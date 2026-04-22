import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, toBookingViewer, toLifecycleActorRole } from "@/lib/booking/route-auth";
import { recordBookingUpdatedPlatformEvents } from "@/lib/core/booking-events";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError, LiveOperationValidationError } from "@/lib/operations/live-state";
import { reversePointsForAppointment } from "@/lib/points/engine";

const cancelSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(2).max(240).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = cancelSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cancellation payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  const actorRole = toLifecycleActorRole(user.role);
  if (!actorRole) {
    return NextResponse.json({ error: "You do not have access to cancel this booking." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const provider = await getLiveOperationsProvider();
    const viewer = toBookingViewer(user);
    if (!viewer) {
      return NextResponse.json({ error: "You do not have access to cancel this booking." }, { status: 403 });
    }
    const scopedSnapshot = await provider.readSnapshot(viewer);
    if (!scopedSnapshot.appointments.some((appointment) => appointment.id === id)) {
      return NextResponse.json({ error: "You do not have access to cancel this booking." }, { status: 403 });
    }
    const result = await provider.cancelAppointment({
      appointmentId: id,
      expectedRevision: parsed.data.expectedRevision,
      actorRole,
      actorEmail: user.email,
      reason: parsed.data.reason
    });
    await recordBookingUpdatedPlatformEvents({
      appointment: result.appointment,
      actorId: user.id,
      actorRole,
      source: "api",
      route: "/api/bookings/[id]/cancel",
      lifecycleEvent: "canceled",
      context: {
        reason: parsed.data.reason ?? null
      }
    });
    try {
      await reversePointsForAppointment({
        appointmentId: id,
        reason: parsed.data.reason?.trim() || "appointment_cancelled"
      });
    } catch {}

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationValidationError) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details ?? null }, { status: error.status });
    }
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    throw error;
  }
}
