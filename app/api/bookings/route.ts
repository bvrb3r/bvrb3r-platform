import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { recordBookingCreatedPlatformEvent } from "@/lib/core/booking-events";
import { getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationConflictError, LiveOperationValidationError } from "@/lib/operations/live-state";

const bookingSchema = z.object({
  locationId: z.string().min(1),
  barberId: z.string().min(1),
  serviceId: z.string().min(1),
  addOnIds: z.array(z.string()).default([]),
  appointmentTime: z.string().min(1),
  clientName: z.string().min(2),
  clientPhone: z.string().min(7),
  pointsToRedeem: z.number().int().min(0).optional(),
  sourceKind: z.enum(["direct", "discovery", "public_profile", "haircut_now", "client_dashboard"]).optional(),
  matchedFrom: z.enum(["favorite_barber", "favorite_shop", "nearby", "available_now"]).optional(),
  discoveryQuery: z.string().optional(),
  barberUsername: z.string().optional(),
  promotionId: z.string().optional(),
  promotionCode: z.string().optional()
});

export async function POST(request: NextRequest) {
  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking payload." }, { status: 400 });
  }

  try {
    const { sourceKind, matchedFrom, discoveryQuery, barberUsername, ...bookingInput } = parsed.data;
    const clientContext = await getClientExperienceContext();
    const provider = await getLiveOperationsProvider();
    const result = await provider.createBooking({
      ...bookingInput,
      clientId: clientContext.clientId || undefined,
      pointsUserId: clientContext.viewer.role === "client" ? clientContext.viewer.id : undefined,
      actorRole: "client",
      actorEmail: clientContext.activeClient?.email ?? clientContext.viewer.email,
      bookingSource: sourceKind ?? "booking"
    });
    await recordBookingCreatedPlatformEvent({
      appointment: result.appointment,
      actorId: clientContext.viewer.id,
      actorRole: "client",
      source: "api",
      route: "/api/bookings",
      context: {
        sourceKind: sourceKind ?? null,
        matchedFrom: matchedFrom ?? null
      }
    });

    if (sourceKind) {
      const marketplaceProvider = await getMarketplaceProvider();
      try {
        await marketplaceProvider.recordBookingCreated({
          appointmentId: result.appointment.id,
          barberId: result.appointment.barberId,
          username: barberUsername,
          clientId: result.appointment.clientId,
          clientEmail: undefined,
          locationId: result.appointment.locationId,
          sourceKind,
          matchedFrom,
          query: discoveryQuery
        });
      } catch {}
    }

    try {
      const engagementProvider = await getEngagementProvider();
      await Promise.all([
        engagementProvider.recordEvent(
        {
          role: "client",
          clientId: result.appointment.clientId,
          userEmail: undefined
        },
        {
          eventType: "appointment_booked",
          targetType: "client",
          targetId: result.appointment.clientId,
          metadata: {
            appointmentId: result.appointment.id,
            barberId: result.appointment.barberId,
            serviceId: result.appointment.serviceId,
            sourceKind: sourceKind ?? null
          }
        }
        ),
        engagementProvider.recordReferralBooking({
          clientId: result.appointment.clientId,
          appointmentId: result.appointment.id
        })
      ]);
    } catch {}

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

    return NextResponse.json({ error: "Unable to create appointment." }, { status: 500 });
  }
}
