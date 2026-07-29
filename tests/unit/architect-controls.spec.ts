import { describe, expect, it } from "vitest";
import { parseArchitectControlCommand } from "@/lib/architect/city-map/controls.server";

describe("Architect City Map controls", () => {
  it("requires the exact two-step confirmation phrase", () => {
    expect(() => parseArchitectControlCommand({
      action: "system_control",
      target: "bookings",
      active: true,
      expectedVersion: 1,
      reason: "Operational incident INC-42",
      confirmation: "confirm bookings on"
    })).toThrow("CONFIRM bookings ON");
  });

  it("parses versioned system controls and registered PR28 feature flags", () => {
    expect(parseArchitectControlCommand({
      action: "system_control",
      target: "payouts",
      active: true,
      expectedVersion: 4,
      reason: "Provider reconciliation requires a hold",
      confirmation: "CONFIRM payouts ON"
    })).toMatchObject({
      action: "system_control",
      target: "payouts",
      expectedVersion: 4
    });

    expect(parseArchitectControlCommand({
      action: "feature_flag",
      target: "owner.analytics.forecasting",
      active: true,
      reason: "Approved staged rollout",
      confirmation: "CONFIRM owner.analytics.forecasting ON"
    })).toMatchObject({
      action: "feature_flag",
      target: "owner.analytics.forecasting",
      active: true
    });
  });

  it("rejects unknown controls, unknown feature flags, and short reasons", () => {
    expect(() => parseArchitectControlCommand({
      action: "system_control",
      target: "refunds",
      active: true,
      expectedVersion: 1,
      reason: "A complete operational reason",
      confirmation: "CONFIRM refunds ON"
    })).toThrow("invalid");

    expect(() => parseArchitectControlCommand({
      action: "feature_flag",
      target: "unknown.flag",
      active: true,
      reason: "A complete operational reason",
      confirmation: "CONFIRM unknown.flag ON"
    })).toThrow("invalid");

    expect(() => parseArchitectControlCommand({
      action: "system_control",
      target: "kiosks",
      active: true,
      expectedVersion: 1,
      reason: "short",
      confirmation: "CONFIRM kiosks ON"
    })).toThrow("at least 8");
  });
});
