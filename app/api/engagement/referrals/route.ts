import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { EngagementValidationError, getClientReferralSummary } from "@/lib/engagement/engine";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";

const inviteSchema = z.object({
  referredClientEmail: z.string().email()
});

export async function GET() {
  try {
    const actor = await requireEngagementActor(["client"]);
    if (!actor.clientId) {
      throw new EngagementValidationError("A client profile is required for referrals.");
    }

    const engagementProvider = await getEngagementProvider();
    const state = await engagementProvider.readState();
    return NextResponse.json({ summary: getClientReferralSummary(state, actor.clientId) });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireEngagementActor(["client"]);
    const payload = inviteSchema.parse(await request.json());
    const [engagementProvider, marketplaceProvider] = await Promise.all([
      getEngagementProvider(),
      getMarketplaceProvider()
    ]);
    const result = await engagementProvider.createReferralInvite(actor, payload);

    try {
      await marketplaceProvider.recordShareEvent({
        eventType: "referral_shared",
        sourceKind: "client_dashboard",
        clientId: actor.clientId,
        sourceReference: result.referralCode.code,
        metadata: {
          referredClientEmail: result.referralEvent.referredClientEmail,
          referralCode: result.referralCode.code
        }
      });
    } catch {
      // Referral invite remains primary even if marketplace analytics are unavailable.
    }

    return NextResponse.json({ referral: { id: result.referralEvent.id, referredClientEmail: result.referralEvent.referredClientEmail } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid referral invite request." }, { status: 400 });
    }

    return engagementErrorResponse(error);
  }
}
