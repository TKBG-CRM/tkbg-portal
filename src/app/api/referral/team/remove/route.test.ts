/**
 * Tests for owner-initiated team-member removal: delete when the record
 * anchors nothing, detach + revoke access when it has referral/commission
 * history, and hard ownership gates in every other case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: () => getUser() } }),
}));

type FakeState = {
  owners: any[];
  members: any[];
  counts: { projects: number; contacts: number; commissions: number };
  deleted: any[];
  updated: any[];
  deleteResult: any[] | null;
  updateResult: any[] | null;
};

const state: FakeState = {
  owners: [],
  members: [],
  counts: { projects: 0, contacts: 0, commissions: 0 },
  deleted: [],
  updated: [],
  deleteResult: null,
  updateResult: null,
};

function chain(result: any) {
  const c: any = {
    eq: () => c,
    ilike: () => c,
    limit: () => Promise.resolve(result),
    select: () => Promise.resolve(result),
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return c;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const count =
            table === "projects"
              ? state.counts.projects
              : table === "contacts"
              ? state.counts.contacts
              : state.counts.commissions;
          return chain({ count });
        }
        // Owner lookup filters portal_access via .eq before .ilike; member
        // lookup filters .eq("id"). Distinguish by which fixture matches.
        return {
          eq: (col: string) =>
            col === "portal_access"
              ? chain({ data: state.owners })
              : chain({ data: state.members }),
          ilike: () => chain({ data: state.owners }),
        } as any;
      },
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: () => {
              state.deleted.push(table);
              return Promise.resolve({
                data: state.deleteResult ?? [{ id: "gone" }],
                error: null,
              });
            },
          }),
        }),
      }),
      update: (patch: any) => ({
        eq: () => ({
          eq: () => ({
            select: () => {
              state.updated.push(patch);
              return Promise.resolve({
                data: state.updateResult ?? [{ id: "kept" }],
                error: null,
              });
            },
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

const OWNER = { id: "tony", parent_partner_id: null };
const MEMBER = {
  id: "amy",
  contact_name: "Amy Broker",
  name: "Finance Family",
  parent_partner_id: "tony",
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
  state.owners = [OWNER];
  state.members = [MEMBER];
  state.counts = { projects: 0, contacts: 0, commissions: 0 };
  state.deleted = [];
  state.updated = [];
  state.deleteResult = null;
  state.updateResult = null;
});

describe("POST /api/referral/team/remove", () => {
  it("deletes a member with no referral or commission history", async () => {
    const res = await POST(makeReq({ memberId: "amy" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: true,
      name: "Amy Broker",
    });
    expect(state.deleted).toEqual(["referral_partners"]);
    expect(state.updated).toHaveLength(0);
  });

  it("detaches (keeps history, revokes access) when the member has referrals", async () => {
    state.counts.projects = 2;
    const res = await POST(makeReq({ memberId: "amy" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: false,
      detached: true,
      name: "Amy Broker",
    });
    expect(state.deleted).toHaveLength(0);
    expect(state.updated[0]).toEqual({
      parent_partner_id: null,
      portal_access: false,
    });
  });

  it("detaches when the member has commission rows", async () => {
    state.counts.commissions = 1;
    const res = await POST(makeReq({ memberId: "amy" }));
    expect((await res.json()).detached).toBe(true);
    expect(state.deleted).toHaveLength(0);
  });

  it("401s without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(makeReq({ memberId: "amy" }))).status).toBe(401);
  });

  it("403s when the target isn't on the caller's team", async () => {
    state.members = [{ ...MEMBER, parent_partner_id: "someone-else" }];
    const res = await POST(makeReq({ memberId: "amy" }));
    expect(res.status).toBe(403);
    expect(state.deleted).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
  });

  it("403s an owner trying to remove themselves (their parent is null)", async () => {
    state.members = [{ ...MEMBER, id: "tony", parent_partner_id: null }];
    expect((await POST(makeReq({ memberId: "tony" }))).status).toBe(403);
  });

  it("400s without a memberId", async () => {
    expect((await POST(makeReq({}))).status).toBe(400);
  });

  it("500s when the delete affects no rows (concurrent change)", async () => {
    state.deleteResult = [];
    expect((await POST(makeReq({ memberId: "amy" }))).status).toBe(500);
  });
});
