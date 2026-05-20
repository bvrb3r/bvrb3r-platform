import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  saveClientFavoriteBarberMock,
  getEngagementProviderMock,
  followBarberMock,
  getMarketplaceProviderMock,
  recordFollowCreatedMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  saveClientFavoriteBarberMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  followBarberMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  recordFollowCreatedMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  saveClientFavoriteBarber: saveClientFavoriteBarberMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: getMarketplaceProviderMock
}));

import { POST as postFavoriteBarber } from "@/app/api/client/favorite-barber/route";

describe("client favorite barber route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    saveClientFavoriteBarberMock.mockReset();
    getEngagementProviderMock.mockReset();
    followBarberMock.mockReset();
    getMarketplaceProviderMock.mockReset();
    recordFollowCreatedMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client_user",
        email: "client@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: true
    });
    getEngagementProviderMock.mockResolvedValue({
      followBarber: followBarberMock
    });
    getMarketplaceProviderMock.mockResolvedValue({
      recordFollowCreated: recordFollowCreatedMock
    });
  });

  it("rejects non-client access", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "owner",
        email: "owner@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: false
    });

    const response = await postFavoriteBarber(new Request("http://localhost:3000/api/client/favorite-barber", {
      method: "POST",
      body: JSON.stringify({ barberReference: "barber-blaze" })
    }));

    expect(response.status).toBe(403);
  });

  it("rejects invalid payloads", async () => {
    const response = await postFavoriteBarber(new Request("http://localhost:3000/api/client/favorite-barber", {
      method: "POST",
      body: JSON.stringify({})
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid favorite barber payload/i);
  });

  it("saves the canonical favorite barber and syncs the follow relationship", async () => {
    saveClientFavoriteBarberMock.mockResolvedValue({
      client: {
        clientReference: "client-jordan",
        fullName: "Jordan Ellis",
        phone: "8135550190",
        email: "client@bvrb3r.demo",
        favoriteBarberReference: "barber-43b3cda2",
        favoriteShopReference: "loc-ybor",
        loyaltyPoints: 125,
        retentionTag: "repeat",
        notes: []
      },
      favoriteBarber: {
        barber: { id: "barber-43b3cda2", name: "Phillip mcgee" },
        profile: { username: "barber-43b3cda2" }
      }
    });

    const response = await postFavoriteBarber(new Request("http://localhost:3000/api/client/favorite-barber", {
      method: "POST",
      body: JSON.stringify({ barberReference: "barber-43b3cda2" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveClientFavoriteBarberMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      barberReference: "barber-43b3cda2"
    });
    expect(followBarberMock).toHaveBeenCalledWith(
      {
        role: "client_user",
        userEmail: "client@bvrb3r.demo",
        clientId: "client-jordan"
      },
      {
        barberId: "barber-43b3cda2",
        notifyOnAvailability: true,
        notifyOnPortfolio: true
      }
    );
    expect(recordFollowCreatedMock).toHaveBeenCalledWith({
      barberId: "barber-43b3cda2",
      username: "barber-43b3cda2",
      clientId: "client-jordan"
    });
    expect(body.ok).toBe(true);
    expect(body.saved).toBe(true);
    expect(body.favoriteBarberReference).toBe("barber-43b3cda2");
    expect(body.client.favoriteBarberReference).toBe("barber-43b3cda2");
  });
});
