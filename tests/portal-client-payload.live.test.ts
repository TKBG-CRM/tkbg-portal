import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  PORTAL_PROJECT_COLUMNS,
  PORTAL_CONTACT_COLUMNS,
  PORTAL_DEPOSIT_PLAN_COLUMNS,
  PORTAL_DEPOSIT_PAYMENT_COLUMNS,
} from "../src/lib/portal-columns";

/**
 * End-to-end leak check against the REAL database, authenticated as a
 * real portal client over the anon key (so RLS is enforced exactly as in
 * production). It runs the same column-scoped queries the portal pages
 * run and asserts the returned rows carry no commission / task / internal
 * key — the guarantee the client requested.
 *
 * It is opt-in: set these env vars to run it (e.g. locally or in a
 * secured CI job). Without them it skips so the default `npm test` stays
 * credential-free.
 *
 *   PORTAL_TEST_SUPABASE_URL
 *   PORTAL_TEST_ANON_KEY
 *   PORTAL_TEST_EMAIL
 *   PORTAL_TEST_PASSWORD
 */
const URL = process.env.PORTAL_TEST_SUPABASE_URL;
const ANON = process.env.PORTAL_TEST_ANON_KEY;
const EMAIL = process.env.PORTAL_TEST_EMAIL;
const PASSWORD = process.env.PORTAL_TEST_PASSWORD;

const runLive = !!(URL && ANON && EMAIL && PASSWORD);

const FORBIDDEN_KEY = /(commission|payout|agent_split|referral_(commission|amount|fee)|internal_notes?|rep_notes?|\btask|assigned_to)/i;

function assertNoForbiddenKeys(rows: unknown) {
  const list = Array.isArray(rows) ? rows : [rows];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      expect(FORBIDDEN_KEY.test(key), `leaked key: ${key}`).toBe(false);
    }
  }
}

describe.runIf(runLive)("live portal client payloads carry no internal fields", () => {
  it("projects / contact / deposit queries return only client-safe keys", async () => {
    const supabase = createClient(URL!, ANON!);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    expect(signInErr).toBeNull();

    const { data: contact } = await supabase
      .from("contacts")
      .select(PORTAL_CONTACT_COLUMNS)
      .single();
    assertNoForbiddenKeys(contact);

    const { data: projects } = await supabase
      .from("projects")
      .select(PORTAL_PROJECT_COLUMNS);
    assertNoForbiddenKeys(projects);

    const { data: plans } = await supabase
      .from("deposit_payment_plans")
      .select(PORTAL_DEPOSIT_PLAN_COLUMNS);
    assertNoForbiddenKeys(plans);

    const { data: payments } = await supabase
      .from("deposit_plan_payments")
      .select(PORTAL_DEPOSIT_PAYMENT_COLUMNS);
    assertNoForbiddenKeys(payments);

    // A client must not be able to read the activities table at all via the
    // portal surface — and even if a row comes back it must not be a task.
    const { data: activities } = await supabase
      .from("activities")
      .select("id, type, title");
    for (const a of activities || []) {
      expect((a as any).type).not.toBe("task");
    }

    await supabase.auth.signOut();
  });
});

if (!runLive) {
  describe("live portal payload check (skipped — no PORTAL_TEST_* creds)", () => {
    it("is configured but inert without credentials", () => {
      expect(runLive).toBe(false);
    });
  });
}
