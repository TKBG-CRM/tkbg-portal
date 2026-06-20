/**
 * Tests for the branded forgot-password trigger (portal side).
 *
 *  - Mints a Supabase recovery token (admin.generateLink) and forwards a
 *    token_hash reset link to the CRM's branded email endpoint.
 *  - Never enumerates accounts: always returns a generic 200, and does NOT
 *    call the CRM when no token could be minted (unknown email).
 *  - Builds the cross-device-safe ?token_hash=…&type=recovery link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateLink = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: { generateLink: (...a: unknown[]) => generateLink(...a) } },
    from: () => ({
      select: () => ({
        ilike: () => ({ limit: () => ({ maybeSingle: () => maybeSingle() }) }),
      }),
    }),
  }),
}));

import { POST } from "./route";

function makeReq(body: unknown, origin = "https://portal.tkbg.com.au"): any {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "origin" ? origin : null) },
    nextUrl: { origin },
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
  delete process.env.NEXT_PUBLIC_APP_URL;
  maybeSingle.mockResolvedValue({ data: { first_name: "Mac" }, error: null });
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/auth/forgot-password", () => {
  it("mints a recovery token and forwards a token_hash link to the CRM", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "HASH123" } },
      error: null,
    });

    const res = await POST(makeReq({ email: "Client@Example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Lower-cased email passed to Supabase.
    expect(generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "client@example.com",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://crm.tkbg.com.au/api/internal/send-password-reset");
    expect(init.headers.Authorization).toBe("Bearer test-secret");
    const sent = JSON.parse(init.body);
    expect(sent.email).toBe("client@example.com");
    expect(sent.name).toBe("Mac");
    expect(sent.reset_url).toBe(
      "https://portal.tkbg.com.au/reset-password?token_hash=HASH123&type=recovery"
    );
  });

  it("returns generic success WITHOUT calling the CRM when the user is unknown", async () => {
    generateLink.mockResolvedValue({
      data: null,
      error: { message: "User not found" },
    });

    const res = await POST(makeReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns generic success WITHOUT minting a token for an invalid email", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(200);
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still succeeds (and forwards) when the name lookup fails", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "HASH" } },
      error: null,
    });
    maybeSingle.mockRejectedValue(new Error("db down"));

    const res = await POST(makeReq({ email: "client@example.com" }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.name).toBe("");
  });

  it("500s when the service role env is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(makeReq({ email: "client@example.com" }));
    expect(res.status).toBe(500);
    expect(generateLink).not.toHaveBeenCalled();
  });
});
