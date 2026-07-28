import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { releaseBookingHold } from "@/lib/booking/engine";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  resolveBookingRouteContext
} from "@/lib/booking/engine/route-context";

/**
 * Gives a held slot back.
 *
 * Releasing is deliberately generous about repetition: a client that abandons
 * checkout may fire this on unload, on navigation, and again on retry, and none
 * of those should surface an error. Releasing an already-released or expired
 * hold reports success. Releasing a hold that was already used to book reports a
 * conflict, because that one is a real disagreement about what happened.
 *
 * Ownership is proved before anything is released, so knowing a token is not
 * enough if it belongs to a different session.
 */

const releaseSchema = z.object({
  holdToken: z.string().min(20).max(200)
});

export async function POST(request: NextRequest) {
  const limited = enforceBookingRateLimit(request, "booking-hold-release", 40);
  if (limited) {
    return limited;
  }

  const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid release request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const context = await resolveBookingRouteContext(request);
    const result = await releaseBookingHold({
      actor: context.actor,
      holdToken: parsed.data.holdToken
    });

    return NextResponse.json(result);
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
