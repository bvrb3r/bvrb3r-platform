import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decorateDiscoveryWithActivation, decorateMapMarkers } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildDiscoveryPayload, buildMapPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

const filterSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  locationId: z.string().optional(),
  styleTagId: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  availability: z.enum(["any", "today", "now"]).optional(),
  specialty: z.string().optional(),
  maxDistanceMiles: z.coerce.number().optional()
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
    maxDistanceMiles: request.nextUrl.searchParams.get("maxDistanceMiles") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid map discovery filters." }, { status: 400 });
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
  const markers = decorateMapMarkers(buildMapPayload(runtime, parsed.data, trustState), results);

  return NextResponse.json({ markers });
}
