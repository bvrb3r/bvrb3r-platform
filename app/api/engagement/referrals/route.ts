import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";
import {
  ReferralServiceError,
  createReferralInvite,
  readClientReferralSummary
} from "@/lib/referrals/service";

const inviteSchema = z.object({
  referredClientEmail: z.string().email()
});

function toErrorResponse(error: unknown) {
  if (error instanceof ReferralServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to process the referral request.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const actor = await requireEngagementActor(["client"]);
    if (!actor.clientId) {
      throw new ReferralServiceError("A client profile is required for referrals.", 403);
    }

    const summary = await readClientReferralSummary({
      clientId: actor.clientId,
      clientEmail: actor.userEmail
    });

    return NextResponse.json({ summary });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireEngagementActor(["client"]);
    if (!actor.clientId || !actor.userEmail) {
      throw new ReferralServiceError("A signed-in client email is required for referrals.", 403);
    }

    const payload = inviteSchema.parse(await request.json());
    const [result, marketplaceProvider] = await Promise.all([
      createReferralInvite({
        clientId: actor.clientId,
        clientEmail: actor.userEmail,
        referredClientEmail: payload.referredClientEmail
      }),
      getMarketplaceProvider()
    ]);

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
      // Marketplace attribution should not block the canonical referral invite.
    }

    return NextResponse.json({
      referral: {
        id: result.referralEvent.id,
        referredClientEmail: result.referralEvent.referredClientEmail
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid referral invite request." }, { status: 400 });
    }

    return toErrorResponse(error);
  }
}
