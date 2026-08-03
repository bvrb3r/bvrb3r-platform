import { describe, expect, it } from "vitest";
import { buildArchitectRentMonitorPayload } from "@/lib/rent/monitors";

describe("Product PR26 Architect rent monitors", () => {
  it("ships 18 read-only states for ChairSync and money integrity", () => {
    const payload = buildArchitectRentMonitorPayload({
      connected: true,
      chairsyncRows: 30,
      chairsyncExternalOwnerViolations: 0,
      chairsyncRestrictedRows: 4,
      duplicateViolations: 0,
      externalAppointmentRows: 30,
      externalPaymentViolations: 0,
      externalAutoBoothViolations: 0,
      externalFeeViolations: 0,
      rentReconciliationDeltaCents: 0,
      openRentDisputes: 1,
      clientBridgeInvitations: 10,
      clientBridgeClaims: 4,
      clientBridgeConsentViolations: 0,
      warnings: []
    }, "2026-07-29T12:00:00.000Z");

    expect(payload.readOnly).toBe(true);
    expect(payload.chairSync).toHaveLength(18);
    expect(payload.clientBridgeMoney).toHaveLength(18);
    expect(payload.chairSync.every((card) => card.status === "Pass")).toBe(true);
    expect(payload.clientBridgeMoney.every((card) => card.status === "Pass")).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/mutate|approve payout|release money/i);
  });

  it("raises incident references on external money or reconciliation violations", () => {
    const payload = buildArchitectRentMonitorPayload({
      connected: true,
      chairsyncRows: 1,
      chairsyncExternalOwnerViolations: 1,
      chairsyncRestrictedRows: 0,
      duplicateViolations: 0,
      externalAppointmentRows: 1,
      externalPaymentViolations: 1,
      externalAutoBoothViolations: 1,
      externalFeeViolations: 1,
      rentReconciliationDeltaCents: 1,
      openRentDisputes: 0,
      clientBridgeInvitations: 1,
      clientBridgeClaims: 0,
      clientBridgeConsentViolations: 1,
      warnings: []
    });

    const failed = [...payload.chairSync, ...payload.clientBridgeMoney].filter(
      (card) => card.status === "Failed"
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((card) => card.incidentReference?.startsWith("BVR-PR26-"))).toBe(true);
  });
});
