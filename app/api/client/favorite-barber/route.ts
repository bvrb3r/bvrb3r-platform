import { NextResponse } from "next/server";
import { z } from "zod";
import { isClientRole } from "@/lib/auth/roles";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { saveClientFavoriteBarber } from "@/lib/booking/platform-service";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const favoriteBarberSchema = z.object({
  barberReference: z.string().min(1)
});

export async function POST(request: Request) {
  const context = await getClientExperienceContext();

  if (!context.isSignedInClient || !context.clientId || !isClientRole(context.viewer.role)) {
    return NextResponse.json({ error: "Only signed-in clients can save a favorite barber." }, { status: 403 });
  }

  const parsed = favoriteBarberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid favorite barber payload." }, { status: 400 });
  }

  try {
    const result = await saveClientFavoriteBarber({
      clientId: context.clientId,
      barberReference: parsed.data.barberReference
    });
    const resolvedBarberReference = result.favoriteBarber?.barber.id ?? parsed.data.barberReference;

    try {
      const engagementProvider = await getEngagementProvider();
      await engagementProvider.followBarber(
        {
          role: "client",
          userEmail: context.viewer.email,
          clientId: context.clientId
        },
        {
          barberId: resolvedBarberReference,
          notifyOnAvailability: true,
          notifyOnPortfolio: true
        }
      );
    } catch {
      // Favoriting the barber is the primary action. Follow sync is best effort.
    }

    try {
      const marketplaceProvider = await getMarketplaceProvider();
      await marketplaceProvider.recordFollowCreated({
        barberId: resolvedBarberReference,
        username: result.favoriteBarber?.profile?.username,
        clientId: context.clientId
      });
    } catch {
      // Favorite save remains primary even if marketplace conversion tracking is unavailable.
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save favorite barber.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
