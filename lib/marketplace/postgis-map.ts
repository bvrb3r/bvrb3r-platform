import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MapDiscoveryMarker } from "@/types/domain";

export type MarketplaceMapViewport = {
  latitude: number;
  longitude: number;
  radiusMiles?: number;
  west?: number;
  south?: number;
  east?: number;
  north?: number;
};

export type PostgisMarketplaceRow = {
  listing_type: "barber" | "shop";
  listing_reference: string;
  location_id: string;
  public_username: string | null;
  latitude: number;
  longitude: number;
  distance_miles: number;
  available_now: boolean;
  sponsored: boolean;
  bvrb3r_rank: number;
};

export function postgisMarketplaceMarkerId(row: Pick<PostgisMarketplaceRow, "listing_type" | "listing_reference" | "location_id">) {
  return row.listing_type === "barber"
    ? `barber-${row.listing_reference}`
    : `shop-${row.location_id}`;
}

export class PostgisMarketplaceError extends Error {
  constructor(
    message: string,
    public readonly code: "postgis_unavailable" | "postgis_query_failed"
  ) {
    super(message);
  }
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePostgisRows(value: unknown): PostgisMarketplaceRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const latitude = finiteNumber(row.latitude);
    const longitude = finiteNumber(row.longitude);
    const distanceMiles = finiteNumber(row.distance_miles);
    const bvrb3rRank = finiteNumber(row.bvrb3r_rank);
    if (
      (row.listing_type !== "barber" && row.listing_type !== "shop")
      || typeof row.listing_reference !== "string"
      || typeof row.location_id !== "string"
      || latitude === null
      || longitude === null
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
      || distanceMiles === null
      || distanceMiles < 0
      || bvrb3rRank === null
    ) {
      return [];
    }
    return [{
      listing_type: row.listing_type,
      listing_reference: row.listing_reference,
      location_id: row.location_id,
      public_username: typeof row.public_username === "string" ? row.public_username : null,
      latitude,
      longitude,
      distance_miles: distanceMiles,
      available_now: row.available_now === true,
      sponsored: row.sponsored === true,
      bvrb3r_rank: bvrb3rRank
    }];
  });
}

export async function readPostgisMarketplaceRows(viewport: MarketplaceMapViewport) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new PostgisMarketplaceError(
      "Location discovery requires the server-owned Supabase connection.",
      "postgis_unavailable"
    );
  }

  const result = await supabase.rpc("pr39_nearby_marketplace", {
    p_longitude: viewport.longitude,
    p_latitude: viewport.latitude,
    p_radius_miles: viewport.radiusMiles ?? 25,
    p_west: viewport.west ?? null,
    p_south: viewport.south ?? null,
    p_east: viewport.east ?? null,
    p_north: viewport.north ?? null,
    p_limit: 80
  });
  if (result.error) {
    throw new PostgisMarketplaceError(
      "Nearby marketplace truth is temporarily unavailable.",
      "postgis_query_failed"
    );
  }
  return parsePostgisRows(result.data);
}

export function orderMapMarkersByPostgis(
  markers: MapDiscoveryMarker[],
  spatialRows: PostgisMarketplaceRow[]
) {
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  const markersByBarber = new Map(
    markers.filter((marker) => marker.barberId).map((marker) => [marker.barberId as string, marker])
  );

  return spatialRows.flatMap((row): MapDiscoveryMarker[] => {
    const marker = row.listing_type === "barber"
      ? markersByBarber.get(row.listing_reference) ?? markersById.get(`barber-${row.listing_reference}`)
      : markersById.get(`shop-${row.location_id}`);
    if (!marker) return [];
    return [{
      ...marker,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceMiles: row.distance_miles,
      availableNow: row.available_now,
      username: row.public_username ?? marker.username,
      featuredLabel: row.sponsored ? marker.featuredLabel ?? "Sponsored · fairness limited" : marker.featuredLabel
    }];
  });
}
