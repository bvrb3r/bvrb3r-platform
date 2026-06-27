import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { redirectMock, getAuthorizedUserMock, getClientExperienceContextMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  getAuthorizedUserMock: vi.fn(),
  getClientExperienceContextMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children }: { children: ReactNode }) => createElement("div", null, children)
}));

vi.mock("@/components/booking/guest-booking-lookup", () => ({
  GuestBookingLookup: ({ initialConfirmation }: { initialConfirmation?: string }) =>
    createElement("div", { "data-testid": "guest-booking-lookup" }, initialConfirmation)
}));

import SearchPage from "@/app/search/page";
import BookingsPage from "@/app/bookings/page";
import ProfilePage from "@/app/profile/page";
import ReferralsPage from "@/app/(platform)/referrals/page";
import SettingsPage from "@/app/(platform)/settings/page";
import WalletPage from "@/app/wallet/page";
import RewardsPage from "@/app/rewards/page";
import ClientBookingsRedirectPage from "@/app/(platform)/dashboard/client/bookings/page";
import ClientMessagesPage from "@/app/messages/page";
import ClientMessageThreadPage from "@/app/messages/[threadId]/page";

describe("client legacy route redirects", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getAuthorizedUserMock.mockReset();
    getClientExperienceContextMock.mockReset();
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "guest-user",
        role: "client_user",
        email: "guest@bvrb3r.local"
      },
      activeClient: null,
      clientId: "",
      isSignedInClient: false,
      isGuest: true
    });
  });

  it("redirects legacy search into the public discovery route", async () => {
    await expect(
      SearchPage({
        searchParams: Promise.resolve({
          q: "fade",
          locationId: "loc-ybor",
          availability: "today"
        })
      })
    ).rejects.toThrow("REDIRECT:/discover?q=fade&locationId=loc-ybor&availability=today");
  });

  it("renders public booking lookup for guests without redirecting into client activity", async () => {
    const result = await BookingsPage({
      searchParams: Promise.resolve({
        confirmation: "BVRGUEST1"
      })
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("redirects signed-in client bookings into client activity and preserves query state", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "11111111-1111-4111-8111-111111111111",
        role: "client_user",
        email: "client@bvrb3r.demo"
      },
      activeClient: {
        email: "client@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: true,
      isGuest: false
    });

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

  it("redirects legacy messages into the canonical client messages route", async () => {
    await expect(
      ClientMessagesPage({
        searchParams: Promise.resolve({ thread: "support" })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/client/messages?thread=support");

    await expect(
      ClientMessageThreadPage({
        params: Promise.resolve({ threadId: "thread-support-1" })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/client/messages/thread-support-1");
  });

  it("redirects client settings into the profile settings section", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/dashboard/client/profile?section=settings");
  });
});
