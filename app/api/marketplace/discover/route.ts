import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { decorateDiscoveryWithActivation } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildDiscoveryPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

const filterSchema = z.object({
  query: z.string().optional(),
  locationId: z.string().optional(),
  styleTagId: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  availability: z.enum(["any", "today", "now"]).optional(),
  specialty: z.string().optional(),
  maxDistanceMiles: z.coerce.number().optional(),
  clientId: z.string().optional()
});

export async function GET(request: NextRequest) {
  const parsed = filterSchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? undefined,
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
    styleTagId: request.nextUrl.searchParams.get("styleTagId") ?? undefined,
    minRating: request.nextUrl.searchParams.get("minRating") ?? undefined,
    maxPrice: request.nextUrl.searchParams.get("maxPrice") ?? undefined,
    availability: request.nextUrl.searchParams.get("availability") ?? undefined,
    specialty: request.nextUrl.searchParams.get("specialty") ?? undefined,
    maxDistanceMiles: request.nextUrl.searchParams.get("maxDistanceMiles") ?? undefined,
    clientId: request.nextUrl.searchParams.get("clientId") ?? undefined
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid discovery filters." }, { status: 400 });

  const marketplaceProvider = await getMarketplaceProvider();
  const engagementProvider = await getEngagementProvider();
  const trustProvider = await getTrustProvider();
  const activationProvider = await getMarketplaceActivationProvider();
  const [runtime, engagementState, trustState, activationState, session] = await Promise.all([
    marketplaceProvider.readRuntime(),
    engagementProvider.readState(),
    trustProvider.readState(),
    activationProvider.readState(),
    getCurrentUserFromServer()
  ]);
  const clientId = parsed.data.clientId ?? (session.user.role === "client" ? session.user.clientId : undefined);
  const filters = {
    query: parsed.data.query,
    locationId: parsed.data.locationId,
    styleTagId: parsed.data.styleTagId,
    minRating: parsed.data.minRating,
    maxPrice: parsed.data.maxPrice,
    availability: parsed.data.availability,
    specialty: parsed.data.specialty,
    maxDistanceMiles: parsed.data.maxDistanceMiles
  };
  const results = buildDiscoveryPayload(runtime, engagementState, trustState, filters);
  const decorated = decorateDiscoveryWithActivation(results, activationState, trustState);

  try {
    await marketplaceProvider.recordDiscoveryImpression({ filters, results: decorated, clientId });
  } catch {}

  try {
    for (const result of decorated.slice(0, 4)) {
      if (result.boostedLabel) {
        await activationProvider.recordMonetizationEvent({
          eventType: "boost_impression",
          barberId: result.barberId,
          citySlug: "tampa-bay",
          sourceKind: "discovery",
          referenceId: result.username,
          metadata: { label: result.boostedLabel }
        });
      }
      if (result.featuredLabel) {
        await activationProvider.recordMonetizationEvent({
          eventType: "featured_impression",
          barberId: result.barberId,
          citySlug: "tampa-bay",
          sourceKind: "discovery",
          referenceId: result.username,
          metadata: { label: result.featuredLabel }
        });
      }
    }
  } catch {}

  return NextResponse.json({ results: decorated });
}
