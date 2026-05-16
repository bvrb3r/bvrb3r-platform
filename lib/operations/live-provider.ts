import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { ensureRecurringBooking } from "@/lib/booking/recurring";
import {
  type AppointmentCheckInEventType,
  type BookableServiceSnapshot,
  calculateAppointmentQuote,
  generateAppointmentConfirmationCode
} from "@/lib/appointments/domain";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  canonicalServiceUuid,
  readCanonicalOperationsSnapshot
} from "@/lib/booking/canonical-booking";
import {
  buildCompensationSnapshot,
  buildOwnerAnalyticsSnapshot,
  buildWorkflowEventRecord,
  type WorkflowPersistenceBarber
} from "@/lib/operations/persistence";
import {
  createCapturedStripePaymentRecord,
  createTipLedgerEntry,
  PaymentServiceError
} from "@/lib/payments/service";
import { syncPaymentRoutingRecord } from "@/lib/fintech/service";
import {
  applyMembershipPricingAdjustmentToQuote,
  buildMembershipPricingAdjustment
} from "@/lib/monetization/membership";
import { readActiveClientMembershipSubscription } from "@/lib/monetization/service";
import {
  commitPointsRedemption,
  previewPointsQuoteAdjustment
} from "@/lib/points/engine";
import {
  completePromotionRedemptionsForAppointment,
  createPromotionRedemptionForAppointment,
  preparePromotionForBooking,
  voidPromotionRedemptionsForAppointment
} from "@/lib/promotions/service";
import {
  AppointmentLifecycleMutationInput,
  BookingMutationInput,
  CancelAppointmentMutationInput,
  CheckoutMutationInput,
  LiveMutationSuccess,
  LiveOperationConflictError,
  LiveOperationValidationError,
  LiveOperationsSnapshot,
  LiveOperationsViewer,
  LiveAppointmentRecord,
  RescheduleAppointmentMutationInput,
  createEmptyLiveOperationsSnapshot,
  bookAppointmentInSnapshot,
  cancelAppointmentInSnapshot,
  checkoutAppointmentInSnapshot,
  createInitialLiveOperationsSnapshot,
  rescheduleAppointmentInSnapshot,
  scopeLiveOperationsSnapshot,
  transitionAppointmentInSnapshot
} from "@/lib/operations/live-state";
import { computeShopVerificationDecision, getVerificationGateDecision, buildPublicTrustSignal } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { Client } from "@/types/domain";
import type { TrustState } from "@/types/trust";
import type { CheckoutRecord, FlowActivity } from "@/lib/utils/operations";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const APPOINTMENT_OVERLAP_CONSTRAINT = "appointments_no_overlap_active";

type AppointmentConflictRow = {
  reference_code: string;
  status: LiveAppointmentRecord["status"];
};

type CanonicalLocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  tax_rate: number | string;
};

type CanonicalBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model?: string | null;
  barber_subtype?: string | null;
  default_money_relationship?: string | null;
  status?: string | null;
  is_bookable?: boolean | null;
  is_discoverable?: boolean | null;
};

type CanonicalClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string | null;
};

type CanonicalClientProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type CanonicalServiceRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  category: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  currency: string | null;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  active: boolean;
  is_bookable: boolean;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
  service_owner_type?: "barber" | "shop" | null;
  service_owner?: "barber" | "shop" | null;
  barber_reference?: string | null;
  shop_reference?: string | null;
};

type SupabaseListResult = {
  data: unknown[] | null;
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
};

function normalizeCanonicalServiceRow(row: Partial<CanonicalServiceRow>): CanonicalServiceRow {
  const owner = row.service_owner_type ?? row.service_owner ?? (row.barber_reference ? "barber" : "shop");
  return {
    id: row.id ?? row.reference_code ?? "",
    reference_code: row.reference_code ?? null,
    location_id: row.location_id ?? row.shop_reference ?? "",
    category: row.category ?? "Haircut",
    name: row.name ?? "Service",
    description: row.description ?? null,
    duration_min: Number(row.duration_min ?? 0),
    buffer_min: Number(row.buffer_min ?? 0),
    price: row.price ?? 0,
    currency: row.currency ?? "usd",
    deposit_amount: row.deposit_amount ?? 0,
    full_prepay_required: row.full_prepay_required ?? true,
    active: row.active !== false,
    is_bookable: row.is_bookable !== false,
    display_order: row.display_order ?? 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    service_owner_type: owner,
    service_owner: owner,
    barber_reference: row.barber_reference ?? null,
    shop_reference: row.shop_reference ?? null
  };
}

function normalizeCanonicalBarberRow(row: Partial<CanonicalBarberRow>): CanonicalBarberRow {
  const reference = row.reference_code ?? row.id ?? "";
  return {
    id: row.id ?? reference,
    reference_code: row.reference_code ?? null,
    profile_id: row.profile_id ?? "",
    compensation_model: row.compensation_model ?? row.default_money_relationship ?? row.barber_subtype ?? "freelance",
    default_money_relationship: row.default_money_relationship ?? null,
    barber_subtype: row.barber_subtype ?? "freelance",
    status: row.status ?? null,
    is_bookable: row.is_bookable ?? null,
    is_discoverable: row.is_discoverable ?? null
  };
}

function toDomainCompensationModel(value?: string | null): "freelance" | "booth_rent" | "commission" {
  if (value === "commission") {
    return "commission";
  }
  if (value === "booth_rent" || value === "blueprint") {
    return "booth_rent";
  }
  return "freelance";
}

type StaffMembershipRow = {
  id: string;
  location_id: string;
  profile_id: string;
};

type PersistenceActivityType = FlowActivity["type"];

type ArtifactPersistenceInput = {
  activityType: PersistenceActivityType;
  actorRole: string;
  amountCollected?: number;
  paymentMethod?: CheckoutRecord["paymentMethod"];
};

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function matchesReference(value: string, row: { id: string; reference_code: string | null }) {
  return row.id === value || row.reference_code === value;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function logBookingTransactionStage(
  stage: string,
  details: Record<string, unknown> = {}
) {
  console.info("[bookings] booking_transaction_stage", {
    reference: "booking_transaction_stage",
    stage,
    ...details
  });
}

function logBookingTransactionStageFailure(
  stage: string,
  error: unknown,
  details: Record<string, unknown> = {}
) {
  const candidate = error && typeof error === "object"
    ? error as { code?: string | null; name?: string | null; message?: string | null; details?: string | null; hint?: string | null; status?: number | null }
    : null;
  console.error("[bookings] booking_transaction_stage_failed", {
    reference: "booking_transaction_stage_failed",
    stage,
    safeMessage: details.safeMessage ?? null,
    errorCode: candidate?.code ?? null,
    errorName: candidate?.name ?? (error instanceof Error ? error.name : null),
    errorStatus: candidate?.status ?? null,
    errorMessage: candidate?.message ?? (error instanceof Error ? error.message : String(error)),
    errorDetails: candidate?.details ?? null,
    errorHint: candidate?.hint ?? null,
    ...postgresErrorDiagnostics(error),
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

type BookingTransactionDiagnostics = {
  canonicalClientUuid: string | null;
  canonicalBarberUuid: string | null;
  canonicalServiceUuid: string | null;
  canonicalLocationUuid: string | null;
  selectedPaymentMethodIdPresent: boolean;
  providerPaymentMethodIdPresent: boolean;
  providerCustomerIdPresent: boolean;
  paymentMethodResolved: boolean;
  stripePaymentIntentIdPresent: boolean;
  paymentIntentCreateStarted: boolean;
  paymentIntentCreateSucceeded: boolean;
  appointmentInsertStarted: boolean;
  appointmentInsertSucceeded: boolean;
  paymentRecordInsertStarted: boolean;
  paymentRecordInsertSucceeded: boolean;
  appointmentConfirmStarted: boolean;
  appointmentConfirmSucceeded: boolean;
  rollbackAttempted: boolean;
  refundAttempted: boolean;
};

function createBookingTransactionDiagnostics(): BookingTransactionDiagnostics {
  return {
    canonicalClientUuid: null,
    canonicalBarberUuid: null,
    canonicalServiceUuid: null,
    canonicalLocationUuid: null,
    selectedPaymentMethodIdPresent: false,
    providerPaymentMethodIdPresent: false,
    providerCustomerIdPresent: false,
    paymentMethodResolved: false,
    stripePaymentIntentIdPresent: false,
    paymentIntentCreateStarted: false,
    paymentIntentCreateSucceeded: false,
    appointmentInsertStarted: false,
    appointmentInsertSucceeded: false,
    paymentRecordInsertStarted: false,
    paymentRecordInsertSucceeded: false,
    appointmentConfirmStarted: false,
    appointmentConfirmSucceeded: false,
    rollbackAttempted: false,
    refundAttempted: false
  };
}

function publicBookingTransactionDiagnostics(diagnostics: BookingTransactionDiagnostics) {
  return {
    canonicalClientUuidPresent: Boolean(diagnostics.canonicalClientUuid),
    canonicalBarberUuidPresent: Boolean(diagnostics.canonicalBarberUuid),
    canonicalServiceUuidPresent: Boolean(diagnostics.canonicalServiceUuid),
    canonicalLocationUuidPresent: Boolean(diagnostics.canonicalLocationUuid),
    selectedPaymentMethodIdPresent: diagnostics.selectedPaymentMethodIdPresent,
    providerPaymentMethodIdPresent: diagnostics.providerPaymentMethodIdPresent,
    providerCustomerIdPresent: diagnostics.providerCustomerIdPresent,
    paymentMethodResolved: diagnostics.paymentMethodResolved,
    stripePaymentIntentIdPresent: diagnostics.stripePaymentIntentIdPresent,
    paymentIntentCreateStarted: diagnostics.paymentIntentCreateStarted,
    paymentIntentCreateSucceeded: diagnostics.paymentIntentCreateSucceeded,
    appointmentInsertStarted: diagnostics.appointmentInsertStarted,
    appointmentInsertSucceeded: diagnostics.appointmentInsertSucceeded,
    paymentRecordInsertStarted: diagnostics.paymentRecordInsertStarted,
    paymentRecordInsertSucceeded: diagnostics.paymentRecordInsertSucceeded,
    appointmentConfirmStarted: diagnostics.appointmentConfirmStarted,
    appointmentConfirmSucceeded: diagnostics.appointmentConfirmSucceeded,
    rollbackAttempted: diagnostics.rollbackAttempted,
    refundAttempted: diagnostics.refundAttempted
  };
}

function bookingTransactionLogDiagnostics(diagnostics: BookingTransactionDiagnostics) {
  return {
    canonicalClientId: diagnostics.canonicalClientUuid,
    canonicalBarberId: diagnostics.canonicalBarberUuid,
    canonicalServiceId: diagnostics.canonicalServiceUuid,
    canonicalLocationId: diagnostics.canonicalLocationUuid,
    ...publicBookingTransactionDiagnostics(diagnostics)
  };
}

function attachBookingTransactionDiagnostics(
  error: unknown,
  stage: string,
  safeMessage: string,
  diagnostics: BookingTransactionDiagnostics
) {
  if (error && typeof error === "object") {
    (error as {
      bookingTransaction?: Record<string, unknown>;
    }).bookingTransaction = {
      stage,
      safeMessage,
      ...publicBookingTransactionDiagnostics(diagnostics)
    };
  }
}

function mergeBookingPaymentDiagnostics(
  diagnostics: BookingTransactionDiagnostics,
  error: unknown
) {
  const paymentDiagnostics = error && typeof error === "object"
    ? (error as {
        bookingPaymentDiagnostics?: {
          stage?: string;
          safeMessage?: string;
          paymentMethodResolved?: boolean;
          stripePaymentIntentIdPresent?: boolean;
          providerPaymentMethodIdPresent?: boolean;
          providerCustomerIdPresent?: boolean;
          paymentIntentCreateStarted?: boolean;
          paymentIntentCreateSucceeded?: boolean;
          refundAttempted?: boolean;
        };
      }).bookingPaymentDiagnostics
    : null;

  if (!paymentDiagnostics) {
    return;
  }

  diagnostics.paymentMethodResolved = Boolean(paymentDiagnostics.paymentMethodResolved);
  diagnostics.stripePaymentIntentIdPresent = Boolean(paymentDiagnostics.stripePaymentIntentIdPresent);
  diagnostics.providerPaymentMethodIdPresent = Boolean(paymentDiagnostics.providerPaymentMethodIdPresent);
  diagnostics.providerCustomerIdPresent = Boolean(paymentDiagnostics.providerCustomerIdPresent);
  diagnostics.paymentIntentCreateStarted = Boolean(paymentDiagnostics.paymentIntentCreateStarted);
  diagnostics.paymentIntentCreateSucceeded = Boolean(paymentDiagnostics.paymentIntentCreateSucceeded);
  diagnostics.refundAttempted = Boolean(paymentDiagnostics.refundAttempted);
}

function getBookingPaymentFailureStage(error: unknown) {
  const stage = error && typeof error === "object"
    ? (error as { bookingPaymentDiagnostics?: { stage?: string } }).bookingPaymentDiagnostics?.stage
    : null;

  return stage === "payment_intent_create_failed" || stage === "payment_record_insert_failed"
    ? stage
    : "payment_record_insert_failed";
}

function getBookingPaymentFailureSafeMessage(error: unknown) {
  const safeMessage = error && typeof error === "object"
    ? (error as { bookingPaymentDiagnostics?: { safeMessage?: string } }).bookingPaymentDiagnostics?.safeMessage
    : null;

  return safeMessage?.trim() || "Payment could not be completed.";
}

function describePublicReference(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "missing";
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(trimmed)) {
    return "uuid";
  }
  if (/^independent-barber-/i.test(trimmed)) {
    return "independent_barber_pseudo_location";
  }
  if (/^barber-/i.test(trimmed)) {
    return "public_barber_reference";
  }
  if (/^client-/i.test(trimmed)) {
    return "public_client_reference";
  }
  return "reference";
}

async function runBookingPostCommitStep(
  stage: string,
  action: () => Promise<unknown>,
  details: Record<string, unknown> = {}
) {
  logBookingTransactionStage(`${stage}_started`, details);
  try {
    await action();
    logBookingTransactionStage(`${stage}_succeeded`, details);
  } catch (error) {
    logBookingTransactionStageFailure(`${stage}_failed`, error, details);
  }
}

async function readTrustStateSafe() {
  try {
    const trustProvider = await getTrustProvider();
    return await trustProvider.readState();
  } catch (error) {
    console.warn("[live-provider] verification trust state unavailable during booking gate check", {
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function createVerificationBlockedError(input: {
  gate: "booking" | "shop_activation";
  barberId: string;
  locationId: string;
  codes: string[];
  reasons: string[];
  degraded: boolean;
}) {
  const isShopLaneBlock = input.gate === "shop_activation";
  const safeReasons = isShopLaneBlock
    ? ["This provider is not available for booking yet."]
    : input.reasons;

  return new LiveOperationValidationError(
    safeReasons[0] ?? "This booking lane is not currently eligible for verification-gated booking.",
    "verification_blocked",
    {
      gate: input.gate,
      barberId: input.barberId,
      locationId: input.locationId,
      codes: input.codes,
      reasons: safeReasons,
      degraded: input.degraded
    }
  );
}

function assertBookableBarberLane(input: {
  barberId: string;
  locationId: string;
  trustState?: TrustState;
  relationshipType?: "freelance" | "booth_rent" | "commission" | null;
  serviceOwnerType?: string | null;
}) {
  if (!input.trustState) {
    return;
  }

  const bookingGate = getVerificationGateDecision(
    buildPublicTrustSignal(input.trustState, input.barberId, input.locationId).verificationDecision,
    "booking"
  );
  if (!bookingGate.allowed) {
    const isFreelanceDirectBooking = input.relationshipType === "freelance"
      && input.serviceOwnerType !== "shop";
    const fatalCodes = bookingGate.codes.filter((code) =>
      ["verification_suspended", "verification_rejected", "verification_expired", "verification_needs_update"].includes(code)
    );
    if (isFreelanceDirectBooking && fatalCodes.length === 0) {
      console.info("[live-provider] booking verification gate bypassed for freelance direct booking", {
        barberId: input.barberId,
        locationId: input.locationId,
        relationshipType: input.relationshipType,
        serviceOwnerType: input.serviceOwnerType,
        suppressedCodes: bookingGate.codes
      });
      return;
    }

    console.warn("[live-provider] booking blocked by barber verification gate", {
      barberId: input.barberId,
      locationId: input.locationId,
      codes: bookingGate.codes,
      reasons: bookingGate.reasons
    });
    throw createVerificationBlockedError({
      gate: "booking",
      barberId: input.barberId,
      locationId: input.locationId,
      codes: bookingGate.codes,
      reasons: bookingGate.reasons,
      degraded: bookingGate.degraded
    });
  }
}

export function isIndependentBookingLocationReference(locationReference?: string | null) {
  return Boolean(locationReference?.startsWith("independent-"));
}

export function isPseudoBarberReference(barberReference?: string | null) {
  return Boolean(barberReference?.startsWith("barber-"));
}

export function isPseudoClientReference(clientReference?: string | null) {
  return Boolean(clientReference?.startsWith("client-"));
}

export function shouldRequireShopBusinessVerificationForBooking(input: {
  serviceOwnerType?: string | null;
  serviceBarberReference?: string | null;
  locationReference?: string | null;
  hasStaffMembership?: boolean;
}) {
  if (isIndependentBookingLocationReference(input.locationReference)) {
    return false;
  }

  return input.serviceOwnerType === "shop"
    && input.hasStaffMembership === true;
}

function isMissingRelationOrColumn(error: unknown) {
  const candidate = error && typeof error === "object"
    ? error as { code?: string | null; message?: string | null }
    : null;
  const message = `${candidate?.message ?? ""}`.toLowerCase();
  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(candidate?.code ?? "")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function getCanonicalServiceOwnerType(service: CanonicalServiceRow) {
  const ownerType = service.service_owner_type ?? service.service_owner ?? null;
  if (ownerType === "barber" || ownerType === "shop") {
    return ownerType;
  }

  return service.barber_reference ? "barber" : "shop";
}

function isBarberDirectService(service: CanonicalServiceRow, barber: CanonicalBarberRow) {
  return getCanonicalServiceOwnerType(service) === "barber"
    || matchesBarberReference(service.barber_reference, barber);
}

function uniqDefined(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

async function readCanonicalBarberByIdentifier(
  supabase: SupabaseClient,
  identifier: string | null | undefined
) {
  if (!identifier) {
    return null;
  }

  const productionSelect = "id, reference_code, profile_id, barber_subtype, status, is_bookable, is_discoverable";
  const legacySelect = "id, reference_code, profile_id, compensation_model";
  const lookupPlan: Array<{ column: "id" | "reference_code" | "profile_id"; value: string }> = [];
  if (isUuid(identifier)) {
    lookupPlan.push({ column: "id", value: identifier });
    lookupPlan.push({ column: "profile_id", value: identifier });
  }
  lookupPlan.push({ column: "reference_code", value: identifier });

  const canonicalId = canonicalBarberUuid(identifier);
  if (canonicalId !== identifier) {
    lookupPlan.push({ column: "id", value: canonicalId });
  }

  for (const lookup of lookupPlan) {
    let result = await supabase
      .from("barbers")
      .select(productionSelect)
      .eq(lookup.column, lookup.value)
      .maybeSingle();

    if (result.error && isMissingRelationOrColumn(result.error)) {
      result = await supabase
        .from("barbers")
        .select(legacySelect)
        .eq(lookup.column, lookup.value)
        .maybeSingle();
    }

    if (result.error) {
      throw result.error;
    }
    if (result.data) {
      return normalizeCanonicalBarberRow(result.data as Partial<CanonicalBarberRow>);
    }
  }

  const profileResult = await supabase
    .from("barber_profiles")
    .select("barber_reference, username")
    .or(`barber_reference.eq.${identifier},username.eq.${identifier}`)
    .maybeSingle();

  if (profileResult.error) {
    throw profileResult.error;
  }

  const profileRow = profileResult.data as {
    barber_reference?: string | null;
    username?: string | null;
  } | null;
  const profileBarberReference = profileRow?.barber_reference;
  if (profileBarberReference && profileBarberReference !== identifier) {
    return readCanonicalBarberByIdentifier(supabase, profileBarberReference);
  }

  return null;
}

export type ResolvedBookableBarber = {
  barberId: string;
  profileId: string;
  userId: string;
  displayName: string | null;
  isFreelance: boolean;
  shopAssignment: StaffMembershipRow | null;
  relationshipType: "freelance" | "booth_rent" | "commission";
  barber: CanonicalBarberRow;
};

async function readBarberDisplayName(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) {
    return null;
  }

  const row = result.data as { full_name?: string | null } | null;
  return row?.full_name ?? null;
}

export async function resolveBookableBarber(
  supabase: SupabaseClient,
  input: {
    barberId?: string | null;
    serviceBarberReference?: string | null;
  }
): Promise<ResolvedBookableBarber | null> {
  const candidates = uniqDefined([
    input.barberId,
    input.barberId?.startsWith("@") ? input.barberId.slice(1) : null,
    input.serviceBarberReference
  ]);

  let barber: CanonicalBarberRow | null = null;
  for (const candidate of candidates) {
    barber = await readCanonicalBarberByIdentifier(supabase, candidate);
    if (barber) {
      break;
    }
  }

  if (!barber) {
    return null;
  }

  const [membershipResult, displayName] = await Promise.all([
    supabase
      .from("staff_locations")
      .select("id, location_id, profile_id")
      .eq("profile_id", barber.profile_id)
      .limit(1)
      .maybeSingle(),
    readBarberDisplayName(supabase, barber.profile_id)
  ]);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const membership = (membershipResult.data as StaffMembershipRow | null) ?? null;
  const explicitRelationship = (barber.default_money_relationship ?? barber.barber_subtype ?? "").toLowerCase();
  const compensationModel = (barber.compensation_model ?? "").toLowerCase();
  const configuredRelationshipType = explicitRelationship === "commission" || compensationModel.includes("commission")
    ? "commission"
    : explicitRelationship === "booth_rent" || explicitRelationship === "blueprint" || compensationModel.includes("booth")
      ? "booth_rent"
      : "freelance";
  const relationshipType = configuredRelationshipType === "freelance" || !membership
    ? "freelance"
    : configuredRelationshipType;

  return {
    barberId: barber.id,
    profileId: barber.profile_id,
    userId: barber.profile_id,
    displayName,
    isFreelance: relationshipType === "freelance",
    shopAssignment: membership,
    relationshipType,
    barber
  };
}

async function readCanonicalClientByIdentifier(
  supabase: SupabaseClient,
  identifier: string | null | undefined
) {
  if (!identifier) {
    return null;
  }

  const lookupPlan: Array<{ column: "id" | "reference_code" | "profile_id"; value: string }> = [];
  if (isUuid(identifier)) {
    lookupPlan.push({ column: "id", value: identifier });
    lookupPlan.push({ column: "profile_id", value: identifier });
  }
  lookupPlan.push({ column: "reference_code", value: identifier });

  const canonicalId = canonicalClientUuid(identifier);
  if (canonicalId !== identifier) {
    lookupPlan.push({ column: "id", value: canonicalId });
  }

  for (const lookup of lookupPlan) {
    const result = await supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .eq(lookup.column, lookup.value)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }
    if (result.data) {
      return result.data as CanonicalClientRow;
    }
  }

  return null;
}

async function readCanonicalClientByProfileId(
  supabase: SupabaseClient,
  profileId: string | null | undefined
) {
  if (!profileId) {
    return null;
  }

  const result = await supabase
    .from("clients")
    .select("id, reference_code, profile_id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (result.error) {
    throw result.error;
  }

  return ((result.data ?? []) as CanonicalClientRow[])[0] ?? null;
}

async function readClientProfileById(supabase: SupabaseClient, profileId?: string | null) {
  if (!profileId) {
    return null;
  }

  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as CanonicalClientProfileRow | null;
}

async function linkCanonicalClientToProfileIfNeeded(
  supabase: SupabaseClient,
  input: {
    client: CanonicalClientRow;
    profile: CanonicalClientProfileRow;
    clientReference?: string | null;
  }
) {
  if (input.client.profile_id && input.client.profile_id !== input.profile.id) {
    return input.client;
  }

  if (input.client.profile_id && input.client.reference_code) {
    return input.client;
  }

  const updateResult = await supabase
    .from("clients")
    .update({
      profile_id: input.client.profile_id ?? input.profile.id,
      reference_code: input.client.reference_code ?? input.clientReference ?? `client-${input.profile.id.slice(0, 8)}`
    })
    .eq("id", input.client.id)
    .select("id, reference_code, profile_id")
    .maybeSingle();

  if (updateResult.error) {
    throw updateResult.error;
  }

  return (updateResult.data as CanonicalClientRow | null) ?? input.client;
}

async function readClientProfileByEmail(supabase: SupabaseClient, email?: string | null) {
  if (!email) {
    return null;
  }

  const result = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("email", email)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as CanonicalClientProfileRow | null;
}

async function ensureClientPreferencesForResolvedClient(
  supabase: SupabaseClient,
  input: {
    client: CanonicalClientRow;
    profile: CanonicalClientProfileRow | null;
  }
) {
  const clientReference = input.client.reference_code ?? input.client.id;
  const result = await supabase
    .from("client_preferences")
    .upsert({
      client_reference: clientReference,
      client_email: input.profile?.email ?? "",
      client_id: input.client.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "client_reference" });

  if (result.error) {
    console.warn("[live-provider] client preference repair skipped during booking context resolution", {
      clientId: input.client.id,
      clientReference,
      message: result.error.message
    });
  }
}

export type ResolvedBookingClient = {
  clientId: string;
  profileId: string | null;
  userId: string | null;
  referenceCode: string | null;
  name: string;
  email: string;
  phone: string;
  client: CanonicalClientRow;
  profile: CanonicalClientProfileRow | null;
};

export async function resolveBookingClient(
  supabase: SupabaseClient,
  input: {
    clientId?: string | null;
    actorProfileId?: string | null;
    actorEmail?: string | null;
    clientName: string;
    clientPhone: string;
  }
): Promise<ResolvedBookingClient | null> {
  const candidates = uniqDefined([input.clientId]);
  let client: CanonicalClientRow | null = null;
  let profile: CanonicalClientProfileRow | null = null;
  let resolvedBy: "actor_profile" | "actor_profile_reference" | "client_reference" | "actor_email" | "created" | null = null;

  const actorProfileId = input.actorProfileId?.trim();
  if (actorProfileId && isUuid(actorProfileId)) {
    profile = await readClientProfileById(supabase, actorProfileId);
    if (profile) {
      client = await readCanonicalClientByProfileId(supabase, profile.id);
      if (client) {
        resolvedBy = "actor_profile";
      } else {
        const candidate = candidates[0]
          ? await readCanonicalClientByIdentifier(supabase, candidates[0])
          : null;
        if (candidate && (!candidate.profile_id || candidate.profile_id === profile.id)) {
          client = await linkCanonicalClientToProfileIfNeeded(supabase, {
            client: candidate,
            profile,
            clientReference: candidates[0]
          });
          resolvedBy = "actor_profile_reference";
        }
      }
    }
  }

  if (!client) {
    for (const candidate of candidates) {
      const candidateClient = await readCanonicalClientByIdentifier(supabase, candidate);
      if (!candidateClient) {
        continue;
      }
      if (profile && candidateClient.profile_id && candidateClient.profile_id !== profile.id) {
        continue;
      }
      client = profile
        ? await linkCanonicalClientToProfileIfNeeded(supabase, {
          client: candidateClient,
          profile,
          clientReference: candidate
        })
        : candidateClient;
      resolvedBy = "client_reference";
      break;
    }
  }

  profile = profile ?? (client ? await readClientProfileById(supabase, client.profile_id) : null);
  if (!client && input.actorEmail) {
    profile = await readClientProfileByEmail(supabase, input.actorEmail);
    if (profile) {
      client = await readCanonicalClientByProfileId(supabase, profile.id)
        ?? await readCanonicalClientByIdentifier(supabase, profile.id);
      resolvedBy = client ? "actor_email" : resolvedBy;
    }
  }

  if (!client && profile) {
    const clientReference = input.clientId && !isUuid(input.clientId)
      ? input.clientId
      : `client-${profile.id.slice(0, 8)}`;
    const insertResult = await supabase
      .from("clients")
      .insert({
        profile_id: profile.id,
        reference_code: clientReference,
        loyalty_points: 0,
        retention_tag: "new"
      })
      .select("id, reference_code, profile_id")
      .single();

    if (insertResult.error) {
      const existing = await readCanonicalClientByIdentifier(supabase, clientReference);
      if (!existing || (existing.profile_id && existing.profile_id !== profile.id)) {
        throw insertResult.error;
      }

      client = await linkCanonicalClientToProfileIfNeeded(supabase, {
        client: existing,
        profile,
        clientReference
      });
    } else {
      client = insertResult.data as CanonicalClientRow;
    }
    resolvedBy = "created";
  }

  if (!client) {
    return null;
  }

  profile = profile ?? await readClientProfileById(supabase, client.profile_id);
  await ensureClientPreferencesForResolvedClient(supabase, { client, profile });
  console.info("[live-provider] booking_client_resolution", {
    actorProfileIdPresent: Boolean(actorProfileId),
    requestClientIdPresent: Boolean(input.clientId?.trim()),
    requestClientIdLooksPublicReference: Boolean(input.clientId?.startsWith("client-")),
    resolvedBy,
    canonicalClientId: client.id,
    profileId: client.profile_id ?? null,
    clientReference: client.reference_code ?? null
  });

  return {
    clientId: client.id,
    profileId: client.profile_id,
    userId: client.profile_id,
    referenceCode: client.reference_code,
    name: profile?.full_name ?? input.clientName,
    email: profile?.email ?? input.actorEmail ?? "",
    phone: profile?.phone ?? input.clientPhone,
    client,
    profile
  };
}

async function readBookingLocationByReference(
  supabase: SupabaseClient,
  locationReference: string | null | undefined
) {
  if (!locationReference) {
    return null;
  }

  const idCandidates = [
    isUuid(locationReference) ? locationReference : null,
    canonicalLocationUuid(locationReference)
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

  if (idCandidates.length) {
    const byId = await supabase
      .from("locations")
      .select("id, reference_code, name, tax_rate")
      .in("id", idCandidates)
      .limit(1)
      .maybeSingle();

    if (byId.error) {
      throw byId.error;
    }
    if (byId.data) {
      return byId.data as CanonicalLocationRow;
    }
  }

  const byReference = await supabase
    .from("locations")
    .select("id, reference_code, name, tax_rate")
    .eq("reference_code", locationReference)
    .maybeSingle();

  if (byReference.error) {
    throw byReference.error;
  }

  return (byReference.data ?? null) as CanonicalLocationRow | null;
}

function parseIndependentLocationLabel(serviceAreaLabel?: string | null, displayName?: string | null) {
  const parts = (serviceAreaLabel ?? "")
    .split(/[\/\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const stateMatch = (serviceAreaLabel ?? "").match(/\b([A-Z]{2})\b/);

  return {
    name: parts[0] ?? (displayName ? `${displayName} booking location` : "Independent barber"),
    neighborhood: parts[1] ?? parts[0] ?? "Independent service location",
    city: parts.find((part) => /tampa/i.test(part)) ?? parts.at(-1) ?? "Service area",
    state: stateMatch?.[1] ?? "NA"
  };
}

async function readIndependentBarberProfileLocation(
  supabase: SupabaseClient,
  barberReference: string
) {
  const profileResult = await supabase
    .from("barber_profiles")
    .select("display_name, service_area_label")
    .eq("barber_reference", barberReference)
    .maybeSingle();

  if (profileResult.error) {
    console.warn("[live-provider] independent barber location profile lookup failed", {
      barberReference,
      message: profileResult.error.message
    });
    return parseIndependentLocationLabel();
  }

  const row = (profileResult.data ?? null) as { display_name?: string | null; service_area_label?: string | null } | null;
  return parseIndependentLocationLabel(row?.service_area_label, row?.display_name);
}

async function ensureIndependentBookingLocation(
  supabase: SupabaseClient,
  input: {
    locationReference: string;
    service: CanonicalServiceRow;
    barber: CanonicalBarberRow;
  }
) {
  const barberReference = input.barber.reference_code ?? input.barber.id;
  const locationId = isUuid(input.service.location_id)
    ? input.service.location_id
    : canonicalLocationUuid(input.locationReference);
  const profileLocation = await readIndependentBarberProfileLocation(supabase, barberReference);
  const payload = {
    id: locationId,
    reference_code: input.locationReference,
    name: profileLocation.name,
    neighborhood: profileLocation.neighborhood,
    city: profileLocation.city,
    state: profileLocation.state,
    phone: null,
    tax_rate: 0
  };

  const upsertResult = await supabase
    .from("locations")
    .upsert(payload, { onConflict: "id" });

  if (upsertResult.error) {
    throw upsertResult.error;
  }

  return readBookingLocationByReference(supabase, locationId);
}

async function resolveBookingLocationRow(
  supabase: SupabaseClient,
  input: BookingMutationInput,
  service: CanonicalServiceRow,
  barber: CanonicalBarberRow
) {
  const candidateReferences = [
    input.locationId,
    service.shop_reference,
    service.location_id
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

  for (const candidate of candidateReferences) {
    const location = await readBookingLocationByReference(supabase, candidate);
    if (location && isCanonicalServiceBookableForContext(service, { location, barber })) {
      return location;
    }
  }

  const locationReference = service.shop_reference ?? input.locationId;
  if (isBarberDirectService(service, barber) || isIndependentBookingLocationReference(locationReference)) {
    const repaired = await ensureIndependentBookingLocation(supabase, {
      locationReference,
      service,
      barber
    });
    if (repaired && isCanonicalServiceBookableForContext(service, { location: repaired, barber })) {
      return repaired;
    }
  }

  return null;
}

function bookingLocationReferenceForPersistence(location: CanonicalLocationRow) {
  return location.reference_code && canonicalLocationUuid(location.reference_code) === location.id
    ? location.reference_code
    : location.id;
}

function assertShopLaneIfRequired(input: {
  barberId: string;
  locationId: string;
  locationReference?: string | null;
  service: CanonicalServiceRow;
  membership: StaffMembershipRow | null;
  trustState?: TrustState;
}) {
  if (!input.trustState || !shouldRequireShopBusinessVerificationForBooking({
    serviceOwnerType: getCanonicalServiceOwnerType(input.service),
    serviceBarberReference: input.service.barber_reference,
    locationReference: input.locationReference,
    hasStaffMembership: Boolean(input.membership)
  })) {
    return;
  }

  const { trustState, barberId, locationId } = input;
  const shopGate = getVerificationGateDecision(computeShopVerificationDecision(trustState, locationId), "shop_activation");
  if (!shopGate.allowed) {
    console.warn("[live-provider] booking blocked by explicit shop-owned lane activation gate", {
      barberId,
      locationId,
      serviceId: input.service.reference_code ?? input.service.id,
      codes: shopGate.codes,
      reasons: shopGate.reasons
    });
    throw createVerificationBlockedError({
      gate: "shop_activation",
      barberId,
      locationId,
      codes: shopGate.codes,
      reasons: shopGate.reasons,
      degraded: shopGate.degraded
    });
  }
}

interface LiveOperationsProvider {
  kind: "demo" | "supabase";
  readSnapshot(viewer: LiveOperationsViewer): Promise<LiveOperationsSnapshot>;
  createBooking(input: BookingMutationInput): Promise<LiveMutationSuccess>;
  rescheduleAppointment(input: RescheduleAppointmentMutationInput): Promise<LiveMutationSuccess>;
  cancelAppointment(input: CancelAppointmentMutationInput): Promise<LiveMutationSuccess>;
  transitionAppointment(input: AppointmentLifecycleMutationInput): Promise<LiveMutationSuccess>;
  checkoutAppointment(input: CheckoutMutationInput): Promise<LiveMutationSuccess>;
}

function toBookableServiceSnapshot(row: CanonicalServiceRow): BookableServiceSnapshot {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    name: row.name,
    durationMinutes: row.duration_min,
    bufferMinutes: row.buffer_min,
    unitPrice: numeric(row.price),
    depositAmount: numeric(row.deposit_amount),
    fullPrepayRequired: row.full_prepay_required
  };
}

async function resolveProfileIdByEmail(supabase: SupabaseClient, email?: string) {
  if (!email) {
    return null;
  }

  const result = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data?.id ?? null;
}

async function generateUniqueConfirmationCode(supabase: SupabaseClient, seed: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAppointmentConfirmationCode(`${seed}:${attempt}`);
    const existing = await supabase
      .from("appointments")
      .select("id")
      .eq("confirmation_code", code)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (!existing.data) {
      return code;
    }
  }

  throw new Error("Could not generate a unique appointment confirmation code.");
}

async function loadCanonicalServicesByReference(
  supabase: SupabaseClient,
  serviceReferences: string[]
) {
  const references = uniqDefined(serviceReferences);
  const ids = [...new Set(references.map((reference) => canonicalServiceUuid(reference)))];
  if (!ids.length) {
    return [] as CanonicalServiceRow[];
  }

  const selectBy = async (column: "id" | "reference_code", values: string[]) => {
    let result = await supabase
      .from("services")
      .select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner, barber_reference, shop_reference")
      .in(column, values) as SupabaseListResult;
    if (result.error && isMissingRelationOrColumn(result.error)) {
      result = await supabase
        .from("services")
        .select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner_type, barber_reference, shop_reference")
        .in(column, values) as SupabaseListResult;
    }
    if (result.error && isMissingRelationOrColumn(result.error)) {
      result = await supabase
        .from("services")
        .select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, barber_reference, shop_reference")
        .in(column, values) as SupabaseListResult;
    }
    if (result.error && isMissingRelationOrColumn(result.error)) {
      result = await supabase
        .from("services")
        .select("id, location_id, name, duration_min, price, active, is_bookable, service_owner, barber_reference, shop_reference")
        .in(column, values) as SupabaseListResult;
    }
    if (result.error && isMissingRelationOrColumn(result.error)) {
      result = await supabase
        .from("services")
        .select("id, location_id, name, duration_min, price, active, is_bookable, barber_reference, shop_reference")
        .in(column, values) as SupabaseListResult;
    }
    return result;
  };

  const byIdResult = await selectBy("id", ids);

  if (byIdResult.error) {
    throw byIdResult.error;
  }

  const rows = ((byIdResult.data ?? []) as Array<Partial<CanonicalServiceRow>>).map(normalizeCanonicalServiceRow);
  const matchedReferences = new Set(rows.flatMap((row) => [row.id, row.reference_code].filter(Boolean) as string[]));
  const missingReferences = references.filter((reference) => !matchedReferences.has(reference));
  if (!missingReferences.length) {
    return rows;
  }

  const byReferenceResult = await selectBy("reference_code", missingReferences);

  if (byReferenceResult.error) {
    throw byReferenceResult.error;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of ((byReferenceResult.data ?? []) as Array<Partial<CanonicalServiceRow>>).map(normalizeCanonicalServiceRow)) {
    byId.set(row.id, row);
  }

  return [...byId.values()];
}

function matchesLocationReference(
  value: string | null | undefined,
  row: CanonicalLocationRow
) {
  return Boolean(value) && (value === row.id || value === row.reference_code);
}

function matchesBarberReference(
  value: string | null | undefined,
  row: CanonicalBarberRow
) {
  return Boolean(value) && (value === row.id || value === row.reference_code || value === row.profile_id);
}

function isCanonicalServiceBookableForContext(
  row: CanonicalServiceRow,
  params: {
    location: CanonicalLocationRow;
    barber: CanonicalBarberRow;
  }
) {
  if (!row.active || row.is_bookable === false) {
    return false;
  }

  const locationMatches = row.location_id === params.location.id
    || Boolean(row.shop_reference && matchesLocationReference(row.shop_reference, params.location));
  if (!locationMatches) {
    return false;
  }

  if (row.barber_reference && !matchesBarberReference(row.barber_reference, params.barber)) {
    return false;
  }

  if (row.shop_reference && !matchesLocationReference(row.shop_reference, params.location)) {
    return false;
  }

  if (getCanonicalServiceOwnerType(row) === "barber" && !row.barber_reference) {
    return false;
  }

  return true;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function syncAppointmentLineItems(supabase: SupabaseClient, appointment: LiveAppointmentRecord) {
  const serviceRows = await loadCanonicalServicesByReference(supabase, [appointment.serviceId, ...appointment.addOnIds]);
  const primaryService = serviceRows.find((row) => matchesReference(appointment.serviceId, row));

  if (!primaryService) {
    throw new Error(`Canonical service ${appointment.serviceId} was not found for appointment ${appointment.id}.`);
  }

  const primaryRow = {
    appointment_id: canonicalAppointmentUuid(appointment.id),
    appointment_reference: appointment.id,
    service_id: primaryService.id,
    service_reference: primaryService.reference_code ?? primaryService.id,
    service_name: primaryService.name,
    category: primaryService.category,
    description: primaryService.description,
    duration_min: primaryService.duration_min,
    buffer_min: primaryService.buffer_min,
    price: numeric(primaryService.price),
    deposit_amount: numeric(primaryService.deposit_amount),
    full_prepay_required: primaryService.full_prepay_required,
    add_on_references: appointment.addOnIds,
    snapshot_payload: {
      serviceReference: primaryService.reference_code ?? primaryService.id,
      addOnReferences: appointment.addOnIds,
      capturedAt: appointment.updatedAt,
      serviceTotal: appointment.serviceTotal ?? appointment.totalAmount,
      addOnTotal: appointment.addOnTotal ?? 0,
      grandTotal: appointment.grandTotal ?? appointment.totalAmount
    },
    service_name_snapshot: primaryService.name,
    duration_minutes_snapshot: primaryService.duration_min,
    unit_price_snapshot: numeric(primaryService.price),
    quantity: 1,
    line_total: appointment.serviceTotal ?? numeric(primaryService.price),
    updated_at: appointment.updatedAt
  };

  const existing = await supabase
    .from("appointment_services")
    .select("id")
    .eq("appointment_id", primaryRow.appointment_id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const primaryResult = existing.data
    ? await supabase.from("appointment_services").update(primaryRow).eq("id", existing.data.id)
    : await supabase.from("appointment_services").insert(primaryRow);

  if (primaryResult.error) {
    throw primaryResult.error;
  }

  const appointmentId = canonicalAppointmentUuid(appointment.id);
  const deleteResult = await supabase
    .from("appointment_add_ons")
    .delete()
    .eq("appointment_id", appointmentId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const addOnRows = serviceRows
    .filter((row) => appointment.addOnIds.some((addOnId) => matchesReference(addOnId, row)))
    .map((row) => ({
      appointment_id: appointmentId,
      add_on_service_id: row.id,
      add_on_reference: row.reference_code ?? row.id,
      add_on_name_snapshot: row.name,
      unit_price_snapshot: numeric(row.price),
      quantity: 1,
      line_total: numeric(row.price),
      updated_at: appointment.updatedAt
    }));

  if (addOnRows.length) {
    const addOnInsert = await supabase.from("appointment_add_ons").insert(addOnRows);
    if (addOnInsert.error) {
      throw addOnInsert.error;
    }
  }
}

function buildNotificationInserts(appointment: LiveAppointmentRecord, kind: "booking" | "reschedule" | "cancel" | "checkout") {
  if (kind === "booking") {
    return [
      {
        channel: "sms",
        title: "Appointment confirmed",
        body: `Your appointment ${appointment.id} is confirmed for ${appointment.start}.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "client", eventType: "booking" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      },
      {
        channel: "in_app",
        title: "New booking added",
        body: `Appointment ${appointment.id} is now on the barber schedule.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "barber", eventType: "booking" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      }
    ];
  }

  if (kind === "cancel") {
    return [
      {
        channel: "in_app",
        title: "Appointment cancelled",
        body: `Appointment ${appointment.id} has been cancelled.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "client", eventType: "cancel" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      }
    ];
  }

  if (kind === "reschedule") {
    return [
      {
        channel: "sms",
        title: "Appointment rescheduled",
        body: `Your appointment ${appointment.id} was moved to ${appointment.start}.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "client", eventType: "reschedule" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      }
    ];
  }

  return [
    {
      channel: "sms",
      title: "Visit completed",
      body: `Appointment ${appointment.id} is complete and ready for follow-up.`,
      status: "scheduled",
      scheduled_for: appointment.updatedAt,
      appointment_reference: appointment.id,
      client_reference: appointment.clientId,
      barber_reference: appointment.barberId,
      location_reference: appointment.locationId,
      metadata: { audience: "client", eventType: "checkout" },
      created_at: appointment.updatedAt,
      updated_at: appointment.updatedAt
    }
  ];
}

function buildBarberStatusInsert(snapshot: LiveOperationsSnapshot, barberId: string) {
  const relevantAppointments = snapshot.appointments
    .filter((entry) => entry.barberId === barberId && entry.status !== "cancelled" && entry.status !== "no_show")
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const activeAppointment = relevantAppointments.find((entry) => entry.status === "checked_in" || entry.status === "in_service");
  const nextAppointment = relevantAppointments.find((entry) => new Date(entry.end).getTime() >= Date.now());
  const liveStatus = activeAppointment ? "busy" : "available";
  const shopReference = nextAppointment?.locationId ?? relevantAppointments[0]?.locationId ?? null;

  return {
    barber_reference: barberId,
    barber_id: canonicalBarberUuid(barberId),
    shop_reference: shopReference,
    current_shop_id: shopReference ? canonicalLocationUuid(shopReference) : null,
    status: activeAppointment ? "busy" : "available",
    live_status: liveStatus,
    is_online: true,
    accepts_walk_ins: !activeAppointment,
    next_available_at: nextAppointment?.start ?? null,
    accepting_bookings: true,
    availability_note: activeAppointment ? "Chair is currently active." : "Ready for the next appointment.",
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function buildPersistenceActivity(appointment: LiveAppointmentRecord, input: ArtifactPersistenceInput): FlowActivity {
  const actorRole = input.actorRole;

  switch (input.activityType) {
    case "booking":
      return {
        id: `activity-${appointment.id}-booking-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "booking",
        detail: `${appointment.id} reserved ${appointment.serviceId}`,
        createdAt: appointment.updatedAt,
        title: "Client booked appointment"
      };
    case "reschedule":
      return {
        id: `activity-${appointment.id}-reschedule-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "reschedule",
        detail: `${appointment.id} moved to ${appointment.start}`,
        createdAt: appointment.updatedAt,
        title: "Appointment rescheduled"
      };
    case "check_in":
      return {
        id: `activity-${appointment.id}-check-in-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "check_in",
        detail: `${appointment.id} moved to checked-in status`,
        createdAt: appointment.updatedAt,
        title: "Front desk checked in client"
      };
    case "service_start":
      return {
        id: `activity-${appointment.id}-service-start-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "service_start",
        detail: `${appointment.id} is now in service`,
        createdAt: appointment.updatedAt,
        title: "Barber started service"
      };
    case "service_complete":
      return {
        id: `activity-${appointment.id}-service-complete-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "service_complete",
        detail: `${appointment.id} completed and posted to the shop dashboard`,
        createdAt: appointment.updatedAt,
        title: "Barber completed service"
      };
    case "checkout":
      return {
        id: `activity-${appointment.id}-checkout-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "checkout",
        detail: `${appointment.id} collected ${input.amountCollected ?? 0} plus ${appointment.tipAmount} tip`,
        createdAt: appointment.updatedAt,
        title: "Checkout captured payment and tip"
      };
    case "cancel":
      return {
        id: `activity-${appointment.id}-cancel-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: "cancel",
        detail: `${appointment.id} was cancelled before service began`,
        createdAt: appointment.updatedAt,
        title: "Appointment cancelled"
      };
    default:
      return {
        id: `activity-${appointment.id}-${appointment.revision}`,
        appointmentId: appointment.id,
        actorRole,
        type: input.activityType,
        detail: `${appointment.id} updated`,
        createdAt: appointment.updatedAt,
        title: "Workflow updated"
      };
  }
}

function buildCheckoutRecordForPersistence(
  appointment: LiveAppointmentRecord,
  input: ArtifactPersistenceInput
): CheckoutRecord | undefined {
  if (input.activityType !== "checkout") {
    return undefined;
  }

  return {
    id: appointment.checkoutReference ?? `checkout-${appointment.id}-${appointment.revision}`,
    appointmentId: appointment.id,
    locationId: appointment.locationId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    amountCollected: Math.max(input.amountCollected ?? 0, 0),
    tipAmount: appointment.tipAmount,
    paymentMethod: input.paymentMethod ?? "card_on_file",
    provider: "stripe",
    collectedAt: appointment.updatedAt
  };
}

async function loadWorkflowPersistenceBarber(
  supabase: SupabaseClient,
  barberReference: string
): Promise<WorkflowPersistenceBarber | null> {
  const barberRow = await readCanonicalBarberByIdentifier(supabase, barberReference);

  if (!barberRow) {
    return null;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("email")
    .eq("id", barberRow.profile_id)
    .maybeSingle();
  if (profileResult.error) {
    throw profileResult.error;
  }

  return {
    id: barberRow.reference_code ?? barberReference,
    userId: barberRow.profile_id,
    compensationModel: toDomainCompensationModel(barberRow.compensation_model),
    commissionRate: undefined,
    boothRentAmount: undefined,
    boothRentFrequency: undefined,
    email: profileResult.data?.email ?? null
  };
}


async function syncAppointmentStatusHistory(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  params?: {
    previousStatus?: LiveAppointmentRecord["status"];
    actorProfileId?: string | null;
    reason?: string | null;
  }
) {
  const existing = await supabase
    .from("appointment_status_history")
    .select("id")
    .eq("appointment_id", canonicalAppointmentUuid(appointment.id))
    .eq("new_status", appointment.status)
    .eq("changed_at", appointment.updatedAt)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return;
  }

  const result = await supabase.from("appointment_status_history").insert({
    appointment_id: canonicalAppointmentUuid(appointment.id),
    status: appointment.status,
    old_status: params?.previousStatus ?? null,
    new_status: appointment.status,
    changed_by: params?.actorProfileId ?? null,
    change_reason: params?.reason ?? null,
    changed_at: appointment.updatedAt
  });
  if (result.error) {
    throw result.error;
  }
}

async function insertAppointmentCheckInEvent(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  eventType: AppointmentCheckInEventType,
  actorProfileId?: string | null,
  eventNotes?: string
) {
  const result = await supabase.from("appointment_check_in_events").insert({
    appointment_id: canonicalAppointmentUuid(appointment.id),
    event_type: eventType,
    recorded_by: actorProfileId ?? null,
    event_notes: eventNotes ?? null,
    recorded_at: appointment.updatedAt
  });

  if (result.error) {
    throw result.error;
  }
}

export function resolveOperationalPaymentRecordAttributes(type: string) {
  const paymentStage = type === "checkout" ? "checkout" : "booking";
  return {
    paymentType: "booking" as const,
    legacyType: paymentStage,
    paymentStage
  };
}

export function rethrowAppointmentPersistenceError(
  error: unknown,
  latestAppointment: LiveAppointmentRecord
): never {
  if (error && typeof error === "object") {
    const candidate = error as {
      code?: string | null;
      message?: string | null;
      details?: string | null;
      hint?: string | null;
    };
    const combinedMessage = [candidate.message, candidate.details, candidate.hint]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (candidate.code === "23P01" || combinedMessage.includes(APPOINTMENT_OVERLAP_CONSTRAINT)) {
      throw new LiveOperationConflictError(
        "The selected time is no longer available with this barber.",
        latestAppointment,
        "schedule_conflict"
      );
    }
  }

  throw error;
}

async function insertPaymentRecord(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  amount: number,
  type: string,
  status: string,
  metadata: Record<string, string | number | boolean | null>,
  options: {
    createdAt?: string;
    paymentMethodId?: string | null;
    shopId?: string | null;
    payoutRoute?: "freelance" | "booth_rent" | "commission";
    platformHold?: boolean;
  } = {}
) {
  const createdAt = options.createdAt ?? appointment.updatedAt;
  const paymentAttributes = resolveOperationalPaymentRecordAttributes(type);
  const existing = await supabase
    .from("payments")
    .select("id")
    .eq("appointment_id", canonicalAppointmentUuid(appointment.id))
    .eq("payment_type", paymentAttributes.paymentType)
    .eq("type", paymentAttributes.legacyType)
    .eq("payment_status", status)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return null;
  }

  return createCapturedStripePaymentRecord(supabase, {
    appointmentId: canonicalAppointmentUuid(appointment.id),
    clientId: canonicalClientUuid(appointment.clientId),
    shopId: options.shopId === undefined
      ? canonicalLocationUuid(appointment.shopId ?? appointment.locationId)
      : options.shopId,
    barberId: canonicalBarberUuid(appointment.barberId),
    serviceId: canonicalServiceUuid(appointment.serviceId),
    amount,
    paymentType: paymentAttributes.paymentType,
    paymentMethodId: options.paymentMethodId ?? null,
    legacyType: paymentAttributes.legacyType,
    legacyStatus: "captured",
    idempotencyKey: `booking:${appointment.id}:${paymentAttributes.legacyType}:${amount.toFixed(2)}`,
    description: paymentAttributes.legacyType === "checkout"
      ? `BVRB3R checkout ${appointment.id}`
      : `BVRB3R booking ${appointment.id}`,
    metadata: {
      ...metadata,
      paymentStage: paymentAttributes.paymentStage,
      appointmentReference: appointment.id,
      clientReference: appointment.clientId,
      barberReference: appointment.barberId,
      locationReference: appointment.locationId,
      serviceReference: appointment.serviceId,
      serviceId: canonicalServiceUuid(appointment.serviceId),
      service_id: canonicalServiceUuid(appointment.serviceId),
      payoutRoute: options.payoutRoute ?? null,
      platformHold: options.platformHold ?? null
    },
    createdAt
  });
}

async function insertNotificationRecords(supabase: SupabaseClient, appointment: LiveAppointmentRecord, kind: "booking" | "reschedule" | "cancel" | "checkout") {
  const rows = buildNotificationInserts(appointment, kind);
  if (!rows.length) {
    return;
  }

  const result = await supabase.from("notifications").insert(rows);
  if (result.error) {
    throw result.error;
  }
}

async function syncBarberStatus(supabase: SupabaseClient, snapshot: LiveOperationsSnapshot, barberId: string) {
  const result = await supabase
    .from("barber_status")
    .upsert(buildBarberStatusInsert(snapshot, barberId), { onConflict: "barber_reference" });

  if (result.error) {
    throw result.error;
  }
}

declare global {
  var __bvrb3rLiveSnapshot: LiveOperationsSnapshot | undefined;
}

function getDemoSnapshot() {
  if (!globalThis.__bvrb3rLiveSnapshot) {
    globalThis.__bvrb3rLiveSnapshot = createInitialLiveOperationsSnapshot("demo");
  }

  return globalThis.__bvrb3rLiveSnapshot;
}

function setDemoSnapshot(snapshot: LiveOperationsSnapshot) {
  globalThis.__bvrb3rLiveSnapshot = snapshot;
}

export function resetDemoLiveOperationsSnapshot() {
  setDemoSnapshot(createInitialLiveOperationsSnapshot("demo"));
}

// Kept for legacy local fixtures; production routing stays Supabase/unavailable to avoid fake operations data.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createDemoProvider(): LiveOperationsProvider {
  return {
    kind: "demo",
    async readSnapshot(viewer) {
      return scopeLiveOperationsSnapshot(getDemoSnapshot(), viewer);
    },
    async createBooking(input) {
      const trustState = await readTrustStateSafe();
      assertBookableBarberLane({
        barberId: input.barberId,
        locationId: input.locationId,
        trustState
      });
      const result = bookAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async rescheduleAppointment(input) {
      const result = rescheduleAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async cancelAppointment(input) {
      const result = cancelAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async transitionAppointment(input) {
      const result = transitionAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async checkoutAppointment(input) {
      const result = checkoutAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    }
  };
}

function createUnavailableSupabaseProvider(): LiveOperationsProvider {
  const readEmptySnapshot = (viewer: LiveOperationsViewer) =>
    scopeLiveOperationsSnapshot(createEmptyLiveOperationsSnapshot("supabase"), viewer);
  const unavailable = (): never => {
    throw new LiveOperationValidationError(
      "Live operations are unavailable because the Supabase server provider is not configured.",
      "invalid_resource_reference"
    );
  };

  return {
    kind: "supabase",
    async readSnapshot(viewer) {
      return readEmptySnapshot(viewer);
    },
    async createBooking() {
      return unavailable();
    },
    async rescheduleAppointment() {
      return unavailable();
    },
    async cancelAppointment() {
      return unavailable();
    },
    async transitionAppointment() {
      return unavailable();
    },
    async checkoutAppointment() {
      return unavailable();
    }
  };
}

async function readFullSupabaseSnapshot(supabase: SupabaseClient): Promise<LiveOperationsSnapshot> {
  return readCanonicalOperationsSnapshot(supabase);
}

async function persistArtifactsForAppointment(
  supabase: SupabaseClient,
  snapshot: LiveOperationsSnapshot,
  appointment: LiveAppointmentRecord,
  input: ArtifactPersistenceInput
) {
  const barber = await loadWorkflowPersistenceBarber(supabase, appointment.barberId);
  if (!barber) {
    await syncBarberStatus(supabase, snapshot, appointment.barberId);
    return;
  }

  const client = snapshot.clients.find((entry) => entry.id === appointment.clientId);
  const latestActivity = buildPersistenceActivity(appointment, input);
  const checkout = buildCheckoutRecordForPersistence(appointment, input);
  const workflowEvent = buildWorkflowEventRecord({
    appointment,
    appointments: snapshot.appointments,
    barber,
    client,
    latestActivity,
    checkout
  });
  const compensationSnapshot = buildCompensationSnapshot({
    appointment,
    appointments: snapshot.appointments,
    barber,
    client,
    latestActivity,
    checkout
  });
  const ownerAnalytics = buildOwnerAnalyticsSnapshot(appointment.locationId, snapshot.appointments);

  if (workflowEvent) {
    const workflowResult = await supabase.from("workflow_events").insert({
      appointment_reference: workflowEvent.appointmentReference,
      location_reference: workflowEvent.locationReference,
      barber_reference: workflowEvent.barberReference,
      barber_user_reference: workflowEvent.barberUserReference,
      barber_email: workflowEvent.barberEmail,
      client_reference: workflowEvent.clientReference,
      client_email: workflowEvent.clientEmail,
      actor_role: workflowEvent.actorRole,
      event_type: workflowEvent.eventType,
      title: workflowEvent.title,
      detail: workflowEvent.detail,
      event_payload: workflowEvent.eventPayload,
      created_at: workflowEvent.createdAt
    });
    if (workflowResult.error) {
      throw workflowResult.error;
    }

    const eventLogResult = await supabase.from("event_log").upsert({
      appointment_reference: workflowEvent.appointmentReference,
      location_reference: workflowEvent.locationReference,
      barber_reference: workflowEvent.barberReference,
      client_reference: workflowEvent.clientReference,
      actor_role: workflowEvent.actorRole,
      event_type: workflowEvent.eventType,
      title: workflowEvent.title,
      detail: workflowEvent.detail,
      payload: workflowEvent.eventPayload,
      created_at: workflowEvent.createdAt
    }, { onConflict: "appointment_reference,event_type,created_at" });
    if (eventLogResult.error) {
      throw eventLogResult.error;
    }
  }

  if (compensationSnapshot) {
    const compensationResult = await supabase
      .from("compensation_snapshots")
      .upsert({
        appointment_reference: compensationSnapshot.appointmentReference,
        location_reference: compensationSnapshot.locationReference,
        barber_reference: compensationSnapshot.barberReference,
        barber_user_reference: compensationSnapshot.barberUserReference,
        barber_email: compensationSnapshot.barberEmail,
        client_reference: compensationSnapshot.clientReference,
        client_email: compensationSnapshot.clientEmail,
        compensation_model: compensationSnapshot.compensationModel,
        business_date: compensationSnapshot.businessDate,
        gross_service_amount: compensationSnapshot.grossServiceAmount,
        deposit_amount: compensationSnapshot.depositAmount,
        collected_amount: compensationSnapshot.collectedAmount,
        tip_amount: compensationSnapshot.tipAmount,
        commission_rate: compensationSnapshot.commissionRate,
        commission_amount: compensationSnapshot.commissionAmount,
        booth_rent_amount: compensationSnapshot.boothRentAmount,
        booth_rent_period_label: compensationSnapshot.boothRentPeriodLabel,
        rent_coverage_amount: compensationSnapshot.rentCoverageAmount,
        checkout_reference: compensationSnapshot.checkoutReference,
        captured_at: compensationSnapshot.capturedAt,
        updated_at: new Date().toISOString()
      }, { onConflict: "appointment_reference" });

    if (compensationResult.error) {
      throw compensationResult.error;
    }
  }

  const analyticsResult = await supabase
    .from("owner_daily_analytics")
    .upsert({
      location_reference: ownerAnalytics.locationReference,
      business_date: ownerAnalytics.businessDate,
      booked_count: ownerAnalytics.bookedCount,
      completed_services_count: ownerAnalytics.completedServicesCount,
      paid_appointments_count: ownerAnalytics.paidAppointmentsCount,
      revenue_total: ownerAnalytics.revenueTotal,
      tip_total: ownerAnalytics.tipTotal,
      outstanding_balance: ownerAnalytics.outstandingBalance,
      updated_at: ownerAnalytics.updatedAt
    }, { onConflict: "location_reference,business_date" });

  if (analyticsResult.error) {
    throw analyticsResult.error;
  }

  await syncBarberStatus(supabase, snapshot, appointment.barberId);
}

async function getLatestAppointmentOrThrow(supabase: SupabaseClient, appointmentId: string) {
  const snapshot = await readCanonicalOperationsSnapshot(supabase);
  const appointment = snapshot.appointments.find((entry) => entry.id === appointmentId);
  if (!appointment) {
    throw new Error(`Appointment ${appointmentId} was not found.`);
  }

  return appointment;
}

async function assertCanonicalSlotAvailability(
  supabase: SupabaseClient,
  params: {
    barber: CanonicalBarberRow;
    appointment: { id?: string; start: string; end: string };
    latestAppointment: LiveAppointmentRecord;
  }
) {
  const blockedResult = await supabase
    .from("blocked_times")
    .select("id")
    .eq("barber_id", params.barber.id)
    .lt("starts_at", params.appointment.end)
    .gt("ends_at", params.appointment.start)
    .limit(1)
    .maybeSingle();

  if (blockedResult.error) {
    throw blockedResult.error;
  }
  if (blockedResult.data) {
    throw new LiveOperationConflictError(
      "The selected time falls into blocked or unavailable chair time.",
      params.latestAppointment,
      "schedule_conflict"
    );
  }

  const overlappingResult = await supabase
    .from("appointments")
    .select("reference_code, status")
    .eq("barber_id", params.barber.id)
    .lt("starts_at", params.appointment.end)
    .gt("ends_at", params.appointment.start);

  if (overlappingResult.error) {
    throw overlappingResult.error;
  }

  const conflictingAppointment = ((overlappingResult.data ?? []) as AppointmentConflictRow[]).find((appointment) => {
    if (appointment.reference_code === params.appointment.id) {
      return false;
    }
    return appointment.status !== "cancelled" && appointment.status !== "no_show";
  });

  if (conflictingAppointment) {
    throw new LiveOperationConflictError(
      "The selected time is no longer available with this barber.",
      await getLatestAppointmentOrThrow(supabase, conflictingAppointment.reference_code),
      "schedule_conflict"
    );
  }
}

async function resolveCanonicalBookingContext(
  supabase: SupabaseClient,
  snapshot: LiveOperationsSnapshot,
  input: BookingMutationInput
) {
  const serviceRows = await loadCanonicalServicesByReference(supabase, [input.serviceId, ...input.addOnIds]);
  const primaryService = serviceRows.find((row) => matchesReference(input.serviceId, row));
  if (!primaryService) {
    throw new LiveOperationValidationError(`Service ${input.serviceId} is not available for booking.`);
  }

  const [resolvedBarber, resolvedClient] = await Promise.all([
    resolveBookableBarber(supabase, {
      barberId: input.barberId,
      serviceBarberReference: primaryService.barber_reference
    }),
    resolveBookingClient(supabase, {
      clientId: input.clientId,
      actorProfileId: input.actorRole === "client" ? input.actorProfileId ?? input.createdBy : null,
      actorEmail: input.actorEmail,
      clientName: input.clientName,
      clientPhone: input.clientPhone
    })
  ]);

  if (!resolvedBarber) {
    throw new LiveOperationValidationError(
      `Barber ${input.barberId} was not found.`,
      "invalid_resource_reference"
    );
  }
  if (!resolvedClient) {
    throw new LiveOperationValidationError(
      `Client ${input.clientId ?? input.actorEmail ?? "session"} was not found.`,
      "invalid_resource_reference"
    );
  }

  const barberRow = resolvedBarber.barber;

  const locationRow = await resolveBookingLocationRow(supabase, input, primaryService, barberRow);
  if (!locationRow) {
    throw new LiveOperationValidationError(
      "This provider is not available for booking yet.",
      getCanonicalServiceOwnerType(primaryService) === "shop" ? "verification_blocked" : "invalid_resource_reference",
      getCanonicalServiceOwnerType(primaryService) === "shop"
        ? {
            gate: "shop_activation",
            barberId: input.barberId,
            locationId: input.locationId,
            codes: ["shop_lane_location_required"],
            reasons: ["This provider is not available for booking yet."],
            degraded: false
          }
        : undefined
    );
  }

  if (!isCanonicalServiceBookableForContext(primaryService, { location: locationRow, barber: barberRow })) {
    throw new LiveOperationValidationError(`Service ${input.serviceId} is not available for booking.`);
  }

  const addOnServices = input.addOnIds.map((addOnId) => {
    const match = serviceRows.find((row) => matchesReference(addOnId, row));
    if (!match || !isCanonicalServiceBookableForContext(match, { location: locationRow, barber: barberRow })) {
      throw new LiveOperationValidationError(`Add-on ${addOnId} is not available for booking.`);
    }
    return match;
  });

  const membershipResult = await supabase
    .from("staff_locations")
    .select("id, location_id, profile_id")
    .eq("profile_id", barberRow.profile_id)
    .eq("location_id", locationRow.id)
    .maybeSingle();

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const membership = (membershipResult.data as StaffMembershipRow | null) ?? null;
  const locationReference = bookingLocationReferenceForPersistence(locationRow);
  const requiresShopLane = shouldRequireShopBusinessVerificationForBooking({
    serviceOwnerType: getCanonicalServiceOwnerType(primaryService),
    serviceBarberReference: primaryService.barber_reference,
    locationReference,
    hasStaffMembership: Boolean(membership)
  });

  if (!membership && getCanonicalServiceOwnerType(primaryService) === "shop") {
    throw new LiveOperationValidationError(
      "This provider is not available for booking yet.",
      "verification_blocked",
      {
        gate: "shop_activation",
        barberId: input.barberId,
        locationId: input.locationId,
        codes: ["shop_lane_assignment_required"],
        reasons: ["This provider is not available for booking yet."],
        degraded: false
      }
    );
  }

  const quote = calculateAppointmentQuote(
    toBookableServiceSnapshot(primaryService),
    addOnServices.map(toBookableServiceSnapshot),
    numeric(locationRow.tax_rate)
  );

  const matchedClient = snapshot.clients.find(
    (client) =>
      normalizePhone(client.phone) === normalizePhone(input.clientPhone)
      || client.name.toLowerCase() === input.clientName.toLowerCase()
  );
  const actorProfileId = input.createdBy ?? await resolveProfileIdByEmail(supabase, input.actorEmail);
  const clientReferenceForBusiness = resolvedClient.referenceCode ?? resolvedClient.clientId;
  const appliedPromotion = await preparePromotionForBooking(supabase, {
    clientId: clientReferenceForBusiness,
    shopId: input.locationId,
    serviceId: input.serviceId,
    addOnIds: input.addOnIds,
    barberId: input.barberId,
    appointmentTime: input.appointmentTime,
    promotionId: input.promotionId,
    promotionCode: input.promotionCode
  });
  const promotedQuote = appliedPromotion
    ? {
        ...quote,
        discountTotal: appliedPromotion.quote.discountTotal,
        taxTotal: appliedPromotion.quote.taxTotal,
        grandTotal: appliedPromotion.quote.grandTotal,
        depositDue: appliedPromotion.quote.depositDue,
        balanceDue: appliedPromotion.quote.balanceDue
      }
    : quote;
  const clientMembershipSubscription = clientReferenceForBusiness
    ? await readActiveClientMembershipSubscription(clientReferenceForBusiness, supabase)
    : null;
  const membershipPricingAdjustment = buildMembershipPricingAdjustment(clientMembershipSubscription, promotedQuote.subtotal);
  const quoteAfterMembership = applyMembershipPricingAdjustmentToQuote(promotedQuote, membershipPricingAdjustment);
  const pointsRole = input.actorRole === "client" ? "client" : null;
  const pointsRedemptionPreview = input.pointsUserId && pointsRole && (input.pointsToRedeem ?? 0) > 0
    ? await previewPointsQuoteAdjustment({
        userId: input.pointsUserId,
        role: pointsRole,
        requestedPoints: input.pointsToRedeem ?? 0,
        quote: quoteAfterMembership
      })
    : null;
  const finalQuote = pointsRedemptionPreview?.quote ?? quoteAfterMembership;

  return {
    location: locationRow,
    barber: barberRow,
    resolvedBarber,
    client: resolvedClient.client,
    resolvedClient,
    membership,
    requiresShopLane,
    locationReference,
    primaryService,
    addOnServices,
    quote: finalQuote,
    quoteBeforePoints: quoteAfterMembership,
    appliedPromotion,
    promotionDiscountTotal: appliedPromotion?.quote.discountTotal ?? 0,
    membershipPricingAdjustment,
    pointsRedemptionPreview: pointsRedemptionPreview?.preview ?? null,
    matchedClient,
    actorProfileId
  };
}

function appointmentUpsertRow(appointment: LiveAppointmentRecord) {
  return {
    id: canonicalAppointmentUuid(appointment.id),
    reference_code: appointment.id,
    location_id: canonicalLocationUuid(appointment.locationId),
    shop_id: appointment.shopId ? canonicalLocationUuid(appointment.shopId) : null,
    barber_id: canonicalBarberUuid(appointment.barberId),
    client_id: canonicalClientUuid(appointment.clientId),
    service_id: canonicalServiceUuid(appointment.serviceId),
    confirmation_code: appointment.confirmationCode ?? generateAppointmentConfirmationCode(appointment.id),
    membership_id: appointment.membershipId ?? null,
    status: appointment.status,
    source: appointment.source,
    booking_source: appointment.bookingSource ?? appointment.source,
    starts_at: appointment.start,
    ends_at: appointment.end,
    checked_in_at: appointment.checkedInAt ?? null,
    service_started_at: appointment.serviceStartedAt ?? null,
    completed_at: appointment.completedAt ?? null,
    cancelled_at: appointment.cancelledAt ?? null,
    cancellation_reason: appointment.cancellationReason ?? null,
    chair_label: appointment.chair,
    add_on_references: appointment.addOnIds,
    deposit_amount: appointment.depositAmount,
    service_total: appointment.serviceTotal ?? appointment.totalAmount,
    add_on_total: appointment.addOnTotal ?? 0,
    subtotal: appointment.subtotal ?? appointment.totalAmount,
    discount_total: appointment.discountTotal ?? 0,
    tax_total: appointment.taxTotal ?? 0,
    total_amount: appointment.totalAmount,
    grand_total: appointment.grandTotal ?? appointment.totalAmount + appointment.tipAmount,
    balance_due: appointment.balanceDue,
    tip_amount: appointment.tipAmount,
    client_note: appointment.note,
    notes: appointment.note,
    internal_notes: appointment.internalNotes ?? null,
    created_by: appointment.createdBy ?? null,
    lifecycle_revision: appointment.revision,
    last_actor_role: appointment.lastActorRole ?? null,
    last_event_type: appointment.lastEventType ?? null,
    checkout_reference: appointment.checkoutReference ?? null,
    updated_at: appointment.updatedAt
  };
}

function resolveAppointmentChairLabel(location: CanonicalLocationRow, input: BookingMutationInput) {
  const locationName = location.name?.trim();
  if (input.actorRole === "front_desk" && !locationName) {
    return "Front desk assign";
  }

  return locationName || "Freelance location";
}

function withCapturedBookingSettlement(appointment: LiveAppointmentRecord) {
  const capturedAmount = Math.max(appointment.grandTotal ?? appointment.totalAmount, 0);
  return {
    ...appointment,
    depositAmount: capturedAmount,
    balanceDue: 0
  } satisfies LiveAppointmentRecord;
}

function replaceAppointmentInSnapshot(
  snapshot: LiveOperationsSnapshot,
  appointment: LiveAppointmentRecord
) {
  return {
    ...snapshot,
    fetchedAt: appointment.updatedAt,
    appointments: [...snapshot.appointments.map((entry) => (entry.id === appointment.id ? appointment : entry))]
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
  } satisfies LiveOperationsSnapshot;
}

function ensureSnapshotIncludesBookingClient(
  snapshot: LiveOperationsSnapshot,
  resolvedClient: ResolvedBookingClient
) {
  if (snapshot.clients.some((entry) => entry.id === resolvedClient.clientId)) {
    return snapshot;
  }

  return {
    ...snapshot,
    clients: [
      ...snapshot.clients,
      {
        id: resolvedClient.clientId,
        name: resolvedClient.name,
        phone: resolvedClient.phone,
        email: resolvedClient.email,
        loyaltyPoints: 0,
        retentionTag: "new",
        notes: []
      } satisfies Client
    ]
  } satisfies LiveOperationsSnapshot;
}

function createSupabaseProvider(supabase: SupabaseClient): LiveOperationsProvider {
  return {
    kind: "supabase",
    async readSnapshot(viewer) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      return scopeLiveOperationsSnapshot(fullSnapshot, viewer);
    },
    async createBooking(input) {
      const diagnostics = createBookingTransactionDiagnostics();
      diagnostics.selectedPaymentMethodIdPresent = Boolean(input.paymentMethodId?.trim());
      logBookingTransactionStage("booking_request_received", {
        locationIdKind: describePublicReference(input.locationId),
        barberIdKind: describePublicReference(input.barberId),
        serviceIdKind: describePublicReference(input.serviceId),
        clientIdKind: describePublicReference(input.clientId),
        paymentMethodIdPresent: Boolean(input.paymentMethodId?.trim())
      });
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      logBookingTransactionStage("booking_snapshot_loaded", {
        appointmentCount: fullSnapshot.appointments.length,
        clientCount: fullSnapshot.clients.length,
        walkInCount: fullSnapshot.walkIns.length
      });
      const context = await resolveCanonicalBookingContext(supabase, fullSnapshot, input);
      diagnostics.canonicalClientUuid = canonicalClientUuid(context.resolvedClient.clientId);
      diagnostics.canonicalBarberUuid = context.barber.id;
      diagnostics.canonicalServiceUuid = context.primaryService.id;
      diagnostics.canonicalLocationUuid = context.location.id;
      logBookingTransactionStage("canonical_client_resolved", {
        clientId: context.resolvedClient.clientId,
        actorProfileIdPresent: Boolean(context.actorProfileId),
        ...publicBookingTransactionDiagnostics(diagnostics)
      });
      logBookingTransactionStage("canonical_barber_resolved", {
        barberId: context.barber.id,
        barberReferencePresent: Boolean(context.barber.reference_code),
        relationshipType: context.resolvedBarber.relationshipType,
        isFreelance: context.resolvedBarber.isFreelance,
        shopAssignmentPresent: Boolean(context.resolvedBarber.shopAssignment),
        ...publicBookingTransactionDiagnostics(diagnostics)
      });
      logBookingTransactionStage("canonical_service_resolved", {
        serviceId: context.primaryService.id,
        serviceReferencePresent: Boolean(context.primaryService.reference_code),
        servicePrice: context.primaryService.price,
        serviceOwnerType: getCanonicalServiceOwnerType(context.primaryService),
        ...publicBookingTransactionDiagnostics(diagnostics)
      });
      logBookingTransactionStage("canonical_location_resolved", {
        locationReference: context.locationReference,
        locationIdKind: describePublicReference(context.locationReference),
        ...publicBookingTransactionDiagnostics(diagnostics)
      });
      const trustState = await readTrustStateSafe();
      const barberTrustReference = context.barber.reference_code ?? input.barberId;
      assertBookableBarberLane({
        barberId: barberTrustReference,
        locationId: context.locationReference,
        trustState,
        relationshipType: context.resolvedBarber.relationshipType,
        serviceOwnerType: getCanonicalServiceOwnerType(context.primaryService)
      });
      assertShopLaneIfRequired({
        barberId: barberTrustReference,
        locationId: input.locationId,
        locationReference: context.locationReference,
        service: context.primaryService,
        membership: context.membership,
        trustState
      });
      const confirmationCode = await generateUniqueConfirmationCode(
        supabase,
        `${input.locationId}:${input.barberId}:${input.serviceId}:${input.appointmentTime}:${input.clientPhone}`
      );
      const result = bookAppointmentInSnapshot(fullSnapshot, {
        ...input,
        locationId: context.location.id,
        barberId: context.barber.id,
        serviceId: context.primaryService.id,
        clientId: context.resolvedClient.clientId,
        confirmationCode,
        membershipId: context.membership?.id,
        bookingSource: input.bookingSource ?? "booking",
        createdBy: context.actorProfileId ?? undefined,
        pricingSnapshot: context.quote
      });
      const bookedAppointment = {
        ...result.appointment,
        chair: resolveAppointmentChairLabel(context.location, input),
        shopId: context.resolvedBarber.isFreelance ? undefined : result.appointment.shopId
      };
      const bookingSnapshot = bookedAppointment === result.appointment
        ? result.snapshot
        : replaceAppointmentInSnapshot(result.snapshot, bookedAppointment);
      const snapshotWithBookingClient = ensureSnapshotIncludesBookingClient(bookingSnapshot, context.resolvedClient);

      await assertCanonicalSlotAvailability(supabase, {
        barber: context.barber,
        appointment: {
          id: bookedAppointment.id,
          start: bookedAppointment.start,
          end: bookedAppointment.end
        },
        latestAppointment: bookedAppointment
      });
      logBookingTransactionStage("availability_validated", {
        appointmentId: bookedAppointment.id,
        barberId: bookedAppointment.barberId,
        startsAt: bookedAppointment.start,
        endsAt: bookedAppointment.end
      });

      const bookingPaymentAmount = Math.max(bookedAppointment.grandTotal ?? bookedAppointment.totalAmount, 0);
      const appointmentForPayment = bookingPaymentAmount > 0
        ? withCapturedBookingSettlement(bookedAppointment)
        : bookedAppointment;
      const snapshotForPayment = appointmentForPayment.id === bookedAppointment.id
        ? replaceAppointmentInSnapshot(snapshotWithBookingClient, appointmentForPayment)
        : snapshotWithBookingClient;

      const appointmentRow = appointmentUpsertRow(appointmentForPayment);
      logBookingTransactionStage("appointment_insert_started", {
        appointmentId: appointmentForPayment.id,
        clientId: appointmentForPayment.clientId,
        barberId: appointmentForPayment.barberId,
        serviceId: appointmentForPayment.serviceId,
        locationId: appointmentForPayment.locationId,
        shopId: appointmentRow.shop_id,
        shopIdNull: appointmentRow.shop_id === null,
        payloadKeys: Object.keys(appointmentRow),
        paymentRequired: bookingPaymentAmount > 0
      });
      const existingAppointment = await supabase
        .from("appointments")
        .select("id")
        .eq("reference_code", appointmentForPayment.id)
        .maybeSingle();
      if (existingAppointment.error) {
        logBookingTransactionStageFailure("appointment_lookup_failed", existingAppointment.error, {
          table: "appointments",
          appointmentId: appointmentForPayment.id,
          safeMessage: "Appointment could not be saved.",
          ...bookingTransactionLogDiagnostics(diagnostics)
        });
        attachBookingTransactionDiagnostics(
          existingAppointment.error,
          "appointment_lookup_failed",
          "Appointment could not be saved.",
          diagnostics
        );
        throw existingAppointment.error;
      }

      diagnostics.appointmentInsertStarted = true;
      const appointmentResult = existingAppointment.data
        ? await supabase.from("appointments").update(appointmentRow).eq("id", existingAppointment.data.id)
        : await supabase.from("appointments").insert(appointmentRow);
        if (appointmentResult.error) {
          logBookingTransactionStageFailure("appointment_insert_failed", appointmentResult.error, {
            table: "appointments",
            appointmentId: appointmentForPayment.id,
            clientId: appointmentRow.client_id,
            barberId: appointmentRow.barber_id,
            serviceId: appointmentRow.service_id,
            locationId: appointmentRow.location_id,
            shopId: appointmentRow.shop_id,
            shopIdNull: appointmentRow.shop_id === null,
            payloadKeys: Object.keys(appointmentRow),
            safeMessage: "Appointment could not be saved.",
            ...bookingTransactionLogDiagnostics(diagnostics)
          });
          try {
            rethrowAppointmentPersistenceError(appointmentResult.error, result.appointment);
          } catch (error) {
            attachBookingTransactionDiagnostics(
              error,
              "appointment_insert_failed",
              error instanceof LiveOperationConflictError ? "This time is no longer available." : "Appointment could not be saved.",
              diagnostics
            );
            throw error;
          }
        }
      diagnostics.appointmentInsertSucceeded = true;
      logBookingTransactionStage("appointment_insert_succeeded", {
        appointmentId: appointmentForPayment.id,
        existingAppointment: Boolean(existingAppointment.data),
        ...publicBookingTransactionDiagnostics(diagnostics)
      });

      try {
        if (bookingPaymentAmount > 0) {
          diagnostics.paymentRecordInsertStarted = true;
          const payment = await insertPaymentRecord(
            supabase,
            appointmentForPayment,
            bookingPaymentAmount,
            "booking",
            "captured",
            {
              source: appointmentForPayment.source,
              serviceReference: appointmentForPayment.serviceId,
              fullPrepay: true
            },
            {
              paymentMethodId: input.paymentMethodId ?? null,
              shopId: context.resolvedBarber.isFreelance || !context.membership
                ? null
                : canonicalLocationUuid(appointmentForPayment.shopId ?? appointmentForPayment.locationId),
              payoutRoute: context.resolvedBarber.relationshipType,
              platformHold: true
            }
          );
          diagnostics.paymentMethodResolved = true;
          diagnostics.stripePaymentIntentIdPresent = Boolean(payment);
          diagnostics.paymentRecordInsertSucceeded = true;
        }
      } catch (error) {
        mergeBookingPaymentDiagnostics(diagnostics, error);
        const paymentFailureStage = getBookingPaymentFailureStage(error);
        const paymentFailureSafeMessage = getBookingPaymentFailureSafeMessage(error);
        if (paymentFailureStage === "payment_intent_create_failed") {
          diagnostics.paymentRecordInsertStarted = false;
          diagnostics.paymentRecordInsertSucceeded = false;
        }
        diagnostics.rollbackAttempted = true;
        await supabase.from("appointments").delete().eq("reference_code", appointmentForPayment.id);
        logBookingTransactionStageFailure(paymentFailureStage, error, {
          table: "payments",
          appointmentId: appointmentForPayment.id,
          rollback: "appointment_deleted",
          safeMessage: paymentFailureSafeMessage,
          ...bookingTransactionLogDiagnostics(diagnostics)
        });
        if (error instanceof PaymentServiceError) {
          throw new LiveOperationValidationError(paymentFailureSafeMessage, "invalid_booking_selection", {
            transaction: {
              stage: paymentFailureStage,
              safeMessage: paymentFailureSafeMessage,
              ...publicBookingTransactionDiagnostics(diagnostics)
            }
          });
        }
        attachBookingTransactionDiagnostics(
          error,
          paymentFailureStage,
          paymentFailureSafeMessage,
          diagnostics
        );
        throw error;
      }

      diagnostics.appointmentConfirmStarted = true;
      diagnostics.appointmentConfirmSucceeded = true;
      logBookingTransactionStage("appointment_confirm_succeeded", {
        appointmentId: appointmentForPayment.id,
        status: appointmentForPayment.status,
        ...publicBookingTransactionDiagnostics(diagnostics)
      });

      await runBookingPostCommitStep("appointment_status_history_insert", () =>
        syncAppointmentStatusHistory(supabase, appointmentForPayment, {
          previousStatus: undefined,
          actorProfileId: context.actorProfileId,
          reason: "appointment_booked"
        }),
      { appointmentId: appointmentForPayment.id });
      await runBookingPostCommitStep("appointment_line_items_sync", () =>
        syncAppointmentLineItems(supabase, appointmentForPayment),
      { appointmentId: appointmentForPayment.id });
      if (context.appliedPromotion && context.promotionDiscountTotal && appointmentForPayment.clientId) {
        await runBookingPostCommitStep("promotion_redemption_insert", () =>
          createPromotionRedemptionForAppointment(supabase, {
            promotionId: context.appliedPromotion!.promotionId,
            clientReference: appointmentForPayment.clientId,
            appointmentReference: appointmentForPayment.id,
            discountAmount: context.promotionDiscountTotal!,
            redeemedAt: appointmentForPayment.updatedAt
          }),
        { appointmentId: appointmentForPayment.id });
      }
      if (input.pointsUserId && (input.pointsToRedeem ?? 0) > 0) {
        await runBookingPostCommitStep("points_redemption_commit", () =>
          commitPointsRedemption({
            userId: input.pointsUserId!,
            role: "client",
            purpose: "booking_discount",
            requestedPoints: input.pointsToRedeem ?? 0,
            orderTotal: context.quoteBeforePoints.grandTotal,
            sourceId: appointmentForPayment.id,
            locationId: appointmentForPayment.locationId,
            metadata: {
              appointmentId: appointmentForPayment.id,
              clientId: appointmentForPayment.clientId,
              barberId: appointmentForPayment.barberId,
              promotionId: context.appliedPromotion?.promotionId ?? null,
              bookingSource: appointmentForPayment.bookingSource ?? null
            }
          }),
        { appointmentId: appointmentForPayment.id });
      }
      await runBookingPostCommitStep("booking_notifications_insert", () =>
        insertNotificationRecords(supabase, appointmentForPayment, "booking"),
      { appointmentId: appointmentForPayment.id });
      await runBookingPostCommitStep("booking_artifacts_persist", () =>
        persistArtifactsForAppointment(supabase, snapshotForPayment, appointmentForPayment, {
          activityType: "booking",
          actorRole: input.actorRole ?? "client"
        }),
      { appointmentId: appointmentForPayment.id });
      logBookingTransactionStage("booking_response_returned", {
        appointmentId: appointmentForPayment.id,
        clientId: appointmentForPayment.clientId,
        barberId: appointmentForPayment.barberId
      });
      return {
        appointment: appointmentForPayment,
        snapshot: snapshotForPayment
      };
    },
    async rescheduleAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const previousAppointment = fullSnapshot.appointments.find((entry) => entry.id === input.appointmentId);
      if (!previousAppointment) {
        throw new Error(`Appointment ${input.appointmentId} was not found.`);
      }

      const [locationResult, resolvedBarber] = await Promise.all([
        supabase
          .from("locations")
          .select("id, reference_code, name, tax_rate")
          .eq("id", canonicalLocationUuid(previousAppointment.locationId))
          .maybeSingle(),
        resolveBookableBarber(supabase, { barberId: previousAppointment.barberId })
      ]);
      if (locationResult.error) {
        throw locationResult.error;
      }
      if (!locationResult.data || !resolvedBarber) {
        throw new LiveOperationValidationError("The booking can no longer be rescheduled because its canonical context is incomplete.", "invalid_resource_reference");
      }

      const serviceRows = await loadCanonicalServicesByReference(supabase, [previousAppointment.serviceId]);
      const primaryService = serviceRows.find((row) => matchesReference(previousAppointment.serviceId, row));
      if (!primaryService || !isCanonicalServiceBookableForContext(primaryService, {
        location: locationResult.data as CanonicalLocationRow,
        barber: resolvedBarber.barber
      })) {
        throw new LiveOperationValidationError("The service linked to this booking is no longer bookable for this barber.", "invalid_booking_selection");
      }

      const result = rescheduleAppointmentInSnapshot(fullSnapshot, input);
      await assertCanonicalSlotAvailability(supabase, {
        barber: resolvedBarber.barber,
        appointment: {
          id: result.appointment.id,
          start: result.appointment.start,
          end: result.appointment.end
        },
        latestAppointment: result.appointment
      });

      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

        if (updateResult.error) {
          rethrowAppointmentPersistenceError(updateResult.error, result.appointment);
        }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before the reschedule completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const actorProfileId = await resolveProfileIdByEmail(supabase, input.actorEmail);
      await syncAppointmentStatusHistory(supabase, result.appointment, {
        previousStatus: previousAppointment.status,
        actorProfileId,
        reason: input.reason ?? "appointment_rescheduled"
      });
      await syncAppointmentLineItems(supabase, result.appointment);
      await insertNotificationRecords(supabase, result.appointment, "reschedule");
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment, {
        activityType: "reschedule",
        actorRole: input.actorRole
      });
      return result;
    },
    async cancelAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const previousAppointment = fullSnapshot.appointments.find((entry) => entry.id === input.appointmentId);
      const result = cancelAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before cancellation completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const actorProfileId = await resolveProfileIdByEmail(supabase, input.actorEmail);
      await syncAppointmentStatusHistory(supabase, result.appointment, {
        previousStatus: previousAppointment?.status,
        actorProfileId,
        reason: input.reason ?? "appointment_cancelled"
      });

      const paymentUpdate = await supabase
        .from("payments")
        .update({ status: "voided", payment_status: "voided", updated_at: result.appointment.updatedAt })
        .eq("appointment_id", canonicalAppointmentUuid(input.appointmentId))
        .eq("payment_status", "authorized");
      if (paymentUpdate.error) {
        throw paymentUpdate.error;
      }

      await insertNotificationRecords(supabase, result.appointment, "cancel");
      await voidPromotionRedemptionsForAppointment(supabase, result.appointment.id, result.appointment.updatedAt);
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment, {
        activityType: "cancel",
        actorRole: input.actorRole
      });
      return result;
    },
    async transitionAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const previousAppointment = fullSnapshot.appointments.find((entry) => entry.id === input.appointmentId);
      const result = transitionAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before your update completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const actorProfileId = await resolveProfileIdByEmail(supabase, input.actorEmail);
      await syncAppointmentStatusHistory(supabase, result.appointment, {
        previousStatus: previousAppointment?.status,
        actorProfileId,
        reason:
          input.action === "check_in"
            ? "appointment_checked_in"
            : input.action === "service_start"
              ? "service_started"
              : "service_completed"
      });
      await insertAppointmentCheckInEvent(
        supabase,
        result.appointment,
        input.action === "check_in"
          ? "checked_in"
          : input.action === "service_start"
            ? "started"
            : "completed",
        actorProfileId,
        result.appointment.note
      );
      if (input.action === "service_complete") {
        await completePromotionRedemptionsForAppointment(supabase, result.appointment.id, result.appointment.updatedAt);
      }
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment, {
        activityType:
          input.action === "check_in"
            ? "check_in"
            : input.action === "service_start"
              ? "service_start"
              : "service_complete",
        actorRole: input.actorRole
      });
      if (input.action === "service_complete") {
        try {
          await ensureRecurringBooking(supabase, {
            clientId: result.appointment.clientId,
            trigger: "appointment_completed",
            completedAppointment: {
              appointmentId: result.appointment.id,
              barberReference: result.appointment.barberId,
              serviceReference: result.appointment.serviceId,
              locationReference: result.appointment.locationId,
              completedAt: result.appointment.updatedAt
            }
          });
        } catch {}
      }
      return result;
    },
    async checkoutAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const result = checkoutAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before checkout completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const remainingBalance = Math.max(result.appointment.totalAmount - result.appointment.depositAmount, 0);
      const checkoutPayment = remainingBalance > 0
        ? await insertPaymentRecord(
          supabase,
          result.appointment,
          remainingBalance,
          "checkout",
          "captured",
          {
            paymentMethod: input.paymentMethod,
            tipAmount: result.appointment.tipAmount,
            checkoutReference: result.appointment.checkoutReference ?? null
          },
          {
            createdAt: result.appointment.updatedAt
          }
        )
        : null;
      if (result.appointment.tipAmount > 0) {
        await createTipLedgerEntry(supabase, {
          appointmentId: canonicalAppointmentUuid(result.appointment.id),
          paymentId: checkoutPayment?.id ?? null,
          clientId: canonicalClientUuid(result.appointment.clientId),
          barberId: canonicalBarberUuid(result.appointment.barberId),
          amount: result.appointment.tipAmount,
          createdAt: result.appointment.updatedAt
        });
      }
      const paymentRowsResult = await supabase
        .from("payments")
        .select("id")
        .eq("appointment_id", canonicalAppointmentUuid(result.appointment.id));
      if (paymentRowsResult.error) {
        throw paymentRowsResult.error;
      }
      for (const paymentRow of (paymentRowsResult.data ?? []) as Array<{ id: string }>) {
        await syncPaymentRoutingRecord(supabase, paymentRow.id);
      }
      await insertNotificationRecords(supabase, result.appointment, "checkout");
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment, {
        activityType: "checkout",
        actorRole: input.actorRole,
        amountCollected: remainingBalance,
        paymentMethod: input.paymentMethod
      });
      return result;
    }
  };
}

export async function getLiveOperationsProvider(): Promise<LiveOperationsProvider> {
  if (!isSupabaseEnabled()) {
    console.warn("[live-provider] Supabase is disabled; returning an empty live snapshot instead of demo operations data.");
    return createUnavailableSupabaseProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("[live-provider] Supabase is enabled but the admin client is unavailable; returning an empty live snapshot instead of demo data.");
    return createUnavailableSupabaseProvider();
  }

  return createSupabaseProvider(supabase);
}







