import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  getShopDashboardPayloadMock,
  readOwnerOperationsControlStateMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getShopDashboardPayloadMock: vi.fn(),
  readOwnerOperationsControlStateMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/booking/route-auth")>();
  return {
    ...original,
    getSessionUser: getSessionUserMock
  };
});

vi.mock("@/lib/config/runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/config/runtime")>();
  return {
    ...original,
    isDemoMode: () => false
  };
});

vi.mock("@/lib/booking/platform-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/booking/platform-service")>();
  return {
    ...original,
    getShopDashboardPayload: getShopDashboardPayloadMock
  };
});

vi.mock("@/lib/owner-operations/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/owner-operations/service")>();
  return {
    ...original,
    readOwnerOperationsControlState: readOwnerOperationsControlStateMock
  };
});

import { GET as getOwnerOperations } from "@/app/api/owner/operations/route";
import { GET as getLegacyShopDashboard } from "@/app/api/shop/dashboard/route";

const owner = {
  id: "owner-1",
  role: "shop_owner_user",
  email: "owner@example.test",
  password: "",
  name: "Owner",
  title: "Owner",
  ownedShopId: "shop-one",
  locationIds: ["shop-one", "shop-two"]
};

function emptyDashboard() {
  return {
    summary: { businessDate: "2026-07-29", revenueToday: 0 },
    barbers: [],
    activeBarbers: [],
    appointments: [],
    ownerAnalytics: [],
    walkIns: [],
    locations: [{
      id: "shop-one",
      name: "Shop One",
      label: "Shop One",
      neighborhood: "",
      city: "Detroit",
      state: "MI"
    }],
    workflowEvents: []
  };
}

describe("Product PR25 owner operations route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getShopDashboardPayloadMock.mockReset();
    readOwnerOperationsControlStateMock.mockReset();
    getSessionUserMock.mockResolvedValue(owner);
    getShopDashboardPayloadMock.mockResolvedValue(emptyDashboard());
    readOwnerOperationsControlStateMock.mockResolvedValue({
      floor: {
        intakeOpen: true,
        floorNote: null,
        rotationOverrideBarberId: null,
        rotationOverrideReason: null,
        rotationOverrideExpiresAt: null,
        version: 1
      },
      kiosk: {
        paired: false,
        pinSet: false,
        enabled: false,
        healthStatus: "unpaired",
        emergencyDisabledAt: null,
        privacyMode: true,
        autoResetEnabled: true,
        externalCheckinEnabled: false,
        guestCheckinAllowed: true,
        qrEntryEnabled: true,
        nfcEntryEnabled: false,
        clientBridgePromptEnabled: true,
        clientBridgePromptFrequency: "once_per_visit",
        notificationFailureEscalation: true,
        rotationPolicy: "balanced",
        balanceGuardrailMinutes: 20,
        paymentCollectionPolicy: "barber_checkout",
        sessionTimeoutSeconds: 75
      },
      chairs: [],
      boothRent: { billedCents: 0, paidCents: 0, outstandingCents: 0, overdueCount: 0 },
      clientBridge: { offered: 0, consented: 0, invitations: 0, claimed: 0, optedOut: 0 }
    });
  });

  it("rejects a shop outside the authenticated owner's scope", async () => {
    const response = await getOwnerOperations(
      new Request("https://example.test/api/owner/operations?shopId=shop-three")
    );
    expect(response.status).toBe(403);
    expect(getShopDashboardPayloadMock).not.toHaveBeenCalled();
  });

  it("queries exactly one approved shop and returns a private projection", async () => {
    const response = await getOwnerOperations(
      new Request("https://example.test/api/owner/operations?shopId=shop-one")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getShopDashboardPayloadMock).toHaveBeenCalledWith({
      role: "owner",
      locationIds: ["shop-one"],
      email: "owner@example.test"
    });
    expect(readOwnerOperationsControlStateMock).toHaveBeenCalledWith(owner, "shop-one");
    expect(body.scope.shopId).toBe("shop-one");
    expect(JSON.stringify(body)).not.toMatch(/revenueToday|tipAmount|balanceDue|ownerAnalytics/);
  });

  it("blocks the legacy all-money dashboard for shop owners", async () => {
    const response = await getLegacyShopDashboard();
    expect(response.status).toBe(410);
    expect(getShopDashboardPayloadMock).not.toHaveBeenCalled();
  });

  it("does not allow a non-owner through the owner endpoint", async () => {
    getSessionUserMock.mockResolvedValue({ ...owner, role: "barber_user" });
    const response = await getOwnerOperations(
      new Request("https://example.test/api/owner/operations?shopId=shop-one")
    );
    expect(response.status).toBe(403);
  });
});
