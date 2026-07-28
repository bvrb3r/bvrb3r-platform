import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { BarberToolsServiceError } from "@/lib/barber/service";

const {
  getSessionUserMock,
  getBarberOverviewPayloadMock,
  getBarberStatusPayloadMock,
  updateBarberStatusMock,
  getBarberSchedulePayloadMock,
  updateBarberScheduleMock,
  getBarberClientsPayloadMock,
  getBarberEarningsPayloadMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getBarberOverviewPayloadMock: vi.fn(),
  getBarberStatusPayloadMock: vi.fn(),
  updateBarberStatusMock: vi.fn(),
  getBarberSchedulePayloadMock: vi.fn(),
  updateBarberScheduleMock: vi.fn(),
  getBarberClientsPayloadMock: vi.fn(),
  getBarberEarningsPayloadMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/barber/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/barber/service")>("@/lib/barber/service");
  return {
    ...actual,
    getBarberOverviewPayload: getBarberOverviewPayloadMock,
    getBarberStatusPayload: getBarberStatusPayloadMock,
    updateBarberStatus: updateBarberStatusMock,
    getBarberSchedulePayload: getBarberSchedulePayloadMock,
    updateBarberSchedule: updateBarberScheduleMock,
    getBarberClientsPayload: getBarberClientsPayloadMock,
    getBarberEarningsPayload: getBarberEarningsPayloadMock
  };
});

import { GET as getOverview } from "@/app/api/barber/overview/route";
import { GET as getStatus, POST as postStatus } from "@/app/api/barber/status/route";
import { GET as getSchedule, POST as postSchedule } from "@/app/api/barber/schedule/route";
import { GET as getClients } from "@/app/api/barber/clients/route";
import { GET as getEarnings } from "@/app/api/barber/earnings/route";

describe("phase 10 barber tools routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getBarberOverviewPayloadMock.mockReset();
    getBarberStatusPayloadMock.mockReset();
    updateBarberStatusMock.mockReset();
    getBarberSchedulePayloadMock.mockReset();
    updateBarberScheduleMock.mockReset();
    getBarberClientsPayloadMock.mockReset();
    getBarberEarningsPayloadMock.mockReset();
  });

  it("returns the barber overview for an authenticated barber", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberOverviewPayloadMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      shops: [],
      status: {
        barberId: "barber-blaze",
        currentShopId: "loc-ybor",
        currentShopLabel: "BVRB3R Ybor",
        liveStatus: "available",
        liveStatusLabel: "Available",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: null,
        lastSeenAt: null,
        updatedAt: null,
        note: "Open for booked guests and walk-ins."
      },
      summary: {
        businessDate: "2026-03-20",
        activeCount: 1,
        serviceRevenueToday: 55,
        tipsToday: 10,
        rentAppliedToday: 30,
        projectedPayout: 30,
        completedPaidCount: 1,
        rentCoverageToday: 0,
        bookedCount: 1,
        checkedInCount: 0,
        inServiceCount: 0,
        completedCount: 1,
        cancelledCount: 0
      },
      nextAppointment: null,
      todayAppointments: [],
      upcomingAppointments: [],
      workingHours: [],
      blockedTimes: [],
      quickClients: [],
      earnings: {
        businessDate: "2026-03-20",
        todayBookings: 1,
        upcomingBookings: 1,
        completedServices: 1,
        grossSales: 55,
        tips: 10,
        averageTicket: 55,
        outstandingCheckoutCount: 0
      }
    });

    const response = await getOverview();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.barberName).toBe("Blaze King");
    expect(body.status.liveStatus).toBe("available");
  });

  it("propagates barber-safe access errors for overview reads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    getBarberOverviewPayloadMock.mockRejectedValue(new BarberToolsServiceError("Only barbers can use barber tools.", 403));

    const response = await getOverview();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/only barbers/i);
  });

  it("returns barber status for an authenticated barber", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberStatusPayloadMock.mockResolvedValue({
      barberId: "barber-blaze",
      currentShopId: "loc-ybor",
      currentShopLabel: "BVRB3R Ybor",
      liveStatus: "busy",
      liveStatusLabel: "Busy",
      isOnline: true,
      acceptsWalkIns: false,
      nextAvailableAt: "2026-03-20T15:00:00.000Z",
      lastSeenAt: "2026-03-20T14:15:00.000Z",
      updatedAt: "2026-03-20T14:15:00.000Z",
      note: "Chair is active right now."
    });

    const response = await getStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.liveStatus).toBe("busy");
  });

  it("rejects invalid barber status payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/barber/status", {
      method: "POST",
      body: JSON.stringify({ liveStatus: "not-real" })
    });

    const response = await postStatus(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid barber status payload/i);
  });

  it("updates barber status with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    updateBarberStatusMock.mockResolvedValue({
      barberId: "barber-blaze",
      currentShopId: "loc-ybor",
      currentShopLabel: "BVRB3R Ybor",
      liveStatus: "available",
      liveStatusLabel: "Available",
      isOnline: true,
      acceptsWalkIns: true,
      nextAvailableAt: "2026-03-20T15:30:00.000Z",
      lastSeenAt: "2026-03-20T14:30:00.000Z",
      updatedAt: "2026-03-20T14:30:00.000Z",
      note: "Open for booked guests and walk-ins."
    });

    const request = new NextRequest("https://bvrb3r.demo/api/barber/status", {
      method: "POST",
      body: JSON.stringify({
        liveStatus: "available",
        isOnline: true,
        acceptsWalkIns: true,
        currentShopId: "loc-ybor"
      })
    });

    const response = await postStatus(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.liveStatus).toBe("available");
    expect(body.acceptsWalkIns).toBe(true);
  });

  it("returns the barber schedule payload", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberSchedulePayloadMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      businessDate: "2026-03-20",
      shops: [{ id: "loc-ybor", label: "BVRB3R Ybor" }],
      status: {
        barberId: "barber-blaze",
        currentShopId: "loc-ybor",
        currentShopLabel: "BVRB3R Ybor",
        liveStatus: "available",
        liveStatusLabel: "Available",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: null,
        lastSeenAt: null,
        updatedAt: null,
        note: "Open for booked guests and walk-ins."
      },
      todayAppointments: [],
      upcomingAppointments: [],
      timeline: {
        viewMode: "day",
        anchorDate: "2026-03-20",
        rangeStart: "2026-03-20",
        rangeEnd: "2026-03-20",
        rangeLabel: "Friday, Mar 20, 2026",
        appointments: []
      },
      workingHours: [],
      blockedTimes: []
    });

    const response = await getSchedule(new NextRequest("https://bvrb3r.demo/api/barber/schedule"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.businessDate).toBe("2026-03-20");
    expect(Array.isArray(body.shops)).toBe(true);
  });

  it("passes the requested schedule view and anchor date into the barber schedule payload", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberSchedulePayloadMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      businessDate: "2026-03-20",
      shops: [],
      status: {
        barberId: "barber-blaze",
        currentShopId: "loc-ybor",
        currentShopLabel: "BVRB3R Ybor",
        liveStatus: "available",
        liveStatusLabel: "Available",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: null,
        lastSeenAt: null,
        updatedAt: null,
        note: "Open for booked guests and walk-ins."
      },
      todayAppointments: [],
      upcomingAppointments: [],
      timeline: {
        viewMode: "week",
        anchorDate: "2026-03-27",
        rangeStart: "2026-03-22",
        rangeEnd: "2026-03-28",
        rangeLabel: "Mar 22 - Mar 28, 2026",
        appointments: []
      },
      workingHours: [],
      blockedTimes: []
    });

    const response = await getSchedule(new NextRequest("https://bvrb3r.demo/api/barber/schedule?view=week&date=2026-03-27"));

    expect(response.status).toBe(200);
    expect(getBarberSchedulePayloadMock).toHaveBeenCalledWith(resolveDemoUser("blaze@bvrb3r.demo"), {
      viewMode: "week",
      anchorDate: "2026-03-27"
    });
  });

  it("rejects invalid barber schedule payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/barber/schedule", {
      method: "POST",
      body: JSON.stringify({
        locationId: "",
        workingHours: [{ weekday: 8, startTime: "09:00", endTime: "17:00" }]
      })
    });

    const response = await postSchedule(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid barber schedule payload/i);
  });

  it("writes blocked time updates through the canonical barber schedule path", async () => {
    const user = resolveDemoUser("blaze@bvrb3r.demo");
    getSessionUserMock.mockResolvedValue(user);
    updateBarberScheduleMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      businessDate: "2026-03-20",
      shops: [],
      status: {
        barberId: "barber-blaze",
        currentShopId: "loc-ybor",
        currentShopLabel: "BVRB3R Ybor",
        liveStatus: "available",
        liveStatusLabel: "Available",
        isOnline: true,
        acceptsWalkIns: true,
        nextAvailableAt: "2026-03-20T14:00:00.000Z",
        lastSeenAt: null,
        updatedAt: null,
        note: "Chair blocked for a personal appointment."
      },
      todayAppointments: [],
      upcomingAppointments: [],
      timeline: {
        viewMode: "day",
        anchorDate: "2026-03-20",
        rangeStart: "2026-03-20",
        rangeEnd: "2026-03-20",
        rangeLabel: "Friday, Mar 20, 2026",
        appointments: []
      },
      workingHours: [],
      blockedTimes: [{
        id: "block-1",
        startsAt: "2026-03-20T13:00:00.000Z",
        endsAt: "2026-03-20T14:00:00.000Z",
        reason: "Personal appointment"
      }]
    });

    const request = new NextRequest("https://bvrb3r.demo/api/barber/schedule", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        blockedPeriod: {
          startsAt: "2026-03-20T13:00:00.000Z",
          endsAt: "2026-03-20T14:00:00.000Z",
          reason: "Personal appointment"
        }
      })
    });

    const response = await postSchedule(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateBarberScheduleMock).toHaveBeenCalledWith(user, {
      locationId: "loc-ybor",
      blockedPeriod: {
        startsAt: "2026-03-20T13:00:00.000Z",
        endsAt: "2026-03-20T14:00:00.000Z",
        reason: "Personal appointment"
      }
    });
    expect(body.blockedTimes).toHaveLength(1);
    expect(body.blockedTimes[0].reason).toBe("Personal appointment");
  });

  it("returns barber clients scoped to the barber relationship set", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("fade@bvrb3r.demo"));
    getBarberClientsPayloadMock.mockResolvedValue({
      barberId: "barber-fade",
      barberName: "Fade Monroe",
      clients: []
    });

    const response = await getClients();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.barberName).toBe("Fade Monroe");
    expect(Array.isArray(body.clients)).toBe(true);
  });

  it("returns barber earnings from the real appointment and payment data model", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberEarningsPayloadMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      summary: {
        businessDate: "2026-03-20",
        todayBookings: 4,
        upcomingBookings: 2,
        completedServices: 2,
        grossSales: 110,
        tips: 20,
        averageTicket: 55,
        outstandingCheckoutCount: 0
      },
      growth: {
        weekRevenue: 245,
        monthRevenue: 890,
        repeatClientRevenue: 440,
        repeatClientShare: 49.4,
        outstandingBalance: 15,
        averageTip: 10,
        trends: [],
        topClients: [],
        serviceMix: [],
        subscription: null
      },
      recentAppointments: []
    });

    const response = await getEarnings();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.grossSales).toBe(110);
    expect(body.summary.tips).toBe(20);
    expect(body.growth.monthRevenue).toBe(890);
  });
});
