import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberAppointmentActionError, resolveBarberAppointmentActionContext } from "@/lib/barber/appointment-actions";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";

const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(2).max(240).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid no-show payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = "barber";
  const { id } = await context.params;

  try {
    const actionContext = await resolveBarberAppointmentActionContext({
      user,
      appointmentId: id,
      allowedStatuses: ["confirmed", "checked_in"]
    });
    console.info("[barber-appointment] action_started", {
      appointmentId: actionContext.appointment.id,
      action: "no_show",
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      oldStatus: actionContext.appointment.status,
      newStatus: "no_show",
      ownershipVerified: true
    });

    const provider = await getLiveOperationsProvider();
    const result = await provider.noShowAppointment({
      appointmentId: actionContext.providerAppointmentId,
      expectedRevision: parsed.data.expectedRevision,
      actorRole,
      actorEmail: user.email,
      reason: parsed.data.reason ?? "Marked no-show by barber"
    });

    console.info("[barber-appointment] action_succeeded", {
      appointmentId: actionContext.appointment.id,
      action: "no_show",
      profileId: actionContext.profile.id,
      barberId: actionContext.barber.id,
      oldStatus: actionContext.appointment.status,
      newStatus: result.appointment.status,
      ownershipVerified: true
    });
    return NextResponse.json({ ok: true, appointment: result.appointment });
  } catch (error) {
    if (error instanceof BarberAppointmentActionError) {
      console.warn("[barber-appointment] action_failed", {
        appointmentId: id,
        action: "no_show",
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
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    console.error("[barber-appointment] action_failed", {
      appointmentId: id,
      action: "no_show",
      stage: "database_update",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      postgresCode: typeof error === "object" && error !== null && "code" in error ? error.code : null,
      profileId: null,
      barberId: null,
      ownershipVerified: null
    });
    return NextResponse.json({ error: "Action could not be completed. Refresh and try again." }, { status: 500 });
  }
}
