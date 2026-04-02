import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { getBarberOverviewPayload } from "@/lib/barber/service";
import { getClientBookingsPayload, getShopDashboardPayload } from "@/lib/booking/platform-service";
import { getLiveOperationsProvider, resetDemoLiveOperationsSnapshot } from "@/lib/operations/live-provider";

describe("demo booking flow consistency", () => {
  beforeEach(() => {
    resetDemoLiveOperationsSnapshot();
  });

  it("keeps a client booking with Blaze consistent across client, barber, front desk, manager, and owner views", async () => {
    const provider = await getLiveOperationsProvider();
    expect(provider.kind).toBe("demo");

    const booking = await provider.createBooking({
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      addOnIds: ["srv-beard"],
      appointmentTime: "2026-03-08T14:00:00-05:00",
      clientName: "Jordan Ellis",
      clientPhone: "(813) 555-0190",
      clientId: "client-jordan",
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    });

    const blaze = resolveDemoUser("blaze@bvrb3r.demo");
    const frontDesk = resolveDemoUser("frontdesk@bvrb3r.demo");
    const manager = resolveDemoUser("manager@bvrb3r.demo");
    const owner = resolveDemoUser("owner@bvrb3r.demo");

    const [clientBookings, barberOverview, frontDeskDashboard, managerDashboard, ownerDashboard] = await Promise.all([
      getClientBookingsPayload("client-jordan"),
      getBarberOverviewPayload(blaze),
      getShopDashboardPayload({
        role: frontDesk.role,
        locationIds: frontDesk.locationIds,
        email: frontDesk.email
      }),
      getShopDashboardPayload({
        role: manager.role,
        barberId: manager.barberId,
        locationIds: manager.locationIds,
        email: manager.email
      }),
      getShopDashboardPayload({
        role: owner.role,
        barberId: owner.barberId,
        locationIds: owner.locationIds,
        email: owner.email
      })
    ]);

    const frontDeskAppointment = frontDeskDashboard.appointments.find((appointment) => appointment.id === booking.appointment.id);
    const managerAppointment = managerDashboard.appointments.find((appointment) => appointment.id === booking.appointment.id);
    const ownerAppointment = ownerDashboard.appointments.find((appointment) => appointment.id === booking.appointment.id);

    expect(clientBookings.nextAppointment?.id).toBe(booking.appointment.id);
    expect(clientBookings.nextAppointment?.barberId).toBe("barber-blaze");
    expect(clientBookings.nextAppointment?.locationId).toBe("loc-ybor");
    expect(clientBookings.nextAppointment?.status).toBe("booked");

    expect(barberOverview.todayAppointments.some((appointment) => appointment.id === booking.appointment.id)).toBe(true);
    expect(barberOverview.upcomingAppointments.some((appointment) => appointment.id === booking.appointment.id)).toBe(true);
    expect(barberOverview.todayAppointments.every((appointment) => appointment.barberId === "barber-blaze")).toBe(true);

    expect(frontDeskAppointment).toMatchObject({
      id: booking.appointment.id,
      barberId: "barber-blaze",
      clientId: "client-jordan",
      locationId: "loc-ybor",
      status: "booked"
    });
    expect(managerAppointment?.id).toBe(booking.appointment.id);
    expect(ownerAppointment?.id).toBe(booking.appointment.id);
  });
});
