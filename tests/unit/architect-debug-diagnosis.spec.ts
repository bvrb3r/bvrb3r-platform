import { describe, expect, it } from "vitest";
import { diagnoseAppointment } from "@/lib/architect/debug/diagnosis";

describe("architect debug diagnosis", () => {
  it("classifies completed paid appointments without routing", () => {
    const diagnosis = diagnoseAppointment({
      entities: {
        appointment: { id: "appt", status: "completed" },
        payment: { id: "payment", status: "captured", payment_status: "captured" },
        routing: null,
        statusHistory: [{ new_status: "completed", change_reason: "barber_completed_service" }]
      }
    } as never);

    expect(diagnosis.diagnosisCode).toBe("completed_but_routing_missing");
    expect(diagnosis.canRepair).toBe(true);
  });

  it("does not mark eligible routing as broken when release has not happened", () => {
    const diagnosis = diagnoseAppointment({
      entities: {
        appointment: { id: "appt", status: "completed" },
        payment: { id: "payment", status: "captured" },
        routing: { id: "routing", payout_readiness_status: "eligible", released_at: null },
        statusHistory: [{ status: "completed" }]
      }
    } as never);

    expect(diagnosis.diagnosisCode).toBe("payout_eligible_not_released");
    expect(diagnosis.health).toBe("healthy");
  });
});
