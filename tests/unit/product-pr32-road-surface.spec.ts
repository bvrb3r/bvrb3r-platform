import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const page = source("app/road/page.tsx");
const screen = source("components/road/road-screen.tsx");
const service = source("lib/road/service.server.ts");

describe("Product PR32 Road surface", () => {
  it("protects /road by canonical role and loads server truth", () => {
    expect(page).toContain('getAuthorizedUser(["client_user", "barber_user", "shop_owner_user"])');
    expect(page).toContain("loadRoadSnapshot(user)");
    expect(page).toContain("ProtectedSessionBoundary");
  });

  it("contains the required role-switched Road sections and honest states", () => {
    for (const heading of [
      "The trail",
      "Badge case — achievements & rewards",
      "Share the badge — straight to Culture",
      "Referrals",
      "Leaderboard — among your people",
      "Streak shields — how forgiveness works",
      "Milestone pushes — the nudge layer",
      "Home-tab widget — the road, pocket size"
    ]) {
      expect(screen).toContain(heading);
    }
    expect(screen).toContain("server truth is not connected");
    expect(screen).toContain("does not invent progress, badges, referrals, friends, or streaks");
    expect(screen).toContain("Complete SET ${set.index - 1} to open");
  });

  it("does not expose a browser completion action", () => {
    expect(service).toContain("recordRoadPlatformEvent");
    expect(service).toContain('supabase.rpc("pr32_record_road_event"');
    expect(screen).not.toContain("recordRoadPlatformEvent");
    expect(screen).not.toContain("achievementComplete");
  });

  it("uses real percentages instead of the reference placeholders", () => {
    expect(screen).toContain("snapshot.percent");
    expect(screen).not.toContain("First Cut 33%");
    expect(screen).not.toContain("Verified 26%");
    expect(screen).not.toContain("The Team 45%");
  });

  it("keeps badge sharing optional and one-time", () => {
    expect(screen).toContain("Optional and never auto-posted");
    expect(screen).toContain("Share to Culture");
    expect(screen).toContain("Save image");
    expect(screen).toContain("snapshot.latestBadge.sharedAt");
    expect(service).toContain('.not("shared_at", "is", null)');
  });

  it("shows server-owned setup attention with reachable corrective actions", () => {
    expect(screen).toContain("data-road-setup-status");
    expect(screen).toContain("Action required");
    expect(screen).toContain("Pending review");
    expect(screen).toContain("achievement.actionHref");
    expect(screen).toContain("Previously earned. Current setup truth needs attention");
    expect(screen).toContain("complete: Boolean(set.badge)");
  });
});
