import { describe, it, expect } from "vitest";
import {
  canSelfServeTeam,
  emailDomain,
  validateTeamMember,
} from "@/lib/referral/team-signup";

const TONY = "tony@financefamily.com.au";

describe("emailDomain", () => {
  it("extracts and normalises the domain", () => {
    expect(emailDomain("Tony@FinanceFamily.com.au ")).toBe("financefamily.com.au");
    expect(emailDomain("not-an-email")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe("canSelfServeTeam", () => {
  it("allows business domains, blocks free mailboxes", () => {
    expect(canSelfServeTeam(TONY)).toBe(true);
    expect(canSelfServeTeam("tony@gmail.com")).toBe(false);
    expect(canSelfServeTeam("tony@bigpond.com")).toBe(false);
    expect(canSelfServeTeam(null)).toBe(false);
  });
});

describe("validateTeamMember", () => {
  it("accepts a same-domain colleague and normalises values", () => {
    const r = validateTeamMember(TONY, "  Amy Broker ", " Amy@FinanceFamily.com.au ");
    expect(r).toEqual({
      ok: true,
      name: "Amy Broker",
      email: "amy@financefamily.com.au",
    });
  });

  it("rejects a different domain — even a lookalike", () => {
    const r = validateTeamMember(TONY, "Mal", "mal@financefamily.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("@financefamily.com.au");
  });

  it("rejects free-mailbox owners entirely", () => {
    const r = validateTeamMember("tony@gmail.com", "Amy", "amy@gmail.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("business email");
  });

  it("rejects the owner's own email, empty names and bad emails", () => {
    expect(validateTeamMember(TONY, "Tony", TONY).ok).toBe(false);
    expect(validateTeamMember(TONY, "A", "amy@financefamily.com.au").ok).toBe(false);
    expect(validateTeamMember(TONY, "Amy", "not-an-email").ok).toBe(false);
  });
});
