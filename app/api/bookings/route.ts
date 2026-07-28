import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAiRecommendation } from "@/lib/ai/service";
import { queueBookingCreatedNotifications } from "@/lib/booking/notifications";
import { recordReferralBookingProgress } from "@/lib/referrals/service";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { recordBookingCreatedPlatformEvent } from "@/lib/core/booking-events";
import { isClientRole } from "@/lib/auth/roles";
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
  clientEmail: z.string().trim().email().optional(),
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
  promotionCode: z.string().optional(),
  cultureAttribution: z.object({
    source: z.literal("culture"),
    culturePostId: z.string().optional(),
    cultureAuthorId: z.string().optional(),
    cultureSurface: z.string().optional(),
    barberId: z.string().optional(),
    serviceId: z.string().optional(),
    locationId: z.string().optional(),
    targetRoute: z.string().optional(),
    cta: z.string().optional()
  }).optional()
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

function extractBookingTransactionDiagnostics(error: unknown) {
  if (!error || typeof error !== "object") {
    return {};
  }

  const direct = (error as { bookingTransaction?: Record<string, unknown> }).bookingTransaction;
  if (direct) {
    return direct;
  }

  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return {};
  }

  const transaction = (details as { transaction?: unknown }).transaction;
  return transaction && typeof transaction === "object"
    ? transaction as Record<string, unknown>
    : {};
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

function logBookingRouteStage(stage: string, details: Record<string, unknown> = {}) {
  console.info("[bookings] booking_transaction_stage", {
    reference: "booking_transaction_stage",
    stage,
    route: "/api/bookings",
    ...details
  });
}

function extractQuotedDiagnostic(value: string | null | undefined, pattern: RegExp) {
  return value?.match(pattern)?.[1] ?? null;
}

function postgresErrorDiagnostics(error: unknown) {
  const candidate = error && typeof error === "object"
    ? error as {
        code?: string | null;
        details?: string | null;
        hint?: string | null;
        message?: string | null;
        table?: string | null;
        column?: string | null;
        constraint?: string | null;
      }
    : null;
  const combined = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(" ");

  return {
    postgresCode: candidate?.code ?? null,
    postgresDetails: candidate?.details ?? null,
    postgresHint: candidate?.hint ?? null,
    table: candidate?.table ?? null,
    column: candidate?.column
      ?? extractQuotedDiagnostic(combined, /column ["']([^"']+)["']/i)
      ?? extractQuotedDiagnostic(combined, /['"]([^'"]+)['"] column/i),
    constraint: candidate?.constraint
      ?? extractQuotedDiagnostic(combined, /constraint ["']([^"']+)["']/i)
  };
}

function logBookingRouteFailure(stage: string, error: unknown, details: Record<string, unknown> = {}) {
  const candidate = error && typeof error === "object"
    ? error as { code?: string | null; name?: string | null; message?: string | null; details?: string | null; hint?: string | null; status?: number | null }
    : null;
  const transactionDiagnostics = extractBookingTransactionDiagnostics(error);
  console.error("[bookings] booking_transaction_stage_failed", {
    reference: "booking_transaction_stage_failed",
    stage,
    route: "/api/bookings",
    safeMessage: details.safeMessage ?? transactionDiagnostics.safeMessage ?? null,
    errorCode: candidate?.code ?? null,
    errorName: candidate?.name ?? (error instanceof Error ? error.name : null),
    errorStatus: candidate?.status ?? null,
    errorMessage: candidate?.message ?? (error instanceof Error ? error.message : String(error)),
    errorDetails: candidate?.details ?? null,
    errorHint: candidate?.hint ?? null,
    ...postgresErrorDiagnostics(error),
    ...transactionDiagnostics,
    ...details
  });
}

function normalizeBookingEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export async function POST(request: NextRequest) {
  logBookingRouteStage("booking_request_received");
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
      cultureAttribution,
      clientEmail,
      ...bookingInput
    } = parsed.data;
    const normalizedCultureAttribution = cultureAttribution
      ? {
          ...cultureAttribution,
          barberId: cultureAttribution.barberId ?? bookingInput.barberId,
          serviceId: cultureAttribution.serviceId ?? bookingInput.serviceId,
          locationId: cultureAttribution.locationId ?? bookingInput.locationId
        }
      : undefined;
    const clientContext = await getClientExperienceContext();
    const isGuestBooking = Boolean(clientContext.isGuest);
    if (!isGuestBooking && !clientContext.isSignedInClient) {
      return NextResponse.json(
        { error: "Booking is available to guests or signed-in client accounts only.", code: "role_not_allowed" },
        { status: 403 }
      );
    }

    const submittedClientEmail = normalizeBookingEmail(clientEmail);
    if (isGuestBooking && !submittedClientEmail) {
      return NextResponse.json(
        { error: "Guest bookings require an email for confirmation and support lookup.", code: "guest_email_required" },
        { status: 400 }
      );
    }

    const actorEmail = isGuestBooking
      ? submittedClientEmail
      : clientContext.activeClient?.email ?? clientContext.viewer.email;
    logBookingRouteStage("auth_user_resolved", {
      authUserIdPresent: Boolean(clientContext.viewer.id),
      actorRole: clientContext.viewer.role,
      clientContextClientIdPresent: Boolean(clientContext.clientId),
      guestBooking: isGuestBooking
    });
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
      clientId: isGuestBooking ? undefined : clientContext.clientId || undefined,
      pointsUserId: !isGuestBooking && isClientRole(clientContext.viewer.role) ? clientContext.viewer.id : undefined,
      actorRole: "client",
      actorEmail,
      actorProfileId: !isGuestBooking && isClientRole(clientContext.viewer.role) ? clientContext.viewer.id : undefined,
      createdBy: isGuestBooking ? undefined : clientContext.viewer.id,
      deferPaymentCollection: isGuestBooking,
      bookingSource: normalizedCultureAttribution ? "culture" : sourceKind ?? "booking"
    });
    await recordBookingCreatedPlatformEvent({
      appointment: result.appointment,
      actorId: clientContext.viewer.id,
      actorRole: "client",
      source: "api",
      route: "/api/bookings",
      context: {
        sourceKind: sourceKind ?? null,
        matchedFrom: matchedFrom ?? null,
        cultureAttribution: normalizedCultureAttribution ?? null
      }
    });

    try {
      await queueBookingCreatedNotifications({
        appointment: result.appointment,
        clientName: bookingInput.clientName,
        clientEmail: actorEmail,
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
          clientId: isGuestBooking ? undefined : result.appointment.clientId,
          clientEmail: actorEmail,
          locationId: result.appointment.locationId,
          sourceKind,
          matchedFrom,
          query: discoveryQuery
        });
      } catch {}
    }

    try {
      if (!isGuestBooking) {
        await recordReferralBookingProgress({
          clientId: result.appointment.clientId,
          appointmentId: result.appointment.id
        });
      }
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
            matchedFrom: matchedFrom ?? null,
            cultureAttribution: normalizedCultureAttribution ?? null
          }
        });
      } catch {}
    }

    logBookingRouteStage("booking_response_returned", {
      appointmentId: result.appointment.id,
      clientId: result.appointment.clientId,
      barberId: result.appointment.barberId
    });
    return NextResponse.json({ appointment: result.appointment });
  } catch (error) {
    if (error instanceof LiveOperationValidationError) {
      const serialized = serializeBookingValidationError(error);
      logBookingRouteFailure("booking_validation_failed", error, {
        code: error.code,
        safeMessage: serialized.error
      });
      return NextResponse.json(
        serialized,
        { status: error.status }
      );
    }

    if (error instanceof LiveOperationConflictError) {
      logBookingRouteFailure("booking_conflict_failed", error, {
        code: error.code,
        safeMessage: "This time is no longer available.",
        latestAppointmentId: error.latestAppointment.id
      });
      return NextResponse.json(
        { error: error.message, code: error.code, latestAppointment: error.latestAppointment },
        { status: error.status }
      );
    }

    const diagnostics = extractBookingTransactionDiagnostics(error);
    const safeMessage = typeof diagnostics.safeMessage === "string" && diagnostics.safeMessage.trim()
      ? diagnostics.safeMessage
      : "We could not book this appointment. Please try again.";
    logBookingRouteFailure("booking_unhandled_failed", error, {
      safeMessage
    });
    return NextResponse.json(
      { error: safeMessage, code: "booking_processing_failed" },
      { status: 500 }
    );
  }
}
