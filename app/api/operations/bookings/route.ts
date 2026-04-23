import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAiRecommendation } from "@/lib/ai/service";
import { recordReferralBookingProgress } from "@/lib/referrals/service";
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
  sourceKind: z.enum(["direct", "discovery", "public_profile", "haircut_now", "client_dashboard"]).optional(),
  matchedFrom: z.enum(["favorite_barber", "favorite_shop", "nearby", "available_now"]).optional(),
  discoveryQuery: z.string().optional(),
  barberUsername: z.string().optional(),
  aiRecommendationId: z.string().optional(),
  aiRecommendationType: z.enum(["rebooking_reminder", "available_now", "barber_gap_alert"]).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid booking payload." }, { status: 400 });
    }

    const {
      sourceKind,
      matchedFrom,
      discoveryQuery,
      barberUsername,
      aiRecommendationId,
      aiRecommendationType,
      ...bookingInput
    } = parsed.data;
    const provider = await getLiveOperationsProvider();
    const result = await provider.createBooking({
      ...bookingInput,
      actorRole: "client"
    });
    await recordBookingCreatedPlatformEvent({
      appointment: result.appointment,
      actorRole: "client",
      source: "api",
      route: "/api/operations/bookings",
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
      } catch {
        // Booking creation should not fail if marketplace attribution cannot be written.
      }
    }

    try {
      await recordReferralBookingProgress({
        clientId: result.appointment.clientId,
        appointmentId: result.appointment.id
      });
    } catch {
      // Referral progression should not block booking creation.
    }

    if (aiRecommendationId && aiRecommendationType) {
      try {
        await trackAiRecommendation({
          recommendationId: aiRecommendationId,
          recommendationType: aiRecommendationType,
          action: "converted",
          surface: "client_home",
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




