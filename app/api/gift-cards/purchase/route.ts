import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  enforceBookingRateLimit,
  resolveBookingRouteContext,
  withBookingSession
} from "@/lib/booking/engine/route-context";
import { giftCardPurchaseSchema } from "@/lib/gift-cards/domain";
import { createGiftCardPaymentSession, GiftCardServiceError } from "@/lib/gift-cards/service";
import { StripeConnectError } from "@/lib/stripe/connect";

export async function POST(request: Request) {
  const limited = enforceBookingRateLimit(request, "gift-card-purchase", 8);
  if (limited) return limited;

  try {
    const context = await resolveBookingRouteContext(request);
    const payload = giftCardPurchaseSchema.parse(await request.json().catch(() => null));
    const payment = await createGiftCardPaymentSession({ actor: context.actor, payload });
    return withBookingSession(NextResponse.json({ payment }, { status: 201 }), context);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid gift card purchase." }, { status: 400 });
    }
    if (error instanceof GiftCardServiceError || error instanceof StripeConnectError) {
      return NextResponse.json(
        { error: error.message, code: "code" in error ? error.code : "stripe_unavailable" },
        { status: error.status }
      );
    }
    return NextResponse.json({ error: "Gift card payment could not be initialized." }, { status: 500 });
  }
}
