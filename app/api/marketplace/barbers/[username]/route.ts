import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { decoratePublicProfileWithActivation } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildPublicProfilePayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

export async function GET(_request: NextRequest, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
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
  const profile = buildPublicProfilePayload(runtime, engagementState, trustState, username);
  if (!profile) return NextResponse.json({ error: "Barber profile not found." }, { status: 404 });
  const decoratedProfile = decoratePublicProfileWithActivation(profile, activationState);
  try {
    await marketplaceProvider.recordProfileView({ barberId: decoratedProfile.barber.id, username, clientId: session.user.role === "client" ? session.user.clientId : undefined });
  } catch {}
  try {
    if (decoratedProfile.proof?.featuredLabel) {
      await activationProvider.recordMonetizationEvent({ eventType: "featured_impression", barberId: decoratedProfile.barber.id, citySlug: "tampa-bay", sourceKind: "public_profile", referenceId: username, metadata: { label: decoratedProfile.proof.featuredLabel } });
    }
  } catch {}
  return NextResponse.json(decoratedProfile);
}
