import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const followSchema = z.object({
  barberId: z.string().min(1),
  notifyOnAvailability: z.boolean().optional().default(true),
  notifyOnPortfolio: z.boolean().optional().default(true)
});

const querySchema = z.object({
  barberId: z.string().min(1)
});

export async function GET(request: NextRequest) {
  try {
    const actor = await requireEngagementActor(["client"]);
    const parsed = querySchema.safeParse({
      barberId: request.nextUrl.searchParams.get("barberId") ?? undefined
    });

    if (!parsed.success || !actor.clientId) {
      return NextResponse.json({ error: "A barber reference is required for follow state." }, { status: 400 });
    }

    const engagementProvider = await getEngagementProvider();
    const state = await engagementProvider.readState();
    const follow = state.barberFollows.find((entry) => entry.clientId === actor.clientId && entry.barberId === parsed.data.barberId);
    const followerCount = state.barberFollows.filter((entry) => entry.barberId === parsed.data.barberId).length;

    return NextResponse.json({
      followState: {
        barberId: parsed.data.barberId,
        isFollowing: Boolean(follow),
        notifyOnAvailability: follow?.notifyOnAvailability ?? true,
        notifyOnPortfolio: follow?.notifyOnPortfolio ?? true,
        followerCount
      }
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireEngagementActor(["client"]);
    const payload = followSchema.parse(await request.json());
    const [engagementProvider, marketplaceProvider] = await Promise.all([
      getEngagementProvider(),
      getMarketplaceProvider()
    ]);
    const result = await engagementProvider.followBarber(actor, payload);

    try {
      await marketplaceProvider.recordFollowCreated({
        barberId: payload.barberId,
        clientId: actor.clientId,
        username: undefined
      });
    } catch {
      // Follow relationship is primary; marketplace analytics are best effort.
    }

    return NextResponse.json({ follow: result.follow, notification: result.notification });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid barber follow request." }, { status: 400 });
    }

    return engagementErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireEngagementActor(["client"]);
    const parsed = querySchema.safeParse({
      barberId: request.nextUrl.searchParams.get("barberId") ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "A barber reference is required to unfollow." }, { status: 400 });
    }

    const engagementProvider = await getEngagementProvider();
    const result = await engagementProvider.unfollowBarber(actor, parsed.data.barberId);
    return NextResponse.json(result);
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
