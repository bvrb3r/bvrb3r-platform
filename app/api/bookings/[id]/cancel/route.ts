import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";
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
  if (!(user.role === "client" || user.role === "front_desk" || user.role === "manager" || user.role === "owner")) {
    return NextResponse.json({ error: "You do not have access to cancel this booking." }, { status: 403 });
  }

  const actorRole = user.role;

  try {
    const { id } = await context.params;
    const provider = await getLiveOperationsProvider();
    const result = await provider.cancelAppointment({
      appointmentId: id,
      expectedRevision: parsed.data.expectedRevision,
      actorRole,
      actorEmail: user.email,
      reason: parsed.data.reason
    });
    try {
      await reversePointsForAppointment({
        appointmentId: id,
        reason: parsed.data.reason?.trim() || "appointment_cancelled"
      });
    } catch {}

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    throw error;
  }
}
