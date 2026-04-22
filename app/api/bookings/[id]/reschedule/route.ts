import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, toBookingViewer, toLifecycleActorRole } from "@/lib/booking/route-auth";
import { recordBookingUpdatedPlatformEvents } from "@/lib/core/booking-events";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError, LiveOperationValidationError } from "@/lib/operations/live-state";

const rescheduleSchema = z.object({
  expectedRevision: z.number().int().positive(),
  appointmentTime: z.string().min(1),
  reason: z.string().trim().min(2).max(240).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = rescheduleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reschedule payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = toLifecycleActorRole(user.role);
  if (!actorRole) {
    return NextResponse.json({ error: "You do not have access to reschedule this booking." }, { status: 403 });
  }
  const viewer = toBookingViewer(user);
  if (!viewer) {
    return NextResponse.json({ error: "You do not have access to reschedule this booking." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const provider = await getLiveOperationsProvider();
    const scopedSnapshot = await provider.readSnapshot(viewer);
    if (!scopedSnapshot.appointments.some((appointment) => appointment.id === id)) {
      return NextResponse.json({ error: "You do not have access to reschedule this booking." }, { status: 403 });
    }

    const result = await provider.rescheduleAppointment({
      appointmentId: id,
      expectedRevision: parsed.data.expectedRevision,
      appointmentTime: parsed.data.appointmentTime,
      actorRole,
      actorEmail: user.email,
      reason: parsed.data.reason
    });
    await recordBookingUpdatedPlatformEvents({
      appointment: result.appointment,
      actorId: user.id,
      actorRole,
      source: "api",
      route: "/api/bookings/[id]/reschedule",
      lifecycleEvent: "rescheduled",
      context: {
        reason: parsed.data.reason ?? null,
        appointmentTime: parsed.data.appointmentTime
      }
    });

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details ?? null },
        { status: error.status }
      );
    }
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code, latestAppointment: error.latestAppointment },
        { status: error.status }
      );
    }

    throw error;
  }
}
