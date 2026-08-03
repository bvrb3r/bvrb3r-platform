import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decorateDiscoveryWithActivation, decorateMapMarkers } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildDiscoveryPayload, buildMapPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import {
  orderMapMarkersByPostgis,
  PostgisMarketplaceError,
  readPostgisMarketplaceRows
} from "@/lib/marketplace/postgis-map";
import { addMapboxTravelTimes, MapboxTravelTimeError } from "@/lib/marketplace/mapbox-travel";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { getTrustProvider } from "@/lib/trust/provider";
import type { MapDiscoveryMarker } from "@/types/domain";

const filterSchema = z.object({
  query: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  locationId: z.string().trim().max(120).optional(),
  styleTagId: z.string().trim().max(120).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().min(0).max(10_000).optional(),
  availability: z.enum(["any", "today", "now"]).optional(),
  specialty: z.string().trim().max(120).optional(),
  maxDistanceMiles: z.coerce.number().min(0.25).max(50).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  north: z.coerce.number().min(-90).max(90).optional()
}).superRefine((value, context) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Latitude and longitude are required together." });
  }
  const bounds = [value.west, value.south, value.east, value.north];
  if (bounds.some((entry) => entry !== undefined) && bounds.some((entry) => entry === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Complete map bounds are required." });
  }
  if (value.west !== undefined && value.east !== undefined && value.west >= value.east) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid longitude bounds." });
  }
  if (value.south !== undefined && value.north !== undefined && value.south >= value.north) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid latitude bounds." });
  }
});

export async function GET(request: NextRequest) {
  const parsed = filterSchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
    styleTagId: request.nextUrl.searchParams.get("styleTagId") ?? undefined,
    minRating: request.nextUrl.searchParams.get("minRating") ?? undefined,
    maxPrice: request.nextUrl.searchParams.get("maxPrice") ?? undefined,
    availability: request.nextUrl.searchParams.get("availability") ?? undefined,
    specialty: request.nextUrl.searchParams.get("specialty") ?? undefined,
    maxDistanceMiles: request.nextUrl.searchParams.get("maxDistanceMiles") ?? undefined,
    latitude: request.nextUrl.searchParams.get("latitude") ?? undefined,
    longitude: request.nextUrl.searchParams.get("longitude") ?? undefined,
    west: request.nextUrl.searchParams.get("west") ?? undefined,
    south: request.nextUrl.searchParams.get("south") ?? undefined,
    east: request.nextUrl.searchParams.get("east") ?? undefined,
    north: request.nextUrl.searchParams.get("north") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid map discovery filters." }, { status: 400 });
  }
  if (parsed.data.latitude === undefined || parsed.data.longitude === undefined) {
    return NextResponse.json(
      { error: "Choose Use my location before loading nearby map results.", code: "map_location_required" },
      { status: 400 }
    );
  }

  const marketplaceProvider = await getMarketplaceProvider();
  const trustProvider = await getTrustProvider();
  const activationProvider = await getMarketplaceActivationProvider();
  const [runtime, trustState, activationState] = await Promise.all([
    marketplaceProvider.readRuntime(),
    trustProvider.readState(),
    activationProvider.readState()
  ]);
  const results = decorateDiscoveryWithActivation(buildDiscoveryPayload(runtime, trustState, parsed.data), activationState, trustState);
  const providerMarkers: MapDiscoveryMarker[] = decorateMapMarkers(buildMapPayload(runtime, parsed.data, trustState), results);
  let markers: MapDiscoveryMarker[];
  let travelAuthority: "mapbox_matrix" | "unavailable" | "not_requested" = "not_requested";

  try {
    const spatialRows = await readPostgisMarketplaceRows({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      radiusMiles: parsed.data.maxDistanceMiles,
      west: parsed.data.west,
      south: parsed.data.south,
      east: parsed.data.east,
      north: parsed.data.north
    });
    markers = orderMapMarkersByPostgis(providerMarkers, spatialRows);
  } catch (error) {
    if (error instanceof PostgisMarketplaceError) {
      return NextResponse.json(
        { error: "Nearby map discovery is temporarily unavailable.", code: error.code },
        { status: 503 }
      );
    }
    throw error;
  }

  const travelLimit = consumeRateLimit({
    bucket: "marketplace-mapbox-matrix",
    key: clientKeyFromRequest(request),
    limit: 20,
    windowMs: 60_000
  });
  if (travelLimit.allowed) {
    try {
      markers = await addMapboxTravelTimes({
        origin: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
        markers
      });
      travelAuthority = "mapbox_matrix";
    } catch (error) {
      if (!(error instanceof MapboxTravelTimeError)) throw error;
      travelAuthority = "unavailable";
    }
  } else {
    travelAuthority = "unavailable";
  }

  return NextResponse.json({ markers, authority: "supabase_postgis" as const, travelAuthority });
}
