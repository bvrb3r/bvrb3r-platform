import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { getBarberSchedulePayload } from "@/lib/barber/service";
import { getLiveOperationsProvider, resetDemoLiveOperationsSnapshot } from "@/lib/operations/live-provider";

describe("barber schedule ranges", () => {
  beforeEach(() => {
    resetDemoLiveOperationsSnapshot();
  });

  it("shows a future Blaze booking in day, week, and month schedule views", async () => {
    const provider = await getLiveOperationsProvider();
    const booking = await provider.createBooking({
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      addOnIds: [],
      appointmentTime: "2026-03-12T14:00:00-05:00",
      clientName: "Jordan Ellis",
      clientPhone: "(813) 555-0190",
      clientId: "client-jordan",
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    });
    const blaze = resolveDemoUser("blaze@bvrb3r.demo");

    const [dayView, weekView, monthView] = await Promise.all([
      getBarberSchedulePayload(blaze, { viewMode: "day", anchorDate: "2026-03-12" }),
      getBarberSchedulePayload(blaze, { viewMode: "week", anchorDate: "2026-03-12" }),
      getBarberSchedulePayload(blaze, { viewMode: "month", anchorDate: "2026-03-12" })
    ]);

    expect(dayView.timeline.appointments.some((appointment) => appointment.id === booking.appointment.id)).toBe(true);
    expect(weekView.timeline.appointments.some((appointment) => appointment.id === booking.appointment.id)).toBe(true);
    expect(monthView.timeline.appointments.some((appointment) => appointment.id === booking.appointment.id)).toBe(true);
  });

  it("keeps the barber schedule timeline scoped to the barber's own appointments", async () => {
    const provider = await getLiveOperationsProvider();

    await provider.createBooking({
      locationId: "loc-ybor",
      barberId: "barber-wave",
      serviceId: "srv-signature",
      addOnIds: [],
      appointmentTime: "2026-03-12T15:00:00-05:00",
      clientName: "Jordan Ellis",
      clientPhone: "(813) 555-0190",
      clientId: "client-jordan",
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    });

    const blaze = resolveDemoUser("blaze@bvrb3r.demo");
    const payload = await getBarberSchedulePayload(blaze, { viewMode: "week", anchorDate: "2026-03-12" });

    expect(payload.timeline.appointments.every((appointment) => appointment.barberId === "barber-blaze")).toBe(true);
    expect(payload.timeline.appointments.some((appointment) => appointment.barberId === "barber-wave")).toBe(false);
  });
});
