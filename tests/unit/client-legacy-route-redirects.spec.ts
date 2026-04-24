import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { redirectMock, getAuthorizedUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  getAuthorizedUserMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

import SearchPage from "@/app/search/page";
import BookingsPage from "@/app/bookings/page";
import ProfilePage from "@/app/profile/page";
import ReferralsPage from "@/app/(platform)/referrals/page";
import SettingsPage from "@/app/(platform)/settings/page";
import WalletPage from "@/app/wallet/page";
import RewardsPage from "@/app/rewards/page";
import ClientBookingsRedirectPage from "@/app/(platform)/dashboard/client/bookings/page";

describe("client legacy route redirects", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getAuthorizedUserMock.mockReset();
  });

  it("redirects legacy search into the canonical client search route", async () => {
    await expect(
      SearchPage({
        searchParams: Promise.resolve({
          q: "fade",
          locationId: "loc-ybor",
          availability: "today"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/client/search?q=fade&locationId=loc-ybor&availability=today");
  });

  it("redirects legacy bookings into client activity and preserves query state", async () => {
    await expect(
      BookingsPage({
        searchParams: Promise.resolve({
          intent: "cancel"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/client/activity?intent=cancel");
  });

  it("redirects legacy profile entry into the canonical client profile route", async () => {
    await expect(
      ProfilePage({
        searchParams: Promise.resolve({
          section: "wallet"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/client/profile?section=wallet");
  });

  it("redirects referrals and section routes into profile sections", () => {
    expect(() => ReferralsPage()).toThrow("REDIRECT:/dashboard/client/profile?section=referrals");
    expect(() => WalletPage()).toThrow("REDIRECT:/dashboard/client/profile?section=wallet");
    expect(() => RewardsPage()).toThrow("REDIRECT:/dashboard/client/profile?section=rewards");
  });

  it("redirects legacy dashboard bookings into activity", () => {
    expect(() => ClientBookingsRedirectPage()).toThrow("REDIRECT:/dashboard/client/activity");
  });

  it("redirects client settings into the profile settings section", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/dashboard/client/profile?section=settings");
  });
});
