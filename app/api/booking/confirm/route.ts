import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmBooking } from "@/lib/booking/engine";
import { resolveConfirmingClientId } from "@/lib/booking/engine/client-resolution";
import {
  bookingErrorResponse,
  assertBookingBillingAccess,
  enforceBookingRateLimit,
  resolveBookingRouteContext,
  withBookingSession
} from "@/lib/booking/engine/route-context";

/**
 * Turns a held slot into a booking.
 *
 * This is the explicit confirmation step. Nothing before it creates an
 * appointment, and nothing here takes or authorizes a payment: the booking
 * records the price that was agreed and it is owed at the chair. Payment
 * capture is PR 34/35.
 *
 * A guest supplies contact details so the shop can reach them; a signed-in
 * caller supplies nothing, because their account already answers the question.
 * Either way the write runs through this server action, which is what keeps
 * anonymous callers off the booking tables entirely.
 */

const confirmSchema = z.object({
  holdToken: z.string().min(20).max(200),
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(7).max(40).optional(),
  email: z.string().trim().email().max(200).optional(),
  clientNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(200).optional()
});

export async function POST(request: NextRequest) {
  const limited = enforceBookingRateLimit(request, "booking-confirm", 15);
  if (limited) {
    return limited;
  }

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid confirmation request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const context = await resolveBookingRouteContext(request);
    await assertBookingBillingAccess(context);
    const clientId = await resolveConfirmingClientId(context.actor, {
      fullName: parsed.data.fullName ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null
    });

    const booking = await confirmBooking({
      actor: context.actor,
      holdToken: parsed.data.holdToken,
      clientId,
      clientNote: parsed.data.clientNote ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null
    });

    return withBookingSession(NextResponse.json({ booking }, { status: 201 }), context);
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
