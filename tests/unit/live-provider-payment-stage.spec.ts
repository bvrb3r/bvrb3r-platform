import { describe, expect, it } from "vitest";
import {
  isIndependentBookingLocationReference,
  isPseudoBarberReference,
  resolveOperationalPaymentRecordAttributes,
  rethrowAppointmentPersistenceError,
  shouldRequireShopBusinessVerificationForBooking
} from "@/lib/operations/live-provider";
import { canonicalBarberUuid, canonicalLocationUuid } from "@/lib/booking/canonical-booking";
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

  it("does not require shop business verification for barber-direct independent bookings", () => {
    expect(isIndependentBookingLocationReference("independent-barber-phillip")).toBe(true);
    expect(shouldRequireShopBusinessVerificationForBooking({
      serviceOwnerType: "barber",
      serviceBarberReference: "barber-phillip",
      locationReference: "independent-barber-phillip",
      hasStaffMembership: false
    })).toBe(false);
  });

  it("does not turn a pending shop attachment into a blanket client booking blocker", () => {
    expect(shouldRequireShopBusinessVerificationForBooking({
      serviceOwnerType: "barber",
      serviceBarberReference: "barber-phillip",
      locationReference: "shop-pending",
      hasStaffMembership: true
    })).toBe(false);
  });

  it("requires shop business verification only for explicit shop-owned booking lanes", () => {
    expect(shouldRequireShopBusinessVerificationForBooking({
      serviceOwnerType: "shop",
      serviceBarberReference: null,
      locationReference: "shop-unapproved",
      hasStaffMembership: true
    })).toBe(true);

    expect(shouldRequireShopBusinessVerificationForBooking({
      serviceOwnerType: "shop",
      serviceBarberReference: "barber-phillip",
      locationReference: "shop-unapproved",
      hasStaffMembership: true
    })).toBe(true);
  });

  it("preserves real location UUIDs instead of hashing them as pseudo-shop references", () => {
    const locationId = "12345678-1234-5123-9234-123456789abc";

    expect(canonicalLocationUuid(locationId)).toBe(locationId);
  });

  it("treats public barber reference codes as pseudo ids and preserves canonical barber UUIDs", () => {
    const barberId = "12345678-1234-5123-9234-123456789abc";

    expect(isPseudoBarberReference("barber-43b3cda2")).toBe(true);
    expect(canonicalBarberUuid(barberId)).toBe(barberId);
  });
});
