import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatTvPrice, resolveWaitingRoomTvStatus, sceneAtElapsedSeconds, WAITING_ROOM_TIMELINE } from "@/lib/tv/waiting-room";

describe("Product PR36 waiting-room TV", () => {
  it("keeps the canonical 15-entry rotation with the two added scenes", () => {
    expect(WAITING_ROOM_TIMELINE).toHaveLength(15);
    expect(WAITING_ROOM_TIMELINE.some((entry) => entry.id === "menu")).toBe(true);
    expect(WAITING_ROOM_TIMELINE.some((entry) => entry.id === "availability")).toBe(true);
  });

  it("rotates deterministically and repeats the live board", () => {
    expect(sceneAtElapsedSeconds(0)).toBe("board");
    expect(sceneAtElapsedSeconds(16)).toBe("menu");
    expect(sceneAtElapsedSeconds(38)).toBe("callout");
    expect(sceneAtElapsedSeconds(44)).toBe("board");
  });

  it("formats real integer-cents menu prices", () => {
    expect(formatTvPrice(4000)).toBe("$40");
    expect(formatTvPrice(3250)).toBe("$32.50");
  });

  it("fails the public display closed for emergency, offline, closed, and empty states", () => {
    expect(resolveWaitingRoomTvStatus({ emergencyDisabledAt: "2026-08-03T00:00:00.000Z", healthStatus: "healthy", intakeOpen: true, hasContent: true })).toBe("emergency");
    expect(resolveWaitingRoomTvStatus({ healthStatus: "offline", intakeOpen: true, hasContent: true })).toBe("offline");
    expect(resolveWaitingRoomTvStatus({ healthStatus: "healthy", intakeOpen: false, hasContent: true })).toBe("closed");
    expect(resolveWaitingRoomTvStatus({ healthStatus: "healthy", intakeOpen: true, hasContent: false })).toBe("empty");
    expect(resolveWaitingRoomTvStatus({ healthStatus: "healthy", intakeOpen: true, hasContent: true })).toBe("live");
  });

  it("binds owner launches to a shop and fails direct multi-shop launches closed", () => {
    const owner = readFileSync("components/operations/owner-operations-workspace.tsx", "utf8");
    const page = readFileSync("app/shop/tv/page.tsx", "utf8");
    const screen = readFileSync("components/tv/waiting-room-tv.tsx", "utf8");

    expect(owner).toContain("/shop/tv?shopId=${encodeURIComponent(data.scope.shopId)}");
    expect(page).toContain('error.code === "tv_shop_required"');
    expect(page).toContain('status: "setup"');
    expect(screen).toContain('setup: ["Choose a shop"');
  });
});
