import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const followSchema = z.object({
  barberId: z.string().min(1),
  notifyOnAvailability: z.boolean().optional().default(true),
  notifyOnPortfolio: z.boolean().optional().default(true)
});

const querySchema = z.object({
  barberId: z.string().min(1)
});

async function resolvePublicBarberIdentity(barberId: string) {
  const profile = await getBarberDetailsPayload(barberId);
  if (!profile) {
    return null;
  }

  return {
    barberId: profile.barber.id,
    username: profile.profile.username
  };
}

type FollowStateSource = Awaited<ReturnType<Awaited<ReturnType<typeof getEngagementProvider>>["readState"]>>;

function buildFollowState(state: FollowStateSource, clientId: string, barberId: string) {
  const follow = state.barberFollows.find((entry) => entry.clientId === clientId && entry.barberId === barberId);
  return {
    follow,
    followState: {
      barberId,
      isFollowing: Boolean(follow),
      notifyOnAvailability: follow?.notifyOnAvailability ?? true,
      notifyOnPortfolio: follow?.notifyOnPortfolio ?? true,
      followerCount: state.barberFollows.filter((entry) => entry.barberId === barberId).length
    }
  };
}

async function readFollowStateAfterMutation(
  engagementProvider: Awaited<ReturnType<typeof getEngagementProvider>>,
  clientId: string,
  barberId: string
) {
  const state = await engagementProvider.readState();
  return buildFollowState(state, clientId, barberId);
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireEngagementActor(["client"]);
    const parsed = querySchema.safeParse({
      barberId: request.nextUrl.searchParams.get("barberId") ?? undefined
    });

    if (!parsed.success || !actor.clientId) {
      return NextResponse.json({ error: "A barber reference is required for follow state." }, { status: 400 });
    }

    const barberIdentity = await resolvePublicBarberIdentity(parsed.data.barberId);
    if (!barberIdentity) {
      return NextResponse.json({ error: "Barber could not be found." }, { status: 404 });
    }

    const engagementProvider = await getEngagementProvider();
    const { followState } = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId);

    return NextResponse.json({
      ok: true,
      followState
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
    const barberIdentity = await resolvePublicBarberIdentity(payload.barberId);
    if (!barberIdentity) {
      return NextResponse.json({ error: "Barber could not be found." }, { status: 404 });
    }

    if (!actor.clientId) {
      return NextResponse.json({ error: "A client profile is required to follow a barber." }, { status: 400 });
    }

    const current = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId);
    if (current.follow) {
      return NextResponse.json({
        ok: true,
        action: "already_following",
        follow: current.follow,
        followState: current.followState
      });
    }

    let result: Awaited<ReturnType<typeof engagementProvider.followBarber>>;
    try {
      result = await engagementProvider.followBarber(actor, {
        ...payload,
        barberId: barberIdentity.barberId
      });
    } catch (error) {
      const recovered = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId).catch(() => null);
      if (recovered?.follow) {
        return NextResponse.json({
          ok: true,
          action: "followed",
          follow: recovered.follow,
          followState: recovered.followState,
          warning: "Follow was saved, but a non-blocking engagement side effect needs review."
        });
      }

      throw error;
    }

    try {
      await marketplaceProvider.recordFollowCreated({
        barberId: barberIdentity.barberId,
        clientId: actor.clientId,
        username: barberIdentity.username
      });
    } catch {
      // Follow relationship is primary; marketplace analytics are best effort.
    }

    const next = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId).catch(() => ({
      follow: result.follow,
      followState: {
        barberId: barberIdentity.barberId,
        isFollowing: true,
        notifyOnAvailability: result.follow.notifyOnAvailability,
        notifyOnPortfolio: result.follow.notifyOnPortfolio,
        followerCount: current.followState.followerCount + 1
      }
    }));

    return NextResponse.json({
      ok: true,
      action: "followed",
      follow: result.follow,
      followState: next.followState,
      notification: result.notification
    });
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

    const barberIdentity = await resolvePublicBarberIdentity(parsed.data.barberId);
    if (!barberIdentity) {
      return NextResponse.json({ error: "Barber could not be found." }, { status: 404 });
    }

    const engagementProvider = await getEngagementProvider();
    if (!actor.clientId) {
      return NextResponse.json({ error: "A client profile is required to unfollow a barber." }, { status: 400 });
    }

    const before = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId);
    if (!before.follow) {
      return NextResponse.json({
        ok: true,
        action: "already_not_following",
        unfollowedBarberId: barberIdentity.barberId,
        followState: before.followState
      });
    }

    const result = await engagementProvider.unfollowBarber(actor, barberIdentity.barberId);
    const after = await readFollowStateAfterMutation(engagementProvider, actor.clientId, barberIdentity.barberId).catch(() => ({
      followState: {
        ...before.followState,
        isFollowing: false,
        followerCount: Math.max(0, before.followState.followerCount - 1)
      }
    }));

    return NextResponse.json({
      ok: true,
      action: "unfollowed",
      ...result,
      followState: after.followState
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
