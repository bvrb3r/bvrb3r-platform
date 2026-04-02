import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const waitlistSchema = z.object({
  barberId: z.string().optional(),
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  query: z.string().optional()
});

export async function POST(request: Request) {
  const parsed = waitlistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid waitlist request." }, { status: 400 });
  }

  const [session, marketplaceProvider, engagementProvider] = await Promise.all([
    getCurrentUserFromServer(),
    getMarketplaceProvider(),
    getEngagementProvider()
  ]);
  const clientId = session.user.role === "client" ? session.user.clientId : undefined;
  const waitlist = await marketplaceProvider.joinWaitlist({
    barberId: parsed.data.barberId,
    serviceId: parsed.data.serviceId,
    locationId: parsed.data.locationId,
    clientId,
    query: parsed.data.query
  });

  if (clientId) {
    try {
      await engagementProvider.recordEvent(
        {
          role: "client",
          clientId,
          userEmail: session.user.email,
          locationIds: session.user.locationIds
        },
        {
          eventType: "waitlist_joined",
          targetType: "service",
          targetId: parsed.data.serviceId,
          metadata: {
            locationId: parsed.data.locationId,
            barberId: parsed.data.barberId ?? null,
            query: parsed.data.query ?? null,
            waitlistRequestId: waitlist.id
          }
        }
      );
    } catch {
      // Waitlist persistence is primary; engagement side effects are best effort.
    }
  }

  return NextResponse.json({ waitlist });
}
