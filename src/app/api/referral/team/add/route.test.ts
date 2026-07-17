/**
 * Integration-style tests for the self-serve team-member endpoint — the full
 * decision tree Tony walks when adding Finance Family staff:
 *
 *   session → resolve owner partner → domain-validate → cap → duplicate →
 *   staff-email guard → insert (portal-enabled, parented to the owner).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: () => getUser() } }),
}));

type FakeState = {
  owners: any[];
  count: number;
  existing: any[];
  staff: any | null;
  insertError: { message: string } | null;
  inserted: any[];
};

const state: FakeState = {
  owners: [],
  count: 0,
  existing: [],
  staff: null,
  insertError: null,
  inserted: [],
};

function chain(result: any) {
  const c: any = {
    eq: () => c,
    ilike: () => c,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return c;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (cols: string, opts?: { head?: boolean }) => {
        if (table === "user_profiles") return chain({ data: state.staff });
        if (opts?.head) return chain({ count: state.count });
        // Owner lookup selects parent_partner_id; the duplicate check is a
        // bare "id" select.
        if (cols.includes("parent_partner_id"))
          return chain({ data: state.owners });
        return chain({ data: state.existing });
      },
      insert: (row: any) => {
        state.inserted.push(row);
        return Promise.resolve({ error: state.insertError });
      },
    }),
  }),
}));

import { POST } from "./route";

const TONY = {
  id: "tony-partner-id",
  name: "Finance Family",
  email: "tony@thefinancefamily.com.au",
  parent_partner_id: null,
};

function makeReq(body: unknown): any {
  return { json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  getUser.mockResolvedValue({
    data: { user: { email: "tony@thefinancefamily.com.au" } },
  });
  state.owners = [TONY];
  state.count = 0;
  state.existing = [];
  state.staff = null;
  state.insertError = null;
  state.inserted = [];
});

describe("POST /api/referral/team/add", () => {
  it("creates a portal-enabled team member under the owner", async () => {
    const res = await POST(
      makeReq({ name: " Amy Broker ", email: " Amy@TheFinanceFamily.com.au " })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      name: "Amy Broker",
      email: "amy@thefinancefamily.com.au",
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      name: "Finance Family",
      contact_name: "Amy Broker",
      email: "amy@thefinancefamily.com.au",
      parent_partner_id: "tony-partner-id",
      portal_access: true,
    });
    expect(state.inserted[0].portal_invited_at).toBeTruthy();
  });

  it("401s without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ name: "Amy", email: "a@b.co" }));
    expect(res.status).toBe(401);
  });

  it("403s when the login email isn't a portal-enabled partner", async () => {
    state.owners = [];
    const res = await POST(
      makeReq({ name: "Amy", email: "amy@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(403);
  });

  it("403s a staff member (one level only — no teams under teams)", async () => {
    state.owners = [{ ...TONY, parent_partner_id: "someone-else" }];
    const res = await POST(
      makeReq({ name: "Amy", email: "amy@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("owner");
  });

  it("400s a lookalike domain", async () => {
    const res = await POST(
      makeReq({ name: "Mal", email: "mal@thefinancefamily.com" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("@thefinancefamily.com.au");
    expect(state.inserted).toHaveLength(0);
  });

  it("400s when the team cap is reached", async () => {
    state.count = 25;
    const res = await POST(
      makeReq({ name: "Amy", email: "amy@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("limit");
  });

  it("409s an email that already belongs to a partner", async () => {
    state.existing = [{ id: "existing-partner" }];
    const res = await POST(
      makeReq({ name: "Amy", email: "amy@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(409);
    expect(state.inserted).toHaveLength(0);
  });

  it("400s a Turnkey staff email", async () => {
    state.staff = { id: "staff-user" };
    const res = await POST(
      makeReq({ name: "Jess", email: "jess@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("staff");
    expect(state.inserted).toHaveLength(0);
  });

  it("500s cleanly when the insert fails", async () => {
    state.insertError = { message: "boom" };
    const res = await POST(
      makeReq({ name: "Amy", email: "amy@thefinancefamily.com.au" })
    );
    expect(res.status).toBe(500);
  });
});
