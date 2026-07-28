import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelBooking } from "@/lib/booking/engine";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  requireAccountActor,
  resolveBookingRouteContext
} from "@/lib/booking/engine/route-context";

/**
 * Cancels a booking.
 *
 * Cancelling something already cancelled reports success with
 * `alreadyCancelled: true` — a client retrying a cancel wants it cancelled, and
 * it is. Cancelling something already completed or marked no-show is refused,
 * because reversing those is a money decision that belongs to the refund path.
 *
 * The slot is freed by the status change itself: the overlap constraint on
 * `appointments` excludes cancelled rows, so the time becomes bookable the
 * moment the transaction commits, with nothing to clean up afterwards.
 */

const cancelSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(2).max(240).optional(),
  idempotencyKey: z.string().min(8).max(200).optional()
});

const paramsSchema = z.object({ appointmentId: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ appointmentId: string }> }) {
  const limited = enforceBookingRateLimit(request, "booking-cancel", 15);
  if (limited) {
    return limited;
  }

  const params = paramsSchema.safeParse(await context.params);
  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !parsed.success) {
    return NextResponse.json(
      { error: "Invalid cancellation request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const routeContext = await resolveBookingRouteContext(request);
    const actor = requireAccountActor(routeContext);
    const result = await cancelBooking({
      actor,
      appointmentId: params.data.appointmentId,
      expectedRevision: parsed.data.expectedRevision,
      reason: parsed.data.reason ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null
    });

    return NextResponse.json({ booking: result });
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
