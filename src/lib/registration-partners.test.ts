import { describe, it, expect } from "vitest";
import {
  normalizePartner,
  linkRegistrationPartners,
  partnerContactColumns,
} from "./registration-partners";

// ── partnerContactColumns (denormalised onto the client contact) ─────────────
describe("partnerContactColumns", () => {
  it("maps broker + conveyancer onto the client contact's columns", () => {
    expect(
      partnerContactColumns(
        { first_name: "Sam", last_name: "Broker", company_name: "Aussie", email: "Sam@X.com" },
        { first_name: "Pat", last_name: "Convey", company_name: "Smith Law", email: "pat@law.com" }
      )
    ).toEqual({
      broker_name: "Sam Broker",
      broker_company: "Aussie",
      broker_email: "sam@x.com",
      conveyancer_name: "Pat Convey",
      conveyancer_company: "Smith Law",
      // no conveyancer_email column on contacts → not included
    });
  });

  it("returns only the fields provided (never clears existing data)", () => {
    expect(partnerContactColumns({ company_name: "Aussie" }, null)).toEqual({
      broker_company: "Aussie",
    });
    expect(partnerContactColumns({}, {})).toEqual({});
    expect(partnerContactColumns(null, undefined)).toEqual({});
  });
});

// ── normalizePartner ─────────────────────────────────────────────────────────
describe("normalizePartner", () => {
  it("returns null when nothing usable is provided", () => {
    expect(normalizePartner(null)).toBeNull();
    expect(normalizePartner(undefined)).toBeNull();
    expect(normalizePartner({})).toBeNull();
    expect(
      normalizePartner({ first_name: "  ", company_name: "", email: " " })
    ).toBeNull();
  });

  it("lower-cases + trims email and keeps company", () => {
    expect(
      normalizePartner({ company_name: " Aussie Loans ", email: " B@X.COM " })
    ).toEqual({
      first_name: "Aussie Loans",
      last_name: "",
      company_name: "Aussie Loans",
      email: "b@x.com",
      phone: null,
    });
  });

  it("falls back first_name → company → email so the NOT NULL column is satisfied", () => {
    expect(normalizePartner({ email: "only@email.com" })?.first_name).toBe(
      "only@email.com"
    );
    expect(normalizePartner({ company_name: "Acme" })?.first_name).toBe("Acme");
    expect(
      normalizePartner({ first_name: "Sam", last_name: "Lee" })
    ).toMatchObject({ first_name: "Sam", last_name: "Lee" });
  });
});

// ── Fake Supabase ────────────────────────────────────────────────────────────
type Row = Record<string, any>;
function makeFake(existingContacts: Row[] = []) {
  const contacts = [...existingContacts];
  const insertedContacts: Row[] = [];
  const insertedActivities: Row[] = [];
  const projectUpdates: Array<{ patch: Row; id: string }> = [];
  let seq = 0;

  function contactsSelect() {
    const f: Record<string, string> = {};
    const b: any = {
      eq(col: string, val: string) {
        f[col] = val;
        return b;
      },
      ilike(col: string, val: string) {
        f[`${col}__ilike`] = String(val).toLowerCase();
        return b;
      },
      limit() {
        return b;
      },
      async maybeSingle() {
        const row = contacts.find((r) => {
          if (f.contact_type && r.contact_type !== f.contact_type) return false;
          if (
            f.email__ilike &&
            String(r.email || "").toLowerCase() !== f.email__ilike
          )
            return false;
          return true;
        });
        return { data: row ? { id: row.id } : null, error: null };
      },
    };
    return b;
  }

  const admin: any = {
    from(table: string) {
      return {
        select() {
          if (table === "contacts") return contactsSelect();
          throw new Error(`unexpected select on ${table}`);
        },
        insert(payload: Row | Row[]) {
          if (table === "activities") {
            insertedActivities.push(
              ...(Array.isArray(payload) ? payload : [payload])
            );
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "contacts") {
            const id = `c${++seq}`;
            const row = { id, ...(payload as Row) };
            insertedContacts.push(row);
            contacts.push(row);
            return {
              select() {
                return { single: async () => ({ data: { id }, error: null }) };
              },
            };
          }
          throw new Error(`unexpected insert on ${table}`);
        },
        update(patch: Row) {
          return {
            async eq(_col: string, val: string) {
              projectUpdates.push({ patch, id: val });
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };

  return { admin, insertedContacts, insertedActivities, projectUpdates };
}

// ── linkRegistrationPartners ─────────────────────────────────────────────────
describe("linkRegistrationPartners", () => {
  it("creates broker + conveyancer contacts and links them onto the project", async () => {
    const fake = makeFake();
    const res = await linkRegistrationPartners(fake.admin, {
      projectId: "p1",
      salesRepId: "rep1",
      existingBrokerId: null,
      existingConveyancerId: null,
      broker: { company_name: "Aussie", email: "B@x.com" },
      conveyancer: { first_name: "Sam", last_name: "Lee", email: "s@y.com" },
    });

    expect(res.broker?.created).toBe(true);
    expect(res.conveyancer?.created).toBe(true);
    expect(fake.insertedContacts).toHaveLength(2);
    expect(fake.insertedContacts.map((c) => c.contact_type).sort()).toEqual([
      "broker",
      "conveyancer",
    ]);
    // Broker contact stores lowercased email + sales rep ownership.
    const brokerRow = fake.insertedContacts.find(
      (c) => c.contact_type === "broker"
    );
    expect(brokerRow).toMatchObject({
      email: "b@x.com",
      company_name: "Aussie",
      sales_rep_id: "rep1",
    });

    // One project update carrying both FK gaps.
    expect(fake.projectUpdates).toHaveLength(1);
    expect(fake.projectUpdates[0].id).toBe("p1");
    expect(fake.projectUpdates[0].patch).toHaveProperty("broker_id");
    expect(fake.projectUpdates[0].patch).toHaveProperty("conveyancer_id");

    // An activity per linked partner.
    expect(fake.insertedActivities).toHaveLength(2);
    expect(fake.insertedActivities.map((a) => a.type).sort()).toEqual([
      "broker_linked",
      "conveyancer_linked",
    ]);
  });

  it("reuses an existing contact of the same type by email (case-insensitive)", async () => {
    const fake = makeFake([
      { id: "existing-b", contact_type: "broker", email: "b@x.com" },
    ]);
    const res = await linkRegistrationPartners(fake.admin, {
      projectId: "p1",
      salesRepId: null,
      existingBrokerId: null,
      existingConveyancerId: null,
      broker: { first_name: "Whoever", email: "B@X.COM" },
      conveyancer: null,
    });

    expect(res.broker).toEqual({ contactId: "existing-b", created: false });
    expect(fake.insertedContacts).toHaveLength(0); // reused, not created
    expect(fake.projectUpdates[0].patch.broker_id).toBe("existing-b");
  });

  it("does not overwrite a partner the sales team already linked", async () => {
    const fake = makeFake();
    const res = await linkRegistrationPartners(fake.admin, {
      projectId: "p1",
      salesRepId: "rep1",
      existingBrokerId: "staff-broker", // already set → leave alone
      existingConveyancerId: null,
      broker: { company_name: "Client's Broker", email: "x@x.com" },
      conveyancer: { company_name: "Client's Conveyancer" },
    });

    expect(res.broker).toBeNull();
    expect(res.conveyancer?.created).toBe(true);
    // Only the conveyancer FK should be patched.
    expect(fake.projectUpdates[0].patch).not.toHaveProperty("broker_id");
    expect(fake.projectUpdates[0].patch).toHaveProperty("conveyancer_id");
  });

  it("is a no-op when neither partner is provided", async () => {
    const fake = makeFake();
    const res = await linkRegistrationPartners(fake.admin, {
      projectId: "p1",
      salesRepId: "rep1",
      existingBrokerId: null,
      existingConveyancerId: null,
      broker: {},
      conveyancer: null,
    });

    expect(res).toEqual({ broker: null, conveyancer: null });
    expect(fake.projectUpdates).toHaveLength(0);
    expect(fake.insertedContacts).toHaveLength(0);
    expect(fake.insertedActivities).toHaveLength(0);
  });
});
