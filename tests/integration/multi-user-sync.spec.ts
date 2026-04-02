import { describe, expect, it } from "vitest";
import {
  LiveOperationConflictError,
  createInitialLiveOperationsSnapshot,
  transitionAppointmentInSnapshot
} from "@/lib/operations/live-state";

describe("multi-user synchronization and conflict handling", () => {
  it("rejects a stale check-in when another desk user already updated the appointment", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const original = snapshot.appointments.find((entry) => entry.id === "appt-1");
    expect(original?.revision).toBe(1);

    const checkedIn = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: "appt-1",
      expectedRevision: 1,
      action: "check_in",
      actorRole: "front_desk"
    });

    expect(() => {
      transitionAppointmentInSnapshot(checkedIn.snapshot, {
        appointmentId: "appt-1",
        expectedRevision: 1,
        action: "check_in",
        actorRole: "manager"
      });
    }).toThrowError(LiveOperationConflictError);
  });

  it("rejects invalid lifecycle transitions when another role already moved the service forward", () => {
    let snapshot = createInitialLiveOperationsSnapshot();

    const started = transitionAppointmentInSnapshot(snapshot, {
      appointmentId: "appt-2",
      expectedRevision: 2,
      action: "service_start",
      actorRole: "barber"
    });
    snapshot = started.snapshot;

    expect(() => {
      transitionAppointmentInSnapshot(snapshot, {
        appointmentId: "appt-2",
        expectedRevision: started.appointment.revision,
        action: "check_in",
        actorRole: "front_desk"
      });
    }).toThrowError(LiveOperationConflictError);
  });
});