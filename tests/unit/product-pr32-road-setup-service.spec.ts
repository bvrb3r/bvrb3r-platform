import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const service = fs.readFileSync(path.join(process.cwd(), "lib/road/service.server.ts"), "utf8");

describe("Product PR32 Road setup service", () => {
  it("reconciles current setup truth before loading Road history", () => {
    expect(service.indexOf('supabase.rpc("pr32_reconcile_road_setup"')).toBeGreaterThan(-1);
    expect(service.indexOf('supabase.rpc("pr32_reconcile_road_setup"')).toBeLessThan(
      service.indexOf('supabase.rpc("pr32_ensure_referral_code"')
    );
  });

  it("fails closed when reconciliation errors", () => {
    expect(service).toContain('"road_setup_reconcile_failed", 503');
    expect(service).toContain("could not be verified against current canonical server records");
  });

  it("requires exactly every role-scoped setup key", () => {
    expect(service).toContain("getRoadSetupAchievementKeys(role)");
    expect(service).toContain("setupChecks.length !== expectedSetupKeys.length");
    expect(service).toContain("road_setup_evidence_incomplete");
  });

  it("passes only validated setup statuses into the snapshot", () => {
    expect(service).toContain("isRoadSetupStatus(status)");
    expect(service).toContain("setupChecks\n  });");
  });
});
