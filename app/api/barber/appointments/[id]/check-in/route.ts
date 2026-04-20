import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { recordBookingUpdatedPlatformEvents } from "@/lib/core/booking-events";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";

const bodySchema = z.object({
  expectedRevision: z.number().int().positive()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-in payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  if (user.role === "client") {
    return NextResponse.json({ error: "You do not have access to check in this appointment." }, { status: 403 });
  }

  const actorRole = user.role === "owner" || user.role === "manager" || user.role === "front_desk"
    ? user.role
    : "barber";

  try {
    const { id } = await context.params;
    const provider = await getLiveOperationsProvider();
    const result = await provider.transitionAppointment({
      appointmentId: id,
      expectedRevision: parsed.data.expectedRevision,
      action: "check_in",
      actorRole,
      actorEmail: user.email
    });
    await recordBookingUpdatedPlatformEvents({
      appointment: result.appointment,
      actorId: user.id,
      actorRole,
      source: "api",
      route: "/api/barber/appointments/[id]/check-in",
      lifecycleEvent: "updated"
    });

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    throw error;
  }
}
