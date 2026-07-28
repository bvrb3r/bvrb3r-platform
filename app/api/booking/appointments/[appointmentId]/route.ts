import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readBookingAppointment } from "@/lib/booking/engine";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  requireAccountActor,
  resolveBookingRouteContext
} from "@/lib/booking/engine/route-context";

/**
 * Reads one booking.
 *
 * Scoped to the actor's relationship with the booking, resolved from canonical
 * rows: the client of record, the barber of record, an active operator at that
 * location, or internal access. Anyone else is told the booking was not found
 * rather than that they are forbidden — confirming that a stranger's appointment
 * exists is itself a disclosure.
 *
 * The response includes the immutable service snapshot and the original
 * attribution, so what is shown is what was agreed, not a fresh read of a
 * catalog that may have changed since.
 */

const paramsSchema = z.object({ appointmentId: z.string().uuid() });

export async function GET(request: NextRequest, context: { params: Promise<{ appointmentId: string }> }) {
  const limited = enforceBookingRateLimit(request, "booking-read", 60);
  if (limited) {
    return limited;
  }

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That booking was not found.", kind: "not_found", reason: "appointment_not_found", retryable: false },
      { status: 404 }
    );
  }

  try {
    const routeContext = await resolveBookingRouteContext(request);
    const actor = requireAccountActor(routeContext);
    const appointment = await readBookingAppointment(actor, parsed.data.appointmentId);

    return NextResponse.json({ appointment });
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
