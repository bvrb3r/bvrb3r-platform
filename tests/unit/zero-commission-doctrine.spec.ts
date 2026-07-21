import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260721133442_enforce_zero_commission.sql",
  "utf8"
);

describe("zero-commission production doctrine", () => {
  it("installs fail-closed guards on every active commission write surface", () => {
    for (const triggerName of [
      "barbers_reject_new_commission",
      "staff_locations_reject_new_commission",
      "shop_team_invites_reject_new_commission",
      "shop_relationships_reject_new_commission",
      "compensation_rules_reject_new_commission",
      "compensation_snapshots_reject_new_commission",
      "payment_routing_reject_new_commission",
      "commission_ledger_reject_new_entries"
    ]) {
      expect(migration).toContain(triggerName);
    }
  });

  it("preserves historical rows while rejecting new commission truth", () => {
    expect(migration).toContain("tg_op = 'INSERT' or old_value is distinct from new_value");
    expect(migration).toContain("Commission is permanently disabled");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(commission_ledger|compensation_snapshots)/i);
  });
});
