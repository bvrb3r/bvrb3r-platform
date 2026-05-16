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
    return NextResponse.json({ error: "Invalid check-in payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = "barber";

  try {
    const { id } = await context.params;
    const actionContext = await resolveBarberAppointmentActionContext({
      user,
      appointmentId: id,
      allowedStatuses: ["confirmed"]
    });
    console.info("[barber-appointment] check_in_started", {
      appointmentId: actionContext.appointment.id,
      authUserIdPresent: Boolean(user.id),
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      currentStatus: actionContext.appointment.status
    });
    const provider = await getLiveOperationsProvider();
    const result = await provider.transitionAppointment({
      appointmentId: actionContext.providerAppointmentId,
      expectedRevision: parsed.data.expectedRevision,
      action: "check_in",
      actorRole,
      actorEmail: user.email
    });
    let platformEventInserted = false;
    try {
      await recordBookingUpdatedPlatformEvents({
        appointment: result.appointment,
        actorId: user.id,
        actorRole,
        source: "api",
        route: "/api/barber/appointments/[id]/check-in",
        lifecycleEvent: "checked_in"
      });
      platformEventInserted = true;
    } catch (eventError) {
      console.warn("[barber-appointment] platform_event_failed", {
        appointmentId: actionContext.appointment.id,
        eventType: "appointment_checked_in",
        errorName: eventError instanceof Error ? eventError.name : "UnknownError",
        errorMessage: eventError instanceof Error ? eventError.message : String(eventError)
      });
    }
    console.info("[barber-appointment] check_in_succeeded", {
      appointmentId: actionContext.appointment.id,
      oldStatus: actionContext.appointment.status,
      newStatus: result.appointment.status,
      statusHistoryInserted: true,
      platformEventInserted
    });

    return NextResponse.json({ ok: true, appointment: result.appointment });
  } catch (error) {
    if (error instanceof BarberAppointmentActionError) {
      const message = error.status === 409
        ? "Appointment cannot be checked in from its current status."
        : error.message;
      console.warn("[barber-appointment] check_in_failed", {
        appointmentId: (await context.params).id,
        stage: "validation",
        errorName: error.name,
        errorMessage: message,
        profileId: null,
        barberId: null,
        currentStatus: null,
        ownershipVerified: error.status !== 403
      });
      return NextResponse.json({ error: message }, { status: error.status });
    }
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    console.error("[barber-appointment] check_in_failed", {
      appointmentId: (await context.params).id,
      stage: "database_update",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      postgresCode: typeof error === "object" && error !== null && "code" in error ? error.code : null,
      postgresDetails: typeof error === "object" && error !== null && "details" in error ? error.details : null,
      profileId: null,
      barberId: null,
      currentStatus: null,
      ownershipVerified: null
    });
    return NextResponse.json({ error: "Check-in could not be completed. Refresh and try again." }, { status: 500 });
  }
}
