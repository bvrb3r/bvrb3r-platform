import { describe, expect, it } from "vitest";
import { getBarberCompensationSummary, getOwnerAnalyticsSummary } from "@/lib/operations/metrics";
import {
  bookAppointmentInSnapshot,
  checkoutAppointmentInSnapshot,
  createInitialLiveOperationsSnapshot,
  transitionAppointmentInSnapshot
} from "@/lib/operations/live-state";

describe("six-step workflow end-to-end coverage", () => {
  it("runs the full booking workflow through owner revenue visibility", () => {
    let snapshot = createInitialLiveOperationsSnapshot();
    const booking = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: ["srv-beard"],
      appointmentTime: "2026-03-08T16:00:00-05:00",
      clientName: "Micah Stone",
      clientPhone: "8135550404"
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
    snapshot = completed.snapshot;

    const checkedOut = checkoutAppointmentInSnapshot(snapshot, {
      appointmentId: completed.appointment.id,
      expectedRevision: completed.appointment.revision,
      tipAmount: 18,
      paymentMethod: "tap_to_pay",
      actorRole: "front_desk"
    });
    snapshot = checkedOut.snapshot;

    const appointment = snapshot.appointments.find((entry) => entry.id === checkedOut.appointment.id);
    const barberMetrics = getBarberCompensationSummary("barber-wave", snapshot.appointments, snapshot.compensationSnapshots);
    const ownerMetrics = getOwnerAnalyticsSummary(snapshot.ownerAnalytics);
    const eventTypes = snapshot.workflowEvents
      .filter((entry) => entry.appointmentReference === checkedOut.appointment.id)
      .map((entry) => entry.eventType);

    expect(appointment?.status).toBe("completed");
    expect(appointment?.balanceDue).toBe(0);
    expect(appointment?.tipAmount).toBe(18);
    expect(eventTypes).toEqual(["checkout", "service_complete", "service_start", "check_in", "booking"]);
    expect(barberMetrics.rentAppliedToday).toBe(0);
    expect(ownerMetrics.revenueToday).toBeGreaterThan(70);
    expect(ownerMetrics.tipsToday).toBeGreaterThanOrEqual(18);
  });

  it("updates booth-rent coverage and owner analytics after checkout", () => {
    let snapshot = createInitialLiveOperationsSnapshot();
    const booking = bookAppointmentInSnapshot(snapshot, {
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-razor",
      addOnIds: ["srv-blackmask"],
      appointmentTime: "2026-03-08T17:30:00-05:00",
      clientName: "Tariq Wells",
      clientPhone: "8135550405"
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
    snapshot = completed.snapshot;

    const checkedOut = checkoutAppointmentInSnapshot(snapshot, {
      appointmentId: completed.appointment.id,
      expectedRevision: completed.appointment.revision,
      tipAmount: 12,
      paymentMethod: "card_on_file",
      actorRole: "front_desk"
    });
    snapshot = checkedOut.snapshot;

    const barberMetrics = getBarberCompensationSummary("barber-blaze", snapshot.appointments, snapshot.compensationSnapshots);
    const ownerMetrics = getOwnerAnalyticsSummary(snapshot.ownerAnalytics);

    expect(barberMetrics.serviceRevenueToday).toBeGreaterThan(70);
    expect(barberMetrics.rentCoverageToday).toBeLessThan(0);
    expect(ownerMetrics.completedServicesToday).toBeGreaterThanOrEqual(2);
    expect(snapshot.compensationSnapshots.some((entry) => entry.appointmentReference === checkedOut.appointment.id)).toBe(true);
  });
});