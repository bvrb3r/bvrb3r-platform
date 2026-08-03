import { describe, expect, it } from "vitest";
import { formatTvPrice, sceneAtElapsedSeconds, WAITING_ROOM_TIMELINE } from "@/lib/tv/waiting-room";

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
});
