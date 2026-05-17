import { describe, expect, it } from "vitest";
import { buildRoutingDebugPacket } from "@/lib/architect/debug/routing-debug";
import { APPOINTMENT_ID, ARCHITECT_USER, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect routing debug", () => {
  it("uses appointment routing truth for routing packets", async () => {
    const packet = await buildRoutingDebugPacket(
      createSupabaseStub(createArchitectDebugTables()) as never,
      APPOINTMENT_ID,
      ARCHITECT_USER
    );

    expect(packet.debugType).toBe("routing");
    expect(packet.summary.diagnosisCode).toBe("completed_but_routing_missing");
    expect(packet.validationChecklist.find((item) => item.stage === "routing_row_exists")).toMatchObject({
      status: "fail",
      reason: "payment_routing_records row missing"
    });
  });
});
