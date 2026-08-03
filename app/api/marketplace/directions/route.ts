import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  getMapboxDirectionsPreview,
  isPrivacyCoarsenedOrigin,
  MapboxDirectionsError
} from "@/lib/marketplace/mapbox-directions";
import {
  postgisMarketplaceMarkerId,
  PostgisMarketplaceError,
  readPostgisMarketplaceRows
} from "@/lib/marketplace/postgis-map";

const requestSchema = z.object({
  markerId: z.string().trim().min(3).max(180).regex(/^(barber|shop)-[A-Za-z0-9_-]+$/),
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }).strict()
}).strict();

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPrivacyCoarsenedOrigin(parsed.data.origin)) {
    return NextResponse.json(
      { error: "Route previews require a privacy-coarsened location and a visible marketplace destination." },
      { status: 400 }
    );
  }

  const rate = consumeRateLimit({
    bucket: "marketplace-mapbox-directions",
    key: clientKeyFromRequest(request),
    limit: 12,
    windowMs: 60_000
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many route previews. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let destination: { latitude: number; longitude: number } | null = null;
  try {
    const spatialRows = await readPostgisMarketplaceRows({
      latitude: parsed.data.origin.latitude,
      longitude: parsed.data.origin.longitude,
      radiusMiles: 50
    });
    const selected = spatialRows.find((row) => postgisMarketplaceMarkerId(row) === parsed.data.markerId);
    if (selected) {
      destination = { latitude: selected.latitude, longitude: selected.longitude };
    }
  } catch (error) {
    if (!(error instanceof PostgisMarketplaceError)) throw error;
    return NextResponse.json(
      { error: "Verified marketplace locations are temporarily unavailable.", code: error.code },
      { status: 503 }
    );
  }

  if (!destination) {
    return NextResponse.json(
      { error: "That verified marketplace destination is no longer available." },
      { status: 404 }
    );
  }

  try {
    const preview = await getMapboxDirectionsPreview({
      origin: parsed.data.origin,
      destination
    });
    return NextResponse.json(
      { preview },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (!(error instanceof MapboxDirectionsError)) throw error;
    return NextResponse.json(
      {
        error: error.code === "mapbox_server_token_missing"
          ? "Route previews are not configured."
          : error.code === "mapbox_route_out_of_bounds"
            ? "This destination is outside the route-preview area."
            : "The route preview is temporarily unavailable.",
        code: error.code
      },
      { status: error.code === "mapbox_route_out_of_bounds" ? 422 : 503 }
    );
  }
}
