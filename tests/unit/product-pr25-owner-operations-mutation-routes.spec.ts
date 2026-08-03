import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  updateOwnerFloorControlsMock,
  setOwnerKioskEmergencyStateMock,
  updateOwnerKioskPolicyMock,
  pairOwnerKioskDeviceMock,
  createOwnerChairMock,
  retireOwnerChairMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  updateOwnerFloorControlsMock: vi.fn(),
  setOwnerKioskEmergencyStateMock: vi.fn(),
  updateOwnerKioskPolicyMock: vi.fn(),
  pairOwnerKioskDeviceMock: vi.fn(),
  createOwnerChairMock: vi.fn(),
  retireOwnerChairMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/booking/route-auth")>();
  return { ...original, getSessionUser: getSessionUserMock };
});

vi.mock("@/lib/owner-operations/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/owner-operations/service")>();
  return {
    ...original,
    updateOwnerFloorControls: updateOwnerFloorControlsMock,
    setOwnerKioskEmergencyState: setOwnerKioskEmergencyStateMock,
    updateOwnerKioskPolicy: updateOwnerKioskPolicyMock,
    pairOwnerKioskDevice: pairOwnerKioskDeviceMock,
    createOwnerChair: createOwnerChairMock,
    retireOwnerChair: retireOwnerChairMock
  };
});

import { PATCH as patchFloor } from "@/app/api/owner/operations/floor/route";
import {
  PATCH as patchKiosk,
  POST as pairKiosk
} from "@/app/api/owner/operations/kiosk/route";
import {
  PATCH as retireChair,
  POST as createChair
} from "@/app/api/owner/operations/chairs/route";
import { OwnerOperationsServiceError } from "@/lib/owner-operations/service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "shop_owner_user",
  ownedShopId: "shop-one",
  locationIds: ["shop-one"]
};

function request(url: string, method: "POST" | "PATCH", body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Product PR25 owner mutation routes", () => {
  beforeEach(() => {
    for (const mock of [
      getSessionUserMock,
      updateOwnerFloorControlsMock,
      setOwnerKioskEmergencyStateMock,
      updateOwnerKioskPolicyMock,
      pairOwnerKioskDeviceMock,
      createOwnerChairMock,
      retireOwnerChairMock
    ]) {
      mock.mockReset();
    }
    getSessionUserMock.mockResolvedValue(user);
  });

  it("requires a reason for every floor-control mutation", async () => {
    const response = await patchFloor(request(
      "https://example.test/api/owner/operations/floor",
      "PATCH",
      { shopId: "shop-one", intakeOpen: false }
    ));
    expect(response.status).toBe(400);
    expect(updateOwnerFloorControlsMock).not.toHaveBeenCalled();
  });

  it("passes an explicit emergency-disable reason to the server service", async () => {
    setOwnerKioskEmergencyStateMock.mockResolvedValue({
      kiosk: { enabled: false, health_status: "disabled" },
      activeSessionsRevoked: true
    });
    const response = await patchKiosk(request(
      "https://example.test/api/owner/operations/kiosk",
      "PATCH",
      {
        shopId: "shop-one",
        disabled: true,
        reason: "Front device is unattended."
      }
    ));
    expect(response.status).toBe(200);
    expect(setOwnerKioskEmergencyStateMock).toHaveBeenCalledWith(user, {
      shopId: "shop-one",
      disabled: true,
      reason: "Front device is unattended."
    });
  });

  it("writes complete kiosk policy through the owner-scoped service", async () => {
    updateOwnerKioskPolicyMock.mockResolvedValue({
      kiosk: { privacy_mode: true, rotation_policy: "balanced" }
    });
    const response = await patchKiosk(request(
      "https://example.test/api/owner/operations/kiosk",
      "PATCH",
      {
        shopId: "shop-one",
        action: "policy",
        privacyMode: true,
        rotationPolicy: "balanced",
        reason: "Protect unattended guest sessions."
      }
    ));
    expect(response.status).toBe(200);
    expect(updateOwnerKioskPolicyMock).toHaveBeenCalledWith(user, {
      shopId: "shop-one",
      action: "policy",
      privacyMode: true,
      rotationPolicy: "balanced",
      reason: "Protect unattended guest sessions."
    });
  });

  it("returns a one-time pairing code only after server pairing succeeds", async () => {
    pairOwnerKioskDeviceMock.mockResolvedValue({
      kiosk: { enabled: true, health_status: "healthy" },
      pairingCode: "145902",
      expiresAt: "2026-07-29T16:00:00.000Z"
    });
    const response = await pairKiosk(request(
      "https://example.test/api/owner/operations/kiosk",
      "POST",
      {
        shopId: "shop-one",
        reason: "Pair the front counter iPad."
      }
    ));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pairingCode).toBe("145902");
    expect(pairOwnerKioskDeviceMock).toHaveBeenCalledWith(user, {
      shopId: "shop-one",
      reason: "Pair the front counter iPad."
    });
  });

  it("validates chair creation and returns 201 only after service success", async () => {
    createOwnerChairMock.mockResolvedValue({
      chair: { id: "22222222-2222-4222-8222-222222222222", label: "Chair 4" }
    });
    const response = await createChair(request(
      "https://example.test/api/owner/operations/chairs",
      "POST",
      {
        shopId: "shop-one",
        label: "Chair 4",
        sortOrder: 4,
        reason: "Added a new floor station."
      }
    ));
    expect(response.status).toBe(201);
    expect(createOwnerChairMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ label: "Chair 4", sortOrder: 4 })
    );
  });

  it("surfaces settle-first chair retirement as a controlled conflict", async () => {
    retireOwnerChairMock.mockRejectedValue(new OwnerOperationsServiceError(
      "Open booth rent must be settled before retiring this assigned chair.",
      409,
      "unsettled_booth_rent"
    ));
    const response = await retireChair(request(
      "https://example.test/api/owner/operations/chairs",
      "PATCH",
      {
        shopId: "shop-one",
        chairId: "22222222-2222-4222-8222-222222222222",
        reason: "Removing this station from the active floor."
      }
    ));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe("unsettled_booth_rent");
  });
});
