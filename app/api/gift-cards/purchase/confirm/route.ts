import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  enforceBookingRateLimit,
  resolveBookingRouteContext,
  withBookingSession
} from "@/lib/booking/engine/route-context";
import { giftCardConfirmSchema } from "@/lib/gift-cards/domain";
import { confirmGiftCardPayment, GiftCardServiceError } from "@/lib/gift-cards/service";
import { StripeConnectError } from "@/lib/stripe/connect";

export async function POST(request: Request) {
  const limited = enforceBookingRateLimit(request, "gift-card-confirm", 12);
  if (limited) return limited;

  try {
    const context = await resolveBookingRouteContext(request);
    const payload = giftCardConfirmSchema.parse(await request.json().catch(() => null));
    const gift = await confirmGiftCardPayment({ actor: context.actor, ...payload });
    return withBookingSession(NextResponse.json({ gift }), context);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid gift card confirmation." }, { status: 400 });
    }
    if (error instanceof GiftCardServiceError || error instanceof StripeConnectError) {
      return NextResponse.json(
        { error: error.message, code: "code" in error ? error.code : "stripe_unavailable" },
        { status: error.status }
      );
    }
    return NextResponse.json({ error: "Gift card payment could not be confirmed." }, { status: 500 });
  }
}
