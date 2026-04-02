import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
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
  if (!(user.role === "owner" || user.role === "manager" || user.role === "commission_barber" || user.role === "booth_rent_barber")) {
    return NextResponse.json({ error: "You do not have access to complete this service." }, { status: 403 });
  }

  const actorRole = user.role === "owner" || user.role === "manager" ? user.role : "barber";

  try {
    const { id } = await context.params;
    const provider = await getLiveOperationsProvider();
    const result = await provider.transitionAppointment({
      appointmentId: id,
      expectedRevision: parsed.data.expectedRevision,
      action: "service_complete",
      actorRole,
      actorEmail: user.email
    });

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json({ error: error.message, code: error.code, latestAppointment: error.latestAppointment }, { status: error.status });
    }

    throw error;
  }
}
