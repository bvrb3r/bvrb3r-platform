import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

import CanonicalKioskCheckInPage from "@/app/kiosk/checkin/page";
import { parseKioskDeviceCookieValue } from "@/lib/kiosk/device";

describe("canonical kiosk check-in entry", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    redirectMock.mockClear();
  });

  it("opens the paired shop kiosk and preserves a supported locale", async () => {
    cookiesMock.mockResolvedValue({
      get: () => ({ value: "shop%2Fybor" })
    });

    await expect(CanonicalKioskCheckInPage({
      searchParams: Promise.resolve({ lang: "es" })
    })).rejects.toThrow("REDIRECT:/kiosk/shop/shop%2Fybor?mode=check-in&lang=es");
  });

  it("renders an honest setup gate when the device has no assignment", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });

    const result = await CanonicalKioskCheckInPage({
      searchParams: Promise.resolve({})
    });

    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed device cookie", () => {
    expect(parseKioskDeviceCookieValue("%E0%A4%A")).toBeNull();
  });
});
