import { describe, expect, it } from "vitest";
import {
  assertAppointmentTransition,
  buildAppointmentLifecycleFields,
  calculateAppointmentQuote,
  generateAppointmentConfirmationCode
} from "@/lib/appointments/domain";
import {
  LiveOperationConflictError,
  bookAppointmentInSnapshot,
  cancelAppointmentInSnapshot,
  createInitialLiveOperationsSnapshot,
  rescheduleAppointmentInSnapshot,
  transitionAppointmentInSnapshot
} from "@/lib/operations/live-state";

describe("phase 7 appointment domain", () => {
  it("calculates deterministic totals for appointment booking", () => {
    const quote = calculateAppointmentQuote(
      {
        id: "srv-signature",
        name: "Signature Precision Cut",
        durationMinutes: 60,
        bufferMinutes: 10,
        unitPrice: 55,
        depositAmount: 15,
        fullPrepayRequired: false
      },
      [
        {
          id: "srv-beard",
          name: "Beard Detail",
          durationMinutes: 20,
          bufferMinutes: 5,
          unitPrice: 18,
          depositAmount: 0,
          fullPrepayRequired: false
        }
      ],
      0.075,
      {
        discountTotal: 5,
        tipTotal: 12
      }
    );

    expect(quote.serviceTotal).toBe(55);
    expect(quote.addOnTotal).toBe(18);
    expect(quote.subtotal).toBe(73);
    expect(quote.discountTotal).toBe(5);
    expect(quote.taxTotal).toBe(5.1);
    expect(quote.grandTotal).toBe(85.1);
    expect(quote.depositDue).toBe(15);
    expect(quote.balanceDue).toBe(70.1);
    expect(quote.totalDurationMinutes).toBe(95);
  });

  it("caps discount and deposit math so promotions cannot overrun the payable total", () => {
    const quote = calculateAppointmentQuote(
      {
        id: "srv-signature",
        name: "Signature Precision Cut",
        durationMinutes: 60,
        bufferMinutes: 10,
        unitPrice: 55,
        depositAmount: 55,
        fullPrepayRequired: true
      },
      [],
      0.075,
      {
        discountTotal: 80
      }
    );

    expect(quote.discountTotal).toBe(55);
    expect(quote.taxTotal).toBe(0);
    expect(quote.grandTotal).toBe(0);
    expect(quote.depositDue).toBe(0);
    expect(quote.balanceDue).toBe(0);
  });

  it("generates stable but distinct confirmation codes", () => {
    const first = generateAppointmentConfirmationCode("appt-one");
    const second = generateAppointmentConfirmationCode("appt-two");

    expect(first).toMatch(/^[A-Z0-9]{10}$/);
    expect(second).toMatch(/^[A-Z0-9]{10}$/);
    expect(first).not.toBe(second);
  });

  it("guards valid and invalid status transitions", () => {
    expect(() => assertAppointmentTransition("booked", "checked_in")).not.toThrow();
    expect(() => assertAppointmentTransition("confirmed", "checked_in")).not.toThrow();
    expect(() => assertAppointmentTransition("checked_in", "in_service")).not.toThrow();
    expect(() => assertAppointmentTransition("in_service", "completed")).not.toThrow();
    expect(() => assertAppointmentTransition("completed", "refunded")).not.toThrow();
    expect(() => assertAppointmentTransition("booked", "completed")).toThrow(/Cannot transition/);
  });

  it("builds lifecycle timestamps for check-in, service start, completion, and cancellation", () => {
    const checkedIn = buildAppointmentLifecycleFields(
      {
        checkedInAt: null,
        serviceStartedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancellationReason: null
      },
      "checked_in",
      "2026-03-19T15:00:00.000Z"
    );
    const started = buildAppointmentLifecycleFields(checkedIn, "in_service", "2026-03-19T15:05:00.000Z");
    const completed = buildAppointmentLifecycleFields(started, "completed", "2026-03-19T16:00:00.000Z");
    const cancelled = buildAppointmentLifecycleFields(completed, "cancelled", "2026-03-19T16:05:00.000Z", "Client changed plans");

    expect(checkedIn.checkedInAt).toBe("2026-03-19T15:00:00.000Z");
    expect(started.serviceStartedAt).toBe("2026-03-19T15:05:00.000Z");
    expect(completed.completedAt).toBe("2026-03-19T16:00:00.000Z");
    expect(cancelled.cancelledAt).toBe("2026-03-19T16:05:00.000Z");
    expect(cancelled.cancellationReason).toBe("Client changed plans");
  });
});

describe("phase 7 appointment lifecycle snapshot rules", () => {
  it("creates a booking with enriched financial and audit fields", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const result = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: ["srv-beard"],
      appointmentTime: "2026-03-08T18:30:00-05:00",
      clientName: "Harper Moss",
      clientPhone: "8135550408",
      clientId: "client-harper",
      confirmationCode: "ABC123TEST",
      membershipId: "membership-1",
      createdBy: "profile-1",
      bookingSource: "client_dashboard",
      pricingSnapshot: {
        serviceTotal: 55,
        addOnTotal: 18,
        subtotal: 73,
        discountTotal: 0,
        taxTotal: 5.48,
        tipTotal: 0,
        grandTotal: 78.48,
        depositDue: 15,
        balanceDue: 63.48,
        totalDurationMinutes: 95
      }
    });

    expect(result.appointment.confirmationCode).toBe("ABC123TEST");
    expect(result.appointment.status).toBe("confirmed");
    expect(result.appointment.shopId).toBe("loc-ybor");
    expect(result.appointment.membershipId).toBe("membership-1");
    expect(result.appointment.createdBy).toBe("profile-1");
    expect(result.appointment.bookingSource).toBe("client_dashboard");
    expect(result.appointment.serviceTotal).toBe(55);
    expect(result.appointment.addOnTotal).toBe(18);
    expect(result.appointment.taxTotal).toBe(5.48);
    expect(result.appointment.grandTotal).toBe(78.48);
    expect(result.appointment.balanceDue).toBe(63.48);
  });

  it("prevents duplicate overlapping bookings", () => {
    const snapshot = createInitialLiveOperationsSnapshot();

    expect(() =>
      bookAppointmentInSnapshot(snapshot, {
        locationId: "loc-ybor",
        barberId: "barber-wave",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-08T10:30:00-05:00",
        clientName: "Conflict Client",
        clientPhone: "8135550410"
      })
    ).toThrow(LiveOperationConflictError);
  });

  it("captures lifecycle timestamps and cancellation reason through transitions", () => {
    let snapshot = createInitialLiveOperationsSnapshot();
    const booking = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-razor",
      addOnIds: [],
      appointmentTime: "2026-03-08T18:00:00-05:00",
      clientName: "Avery Lane",
      clientPhone: "8135550411"
    });
    snapshot = booking.snapshot;

    const checkedIn = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: booking.appointment.id,
      expectedRevision: booking.appointment.revision,
      action: "check_in",
      actorRole: "front_desk"
    });
    snapshot = checkedIn.snapshot;

    const started = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: checkedIn.appointment.id,
      expectedRevision: checkedIn.appointment.revision,
      action: "service_start",
      actorRole: "barber"
    });
    snapshot = started.snapshot;

    const completed = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: started.appointment.id,
      expectedRevision: started.appointment.revision,
      action: "service_complete",
      actorRole: "barber"
    });

    expect(checkedIn.appointment.checkedInAt).toBeTruthy();
    expect(started.appointment.serviceStartedAt).toBeTruthy();
    expect(completed.appointment.completedAt).toBeTruthy();

    const cancellationBooking = bookAppointmentInSnapshot(completed.snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: [],
      appointmentTime: "2026-03-08T19:45:00-05:00",
      clientName: "Casey Shore",
      clientPhone: "8135550412"
    });

    const cancelled = cancelAppointmentInSnapshot(cancellationBooking.snapshot, {
      appointmentId: cancellationBooking.appointment.id,
      expectedRevision: cancellationBooking.appointment.revision,
      actorRole: "front_desk",
      reason: "Client stepped out before service"
    });

    expect(cancelled.appointment.cancelledAt).toBeTruthy();
    expect(cancelled.appointment.cancellationReason).toBe("Client stepped out before service");
  });

  it("reschedules only confirmed-equivalent appointments into open slots", () => {
    let snapshot = createInitialLiveOperationsSnapshot();
    const booking = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-razor",
      addOnIds: [],
      appointmentTime: "2026-03-08T18:00:00-05:00",
      clientName: "Avery Lane",
      clientPhone: "8135550411"
    });
    snapshot = booking.snapshot;

    const rescheduled = rescheduleAppointmentInSnapshot(snapshot, {
      appointmentId: booking.appointment.id,
      expectedRevision: booking.appointment.revision,
      appointmentTime: "2026-03-08T20:00:00-05:00",
      actorRole: "client",
      reason: "Needs a later chair"
    });

    expect(rescheduled.appointment.status).toBe("confirmed");
    expect(rescheduled.appointment.start).toBe("2026-03-09T01:00:00.000Z");
    expect(rescheduled.appointment.revision).toBe(booking.appointment.revision + 1);
    expect(rescheduled.appointment.lastEventType).toBe("reschedule");
  });

  it("blocks rescheduling into overlapping slots or after check-in", () => {
    let snapshot = createInitialLiveOperationsSnapshot();
    const booking = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-razor",
      addOnIds: [],
      appointmentTime: "2026-03-08T18:00:00-05:00",
      clientName: "Avery Lane",
      clientPhone: "8135550411"
    });
    snapshot = booking.snapshot;

    expect(() =>
      rescheduleAppointmentInSnapshot(snapshot, {
        appointmentId: booking.appointment.id,
        expectedRevision: booking.appointment.revision,
        appointmentTime: "2026-03-08T12:15:00-05:00",
        actorRole: "client"
      })
    ).toThrow(LiveOperationConflictError);

    const checkedIn = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: booking.appointment.id,
      expectedRevision: booking.appointment.revision,
      action: "check_in",
      actorRole: "front_desk"
    });

    expect(() =>
      rescheduleAppointmentInSnapshot(checkedIn.snapshot, {
        appointmentId: checkedIn.appointment.id,
        expectedRevision: checkedIn.appointment.revision,
        appointmentTime: "2026-03-08T20:00:00-05:00",
        actorRole: "client"
      })
    ).toThrow(LiveOperationConflictError);
  });
});
