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

import TeamPage from "@/app/(platform)/team/page";
import AppointmentsPage from "@/app/(platform)/appointments/page";
import ReportsPage from "@/app/(platform)/reports/page";
import SettingsPage from "@/app/(platform)/settings/page";
import ServicesPage from "@/app/(platform)/services/page";
import WorkspaceProfilePage from "@/app/(platform)/workspace/profile/page";
import OwnerFinanceRedirectPage from "@/app/(platform)/dashboard/owner/finance/page";
import OwnerStaffRedirectPage from "@/app/(platform)/dashboard/owner/staff/page";
import OwnerOverviewRedirectPage from "@/app/(platform)/dashboard/owner/overview/page";

describe("owner legacy route redirects", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getAuthorizedUserMock.mockReset();
  });

  it("redirects shared owner team and schedule entries into the canonical owner tabs", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(TeamPage()).rejects.toThrow("REDIRECT:/dashboard/owner/team");

    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(
      AppointmentsPage({
        searchParams: Promise.resolve({
          view: "day",
          date: "2026-04-24"
        })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/owner/schedule?view=day&date=2026-04-24");
  });

  it("redirects owner money, settings, services, and profile entry points into the canonical owner tabs", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(
      ReportsPage({
        searchParams: Promise.resolve({ view: "growth" })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/owner/money?view=growth");

    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/dashboard/owner/settings");

    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(
      ServicesPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("REDIRECT:/dashboard/owner/settings?section=services");

    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    await expect(WorkspaceProfilePage()).rejects.toThrow("REDIRECT:/dashboard/owner/settings");
  });

  it("redirects old dashboard owner routes into the five-tab owner system", () => {
    expect(() => OwnerFinanceRedirectPage()).toThrow("REDIRECT:/dashboard/owner/money");
    expect(() => OwnerStaffRedirectPage()).toThrow("REDIRECT:/dashboard/owner/team");
    expect(() => OwnerOverviewRedirectPage()).toThrow("REDIRECT:/dashboard/owner");
  });
});
