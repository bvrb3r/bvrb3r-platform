import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  setOwnerTeamRelationshipPauseMock,
  endBarberShopRelationshipMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  setOwnerTeamRelationshipPauseMock: vi.fn(),
  endBarberShopRelationshipMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/booking/route-auth")>();
  return { ...original, getSessionUser: getSessionUserMock };
});

vi.mock("@/lib/operations/shop-team-invites", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/operations/shop-team-invites")>();
  return {
    ...original,
    setOwnerTeamRelationshipPause: setOwnerTeamRelationshipPauseMock,
    endBarberShopRelationship: endBarberShopRelationshipMock
  };
});

import {
  DELETE as endRelationship,
  PATCH as pauseRelationship
} from "@/app/api/owner/team/relationships/route";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "shop_owner_user",
  ownedShopId: "shop-one",
  locationIds: ["shop-one"]
};

function request(method: "PATCH" | "DELETE", body: unknown) {
  return new Request("https://example.test/api/owner/team/relationships", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Product PR25 owner relationship routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    setOwnerTeamRelationshipPauseMock.mockReset();
    endBarberShopRelationshipMock.mockReset();
    getSessionUserMock.mockResolvedValue(user);
  });

  it("requires a reason and sends pause through the canonical service", async () => {
    setOwnerTeamRelationshipPauseMock.mockResolvedValue({
      relationshipId: "relationship-one",
      status: "paused"
    });
    const response = await pauseRelationship(request("PATCH", {
      relationshipId: "relationship-one",
      paused: true,
      reason: "Barber is away from the floor."
    }));
    expect(response.status).toBe(200);
    expect(setOwnerTeamRelationshipPauseMock).toHaveBeenCalledWith(user, {
      relationshipId: "relationship-one",
      paused: true,
      reason: "Barber is away from the floor."
    });
  });

  it("keeps relationship ending on the settle-first service path", async () => {
    endBarberShopRelationshipMock.mockResolvedValue({
      relationshipId: "relationship-one",
      effectiveRoutingModel: "freelance"
    });
    const response = await endRelationship(request("DELETE", {
      relationshipId: "relationship-one",
      reason: "Agreement ended after settlement."
    }));
    expect(response.status).toBe(200);
    expect(endBarberShopRelationshipMock).toHaveBeenCalledWith(user, {
      actor: "owner",
      relationshipId: "relationship-one",
      reason: "Agreement ended after settlement."
    });
  });
});
