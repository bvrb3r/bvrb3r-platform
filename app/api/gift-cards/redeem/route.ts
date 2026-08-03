import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError, requireVerifiedActor } from "@/lib/auth/permissions";
import { giftCardRedeemSchema } from "@/lib/gift-cards/domain";
import { GiftCardServiceError, redeemGiftCardBalance } from "@/lib/gift-cards/service";

export async function POST(request: Request) {
  try {
    const actor = await requireVerifiedActor();
    const payload = giftCardRedeemSchema.parse(await request.json().catch(() => null));
    const redemption = await redeemGiftCardBalance({ profileId: actor.user.id, ...payload });
    return NextResponse.json({ redemption });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid gift card redemption." }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof GiftCardServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Gift balance could not be applied." }, { status: 500 });
  }
}
