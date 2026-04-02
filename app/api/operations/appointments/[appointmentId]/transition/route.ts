import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError } from "@/lib/operations/live-state";

const transitionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  action: z.enum(["check_in", "service_start", "service_complete"])
});

function actorRoleForUserRole(role: string) {
  if (role === "commission_barber" || role === "booth_rent_barber") {
    return "barber" as const;
  }

  if (role === "front_desk" || role === "manager" || role === "owner") {
    return role;
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const body = await request.json();
  const parsed = transitionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transition payload." }, { status: 400 });
  }

  const { user } = await getCurrentUserFromServer();
  const actorRole = actorRoleForUserRole(user.role);
  if (!actorRole) {
    return NextResponse.json({ error: "You do not have access to mutate appointment workflow." }, { status: 403 });
  }

  if (parsed.data.action === "check_in" && !(user.role === "front_desk" || user.role === "manager" || user.role === "owner")) {
    return NextResponse.json({ error: "Only front desk, manager, or owner can check clients in." }, { status: 403 });
  }

  if ((parsed.data.action === "service_start" || parsed.data.action === "service_complete") && !(user.role === "commission_barber" || user.role === "booth_rent_barber" || user.role === "manager" || user.role === "owner")) {
    return NextResponse.json({ error: "Only barber, manager, or owner can change chair-service status." }, { status: 403 });
  }

  const provider = await getLiveOperationsProvider();

  try {
    const { appointmentId } = await params;
    const result = await provider.transitionAppointment({
      appointmentId,
      expectedRevision: parsed.data.expectedRevision,
      action: parsed.data.action,
      actorRole,
      actorEmail: user.email
    });

    if (parsed.data.action === "service_complete" && (user.role === "commission_barber" || user.role === "booth_rent_barber")) {
      try {
        const engagementProvider = await getEngagementProvider();
        await engagementProvider.recordEvent(
          {
            role: user.role,
            barberId: user.barberId,
            userEmail: user.email,
            locationIds: user.locationIds
          },
          {
            eventType: "service_completed",
            targetType: "barber",
            targetId: result.appointment.barberId,
            metadata: {
              appointmentId: result.appointment.id,
              serviceId: result.appointment.serviceId,
              locationId: result.appointment.locationId
            }
          }
        );
      } catch {
        // Lifecycle transition remains primary even if engagement writes fail.
      }
    }

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          latestAppointment: error.latestAppointment
        },
        { status: error.status }
      );
    }

    throw error;
  }
}
