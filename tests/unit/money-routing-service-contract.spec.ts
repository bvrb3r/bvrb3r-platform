import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "lib", "fintech", "service.ts"), "utf8");

describe("Mission 2 routing write contract", () => {
  it("does not force service completion to bypass payout readiness", () => {
    expect(source).not.toContain('completionEligibilityForced\n    ? "eligible"');
    expect(source).toContain("it must never bypass");
    expect(source).toContain("calculated.payoutReadinessStatus");
  });

  it("does not force completed money back to pending", () => {
    expect(source).not.toContain('completionEligibilityForced\n        ? "pending"');
    expect(source).toContain("calculated.moneyRoutingStatus");
  });

  it("preserves canonical blockers on the routing row", () => {
    expect(source).toContain("blocked_reason: blockedReason");
    expect(source).not.toContain("blocked_reason: completionEligibilityForced ? null : blockedReason");
  });
});
