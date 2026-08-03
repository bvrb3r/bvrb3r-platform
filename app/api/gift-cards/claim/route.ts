import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError, requireVerifiedActor } from "@/lib/auth/permissions";
import { giftCardClaimSchema } from "@/lib/gift-cards/domain";
import { claimGiftCard, GiftCardServiceError } from "@/lib/gift-cards/service";

export async function POST(request: Request) {
  try {
    const actor = await requireVerifiedActor();
    const payload = giftCardClaimSchema.parse(await request.json().catch(() => null));
    const giftCard = await claimGiftCard({ profileId: actor.user.id, claimToken: payload.claimToken });
    return NextResponse.json({ giftCard });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid gift card claim." }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof GiftCardServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Gift card claim could not be completed." }, { status: 500 });
  }
}
