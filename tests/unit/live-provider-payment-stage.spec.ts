import { describe, expect, it } from "vitest";
import { resolveOperationalPaymentRecordAttributes, rethrowAppointmentPersistenceError } from "@/lib/operations/live-provider";
import { LiveOperationConflictError, bookAppointmentInSnapshot, createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";

describe("live operations payment stage mapping", () => {
  it("keeps checkout money in the booking ledger while preserving an explicit checkout stage", () => {
    expect(resolveOperationalPaymentRecordAttributes("checkout")).toEqual({
      paymentType: "booking",
      legacyType: "checkout",
      paymentStage: "checkout"
    });
  });

  it("uses the booking stage for appointment deposits and prepay captures", () => {
    expect(resolveOperationalPaymentRecordAttributes("booking")).toEqual({
      paymentType: "booking",
      legacyType: "booking",
      paymentStage: "booking"
    });
  });

  it("maps appointment overlap persistence errors back to a canonical schedule conflict", () => {
    const { appointment } = bookAppointmentInSnapshot(createInitialLiveOperationsSnapshot(), {
      locationId: "loc-ybor",
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: [],
      appointmentTime: "2026-03-08T18:30:00-05:00",
      clientName: "Jordan Hale",
      clientPhone: "8135550408"
    });

    expect(() =>
      rethrowAppointmentPersistenceError(
        {
          code: "23P01",
          message: 'conflicting key value violates exclusion constraint "appointments_no_overlap_active"'
        },
        appointment
      )
    ).toThrow(LiveOperationConflictError);
  });
});
