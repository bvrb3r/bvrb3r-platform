import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  getPublicShopProfilePayloadMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getPublicShopProfilePayloadMock: vi.fn()
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>
}));

vi.mock("@/components/marketplace/public-shop-profile", () => ({
  PublicShopProfile: ({ payload }: { payload: { shop: { name: string; shopUsername?: string } } }) => (
    <div data-testid="public-shop-route-profile">
      <span>{payload.shop.name}</span>
      <span>@{payload.shop.shopUsername}</span>
    </div>
  )
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getPublicShopProfilePayload: getPublicShopProfilePayloadMock
}));

import PublicShopProfilePage from "@/app/shop/[shopId]/page";

describe("public shop route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getPublicShopProfilePayloadMock.mockReset();
    getClientExperienceContextMock.mockResolvedValue({
      isGuest: true,
      isSignedInClient: false,
      viewer: { role: "guest" }
    });
  });

  it("loads a public shop page by shop handle instead of 404ing", async () => {
    getPublicShopProfilePayloadMock.mockResolvedValue({
      shop: {
        id: "shop-bvrb3r",
        name: "The BVRB3R Shop",
        shopUsername: "bvrb3rshop"
      },
      barbers: [],
      services: []
    });

    render(await PublicShopProfilePage({
      params: Promise.resolve({ shopId: "bvrb3rshop" })
    }));

    expect(getPublicShopProfilePayloadMock).toHaveBeenCalledWith("bvrb3rshop");
    expect(screen.getByTestId("public-shop-route-profile")).toBeInTheDocument();
    expect(screen.getByText("The BVRB3R Shop")).toBeInTheDocument();
    expect(screen.getByText("@bvrb3rshop")).toBeInTheDocument();
  });
});
