import "server-only";

type MapboxFeature = {
  id?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

export type MapboxAddress = {
  longitude: number;
  latitude: number;
  formattedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  providerReference: string;
  accuracy: string;
};

export class MapboxGeocodingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "mapbox_server_token_missing"
      | "mapbox_geocoding_unavailable"
      | "mapbox_address_not_found"
  ) {
    super(message);
    this.name = "MapboxGeocodingError";
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

function nestedName(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const entry = (value as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  return typeof row.name === "string" ? row.name : null;
}

function nestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const entry = (value as Record<string, unknown>)[key];
  return entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
}

export function parseMapboxAddressFeature(value: unknown): MapboxAddress | null {
  if (!value || typeof value !== "object") return null;
  const feature = value as MapboxFeature;
  if (feature.geometry?.type !== "Point") return null;
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!validCoordinate(longitude, latitude)) return null;
  const properties = feature.properties ?? {};
  if (properties.feature_type !== "address") return null;
  const context = properties.context;
  const regionEntry = nestedRecord(context, "region");
  const countryEntry = nestedRecord(context, "country");
  const region = regionEntry
    ? String(
        regionEntry.region_code
        ?? regionEntry.region_code_full
        ?? regionEntry.name
        ?? ""
      ).replace(/^US-/, "")
    : "";
  const countryCode = String(
    countryEntry?.country_code
    ?? countryEntry?.country_code_alpha_3
    ?? ""
  ).trim().toUpperCase();
  const city = nestedName(context, "place") ?? nestedName(context, "locality") ?? "";
  const postalCode = nestedName(context, "postcode") ?? "";
  const formattedAddress = String(
    properties.full_address
    ?? properties.address
    ?? properties.name
    ?? ""
  ).trim();
  const providerReference = String(properties.mapbox_id ?? feature.id ?? "").trim();
  const accuracy = properties.coordinates && typeof properties.coordinates === "object"
    ? String((properties.coordinates as Record<string, unknown>).accuracy ?? "").trim()
    : "";
  if (
    !formattedAddress
    || !providerReference
    || !city
    || !region
    || !postalCode
    || (countryCode !== "US" && countryCode !== "USA")
  ) return null;
  return {
    longitude,
    latitude,
    formattedAddress,
    city,
    region,
    postalCode,
    providerReference,
    accuracy
  };
}

function serverToken() {
  const token = process.env.MAPBOX_SERVER_TOKEN?.trim();
  if (!token) {
    throw new MapboxGeocodingError(
      "Server-side Mapbox geocoding is not configured.",
      "mapbox_server_token_missing"
    );
  }
  return token;
}

async function readAddress(url: URL, timeoutMs: number) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  }).catch(() => null);
  if (!response?.ok) {
    throw new MapboxGeocodingError(
      "Mapbox geocoding is temporarily unavailable.",
      "mapbox_geocoding_unavailable"
    );
  }
  const payload = await response.json().catch(() => null) as { features?: unknown[] } | null;
  const address = parseMapboxAddressFeature(payload?.features?.[0]);
  if (!address) {
    throw new MapboxGeocodingError(
      "Mapbox did not return a complete US address.",
      "mapbox_address_not_found"
    );
  }
  return address;
}

export async function forwardPermanentMapboxAddress(address: string) {
  const normalized = address.trim();
  if (normalized.length < 6 || normalized.length > 240) {
    throw new MapboxGeocodingError(
      "Choose a complete shop address.",
      "mapbox_address_not_found"
    );
  }
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", normalized);
  url.searchParams.set("access_token", serverToken());
  url.searchParams.set("permanent", "true");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("country", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", "1");
  return readAddress(url, 8_000);
}

/**
 * Reverse lookup is display-only and never written to storage. The caller must
 * resolve the coordinate from a verified server-owned shop location rather
 * than accept an arbitrary browser coordinate.
 */
export async function reverseMapboxAddress(input: { latitude: number; longitude: number }) {
  if (!validCoordinate(input.longitude, input.latitude)) {
    throw new MapboxGeocodingError(
      "The verified shop pin is invalid.",
      "mapbox_address_not_found"
    );
  }
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("access_token", serverToken());
  url.searchParams.set("country", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", "1");
  return readAddress(url, 5_000);
}
