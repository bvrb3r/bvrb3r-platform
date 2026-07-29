import { describe, expect, it } from "vitest";
import {
  executeArchitectOperation,
  parseArchitectOperationCommand
} from "@/lib/architect/city-map/operations.server";

describe("Architect City Map operations", () => {
  it("requires the exact action and target confirmation", () => {
    expect(() => parseArchitectOperationCommand({
      action: "job_run",
      target: "fintech",
      reason: "Manual certification run",
      confirmation: "confirm job run"
    })).toThrow("CONFIRM job_run fintech");
  });

  it("parses the complete PR29 command registry", () => {
    for (const action of [
      "job_run",
      "webhook_replay",
      "broadcast",
      "device_restart",
      "sessions_revoke",
      "account_lock",
      "maintenance_schedule",
      "maintenance_cancel",
      "backup",
      "restore_drill",
      "cdn_purge",
      "rate_limit",
      "vercel_rollback"
    ]) {
      expect(parseArchitectOperationCommand({
        action,
        target: "target-29",
        reason: "Approved operator action",
        confirmation: `CONFIRM ${action} target-29`,
        payload: { source: "test" }
      })).toMatchObject({ action, target: "target-29" });
    }
  });

  it("rejects unknown operations and short reasons", () => {
    expect(() => parseArchitectOperationCommand({
      action: "refund_everything",
      target: "money",
      reason: "Approved operator action",
      confirmation: "CONFIRM refund_everything money"
    })).toThrow("invalid");
    expect(() => parseArchitectOperationCommand({
      action: "backup",
      target: "database",
      reason: "short",
      confirmation: "CONFIRM backup database"
    })).toThrow("at least 8");
  });

  it("rejects unsupported executors at the server boundary before any write", async () => {
    const from = () => {
      throw new Error("No database write should be attempted.");
    };
    await expect(executeArchitectOperation({
      supabase: { from } as never,
      actorUserId: "architect-29",
      command: parseArchitectOperationCommand({
        action: "backup",
        target: "database",
        reason: "Provider executor is absent",
        confirmation: "CONFIRM backup database"
      })
    })).rejects.toThrow("executor is not connected");
  });
});
