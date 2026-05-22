import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  resolveBarberAppointmentActionContextMock,
  getLiveOperationsProviderMock,
  recordBookingUpdatedPlatformEventsMock,
  transitionAppointmentMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  resolveBarberAppointmentActionContextMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  recordBookingUpdatedPlatformEventsMock: vi.fn(),
  transitionAppointmentMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/barber/appointment-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/barber/appointment-actions")>("@/lib/barber/appointment-actions");
  return {
    ...actual,
    resolveBarberAppointmentActionContext: resolveBarberAppointmentActionContextMock
  };
});

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/core/booking-events", () => ({
  recordBookingUpdatedPlatformEvents: recordBookingUpdatedPlatformEventsMock
}));

import { POST } from "@/app/api/barber/appointments/[id]/complete/route";

const appointmentId = "2090ae1e-3b7c-59d2-81ac-9f88908fd735";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest(`https://bvrb3r.app/api/barber/appointments/${appointmentId}/complete`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function mockActionContext() {
  resolveBarberAppointmentActionContextMock.mockResolvedValue({
    profile: { id: "profile-barber", email: "barber@bvrb3r.app", role: "barber_user" },
    barber: { id: "barber-live", reference_code: "barber-43b3cda2", barber_subtype: "freelance" },
    appointment: {
      id: appointmentId,
      reference_code: "appt-live",
      barber_id: "barber-live",
      status: "confirmed",
      lifecycle_revision: 7
    },
    providerAppointmentId: "appt-live",
    relationshipType: "freelance"
  });
}

describe("barber complete appointment route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    resolveBarberAppointmentActionContextMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    recordBookingUpdatedPlatformEventsMock.mockReset();
    transitionAppointmentMock.mockReset();

    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "barber_user",
      email: "barber@bvrb3r.app"
    });
    mockActionContext();
    getLiveOperationsProviderMock.mockResolvedValue({
      transitionAppointment: transitionAppointmentMock
    });
    recordBookingUpdatedPlatformEventsMock.mockResolvedValue(undefined);
  });

  it("uses the server appointment revision when the client omits expectedRevision", async () => {
    transitionAppointmentMock.mockResolvedValue({
      appointment: {
        id: "appt-live",
        status: "completed",
        completedAt: "2026-05-22T14:30:00.000Z",
        updatedAt: "2026-05-22T14:30:00.000Z",
        revision: 8
      },
      snapshot: {},
      routing: {
        appointmentId,
        paymentId: "payment-live",
        routingRecordId: "routing-live",
        relationshipType: "freelance",
        status: "eligible",
        payoutReadinessStatus: "ready",
        moneyRoutingStatus: "pending",
        eligibleAt: "2026-05-22T14:30:00.000Z",
        releasedAt: null,
        barberAmountCents: 475,
        shopAmountCents: 0,
        platformAmountCents: 25
      }
    });

    const response = await POST(buildRequest({}), { params: Promise.resolve({ id: appointmentId }) });

    expect(response.status).toBe(200);
    expect(transitionAppointmentMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-live",
      expectedRevision: 7,
      action: "service_complete",
      actorRole: "barber",
      actorEmail: "barber@bvrb3r.app"
    }));
  });

  it("returns the server completion error instead of hiding it behind a generic refresh message", async () => {
    transitionAppointmentMock.mockRejectedValue(new Error("Unable to write the payment routing ledger."));

    const response = await POST(buildRequest({ expectedRevision: 7 }), { params: Promise.resolve({ id: appointmentId }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Unable to write the payment routing ledger.");
  });
});
