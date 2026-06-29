/**
 * Registration and payment are decoupled — the link is often used to register
 * BEFORE paying. The staff notification wording must reflect which case
 * occurred so the rep knows whether to chase the deposit.
 */
import { describe, it, expect } from "vitest";
import { composeRegistrationNotification } from "@/lib/registration-notification";

describe("composeRegistrationNotification", () => {
  it("says paid when a remittance was attached", () => {
    const { title, message } = composeRegistrationNotification({
      clientName: "Damion Denysenko",
      projectName: "Lot 832 Paver Road",
      depositPaid: true,
    });
    expect(title).toBe("Damion Denysenko registered and paid initial deposit");
    expect(message).toContain("Initial deposit has been paid");
    expect(message).toContain("for Lot 832 Paver Road");
  });

  it("says pending and prompts follow-up when no remittance was attached", () => {
    const { title, message } = composeRegistrationNotification({
      clientName: "Damion Denysenko",
      projectName: "Lot 832 Paver Road",
      depositPaid: false,
    });
    expect(title).toBe("Damion Denysenko registered — initial deposit pending");
    expect(message).toContain("not yet confirmed");
    expect(message).toContain("follow up");
    expect(message).not.toContain("has been paid");
  });

  it("handles a missing client name and project gracefully", () => {
    const paid = composeRegistrationNotification({
      clientName: null,
      projectName: null,
      depositPaid: true,
    });
    expect(paid.title).toBe("Client registered and paid initial deposit");
    expect(paid.message).not.toContain(" for ");

    const pending = composeRegistrationNotification({
      clientName: "",
      projectName: null,
      depositPaid: false,
    });
    expect(pending.title).toBe("Client registered — initial deposit pending");
  });
});
