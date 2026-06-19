import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "./page";

// next/navigation is unavailable outside the Next runtime — stub the two
// hooks the login page reads.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// The Supabase browser client must not be constructed for real in tests.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  }),
}));

describe("redesigned client portal login", () => {
  it("renders the branded look and copy", () => {
    render(<LoginPage />);
    // "Client Portal" now sits below the header as a small gold tag
    // (wrapped in · … · bullets) above the heading, no longer inside the
    // black logo block.
    expect(
      screen.getByText((_, el) => el?.textContent === "· Client Portal ·")
    ).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Sign in to view your project")).toBeInTheDocument();
    // Larger white wordmark on the black bar — bumped from h-4/h-5 to
    // h-8 → md:h-12 for prominence.
    const logo = screen.getByAltText("Turnkey Building Group") as HTMLImageElement;
    expect(logo.getAttribute("src")).toContain("TURNKEY_WORDMARK_WHITE");
    expect(logo.className).toContain("h-8");
    // Form essentials still present.
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("never renders commission, payout or task wording", () => {
    const { container } = render(<LoginPage />);
    const text = container.textContent || "";
    expect(/commission/i.test(text)).toBe(false);
    expect(/payout/i.test(text)).toBe(false);
    expect(/\btask/i.test(text)).toBe(false);
  });
});
