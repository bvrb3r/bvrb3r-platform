import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBookingHold } from "@/lib/booking/engine";
import { publicBookingDoors } from "@/lib/booking/engine/attribution";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  resolveBookingRouteContext,
  withBookingSession
} from "@/lib/booking/engine/route-context";

/**
 * Takes a short-lived hold on a slot.
 *
 * A hold is not a booking. It reserves the chair-minute while the person
 * finishes deciding, expires on its own, and takes no money. Confirmation is a
 * separate, explicit call — nothing here books anything.
 *
 * Note what the request cannot say: there is no price, duration, buffer or
 * end-time field. Those are read from the catalog inside the transaction that
 * creates the hold, so a caller cannot propose a cheaper or shorter service than
 * the barber published.
 *
 * The `sourceDoor` a caller may claim is restricted to the public doors. A web
 * request cannot label itself as coming from a kiosk to inherit kiosk trust.
 */

const holdSchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true }),
  sourceDoor: z.string().optional(),
  sourceSurface: z.string().max(120).optional(),
  campaignId: z.string().max(120).optional(),
  referralCode: z.string().max(120).optional(),
  correlationId: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(200).optional()
});

export async function POST(request: NextRequest) {
  const limited = enforceBookingRateLimit(request, "booking-hold", 20);
  if (limited) {
    return limited;
  }

  const parsed = holdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid hold request.", kind: "validation", reason: "missing_required_input", retryable: false },
      { status: 400 }
    );
  }

  try {
    const context = await resolveBookingRouteContext(request);
    const result = await createBookingHold({
      actor: context.actor,
      barberId: parsed.data.barberId,
      serviceId: parsed.data.serviceId,
      locationId: parsed.data.locationId ?? null,
      startsAt: parsed.data.startsAt,
      attribution: {
        sourceDoor: parsed.data.sourceDoor,
        sourceSurface: parsed.data.sourceSurface,
        campaignId: parsed.data.campaignId,
        referralCode: parsed.data.referralCode,
        correlationId: parsed.data.correlationId
      },
      allowedDoors: publicBookingDoors(),
      fallbackDoor: "bvrb3r_web",
      idempotencyKey: parsed.data.idempotencyKey ?? null
    });

    // The token is returned exactly once, here. It is never stored in a row, a
    // log line or an audit record — only its digest is.
    return withBookingSession(
      NextResponse.json({ holdToken: result.holdToken, hold: result.hold }, { status: 201 }),
      context
    );
  } catch (error) {
    return bookingErrorResponse(error);
  }
}
