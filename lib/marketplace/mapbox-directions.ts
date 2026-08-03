import "server-only";

const MAX_PREVIEW_CROW_MILES = 55;
const MAX_PREVIEW_ROUTE_MILES = 100;
const MAX_PREVIEW_DURATION_MINUTES = 240;
const MAX_PREVIEW_GEOMETRY_POINTS = 512;

type Coordinate = { latitude: number; longitude: number };

export type MapboxRoutePreview = {
  durationMinutes: number;
  distanceMiles: number;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

type DirectionsPayload = {
  code?: string;
  routes?: Array<{
    duration?: unknown;
    distance?: unknown;
    geometry?: { type?: unknown; coordinates?: unknown };
  }>;
};

export class MapboxDirectionsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "mapbox_server_token_missing"
      | "mapbox_directions_unavailable"
      | "mapbox_route_out_of_bounds"
  ) {
    super(message);
    this.name = "MapboxDirectionsError";
  }
}

function validCoordinate(coordinate: Coordinate) {
  return Number.isFinite(coordinate.longitude)
    && Number.isFinite(coordinate.latitude)
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90;
}

export function isPrivacyCoarsenedOrigin(coordinate: Coordinate) {
  if (!validCoordinate(coordinate)) return false;
  const coarsenedLatitude = Math.round(coordinate.latitude * 1_000) / 1_000;
  const coarsenedLongitude = Math.round(coordinate.longitude * 1_000) / 1_000;
  return Math.abs(coordinate.latitude - coarsenedLatitude) < 1e-9
    && Math.abs(coordinate.longitude - coarsenedLongitude) < 1e-9;
}

export function greatCircleMiles(origin: Coordinate, destination: Coordinate) {
  if (!validCoordinate(origin) || !validCoordinate(destination)) return Number.POSITIVE_INFINITY;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function parseMapboxDirectionsPreview(value: unknown): MapboxRoutePreview | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as DirectionsPayload;
  if (payload.code !== "Ok") return null;
  const route = payload.routes?.[0];
  const durationSeconds = Number(route?.duration);
  const distanceMeters = Number(route?.distance);
  const rawCoordinates = route?.geometry?.type === "LineString"
    ? route.geometry.coordinates
    : null;
  if (
    !Number.isFinite(durationSeconds)
    || durationSeconds < 0
    || durationSeconds > MAX_PREVIEW_DURATION_MINUTES * 60
    || !Number.isFinite(distanceMeters)
    || distanceMeters < 0
    || distanceMeters > MAX_PREVIEW_ROUTE_MILES * 1609.344
    || !Array.isArray(rawCoordinates)
    || rawCoordinates.length < 2
    || rawCoordinates.length > MAX_PREVIEW_GEOMETRY_POINTS
  ) return null;

  const coordinates = rawCoordinates.flatMap((candidate): Array<[number, number]> => {
    if (!Array.isArray(candidate) || candidate.length < 2) return [];
    const longitude = Number(candidate[0]);
    const latitude = Number(candidate[1]);
    if (!validCoordinate({ longitude, latitude })) return [];
    return [[longitude, latitude]];
  });
  if (coordinates.length !== rawCoordinates.length) return null;

  return {
    durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    distanceMiles: Math.round((distanceMeters / 1609.344) * 10) / 10,
    geometry: { type: "LineString", coordinates }
  };
}

/**
 * Produces a bounded overview polyline only. BVRB3R never requests steps,
 * maneuvers, or turn-by-turn instructions; live navigation stays in the user's
 * chosen maps application.
 */
export async function getMapboxDirectionsPreview(input: {
  origin: Coordinate;
  destination: Coordinate;
}) {
  if (
    !validCoordinate(input.origin)
    || !validCoordinate(input.destination)
    || greatCircleMiles(input.origin, input.destination) > MAX_PREVIEW_CROW_MILES
  ) {
    throw new MapboxDirectionsError(
      "The selected destination is outside the route-preview boundary.",
      "mapbox_route_out_of_bounds"
    );
  }

  const token = process.env.MAPBOX_SERVER_TOKEN?.trim();
  if (!token) {
    throw new MapboxDirectionsError(
      "Route previews are not configured.",
      "mapbox_server_token_missing"
    );
  }

  const coordinatePath = [input.origin, input.destination]
    .map((coordinate) => `${coordinate.longitude},${coordinate.latitude}`)
    .join(";");
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatePath}`);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "simplified");
  url.searchParams.set("steps", "false");
  url.searchParams.set("access_token", token);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4_500)
  }).catch(() => null);
  if (!response?.ok) {
    throw new MapboxDirectionsError(
      "The route preview is temporarily unavailable.",
      "mapbox_directions_unavailable"
    );
  }
  const payload = await response.json().catch(() => null);
  const preview = parseMapboxDirectionsPreview(payload);
  if (!preview) {
    throw new MapboxDirectionsError(
      "Mapbox returned an invalid or out-of-bounds route preview.",
      "mapbox_directions_unavailable"
    );
  }
  return preview;
}
