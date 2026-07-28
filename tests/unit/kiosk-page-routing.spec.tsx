import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/components/kiosk/kiosk-parity-screen", () => ({
  KioskParityScreen: () => null
}));

import KioskPage from "@/app/kiosk/[shopId]/page";

describe("legacy shop kiosk page routing", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects the legacy shop kiosk path to the explicit shop kiosk route", async () => {
    await KioskPage({ params: Promise.resolve({ shopId: "shop-123" }) });

    expect(redirectMock).toHaveBeenCalledWith("/kiosk/shop/shop-123");
  });
});
