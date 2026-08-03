import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  bookingErrorResponse,
  enforceBookingRateLimit,
  resolveBookingRouteContext,
  withBookingSession
} from "@/lib/booking/engine/route-context";
import { createGroupBookingSchema } from "@/lib/group-booking/domain";
import {
  createAndConfirmGroupBooking,
  GroupBookingServiceError,
  readGroupBookingCatalog
} from "@/lib/group-booking/service";

export async function GET() {
  try {
    return NextResponse.json({ catalog: await readGroupBookingCatalog() });
  } catch (error) {
    if (error instanceof GroupBookingServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "The group-booking catalog could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = enforceBookingRateLimit(request, "group-booking", 8);
  if (limited) return limited;

  try {
    const context = await resolveBookingRouteContext(request);
    const payload = createGroupBookingSchema.parse(await request.json().catch(() => null));
    const group = await createAndConfirmGroupBooking({ actor: context.actor, payload });
    return withBookingSession(NextResponse.json({ group }, { status: 201 }), context);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        error: error.issues[0]?.message ?? "Invalid group booking request.",
        code: "invalid_group_booking"
      }, { status: 400 });
    }
    if (error instanceof GroupBookingServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return bookingErrorResponse(error);
  }
}
