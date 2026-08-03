import { describe, expect, it } from "vitest";
import {
  allPr36LaunchChecksGreen,
  buildPr36LaunchChecklist,
  formatPr36WaitlistPosition,
  pr36PaymentAllowed,
  resolvePr36BookingAccess,
  resolvePr36LaunchPhase,
  type Pr36LaunchConfigRow,
  type Pr36LaunchEvidence
} from "@/lib/shops/pr36-prelaunch-domain";

const config: Pr36LaunchConfigRow = {
  shop_id: "southside",
  opening_at: "2026-08-15T14:00:00.000Z",
  chair_capacity: 6,
  head_start_hours: 24,
  status: "launch_scheduled",
  page_visits: 1204,
  version: 2,
  go_live_approved_at: "2026-08-01T12:00:00.000Z",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z"
};

const greenEvidence: Pr36LaunchEvidence = {
  identity: {
    approved: true,
    name: "Southside Chop House",
    publicUsername: "southsidechophouse",
    address: "1204 S MacDill Ave",
    city: "Tampa",
    state: "FL"
  },
  stripe: {
    connected: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    onboardingStatus: "verified",
    payoutReadinessStatus: "ready"
  },
  policies: { published: true },
  hours: { published: true },
  team: { foundingChairCount: 6, chairCapacity: 6 },
  kiosk: { enabled: true, paired: true, tested: true }
};

describe("Product PR36 shop prelaunch domain", () => {
  it("opens waitlist booking exactly 24 hours before public booking", () => {
    expect(resolvePr36LaunchPhase(config, new Date("2026-08-14T13:59:59.000Z"))).toBe("scheduled");
    expect(resolvePr36LaunchPhase(config, new Date("2026-08-14T14:00:00.000Z"))).toBe("waitlist_head_start");
    expect(resolvePr36BookingAccess({ config, viewerWaitlisted: true, now: new Date("2026-08-14T18:00:00.000Z") })).toBe("waitlist_only");
    expect(resolvePr36BookingAccess({ config, viewerWaitlisted: false, now: new Date("2026-08-14T18:00:00.000Z") })).toBe("closed");
    expect(resolvePr36BookingAccess({ config, viewerWaitlisted: false, now: new Date("2026-08-15T14:00:00.000Z") })).toBe("public");
  });

  it("never permits payment during the waitlist head start", () => {
    expect(pr36PaymentAllowed(config, new Date("2026-08-14T20:00:00.000Z"))).toBe(false);
    expect(pr36PaymentAllowed(config, new Date("2026-08-15T14:00:00.000Z"))).toBe(true);
    expect(pr36PaymentAllowed({ ...config, status: "prelaunch", go_live_approved_at: null }, new Date("2026-08-16T14:00:00.000Z"))).toBe(false);
  });

  it("requires all six real readiness families before Go live", () => {
    const greenChecks = buildPr36LaunchChecklist(greenEvidence);
    expect(greenChecks).toHaveLength(6);
    expect(allPr36LaunchChecksGreen(greenChecks)).toBe(true);

    const incomplete = buildPr36LaunchChecklist({
      ...greenEvidence,
      team: { foundingChairCount: 5, chairCapacity: 6 }
    });
    expect(allPr36LaunchChecksGreen(incomplete)).toBe(false);
    expect(incomplete.find((check) => check.key === "team")).toMatchObject({ green: false, href: "/shop/team" });
  });

  it("formats the permanent stored waitlist position honestly", () => {
    expect(formatPr36WaitlistPosition(1)).toBe("1st");
    expect(formatPr36WaitlistPosition(12)).toBe("12th");
    expect(formatPr36WaitlistPosition(23)).toBe("23rd");
    expect(formatPr36WaitlistPosition(null)).toBeNull();
  });
});
