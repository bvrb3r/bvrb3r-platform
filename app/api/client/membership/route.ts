import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { isClientRole } from "@/lib/auth/roles";
import { readClientReferralSummary } from "@/lib/referrals/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildClientMembershipExecutionSummary,
  cancelClientMembershipSubscription,
  createClientMembershipSubscriptionSession,
  MonetizationServiceError
} from "@/lib/monetization/service";
import { readPointsBalanceForClientReference } from "@/lib/points/engine";

const subscribeSchema = z.object({
  planCode: z.string().min(1)
});

type ClientMembershipContext = Awaited<ReturnType<typeof getClientExperienceContext>>;

function canAccessClientMembership(context: ClientMembershipContext) {
  return Boolean(context.isSignedInClient && context.clientId && isClientRole(context.viewer.role));
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readExecutionSummary(context: Awaited<ReturnType<typeof getClientExperienceContext>>) {
  const supabase = createSupabaseAdminClient();
  const [pointsBalance, referralSummary] = await Promise.all([
    readPointsBalanceForClientReference(context.clientId, supabase),
    readClientReferralSummary({
      clientId: context.clientId,
      clientEmail: context.viewer.email
    }, supabase)
  ]);

  const membership = await buildClientMembershipExecutionSummary({
    clientId: context.clientId,
    clientName: context.activeClient?.name ?? context.viewer.name,
    pointsBalance: pointsBalance.unlockedPoints,
    referralCredits: referralSummary.totals.rewardPointsEarned,
    unlockedRewardCount: 0,
    nextDueAt: null,
    supabaseOverride: supabase
  });

  if (!membership.subscription) {
    console.warn("[client-profile] membership_status_defaulted", {
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role,
      membershipStatus: membership.membershipStatus ?? "none",
      tier: membership.tier ?? "none",
      active: membership.active ?? false,
      points: membership.points ?? 0
    });
  }

  return membership;
}

function toErrorResponse(error: unknown) {
  if (error instanceof MonetizationServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to load client membership.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const context = await getClientExperienceContext();
  if (!canAccessClientMembership(context)) {
    return NextResponse.json({ error: "Only signed-in clients can view membership details." }, { status: 403 });
  }

  try {
    const membership = await readExecutionSummary(context);
    return NextResponse.json({ membership });
  } catch (error) {
    console.warn("[client-profile] membership_status_failed", {
      stage: "read_execution_summary",
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role,
      message: safeErrorMessage(error)
    });
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await getClientExperienceContext();
  if (!canAccessClientMembership(context)) {
    return NextResponse.json({ error: "Only signed-in clients can start a membership subscription." }, { status: 403 });
  }

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid membership subscribe payload." }, { status: 400 });
  }

  try {
    const result = await createClientMembershipSubscriptionSession({
      user: context.viewer,
      planCode: parsed.data.planCode
    });
    const membership = await readExecutionSummary(context);
    return NextResponse.json({
      membership,
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId
    });
  } catch (error) {
    console.warn("[client-profile] membership_status_failed", {
      stage: "subscribe",
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role,
      message: safeErrorMessage(error)
    });
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  const context = await getClientExperienceContext();
  if (!canAccessClientMembership(context)) {
    return NextResponse.json({ error: "Only signed-in clients can cancel a membership subscription." }, { status: 403 });
  }

  try {
    const subscription = await cancelClientMembershipSubscription({
      user: context.viewer
    });
    const membership = await readExecutionSummary(context);
    return NextResponse.json({ subscription, membership });
  } catch (error) {
    console.warn("[client-profile] membership_status_failed", {
      stage: "cancel",
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role,
      message: safeErrorMessage(error)
    });
    return toErrorResponse(error);
  }
}
