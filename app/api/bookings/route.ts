import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAiRecommendation } from "@/lib/ai/service";
import { queueBookingCreatedNotifications } from "@/lib/booking/notifications";
import { recordReferralBookingProgress } from "@/lib/referrals/service";
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
  paymentMethodId: z.string().min(1).optional(),
  pointsToRedeem: z.number().int().min(0).optional(),
  sourceKind: z.enum(["direct", "discovery", "public_profile", "haircut_now", "client_dashboard"]).optional(),
  matchedFrom: z.enum(["favorite_barber", "favorite_shop", "nearby", "available_now"]).optional(),
  discoveryQuery: z.string().optional(),
  barberUsername: z.string().optional(),
  barberName: z.string().optional(),
  serviceName: z.string().optional(),
  aiRecommendationId: z.string().optional(),
  aiRecommendationType: z.enum(["rebooking_reminder", "available_now", "barber_gap_alert"]).optional(),
  promotionId: z.string().optional(),
  promotionCode: z.string().optional()
});

function serializeBookingValidationError(error: LiveOperationValidationError) {
  const details = error.details && typeof error.details === "object"
    ? error.details as Record<string, unknown>
    : null;

  if (error.code === "verification_blocked" && details?.gate === "shop_activation") {
    return {
      error: "This provider is not available for booking yet.",
      code: error.code,
      details: {
        ...details,
        reasons: ["This provider is not available for booking yet."]
      }
    };
  }

  return { error: error.message, code: error.code, details: error.details ?? null };
}

export async function POST(request: NextRequest) {
  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking payload." }, { status: 400 });
  }

  try {
    const {
      sourceKind,
      matchedFrom,
      discoveryQuery,
      barberUsername,
      barberName,
      serviceName,
      aiRecommendationId,
      aiRecommendationType,
      ...bookingInput
    } = parsed.data;
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

    try {
      await queueBookingCreatedNotifications({
        appointment: result.appointment,
        clientName: bookingInput.clientName,
        clientEmail: clientContext.activeClient?.email ?? clientContext.viewer.email,
        barberUsername,
        barberName,
        serviceName,
        startsAt: result.appointment.start ?? bookingInput.appointmentTime
      });
    } catch (notificationError) {
      console.error("booking_notification_queue_failed", {
        appointmentId: result.appointment.id,
        barberId: result.appointment.barberId,
        clientId: result.appointment.clientId,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
    }

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
      await recordReferralBookingProgress({
        clientId: result.appointment.clientId,
        appointmentId: result.appointment.id
      });
    } catch {}

    if (aiRecommendationId && aiRecommendationType) {
      try {
        await trackAiRecommendation({
          recommendationId: aiRecommendationId,
          recommendationType: aiRecommendationType,
          action: "converted",
          surface: "client_home",
          actorId: clientContext.viewer.id,
          actorRole: clientContext.viewer.role,
          relatedIds: {
            appointmentId: result.appointment.id,
            clientId: result.appointment.clientId,
            barberId: result.appointment.barberId,
            serviceId: result.appointment.serviceId,
            locationId: result.appointment.locationId
          },
          payload: {
            sourceKind: sourceKind ?? null,
            matchedFrom: matchedFrom ?? null
          }
        });
      } catch {}
    }

    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationValidationError) {
      return NextResponse.json(
        serializeBookingValidationError(error),
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
