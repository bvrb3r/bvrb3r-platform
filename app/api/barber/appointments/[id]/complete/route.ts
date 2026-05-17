import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberAppointmentActionError, resolveBarberAppointmentActionContext } from "@/lib/barber/appointment-actions";
import { recordBookingUpdatedPlatformEvents } from "@/lib/core/booking-events";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError, type LiveMutationSuccess } from "@/lib/operations/live-state";

const bodySchema = z.object({
  expectedRevision: z.number().int().positive()
});

function normalizeCompleteRouting(routing: LiveMutationSuccess["routing"] | undefined) {
  if (!routing) {
    return null;
  }

  return {
    ...routing,
    payoutReadinessStatus: routing.status === "eligible" ? "eligible" : routing.payoutReadinessStatus ?? null,
    moneyRoutingStatus: routing.moneyRoutingStatus ?? (routing.status === "eligible" ? "ready_for_payout" : routing.status),
    eligibleAt: routing.eligibleAt ?? null,
    releasedAt: routing.releasedAt ?? null,
    barberPayoutAmount: routing.barberAmountCents / 100,
    platformFeeAmount: routing.platformAmountCents / 100,
    shopSplitAmount: routing.shopAmountCents / 100
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid service-complete payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = "barber";
  const { id } = await context.params;

  try {
    const actionContext = await resolveBarberAppointmentActionContext({
      user,
      appointmentId: id,
      allowedStatuses: ["confirmed", "checked_in", "in_service"]
    });
    console.info("[barber-appointment] complete_started", {
      appointmentId: actionContext.appointment.id,
      authUserIdPresent: Boolean(user.id),
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      currentStatus: actionContext.appointment.status
    });
    console.info("[barber-appointment] action_started", {
      appointmentId: actionContext.appointment.id,
      action: "complete",
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      oldStatus: actionContext.appointment.status,
      newStatus: "completed",
      ownershipVerified: true
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

    const responseAppointment = {
      ...result.appointment,
      id: actionContext.appointment.id
    };
    const responseRouting = normalizeCompleteRouting(result.routing);
    console.info("[barber-appointment] complete_succeeded", {
      appointmentId: actionContext.appointment.id,
      oldStatus: actionContext.appointment.status,
      newStatus: responseAppointment.status,
      completedAtPresent: Boolean(responseAppointment.completedAt),
      statusHistoryInserted: true,
      routingUpdated: Boolean(responseRouting),
      payoutReadinessStatus: responseRouting?.payoutReadinessStatus ?? responseRouting?.status ?? null,
      eligibleAtPresent: Boolean(responseRouting?.eligibleAt)
    });
    console.info("[barber-appointment] action_succeeded", {
      appointmentId: actionContext.appointment.id,
      action: "complete",
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      oldStatus: actionContext.appointment.status,
      newStatus: result.appointment.status,
      ownershipVerified: true
    });
    return NextResponse.json({ ok: true, appointment: responseAppointment, routing: responseRouting });
  } catch (error) {
    if (error instanceof BarberAppointmentActionError) {
      console.warn("[barber-appointment] complete_failed", {
        appointmentId: id,
        stage: "validation",
        errorName: error.name,
        errorMessage: error.message,
        postgresCode: null,
        postgresDetails: null,
        profileId: null,
        barberId: null,
        currentStatus: null,
        ownershipVerified: error.status !== 403
      });
      console.warn("[barber-appointment] action_failed", {
        appointmentId: id,
        action: "complete",
        stage: "validation",
        errorName: error.name,
        errorMessage: error.message,
        postgresCode: null,
        profileId: null,
        barberId: null,
        ownershipVerified: error.status !== 403
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof LiveOperationConflictError) {
      console.warn("[barber-appointment] complete_failed", {
        appointmentId: id,
        stage: "conflict",
        errorName: error.name,
        errorMessage: error.message,
        postgresCode: null,
        postgresDetails: null,
        profileId: null,
        barberId: null,
        currentStatus: error.latestAppointment.status,
        ownershipVerified: true
      });
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    console.error("[barber-appointment] complete_failed", {
      appointmentId: id,
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
    console.error("[barber-appointment] action_failed", {
      appointmentId: id,
      action: "complete",
      stage: "database_update",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      postgresCode: typeof error === "object" && error !== null && "code" in error ? error.code : null,
      profileId: null,
      barberId: null,
      ownershipVerified: null
    });
    return NextResponse.json({ error: "Appointment could not be completed. Refresh and try again." }, { status: 500 });
  }
}
