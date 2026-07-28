import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readBookingAvailability } from "@/lib/booking/engine";
import { bookingErrorResponse, enforceBookingRateLimit } from "@/lib/booking/engine/route-context";

/**
 * Bookable availability for one barber and one service.
 *
 * Public by design — someone comparing barbers has not signed in yet — but it
 * still runs server-side against deny-by-default tables, and it is rate limited
 * because an unauthenticated slot query is a cheap way to probe a schedule.
 *
 * The response carries a reason when there are no times. "No availability" and
 * "this barber does not work Sundays" are different answers, and only one of
 * them tells the person what to do next.
 */

const availabilitySchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(30).optional()
});

export async function GET(request: NextRequest) {
  const limited = enforceBookingRateLimit(request, "booking-availability", 60);
  if (limited) {
    return limited;
  }

  const parsed = availabilitySchema.safeParse({
    barberId: request.nextUrl.searchParams.get("barberId") ?? undefined,
    serviceId: request.nextUrl.searchParams.get("serviceId") ?? undefined,
    startDate: request.nextUrl.searchParams.get("startDate") ?? undefined,
    days: request.nextUrl.searchParams.get("days") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid availability request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const availability = await readBookingAvailability({
      barberId: parsed.data.barberId,
      serviceId: parsed.data.serviceId,
      startDate: parsed.data.startDate ?? null,
      days: parsed.data.days
    });

    return NextResponse.json({ availability });
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
