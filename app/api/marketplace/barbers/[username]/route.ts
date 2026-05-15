import { NextRequest, NextResponse } from "next/server";
import { isClientRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

export async function GET(_request: NextRequest, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const profile = await getBarberDetailsPayload(username);
  if (!profile) {
    return NextResponse.json({ error: "Barber profile not found." }, { status: 404 });
  }

  try {
    const [marketplaceProvider, session] = await Promise.all([
      getMarketplaceProvider(),
      getCurrentUserFromServer()
    ]);
    await marketplaceProvider.recordProfileView({
      barberId: profile.barber.id,
      username,
      clientId: isClientRole(session.user.role) ? session.user.clientId : undefined
    });
  } catch {}

  try {
    if (profile.proof?.featuredLabel) {
      const activationProvider = await getMarketplaceActivationProvider();
      await activationProvider.recordMonetizationEvent({
        eventType: "featured_impression",
        barberId: profile.barber.id,
        citySlug: "tampa-bay",
        sourceKind: "public_profile",
        referenceId: username,
        metadata: { label: profile.proof.featuredLabel }
      });
    }
  } catch {}

  return NextResponse.json(profile);
}
