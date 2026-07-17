/**
 * Tests for the referral sign-in link trigger — specifically the ordering bug
 * that locked partners out: the handle_new_user trigger mints a user_profiles
 * row for the auth user this route itself creates, so on a partner's second
 * visit the old "profile row exists → Turnkey staff" check rejected them.
 * A portal-enabled referral_partners row must ALWAYS win.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createUser = vi.fn();
const generateLink = vi.fn();

const state: {
  partners: any[];
  staffProfile: any | null;
} = { partners: [], staffProfile: null };

function chain(result: any) {
  const c: any = {
    eq: () => c,
    ilike: () => c,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return c;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) =>
      ({
        select: () =>
          table === "user_profiles"
            ? chain({ data: state.staffProfile })
            : chain({ data: state.partners }),
      }) as any,
    auth: {
      admin: {
        createUser: (...a: unknown[]) => createUser(...a),
        generateLink: (...a: unknown[]) => generateLink(...a),
      },
    },
  }),
}));

import { POST } from "./route";

function makeReq(body: unknown): any {
  return {
    headers: { get: () => "https://portal.tkbg.com.au" },
    nextUrl: { origin: "https://portal.tkbg.com.au" },
    json: async () => body,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.INTERNAL_WEBHOOK_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_CRM_URL = "https://crm.tkbg.com.au";
  state.partners = [];
  state.staffProfile = null;
  createUser.mockResolvedValue({ data: {}, error: null });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "HASH123" } },
    error: null,
  });
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/portal/referral/send-link", () => {
  it("sends a link to a partner EVEN IF a stray user_profiles row exists", async () => {
    state.partners = [{ id: "tony", contact_name: "Tony Owner", name: "Finance Family" }];
    // The trigger-minted profile row that used to lock Tony out:
    state.staffProfile = { id: "stray-profile" };

    const res = await POST(makeReq({ email: "tony@thefinancefamily.com.au" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // New auth users carry the source marker so migration 102's trigger skips
    // the staff-profile insert.
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: { source: "referral_partner_portal" },
      })
    );
  });

  it("still blocks a genuine staff email (profile row, no partner row)", async () => {
    state.staffProfile = { id: "real-staff" };
    const res = await POST(makeReq({ email: "jess@tkbg.com.au" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("staff");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s an unknown email without leaking anything", async () => {
    const res = await POST(makeReq({ email: "nobody@example.com" }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });
});
