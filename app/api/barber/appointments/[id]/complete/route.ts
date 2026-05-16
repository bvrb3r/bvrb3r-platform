import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberAppointmentActionError, resolveBarberAppointmentActionContext } from "@/lib/barber/appointment-actions";
import { recordBookingUpdatedPlatformEvents } from "@/lib/core/booking-events";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";

const bodySchema = z.object({
  expectedRevision: z.number().int().positive()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid service-complete payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = "barber";

  try {
    const { id } = await context.params;
    const actionContext = await resolveBarberAppointmentActionContext({
      user,
      appointmentId: id,
      allowedStatuses: ["confirmed", "checked_in", "in_service"]
    });
    const provider = await getLiveOperationsProvider();
    const result = await provider.transitionAppointment({
      appointmentId: actionContext.providerAppointmentId,
      expectedRevision: parsed.data.expectedRevision,
      action: "service_complete",
      actorRole,
      actorEmail: user.email
    });
    try {
      await recordBookingUpdatedPlatformEvents({
        appointment: result.appointment,
        actorId: user.id,
        actorRole,
        source: "api",
        route: "/api/barber/appointments/[id]/complete",
        lifecycleEvent: "completed"
      });
    } catch (eventError) {
      console.warn("[barber-appointment] platform_event_failed", {
        appointmentId: actionContext.appointment.id,
        eventType: "appointment_completed",
        errorName: eventError instanceof Error ? eventError.name : "UnknownError",
        errorMessage: eventError instanceof Error ? eventError.message : String(eventError)
      });
    }

    return NextResponse.json({ ok: true, appointment: result.appointment });
  } catch (error) {
    if (error instanceof BarberAppointmentActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    return NextResponse.json({ error: "Appointment could not be completed. Refresh and try again." }, { status: 500 });
  }
}
