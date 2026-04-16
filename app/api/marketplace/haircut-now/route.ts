import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { buildHaircutNowPayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

const requestSchema = z.object({
  clientId: z.string().optional(),
  locationId: z.string().optional()
});

export async function GET(request: NextRequest) {
  const parsed = requestSchema.safeParse({
    clientId: request.nextUrl.searchParams.get("clientId") ?? undefined,
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid instant-book request." }, { status: 400 });
  }

  const [marketplaceProvider, engagementProvider, trustProvider] = await Promise.all([
    getMarketplaceProvider(),
    getEngagementProvider(),
    getTrustProvider()
  ]);
  const [runtime, engagementState, trustState, session] = await Promise.all([
    marketplaceProvider.readRuntime(),
    engagementProvider.readState(),
    trustProvider.readState(),
    getCurrentUserFromServer()
  ]);
  const clientId = parsed.data.clientId ?? (session.user.role === "client" ? session.user.clientId : undefined);
  const match = buildHaircutNowPayload(runtime, engagementState, clientId, parsed.data.locationId, trustState);

  try {
    await marketplaceProvider.recordHaircutNowImpression({ match, clientId });
  } catch {
    // Keep instant matching responsive even if analytics persistence is unavailable.
  }

  return NextResponse.json({ match });
}
