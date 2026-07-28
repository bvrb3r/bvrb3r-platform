import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rescheduleBooking } from "@/lib/booking/engine";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  requireAccountActor,
  resolveBookingRouteContext
} from "@/lib/booking/engine/route-context";

/**
 * Moves a booking to a new time.
 *
 * A reschedule is not a time edit. The caller first takes a hold on the new slot
 * exactly as a first-time booking would, and passes that hold here — so the new
 * time is proved free by the same mechanism, under the same lock, and the old
 * booking keeps its slot until the new one is secured. The database performs the
 * move as a single UPDATE, so the booking is never briefly holding both slots or
 * neither.
 *
 * `expectedRevision` is required. Two consoles open on the same booking cannot
 * both apply their change: the second is told the booking moved.
 */

const rescheduleSchema = z.object({
  expectedRevision: z.number().int().positive(),
  holdToken: z.string().min(20).max(200),
  reason: z.string().trim().min(2).max(240).optional(),
  idempotencyKey: z.string().min(8).max(200).optional()
});

const paramsSchema = z.object({ appointmentId: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ appointmentId: string }> }) {
  const limited = enforceBookingRateLimit(request, "booking-reschedule", 15);
  if (limited) {
    return limited;
  }

  const params = paramsSchema.safeParse(await context.params);
  const parsed = rescheduleSchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !parsed.success) {
    return NextResponse.json(
      { error: "Invalid reschedule request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const routeContext = await resolveBookingRouteContext(request);
    const actor = requireAccountActor(routeContext);
    const result = await rescheduleBooking({
      actor,
      appointmentId: params.data.appointmentId,
      expectedRevision: parsed.data.expectedRevision,
      holdToken: parsed.data.holdToken,
      reason: parsed.data.reason ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null
    });

    return NextResponse.json({ booking: result });
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
