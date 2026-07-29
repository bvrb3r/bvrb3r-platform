import { describe, expect, it } from "vitest";
import {
  assertQueueReassignmentAllowed,
  maskClientName,
  maskEmail,
  maskPhone,
  paymentOwnerForSource,
  resolveActivationLinkState,
  resolveClientBridgeEligibility,
  resolveQueueAssignmentLock
} from "@/lib/clientbridge/domain";

describe("Product PR23 ClientBridge and ownership rules", () => {
  it("keeps external payment ownership outside BVRB3R money", () => {
    expect(paymentOwnerForSource("booksy")).toBe("external:booksy");
    expect(paymentOwnerForSource("square")).toBe("external:square");
    expect(paymentOwnerForSource("thecut")).toBe("external:thecut");
    expect(paymentOwnerForSource("bvrb3r", "bvrb3r_card")).toBe("bvrb3r_card");
  });

  it("locks booked and non-cash visits to their barber", () => {
    expect(resolveQueueAssignmentLock({
      entryType: "booked",
      paymentOwner: "bvrb3r_card"
    }).locked).toBe(true);
    expect(resolveQueueAssignmentLock({
      entryType: "walkin",
      paymentOwner: "external:square"
    }).locked).toBe(true);
    expect(resolveQueueAssignmentLock({
      entryType: "walkin",
      paymentOwner: "bvrb3r_cash"
    })).toMatchObject({ locked: false, reassignable: true });
  });

  it("allows only a BVRB3R cash walk-in with a real audit reason to move", () => {
    expect(() => assertQueueReassignmentAllowed({
      entryType: "walkin",
      paymentOwner: "bvrb3r_cash",
      reason: "Chair went offline"
    })).not.toThrow();
    expect(() => assertQueueReassignmentAllowed({
      entryType: "booked",
      paymentOwner: "unpaid_manual",
      reason: "Requested move"
    })).toThrow(/booked visits are locked/i);
    expect(() => assertQueueReassignmentAllowed({
      entryType: "walkin",
      paymentOwner: "bvrb3r_cash",
      reason: " "
    })).toThrow(/audit reason/i);
  });

  it("caps ClientBridge at two invitations per 60 days", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    expect(resolveClientBridgeEligibility({
      providerDataRestricted: false,
      previouslyDeclined: false,
      invitationDates: [
        "2026-07-01T12:00:00.000Z",
        "2026-07-20T12:00:00.000Z"
      ],
      now
    })).toEqual({ eligible: false, suppressionReason: "frequency_limit" });
    expect(resolveClientBridgeEligibility({
      providerDataRestricted: false,
      previouslyDeclined: false,
      invitationDates: [
        "2026-04-01T12:00:00.000Z",
        "2026-07-20T12:00:00.000Z"
      ],
      now
    })).toEqual({ eligible: true, suppressionReason: null });
  });

  it("suppresses provider-restricted and previously declined invitations", () => {
    expect(resolveClientBridgeEligibility({
      providerDataRestricted: true,
      previouslyDeclined: false,
      invitationDates: []
    })).toEqual({ eligible: false, suppressionReason: "provider_restriction" });
    expect(resolveClientBridgeEligibility({
      providerDataRestricted: false,
      previouslyDeclined: true,
      invitationDates: []
    })).toEqual({ eligible: false, suppressionReason: "prior_decline" });
  });

  it("masks kiosk appointment identity and enforces activation expiry", () => {
    expect(maskClientName("Jordan Ellis")).toBe("J••• E.");
    expect(maskPhone("(813) 555-0199")).toBe("•••• 0199");
    expect(maskEmail("Jordan@example.com")).toBe("j•••@example.com");
    expect(resolveActivationLinkState({
      status: "queued",
      expiresAt: "2026-07-31T12:00:00.000Z",
      now: new Date("2026-07-28T12:00:00.000Z")
    })).toBe("claimable");
    expect(resolveActivationLinkState({
      status: "claimed",
      expiresAt: "2026-07-31T12:00:00.000Z"
    })).toBe("already_used");
    expect(resolveActivationLinkState({
      status: "queued",
      expiresAt: "2026-07-27T12:00:00.000Z",
      now: new Date("2026-07-28T12:00:00.000Z")
    })).toBe("expired");
  });
});
