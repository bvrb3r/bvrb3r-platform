import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/components/kiosk/kiosk-parity-screen", () => ({
  KioskParityScreen: (props: Record<string, unknown>) => props
}));

vi.mock("@/components/kiosk/kiosk-mode-screen", () => ({
  KioskModeScreen: (props: Record<string, unknown>) => ({ type: "check-in", ...props })
}));

import BarberKioskPage from "@/app/kiosk/barber/[barberId]/page";
import LegacyKioskPage from "@/app/kiosk/[shopId]/page";
import ExplicitShopKioskPage from "@/app/kiosk/shop/[shopId]/page";

/**
 * `?lang=` is how a shop prints or bookmarks a kiosk in a given language, so
 * the language has to be resolved on the server before the first paint.
 */
describe("kiosk page language routing", () => {
  it("boots the shop kiosk into Spanish for ?lang=es", async () => {
    const element = await ExplicitShopKioskPage({
      params: Promise.resolve({ shopId: "loc-ybor" }),
      searchParams: Promise.resolve({ lang: "es" })
    });

    expect(element.props).toMatchObject({ shopId: "loc-ybor", scope: "shop", initialLocale: "es" });
  });

  it("boots the shop kiosk into Kreyòl for ?lang=ht and English by default", async () => {
    const kreyol = await ExplicitShopKioskPage({
      params: Promise.resolve({ shopId: "loc-ybor" }),
      searchParams: Promise.resolve({ lang: "ht" })
    });
    const fallback = await ExplicitShopKioskPage({
      params: Promise.resolve({ shopId: "loc-ybor" }),
      searchParams: Promise.resolve({})
    });

    expect(kreyol.props.initialLocale).toBe("ht");
    expect(fallback.props.initialLocale).toBe("en");
  });

  it("opens the functional appointment check-in flow for ?mode=check-in", async () => {
    const element = await ExplicitShopKioskPage({
      params: Promise.resolve({ shopId: "loc-ybor" }),
      searchParams: Promise.resolve({ mode: "check-in" })
    });

    expect(element.props).toMatchObject({ shopId: "loc-ybor", scope: "shop" });
    expect(element.props).not.toHaveProperty("initialLocale");
  });

  it("boots the barber kiosk into the requested language", async () => {
    const element = await BarberKioskPage({
      params: Promise.resolve({ barberId: "barber-blaze" }),
      searchParams: Promise.resolve({ lang: "es-MX" })
    });

    expect(element.props).toMatchObject({ shopId: "barber-blaze", scope: "barber", initialLocale: "es" });
  });

  it("carries the language across the legacy kiosk redirect", async () => {
    redirectMock.mockReset();
    await LegacyKioskPage({
      params: Promise.resolve({ shopId: "shop-123" }),
      searchParams: Promise.resolve({ lang: "es" })
    });

    expect(redirectMock).toHaveBeenCalledWith("/kiosk/shop/shop-123?lang=es");
  });

  it("does not append a redundant language to an English legacy redirect", async () => {
    redirectMock.mockReset();
    await LegacyKioskPage({ params: Promise.resolve({ shopId: "shop-123" }) });

    expect(redirectMock).toHaveBeenCalledWith("/kiosk/shop/shop-123");
  });
});
