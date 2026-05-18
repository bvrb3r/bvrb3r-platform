import { describe, expect, it } from "vitest";
import {
  isPayoutReadinessEligible,
  loadPaymentRoutingConstraintEvidence,
  readinessDbValueForBusinessMeaning
} from "@/lib/architect/mission-control/schema-constraints";
import { createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect schema constraint debug", () => {
  it("loads production-allowed payment routing values", async () => {
    const tables = createArchitectDebugTables();
    const evidence = await loadPaymentRoutingConstraintEvidence(createSupabaseStub(tables) as never);

    expect(evidence.allowedValues.payout_readiness_status).toEqual(expect.arrayContaining(["ready", "blocked"]));
    expect(readinessDbValueForBusinessMeaning(evidence, "eligible")).toBe("ready");
    expect(isPayoutReadinessEligible("ready")).toBe(true);
  });

  it("prefers eligible when the production constraint allows it", async () => {
    const tables = createArchitectDebugTables({
      "information_schema.check_constraints": [{
        constraint_name: "payment_routing_records_payout_readiness_status_check",
        check_clause: "CHECK ((payout_readiness_status = ANY (ARRAY['not_ready'::text, 'eligible'::text, 'blocked'::text])))"
      }]
    });
    const evidence = await loadPaymentRoutingConstraintEvidence(createSupabaseStub(tables) as never);

    expect(readinessDbValueForBusinessMeaning(evidence, "eligible")).toBe("eligible");
  });
});
