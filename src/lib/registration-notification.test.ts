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

  it("flags a missing ID when the client opts to send it later", () => {
    const paid = composeRegistrationNotification({
      clientName: "Lachlan Vancuylenberg",
      projectName: "Lot 12 Example St",
      depositPaid: true,
      idProvided: false,
    });
    expect(paid.title).toBe(
      "Lachlan Vancuylenberg registered and paid — ID still needed"
    );
    expect(paid.message).toContain("No ID was attached");
    expect(paid.message).toContain("send it later");

    const pending = composeRegistrationNotification({
      clientName: "Lachlan Vancuylenberg",
      projectName: null,
      depositPaid: false,
      idProvided: false,
    });
    expect(pending.title).toBe(
      "Lachlan Vancuylenberg registered — deposit & ID pending"
    );
    expect(pending.message).toContain("No ID was attached");
  });

  it("keeps the original wording when an ID was provided", () => {
    const { title, message } = composeRegistrationNotification({
      clientName: "Jane Doe",
      projectName: null,
      depositPaid: true,
      idProvided: true,
    });
    expect(title).toBe("Jane Doe registered and paid initial deposit");
    expect(message).not.toContain("No ID was attached");
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
