import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createBarberShopJoinRequestMock,
  createOwnerTeamInviteMock,
  getSessionUserMock,
  listBarberJoinableShopsMock,
  listBarberTeamInvitesMock,
  listOwnerTeamInviteDirectoryMock,
  respondToBarberTeamInviteMock,
  respondToOwnerJoinRequestMock
} = vi.hoisted(() => ({
  createBarberShopJoinRequestMock: vi.fn(),
  createOwnerTeamInviteMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  listBarberJoinableShopsMock: vi.fn(),
  listBarberTeamInvitesMock: vi.fn(),
  listOwnerTeamInviteDirectoryMock: vi.fn(),
  respondToBarberTeamInviteMock: vi.fn(),
  respondToOwnerJoinRequestMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/operations/shop-team-invites", () => ({
  ShopTeamInviteServiceError: class ShopTeamInviteServiceError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  createBarberShopJoinRequest: createBarberShopJoinRequestMock,
  createOwnerTeamInvite: createOwnerTeamInviteMock,
  listBarberJoinableShops: listBarberJoinableShopsMock,
  listBarberTeamInvites: listBarberTeamInvitesMock,
  listOwnerTeamInviteDirectory: listOwnerTeamInviteDirectoryMock,
  respondToBarberTeamInvite: respondToBarberTeamInviteMock,
  respondToOwnerJoinRequest: respondToOwnerJoinRequestMock
}));

describe("shop team invite routes", () => {
  beforeEach(() => {
    createBarberShopJoinRequestMock.mockReset();
    createOwnerTeamInviteMock.mockReset();
    getSessionUserMock.mockReset();
    listBarberJoinableShopsMock.mockReset();
    listBarberTeamInvitesMock.mockReset();
    listOwnerTeamInviteDirectoryMock.mockReset();
    respondToBarberTeamInviteMock.mockReset();
    respondToOwnerJoinRequestMock.mockReset();

    getSessionUserMock.mockResolvedValue({
      id: "profile-owner",
      role: "owner",
      email: "owner@example.com"
    });
  });

  it("loads the owner searchable barber directory through the canonical service", async () => {
    listOwnerTeamInviteDirectoryMock.mockResolvedValue({
      shop: { id: "shop-ybor", label: "BVRB3R Ybor" },
      barbers: []
    });
    const { GET } = await import("@/app/api/owner/team/invites/route");

    const response = await GET({ nextUrl: new URL("https://bvrb3r.test/api/owner/team/invites?q=fade") } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shop.id).toBe("shop-ybor");
    expect(listOwnerTeamInviteDirectoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner" }),
      "fade"
    );
  });

  it("creates owner invites without assigning the barber immediately", async () => {
    createOwnerTeamInviteMock.mockResolvedValue({
      id: "invite-1",
      shopId: "shop-ybor",
      barberId: "barber-real",
      barberName: "Real Barber",
      status: "invited"
    });
    const { POST } = await import("@/app/api/owner/team/invites/route");

    const response = await POST(new Request("https://bvrb3r.test/api/owner/team/invites", {
      method: "POST",
      body: JSON.stringify({
        shopId: "shop-ybor",
        barberId: "barber-real"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite.status).toBe("invited");
    expect(createOwnerTeamInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner" }),
      {
        shopId: "shop-ybor",
        barberId: "barber-real"
      }
    );
  });

  it("lets barbers search approved shops that can receive team requests", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "commission_barber",
      barberId: "barber-real",
      email: "barber@example.com"
    });
    listBarberJoinableShopsMock.mockResolvedValue({
      shops: [{
        shopId: "shop-location-uuid",
        shopReference: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        approvalStatus: "approved",
        liveStatusLabel: "Not live yet",
        alreadyAssigned: false,
        inviteStatus: null,
        canRequest: true,
        readinessLabels: ["Approved shop", "Setup incomplete"]
      }]
    });
    const { GET } = await import("@/app/api/barber/shop-requests/route");

    const response = await GET({ nextUrl: new URL("https://bvrb3r.test/api/barber/shop-requests?q=ybor") } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shops[0].readinessLabels).toContain("Setup incomplete");
    expect(listBarberJoinableShopsMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "commission_barber", barberId: "barber-real" }),
      "ybor"
    );
  });

  it("lets a barber request to join a shop without auto-assigning", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "booth_rent_barber",
      barberId: "barber-real",
      email: "barber@example.com"
    });
    createBarberShopJoinRequestMock.mockResolvedValue({
      id: "invite-join-1",
      shopId: "shop-ybor",
      shopLabel: "BVRB3R Ybor",
      barberId: "barber-real",
      barberName: "Real Barber",
      status: "requested"
    });
    const { POST } = await import("@/app/api/barber/shop-requests/route");

    const response = await POST(new Request("https://bvrb3r.test/api/barber/shop-requests", {
      method: "POST",
      body: JSON.stringify({ shopId: "shop-location-uuid" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite.status).toBe("requested");
    expect(createBarberShopJoinRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "booth_rent_barber", barberId: "barber-real" }),
      { shopId: "shop-location-uuid" }
    );
  });

  it("lets a barber accept a shop invitation through the canonical response service", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "commission_barber",
      barberId: "barber-real",
      email: "barber@example.com"
    });
    respondToBarberTeamInviteMock.mockResolvedValue({
      invite: {
        id: "invite-1",
        shopId: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        barberId: "barber-real",
        barberName: "Real Barber",
        status: "active"
      }
    });
    const { PATCH } = await import("@/app/api/barber/team-invites/route");

    const response = await PATCH(new Request("https://bvrb3r.test/api/barber/team-invites", {
      method: "PATCH",
      body: JSON.stringify({
        inviteId: "invite-1",
        status: "accepted"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite.status).toBe("active");
    expect(respondToBarberTeamInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "commission_barber", barberId: "barber-real" }),
      {
        inviteId: "invite-1",
        status: "accepted"
      }
    );
  });

  it("lets a barber decline a shop invitation without creating an assignment", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "booth_rent_barber",
      barberId: "barber-real",
      email: "barber@example.com"
    });
    respondToBarberTeamInviteMock.mockResolvedValue({
      invite: {
        id: "invite-1",
        shopId: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        barberId: "barber-real",
        barberName: "Real Barber",
        status: "declined"
      }
    });
    const { PATCH } = await import("@/app/api/barber/team-invites/route");

    const response = await PATCH(new Request("https://bvrb3r.test/api/barber/team-invites", {
      method: "PATCH",
      body: JSON.stringify({
        inviteId: "invite-1",
        status: "declined"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite.status).toBe("declined");
    expect(respondToBarberTeamInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "booth_rent_barber", barberId: "barber-real" }),
      {
        inviteId: "invite-1",
        status: "declined"
      }
    );
  });

  it("lets an owner accept a barber join request through the canonical response service", async () => {
    respondToOwnerJoinRequestMock.mockResolvedValue({
      invite: {
        id: "join-1",
        shopId: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        barberId: "barber-real",
        barberName: "Real Barber",
        status: "active"
      }
    });
    const { PATCH } = await import("@/app/api/owner/team/invites/route");

    const response = await PATCH(new Request("https://bvrb3r.test/api/owner/team/invites", {
      method: "PATCH",
      body: JSON.stringify({
        inviteId: "join-1",
        status: "accepted"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite.status).toBe("active");
    expect(respondToOwnerJoinRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner" }),
      {
        inviteId: "join-1",
        status: "accepted"
      }
    );
  });
});
