import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveOperationConflictError } from "@/lib/operations/live-state";

const {
  getSessionUserMock,
  getLiveOperationsProviderMock,
  recordBookingUpdatedPlatformEventsMock,
  reversePointsForAppointmentMock,
  cancelAppointmentMock,
  rescheduleAppointmentMock,
  readSnapshotMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  recordBookingUpdatedPlatformEventsMock: vi.fn(),
  reversePointsForAppointmentMock: vi.fn(),
  cancelAppointmentMock: vi.fn(),
  rescheduleAppointmentMock: vi.fn(),
  readSnapshotMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock,
  toBookingViewer: (user: { role: string; clientId?: string; barberId?: string; locationIds?: string[]; email?: string }) => {
    if (user.role === "client" && user.clientId) {
      return { role: "client", clientId: user.clientId, email: user.email };
    }
    if (user.role === "commission_barber" || user.role === "booth_rent_barber") {
      return { role: user.role, barberId: user.barberId, locationIds: user.locationIds ?? [], email: user.email };
    }
    if (user.role === "owner" || user.role === "manager" || user.role === "front_desk") {
      return { role: user.role, locationIds: user.locationIds ?? [], email: user.email };
    }
    return null;
  },
  toLifecycleActorRole: (role: string) => {
    if (role === "commission_barber" || role === "booth_rent_barber") {
      return "barber";
    }
    if (role === "client" || role === "owner" || role === "manager" || role === "front_desk") {
      return role;
    }
    return null;
  }
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/core/booking-events", () => ({
  recordBookingUpdatedPlatformEvents: recordBookingUpdatedPlatformEventsMock
}));

vi.mock("@/lib/points/engine", () => ({
  reversePointsForAppointment: reversePointsForAppointmentMock
}));

import { POST as postCancel } from "@/app/api/bookings/[id]/cancel/route";
import { POST as postReschedule } from "@/app/api/bookings/[id]/reschedule/route";

const appointmentFixture = {
  id: "appt-live-1",
  clientId: "client-live",
  barberId: "barber-live",
  locationId: "loc-live",
  serviceId: "srv-live",
  status: "confirmed",
  start: "2026-04-21T15:00:00.000Z",
  end: "2026-04-21T16:00:00.000Z",
  updatedAt: "2026-04-21T14:00:00.000Z",
  revision: 3
};

describe("booking mutation routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    recordBookingUpdatedPlatformEventsMock.mockReset();
    reversePointsForAppointmentMock.mockReset();
    cancelAppointmentMock.mockReset();
    rescheduleAppointmentMock.mockReset();
    readSnapshotMock.mockReset();

    getSessionUserMock.mockResolvedValue({
      id: "profile-client",
      role: "client",
      email: "client@bvrb3r.app",
      clientId: "client-live"
    });
    readSnapshotMock.mockResolvedValue({
      appointments: [appointmentFixture]
    });
    cancelAppointmentMock.mockResolvedValue({
      appointment: {
        ...appointmentFixture,
        status: "cancelled",
        revision: 4,
        updatedAt: "2026-04-21T14:05:00.000Z"
      }
    });
    rescheduleAppointmentMock.mockResolvedValue({
      appointment: {
        ...appointmentFixture,
        start: "2026-04-21T17:00:00.000Z",
        end: "2026-04-21T18:00:00.000Z",
        revision: 4,
        updatedAt: "2026-04-21T14:05:00.000Z",
        lastEventType: "reschedule"
      }
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      readSnapshot: readSnapshotMock,
      cancelAppointment: cancelAppointmentMock,
      rescheduleAppointment: rescheduleAppointmentMock
    });
    reversePointsForAppointmentMock.mockResolvedValue(undefined);
    recordBookingUpdatedPlatformEventsMock.mockResolvedValue(undefined);
  });

  it("denies cancel when the scoped viewer cannot see the appointment", async () => {
    readSnapshotMock.mockResolvedValueOnce({ appointments: [] });

    const response = await postCancel(
      new NextRequest("https://bvrb3r.app/api/bookings/appt-live-1/cancel", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 3,
          reason: "Need to move it"
        })
      }),
      { params: Promise.resolve({ id: "appt-live-1" }) }
    );

    expect(response.status).toBe(403);
    expect(cancelAppointmentMock).not.toHaveBeenCalled();
  });

  it("allows a barber to cancel through the canonical booking route", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "profile-barber",
      role: "commission_barber",
      barberId: "barber-live",
      locationIds: ["loc-live"],
      email: "barber@bvrb3r.app"
    });

    const response = await postCancel(
      new NextRequest("https://bvrb3r.app/api/bookings/appt-live-1/cancel", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 3,
          reason: "Chair needs to be reopened"
        })
      }),
      { params: Promise.resolve({ id: "appt-live-1" }) }
    );

    expect(response.status).toBe(200);
    expect(cancelAppointmentMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-live-1",
      expectedRevision: 3,
      actorRole: "barber",
      actorEmail: "barber@bvrb3r.app"
    }));
  });

  it("reschedules through the canonical provider and emits booking_rescheduled", async () => {
    const response = await postReschedule(
      new NextRequest("https://bvrb3r.app/api/bookings/appt-live-1/reschedule", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 3,
          appointmentTime: "2026-04-21T17:00:00.000Z",
          reason: "Need a later chair"
        })
      }),
      { params: Promise.resolve({ id: "appt-live-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rescheduleAppointmentMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-live-1",
      expectedRevision: 3,
      appointmentTime: "2026-04-21T17:00:00.000Z",
      actorRole: "client",
      actorEmail: "client@bvrb3r.app"
    }));
    expect(recordBookingUpdatedPlatformEventsMock).toHaveBeenCalledWith(expect.objectContaining({
      appointment: expect.objectContaining({ id: "appt-live-1" }),
      lifecycleEvent: "rescheduled",
      route: "/api/bookings/[id]/reschedule"
    }));
    expect(body.appointment.start).toBe("2026-04-21T17:00:00.000Z");
  });

  it("allows a barber to reschedule through the canonical booking route", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "profile-barber",
      role: "commission_barber",
      barberId: "barber-live",
      locationIds: ["loc-live"],
      email: "barber@bvrb3r.app"
    });

    const response = await postReschedule(
      new NextRequest("https://bvrb3r.app/api/bookings/appt-live-1/reschedule", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 3,
          appointmentTime: "2026-04-21T17:00:00.000Z",
          reason: "Move to the later chair gap"
        })
      }),
      { params: Promise.resolve({ id: "appt-live-1" }) }
    );

    expect(response.status).toBe(200);
    expect(rescheduleAppointmentMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-live-1",
      expectedRevision: 3,
      actorRole: "barber",
      actorEmail: "barber@bvrb3r.app"
    }));
  });

  it("preserves live conflict responses for reschedule collisions", async () => {
    rescheduleAppointmentMock.mockRejectedValueOnce(
      new LiveOperationConflictError("The selected time is no longer available with this barber.", appointmentFixture as any, "schedule_conflict")
    );

    const response = await postReschedule(
      new NextRequest("https://bvrb3r.app/api/bookings/appt-live-1/reschedule", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 3,
          appointmentTime: "2026-04-21T17:00:00.000Z"
        })
      }),
      { params: Promise.resolve({ id: "appt-live-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("schedule_conflict");
  });
});
