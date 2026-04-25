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

import CommandPage from "@/app/(platform)/command/page";
import EarningsPage from "@/app/(platform)/earnings/page";
import AppointmentsPage from "@/app/(platform)/appointments/page";
import ServicesPage from "@/app/(platform)/services/page";
import WorkspaceProfilePage from "@/app/(platform)/workspace/profile/page";
import BarberAppointmentsRedirectPage from "@/app/(platform)/dashboard/barber/appointments/page";
import BarberAvailabilityRedirectPage from "@/app/(platform)/dashboard/barber/availability/page";
import BarberEarningsRedirectPage from "@/app/(platform)/dashboard/barber/earnings/page";
import BarberServicesRedirectPage from "@/app/(platform)/dashboard/barber/services/page";
import BarberPayoutsRedirectPage from "@/app/(platform)/dashboard/barber/payouts/page";
import BarberReviewsRedirectPage from "@/app/(platform)/dashboard/barber/reviews/page";
import BarberSettingsRedirectPage from "@/app/(platform)/dashboard/barber/settings/page";

describe("barber legacy route redirects", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getAuthorizedUserMock.mockReset();
  });

  it("redirects the old barber command and earnings entries into the new barber tabs", async () => {
    await expect(CommandPage()).rejects.toThrow("REDIRECT:/dashboard/barber/calendar");
    await expect(EarningsPage()).rejects.toThrow("REDIRECT:/dashboard/barber/checkout?section=earnings");
  });

  it("redirects shared barber appointments into the barber calendar and keeps query state", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(
      AppointmentsPage({
        searchParams: Promise.resolve({
          view: "week",
          date: "2026-04-24"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/barber/calendar?view=week&date=2026-04-24");
  });

  it("redirects shared barber services into Checkout and preserves extra query state", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(
      ServicesPage({
        searchParams: Promise.resolve({
          source: "legacy"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/barber/checkout?section=services&source=legacy");
  });

  it("redirects shared barber profile into the barber profile tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(WorkspaceProfilePage()).rejects.toThrow("REDIRECT:/dashboard/barber/profile");
  });

  it("redirects old dashboard barber routes into the new canonical barber tabs", async () => {
    expect(() => BarberAppointmentsRedirectPage()).toThrow("REDIRECT:/dashboard/barber/calendar");
    expect(() => BarberAvailabilityRedirectPage()).toThrow("REDIRECT:/dashboard/barber/calendar");
    expect(() => BarberEarningsRedirectPage()).toThrow("REDIRECT:/dashboard/barber/checkout?section=earnings");
    expect(() => BarberServicesRedirectPage()).toThrow("REDIRECT:/dashboard/barber/checkout?section=services");
    expect(() => BarberPayoutsRedirectPage()).toThrow("REDIRECT:/dashboard/barber/profile?section=payouts");
    expect(() => BarberReviewsRedirectPage()).toThrow("REDIRECT:/dashboard/barber/profile?section=reviews");
    await expect(BarberSettingsRedirectPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/dashboard/barber/profile?section=settings");
  });
});
