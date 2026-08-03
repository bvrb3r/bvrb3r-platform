import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMapboxTravelTimes,
  mergeMapboxTravelTimes,
  normalizeMatrixPayload
} from "@/lib/marketplace/mapbox-travel";
import type { MapDiscoveryMarker } from "@/types/domain";

const markers: MapDiscoveryMarker[] = [
  {
    id: "barber-one",
    kind: "barber",
    label: "Barber One",
    latitude: 27.95,
    longitude: -82.45,
    rating: 4.9,
    priceRangeLabel: "$30–$50",
    nextAvailableAt: "2026-08-03T16:00:00.000Z"
  }
];

describe("Product PR39 Mapbox travel-time enrichment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("adds matrix time and road distance without changing BVRB3R order", () => {
    expect(mergeMapboxTravelTimes(markers, {
      durations: [[601]],
      distances: [[3218.688]]
    })).toEqual([
      expect.objectContaining({
        id: "barber-one",
        driveTimeMinutes: 11,
        driveDistanceMiles: 2
      })
    ]);
  });

  it("keeps a marker honest when Mapbox cannot route it", () => {
    expect(mergeMapboxTravelTimes(markers, {
      durations: [[null]],
      distances: [[null]]
    })).toEqual(markers);
  });

  it("drops the control element required by Mapbox's one-destination minimum", () => {
    expect(normalizeMatrixPayload({
      code: "Ok",
      durations: [[0, 601]],
      distances: [[0, 3218.688]]
    }, 1)).toMatchObject({
      durations: [[601]],
      distances: [[3218.688]]
    });
  });

  it("requests two Matrix elements for one listing and merges only the listing", async () => {
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "server-map-token-for-tests");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "Ok",
      durations: [[0, 601]],
      distances: [[0, 3218.688]]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(addMapboxTravelTimes({
      origin: { latitude: 27.951, longitude: -82.457 },
      markers
    })).resolves.toEqual([
      expect.objectContaining({ driveTimeMinutes: 11, driveDistanceMiles: 2 })
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("sources")).toBe("0");
    expect(requestUrl.searchParams.get("destinations")).toBe("0;1");
  });

  it("rejects negative Matrix values instead of presenting impossible travel", () => {
    expect(mergeMapboxTravelTimes(markers, {
      durations: [[-1]],
      distances: [[-1]]
    })).toEqual(markers);
  });
});
