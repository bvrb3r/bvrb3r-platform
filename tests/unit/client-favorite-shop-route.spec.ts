import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  saveClientFavoriteShopMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  saveClientFavoriteShopMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  saveClientFavoriteShop: saveClientFavoriteShopMock
}));

import { POST as postFavoriteShop } from "@/app/api/client/favorite-shop/route";

describe("client favorite shop route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    saveClientFavoriteShopMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client",
        email: "client@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: true
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

    const response = await postFavoriteShop(new Request("http://localhost:3000/api/client/favorite-shop", {
      method: "POST",
      body: JSON.stringify({ shopReference: "shop-ybor" })
    }));

    expect(response.status).toBe(403);
  });

  it("rejects invalid payloads", async () => {
    const response = await postFavoriteShop(new Request("http://localhost:3000/api/client/favorite-shop", {
      method: "POST",
      body: JSON.stringify({})
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid favorite shop payload/i);
  });

  it("saves the canonical favorite shop preference", async () => {
    saveClientFavoriteShopMock.mockResolvedValue({
      client: {
        clientReference: "client-jordan",
        fullName: "Jordan Ellis",
        phone: "8135550190",
        email: "client@bvrb3r.demo",
        favoriteBarberReference: "barber-blaze",
        favoriteShopReference: "shop-ybor",
        loyaltyPoints: 125,
        retentionTag: "repeat",
        notes: []
      },
      favoriteShop: {
        shop: { id: "shop-ybor", name: "BVRB3R Ybor" }
      }
    });

    const response = await postFavoriteShop(new Request("http://localhost:3000/api/client/favorite-shop", {
      method: "POST",
      body: JSON.stringify({ shopReference: "shop-ybor" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveClientFavoriteShopMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      shopReference: "shop-ybor"
    });
    expect(body.client.favoriteShopReference).toBe("shop-ybor");
  });
});
