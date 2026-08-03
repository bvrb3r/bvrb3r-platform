import "server-only";

import type { MapDiscoveryMarker } from "@/types/domain";

type MatrixPayload = {
  code?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
};

export class MapboxTravelTimeError extends Error {
  constructor(
    message: string,
    public code: "mapbox_server_token_missing" | "mapbox_matrix_unavailable"
  ) {
    super(message);
    this.name = "MapboxTravelTimeError";
  }
}

function validCoordinate(longitude: number, latitude: number) {
  return Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90;
}

export function mergeMapboxTravelTimes(
  markers: MapDiscoveryMarker[],
  payload: MatrixPayload
) {
  const durations = payload.durations?.[0] ?? [];
  const distances = payload.distances?.[0] ?? [];
  return markers.map((marker, index) => {
    const seconds = durations[index];
    const meters = distances[index];
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return marker;
    return {
      ...marker,
      driveTimeMinutes: Math.max(1, Math.ceil(seconds / 60)),
      driveDistanceMiles: typeof meters === "number" && Number.isFinite(meters) && meters >= 0
        ? Math.round((meters / 1609.344) * 10) / 10
        : undefined
    };
  });
}

/**
 * Mapbox requires at least two Matrix elements. A single origin/destination
 * pair is only one element, so that request also asks for origin -> origin.
 * Remove that leading control element before merging the real destination.
 */
export function normalizeMatrixPayload(
  payload: MatrixPayload,
  destinationCount: number
): MatrixPayload {
  if (destinationCount !== 1) return payload;
  return {
    ...payload,
    durations: payload.durations?.map((row) => row.slice(1)),
    distances: payload.distances?.map((row) => row.slice(1))
  };
}

/**
 * One origin to the first six BVRB3R-ranked destinations. Mapbox computes
 * travel time only; it never chooses, filters, or reorders marketplace rows.
 */
export async function addMapboxTravelTimes(input: {
  origin: { latitude: number; longitude: number };
  markers: MapDiscoveryMarker[];
}) {
  const destinations = input.markers
    .filter((marker) => validCoordinate(marker.longitude, marker.latitude))
    .slice(0, 6);
  if (!destinations.length || !validCoordinate(input.origin.longitude, input.origin.latitude)) {
    return input.markers;
  }

  const token = process.env.MAPBOX_SERVER_TOKEN?.trim();
  if (!token) {
    throw new MapboxTravelTimeError(
      "Drive-time estimates are not configured.",
      "mapbox_server_token_missing"
    );
  }

  const coordinatePath = [input.origin, ...destinations]
    .map((coordinate) => `${coordinate.longitude},${coordinate.latitude}`)
    .join(";");
  const url = new URL(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinatePath}`);
  url.searchParams.set("sources", "0");
  url.searchParams.set(
    "destinations",
    destinations.length === 1
      ? "0;1"
      : destinations.map((_, index) => String(index + 1)).join(";")
  );
  url.searchParams.set("annotations", "duration,distance");
  url.searchParams.set("access_token", token);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4_000)
  }).catch(() => null);
  if (!response?.ok) {
    throw new MapboxTravelTimeError(
      "Drive-time estimates are temporarily unavailable.",
      "mapbox_matrix_unavailable"
    );
  }
  const payload = await response.json().catch(() => null) as MatrixPayload | null;
  if (!payload || payload.code !== "Ok") {
    throw new MapboxTravelTimeError(
      "Drive-time estimates are temporarily unavailable.",
      "mapbox_matrix_unavailable"
    );
  }

  const enriched = mergeMapboxTravelTimes(
    destinations,
    normalizeMatrixPayload(payload, destinations.length)
  );
  const byId = new Map(enriched.map((marker) => [marker.id, marker]));
  return input.markers.map((marker) => byId.get(marker.id) ?? marker);
}
