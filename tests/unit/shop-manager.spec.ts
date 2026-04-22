import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getShopDashboardPayloadMock,
  getQueueWorkspacePayloadMock,
  readPlatformShopControlStateMock
} = vi.hoisted(() => ({
  getShopDashboardPayloadMock: vi.fn(),
  getQueueWorkspacePayloadMock: vi.fn(),
  readPlatformShopControlStateMock: vi.fn()
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getShopDashboardPayload: getShopDashboardPayloadMock
}));

vi.mock("@/lib/queue/service", () => ({
  getQueueWorkspacePayload: getQueueWorkspacePayloadMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  readPlatformShopControlState: readPlatformShopControlStateMock
}));

import { getShopManagerPayload } from "@/lib/operations/shop-manager";

describe("shop manager service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00.000Z"));

    getShopDashboardPayloadMock.mockReset();
    getQueueWorkspacePayloadMock.mockReset();
    readPlatformShopControlStateMock.mockReset();

    getShopDashboardPayloadMock.mockResolvedValue({
      summary: {
        businessDate: "2026-04-21",
        readyForCheckoutCount: 1
      },
      appointments: [
        {
          id: "appt-cancelled",
          barberId: "barber-maya",
          status: "cancelled",
          start: "2026-04-21T13:00:00.000Z",
          totalAmount: 65,
          tipAmount: 0,
          balanceDue: 0,
          display: {
            barberName: "Maya Cole",
            serviceName: "Signature Cut"
          }
        },
        {
          id: "appt-completed",
          barberId: "barber-maya",
          status: "completed",
          start: "2026-04-21T10:00:00.000Z",
          totalAmount: 90,
          tipAmount: 15,
          balanceDue: 0,
          display: {
            barberName: "Maya Cole",
            serviceName: "Signature Cut"
          }
        }
      ],
      walkIns: [],
      barbers: [
        {
          id: "barber-maya",
          name: "Maya Cole",
          activeAppointmentCount: 0
        }
      ],
      ownerAnalytics: [{ businessDate: "2026-04-21", revenueTotal: 105 }],
      locations: [{ id: "shop-ybor" }]
    });

    getQueueWorkspacePayloadMock.mockResolvedValue({
      entries: [
        {
          id: "queue-1",
          clientName: "Jordan Ellis",
          waitMinutes: 12,
          serviceName: "Buzz Cut",
          status: "active",
          bestAvailableBarber: {
            barberId: "barber-maya",
            barberName: "Maya Cole"
          }
        }
      ]
    });

    readPlatformShopControlStateMock.mockResolvedValue({
      shopStatus: "active",
      aiManagerEnabled: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds owner suggestions from canonical shop, queue, and control data without growth links", async () => {
    const payload = await getShopManagerPayload(resolveDemoUser("owner@bvrb3r.demo"));

    expect(payload.mode).toBe("assist");
    expect(payload.summary.queueEntries).toBe(1);
    expect(payload.summary.openChairs).toBe(1);
    expect(readPlatformShopControlStateMock).toHaveBeenCalledWith("loc-ybor");
    expect(readPlatformShopControlStateMock).toHaveBeenCalledWith("loc-hyde");
    expect(readPlatformShopControlStateMock).toHaveBeenCalledWith("shop-ybor");
    expect(payload.suggestions.some((suggestion) => suggestion.action?.kind === "link" && suggestion.action.href.includes("growth"))).toBe(false);
    expect(payload.suggestions.some((suggestion) => suggestion.action?.kind === "link" && suggestion.action.href === "/team")).toBe(true);
  });

  it("honestly disables auto guidance when platform control turns AI manager off", async () => {
    readPlatformShopControlStateMock.mockResolvedValue({
      shopStatus: "paused",
      aiManagerEnabled: false
    });

    const payload = await getShopManagerPayload(resolveDemoUser("owner@bvrb3r.demo"));

    expect(payload.autoModeAvailable).toBe(false);
    expect(payload.suggestions).toEqual([]);
    expect(payload.autoModeReason).toMatch(/disabled for this shop/i);
  });
});
