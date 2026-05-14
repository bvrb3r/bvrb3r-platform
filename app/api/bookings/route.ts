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

  if (/\bindependent-barber-[a-z0-9-]+/i.test(error.message)) {
    return {
      error: "This provider is not available for booking yet.",
      code: error.code,
      details: null
    };
  }

  if (/\bbarber-[a-z0-9-]+/i.test(error.message) && /not found/i.test(error.message)) {
    return {
      error: "This barber is not available for booking yet.",
      code: error.code,
      details: null
    };
  }

  if (/\bclient-[a-z0-9-]+/i.test(error.message) && /not found/i.test(error.message)) {
    return {
      error: "We could not book this appointment. Please try again.",
      code: error.code,
      details: null
    };
  }

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

function describePaymentMethodId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "missing";
  }

  if (/^pm_/i.test(trimmed)) {
    return "stripe_provider_ref";
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(trimmed)) {
    return "uuid";
  }

  if (/visa|mastercard|amex|discover|ending|\u2022{2,}|\*{2,}/i.test(trimmed)) {
    return "display_label";
  }

  return "saved_method_id";
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
    console.info("[bookings] booking_payment_payload_received", {
      paymentMethodIdPresent: Boolean(bookingInput.paymentMethodId?.trim()),
      paymentMethodIdKind: describePaymentMethodId(bookingInput.paymentMethodId),
      clientContextClientIdPresent: Boolean(clientContext.clientId),
      viewerIdPresent: Boolean(clientContext.viewer.id),
      viewerRole: clientContext.viewer.role
    });
    const provider = await getLiveOperationsProvider();
    const result = await provider.createBooking({
      ...bookingInput,
      clientId: clientContext.clientId || undefined,
      pointsUserId: clientContext.viewer.role === "client" ? clientContext.viewer.id : undefined,
      actorRole: "client",
      actorEmail: clientContext.activeClient?.email ?? clientContext.viewer.email,
      actorProfileId: clientContext.viewer.role === "client" ? clientContext.viewer.id : undefined,
      createdBy: clientContext.viewer.id,
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
