import "server-only";

import type Stripe from "stripe";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvent,
  type PlatformEventInput
} from "@/lib/core/platform-events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createStripeTransfer,
  getStripeConnectClient,
  getStripeConnectEnvironment,
  retrieveStripeConnectedAccount,
  retrieveStripePlatformBalance,
  type StripeConnectEnvironmentMode
} from "@/lib/stripe/connect";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type GiftCardPayoutObligation = {
  id: string;
  applicationId: string;
  appointmentId: string;
  barberId: string;
  amountCents: number;
  status: string;
};

export type GiftCardPayoutApplication = {
  id: string;
  giftCardId: string;
  appointmentId: string;
  amountCents: number;
  serviceOnly: boolean;
  tipAppliedCents: number;
};

export type GiftCardPayoutAppointment = {
  id: string;
  status: string;
  completedAt: string | null;
};

export type GiftCardPayoutConnectedAccount = {
  id: string;
  barberId: string;
  provider: string;
  providerAccountId: string | null;
  onboardingStatus: string;
  payoutReadinessStatus: string;
  legalReadinessStatus: string;
  taxReadinessStatus: string;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  disabledReason: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export type GiftCardPayoutCandidate = {
  obligation: GiftCardPayoutObligation;
  application: GiftCardPayoutApplication | null;
  appointment: GiftCardPayoutAppointment | null;
  currency: string | null;
  connectedAccount: GiftCardPayoutConnectedAccount | null;
};

export type GiftCardPayoutEventEvidence = {
  eventType: string;
  entityType: string;
  entityId: string;
  relatedIds: Record<string, unknown>;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt: string;
};

export type GiftCardPayoutStatusTransition = "updated" | "already_target" | "conflict";

export type GiftCardPayoutRepository = {
  listReadyCandidates(limit: number): Promise<GiftCardPayoutCandidate[]>;
  findEvent(idempotencyKey: string): Promise<GiftCardPayoutEventEvidence | null>;
  recordEvent(event: PlatformEventInput): Promise<void>;
  transitionStatus(input: {
    obligationId: string;
    from: "ready_for_payout";
    to: "paid" | "needs_review";
    now: string;
  }): Promise<GiftCardPayoutStatusTransition>;
};

export type GiftCardPayoutProviderAccount = {
  id: string;
  deleted: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  disabledReason: string | null;
};

export type GiftCardPayoutTransfer = {
  id: string;
  amountCents: number;
  currency: string;
  destinationAccountId: string | null;
  metadata: Record<string, string>;
};

export type GiftCardPayoutProvider = {
  environmentMode: StripeConnectEnvironmentMode;
  inspectConnectedAccount(accountId: string): Promise<GiftCardPayoutProviderAccount>;
  availableCents(currency: string): Promise<number>;
  createTransfer(input: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    transferGroup: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<GiftCardPayoutTransfer>;
  retrieveTransfer(transferId: string): Promise<GiftCardPayoutTransfer>;
};

export type GiftCardPayoutWorkerItem = {
  obligationId: string;
  outcome: "paid" | "recovered" | "already_paid" | "not_ready" | "needs_review" | "failed" | "skipped";
  reason: string;
  processorTransferId?: string;
};

export type GiftCardPayoutWorkerResult = {
  scanned: number;
  paid: number;
  recovered: number;
  alreadyPaid: number;
  notReady: number;
  needsReview: number;
  failed: number;
  skipped: number;
  items: GiftCardPayoutWorkerItem[];
};

type DatabaseObligationRow = {
  id: string;
  application_id: string;
  appointment_id: string;
  barber_id: string;
  amount_cents: number;
  status: string;
};

type DatabaseApplicationRow = {
  id: string;
  gift_card_id: string;
  appointment_id: string;
  amount_cents: number;
  service_only: boolean;
  tip_applied_cents: number;
};

type DatabaseAppointmentRow = {
  id: string;
  status: string;
  completed_at: string | null;
};

type DatabaseCardRow = { id: string; currency: string };

type DatabaseConnectedAccountRow = {
  id: string;
  barber_id: string;
  provider: string;
  provider_account_id: string | null;
  onboarding_status: string;
  payout_readiness_status: string;
  legal_readiness_status: string;
  tax_readiness_status: string;
  requirements_currently_due: unknown;
  requirements_past_due: unknown;
  disabled_reason: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

type DatabaseEventRow = {
  event_type: string;
  entity_type: string;
  entity_id: string;
  related_ids: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  idempotency_key: string;
  occurred_at: string;
};

export class GiftCardPayoutWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiftCardPayoutWorkerError";
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  return [];
}

function mapConnectedAccount(row: DatabaseConnectedAccountRow): GiftCardPayoutConnectedAccount {
  return {
    id: row.id,
    barberId: row.barber_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    onboardingStatus: row.onboarding_status,
    payoutReadinessStatus: row.payout_readiness_status,
    legalReadinessStatus: row.legal_readiness_status,
    taxReadinessStatus: row.tax_readiness_status,
    requirementsCurrentlyDue: stringList(row.requirements_currently_due),
    requirementsPastDue: stringList(row.requirements_past_due),
    disabledReason: row.disabled_reason,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled
  };
}

export function createGiftCardPayoutRepository(supabase: SupabaseAdmin): GiftCardPayoutRepository {
  return {
    async listReadyCandidates(limit) {
      const obligationsResult = await supabase
        .from("gift_card_payout_obligations")
        .select("id, application_id, appointment_id, barber_id, amount_cents, status")
        .eq("status", "ready_for_payout")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (obligationsResult.error) {
        throw new GiftCardPayoutWorkerError("Ready gift-card payout obligations could not be loaded.");
      }

      const obligations = (obligationsResult.data ?? []) as DatabaseObligationRow[];
      if (!obligations.length) return [];

      const applicationIds = unique(obligations.map((row) => row.application_id));
      const appointmentIds = unique(obligations.map((row) => row.appointment_id));
      const barberIds = unique(obligations.map((row) => row.barber_id));
      const [applicationsResult, appointmentsResult, accountsResult] = await Promise.all([
        supabase.from("gift_card_applications")
          .select("id, gift_card_id, appointment_id, amount_cents, service_only, tip_applied_cents")
          .in("id", applicationIds),
        supabase.from("appointments").select("id, status, completed_at").in("id", appointmentIds),
        supabase.from("connected_accounts")
          .select("id, barber_id, provider, provider_account_id, onboarding_status, payout_readiness_status, legal_readiness_status, tax_readiness_status, requirements_currently_due, requirements_past_due, disabled_reason, charges_enabled, payouts_enabled")
          .eq("subject_type", "barber")
          .in("barber_id", barberIds)
      ]);
      if (applicationsResult.error || appointmentsResult.error || accountsResult.error) {
        throw new GiftCardPayoutWorkerError("Gift-card payout execution evidence could not be loaded.");
      }

      const applications = (applicationsResult.data ?? []) as DatabaseApplicationRow[];
      const cardIds = unique(applications.map((row) => row.gift_card_id));
      const cardsResult = cardIds.length
        ? await supabase.from("gift_cards").select("id, currency").in("id", cardIds)
        : { data: [], error: null };
      if (cardsResult.error) {
        throw new GiftCardPayoutWorkerError("Gift-card payout currency evidence could not be loaded.");
      }

      const applicationById = new Map(applications.map((row) => [row.id, row]));
      const appointmentById = new Map(((appointmentsResult.data ?? []) as DatabaseAppointmentRow[]).map((row) => [row.id, row]));
      const cardById = new Map(((cardsResult.data ?? []) as DatabaseCardRow[]).map((row) => [row.id, row]));
      const accountByBarberId = new Map(((accountsResult.data ?? []) as DatabaseConnectedAccountRow[]).map((row) => [row.barber_id, row]));

      return obligations.map((row): GiftCardPayoutCandidate => {
        const application = applicationById.get(row.application_id) ?? null;
        const appointment = appointmentById.get(row.appointment_id) ?? null;
        const card = application ? cardById.get(application.gift_card_id) ?? null : null;
        const account = accountByBarberId.get(row.barber_id) ?? null;
        return {
          obligation: {
            id: row.id,
            applicationId: row.application_id,
            appointmentId: row.appointment_id,
            barberId: row.barber_id,
            amountCents: Number(row.amount_cents),
            status: row.status
          },
          application: application
            ? {
                id: application.id,
                giftCardId: application.gift_card_id,
                appointmentId: application.appointment_id,
                amountCents: Number(application.amount_cents),
                serviceOnly: application.service_only,
                tipAppliedCents: Number(application.tip_applied_cents)
              }
            : null,
          appointment: appointment
            ? { id: appointment.id, status: appointment.status, completedAt: appointment.completed_at }
            : null,
          currency: card?.currency?.toLowerCase() ?? null,
          connectedAccount: account ? mapConnectedAccount(account) : null
        };
      });
    },

    async findEvent(idempotencyKey) {
      const result = await supabase
        .from("platform_events")
        .select("event_type, entity_type, entity_id, related_ids, payload, idempotency_key, occurred_at")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (result.error) {
        throw new GiftCardPayoutWorkerError("Gift-card payout event evidence could not be loaded.");
      }
      const row = result.data as DatabaseEventRow | null;
      return row
        ? {
            eventType: row.event_type,
            entityType: row.entity_type,
            entityId: row.entity_id,
            relatedIds: row.related_ids ?? {},
            payload: row.payload ?? {},
            idempotencyKey: row.idempotency_key,
            occurredAt: row.occurred_at
          }
        : null;
    },

    async recordEvent(event) {
      await recordRequiredPlatformEvent(supabase, event);
    },

    async transitionStatus(input) {
      const update = await supabase
        .from("gift_card_payout_obligations")
        .update({ status: input.to, updated_at: input.now })
        .eq("id", input.obligationId)
        .eq("status", input.from)
        .select("id, status")
        .maybeSingle();
      if (update.error) {
        throw new GiftCardPayoutWorkerError("Gift-card payout status could not be advanced.");
      }
      if (update.data) return "updated";

      const current = await supabase
        .from("gift_card_payout_obligations")
        .select("status")
        .eq("id", input.obligationId)
        .maybeSingle();
      if (current.error) {
        throw new GiftCardPayoutWorkerError("Gift-card payout status could not be rechecked.");
      }
      return current.data?.status === input.to ? "already_target" : "conflict";
    }
  };
}

function destinationId(transfer: Stripe.Transfer) {
  if (typeof transfer.destination === "string") return transfer.destination;
  return transfer.destination?.id ?? null;
}

function mapTransfer(transfer: Stripe.Transfer): GiftCardPayoutTransfer {
  return {
    id: transfer.id,
    amountCents: transfer.amount,
    currency: transfer.currency.toLowerCase(),
    destinationAccountId: destinationId(transfer),
    metadata: { ...transfer.metadata }
  };
}

export function createStripeGiftCardPayoutProvider(): GiftCardPayoutProvider {
  return {
    environmentMode: getStripeConnectEnvironment().mode,

    async inspectConnectedAccount(accountId) {
      const account = await retrieveStripeConnectedAccount(accountId);
      if ("deleted" in account && account.deleted) {
        return {
          id: account.id,
          deleted: true,
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          requirementsCurrentlyDue: [],
          requirementsPastDue: [],
          disabledReason: "Stripe connected account was deleted."
        };
      }
      return {
        id: account.id,
        deleted: false,
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        requirementsCurrentlyDue: stringList(account.requirements?.currently_due),
        requirementsPastDue: stringList(account.requirements?.past_due),
        disabledReason: account.requirements?.disabled_reason?.trim() || null
      };
    },

    async availableCents(currency) {
      const balance = await retrieveStripePlatformBalance();
      return balance.available
        .filter((entry) => entry.currency.toLowerCase() === currency.toLowerCase())
        .reduce((total, entry) => total + entry.amount, 0);
    },

    async createTransfer(input) {
      return mapTransfer(await createStripeTransfer({
        amount: input.amountCents / 100,
        currency: input.currency,
        destinationAccountId: input.destinationAccountId,
        transferGroup: input.transferGroup,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey
      }));
    },

    async retrieveTransfer(transferId) {
      return mapTransfer(await getStripeConnectClient().transfers.retrieve(transferId));
    }
  };
}

export function giftCardPayoutIdempotencyKeys(obligationId: string) {
  return {
    plan: buildPlatformEventIdempotencyKey(["pr36", "gift-payout", obligationId, "plan", "v1"]),
    transfer: buildPlatformEventIdempotencyKey(["pr36", "gift-payout", obligationId, "transfer", "v1"]),
    release: buildPlatformEventIdempotencyKey(["pr36", "gift-payout", obligationId, "released", "v1"])
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function candidateIntegrityReason(candidate: GiftCardPayoutCandidate) {
  const { obligation, application, appointment, currency } = candidate;
  if (obligation.status !== "ready_for_payout") return "obligation_not_ready";
  if (!Number.isSafeInteger(obligation.amountCents) || obligation.amountCents <= 0) return "invalid_obligation_amount";
  if (!application || application.id !== obligation.applicationId) return "application_missing";
  if (application.appointmentId !== obligation.appointmentId) return "application_appointment_mismatch";
  if (application.amountCents !== obligation.amountCents) return "application_amount_mismatch";
  if (!application.serviceOnly || application.tipAppliedCents !== 0) return "gift_application_touched_tip";
  if (!appointment || appointment.id !== obligation.appointmentId) return "appointment_missing";
  if (appointment.status !== "completed" && !appointment.completedAt) return "appointment_not_completed";
  if (!currency || !/^[a-z]{3}$/.test(currency)) return "invalid_currency";
  return null;
}

function databaseAccountReadinessReason(candidate: GiftCardPayoutCandidate) {
  const account = candidate.connectedAccount;
  if (!account) return "connected_account_missing";
  if (account.barberId !== candidate.obligation.barberId) return "connected_account_barber_mismatch";
  if (account.provider !== "stripe_connect") return "connected_account_provider_invalid";
  if (!account.providerAccountId?.trim()) return "connected_account_provider_id_missing";
  if (account.onboardingStatus !== "verified") return "connected_account_onboarding_incomplete";
  if (account.payoutReadinessStatus !== "ready") return "connected_account_payout_not_ready";
  if (account.legalReadinessStatus !== "accepted") return "connected_account_legal_incomplete";
  if (account.taxReadinessStatus !== "verified") return "connected_account_tax_incomplete";
  if (!account.chargesEnabled || !account.payoutsEnabled) return "connected_account_capabilities_incomplete";
  if (account.requirementsCurrentlyDue.length || account.requirementsPastDue.length) return "connected_account_requirements_due";
  if (account.disabledReason?.trim()) return "connected_account_disabled";
  return null;
}

function providerAccountReadinessReason(
  plannedAccountId: string,
  account: GiftCardPayoutProviderAccount
) {
  if (account.id !== plannedAccountId) return "provider_account_identity_mismatch";
  if (account.deleted) return "provider_account_deleted";
  if (!account.detailsSubmitted || !account.chargesEnabled || !account.payoutsEnabled) return "provider_account_capabilities_incomplete";
  if (account.requirementsCurrentlyDue.length || account.requirementsPastDue.length) return "provider_account_requirements_due";
  if (account.disabledReason?.trim()) return "provider_account_disabled";
  return null;
}

function planPayload(candidate: GiftCardPayoutCandidate, destinationAccountId: string, transferKey: string) {
  return {
    obligationId: candidate.obligation.id,
    applicationId: candidate.obligation.applicationId,
    appointmentId: candidate.obligation.appointmentId,
    barberId: candidate.obligation.barberId,
    connectedAccountId: candidate.connectedAccount?.id ?? null,
    destinationAccountId,
    amountCents: candidate.obligation.amountCents,
    currency: candidate.currency,
    provider: "stripe_connect",
    serviceOnly: true,
    tipAppliedCents: 0,
    transferIdempotencyKey: transferKey
  };
}

function validatePlan(
  evidence: GiftCardPayoutEventEvidence,
  candidate: GiftCardPayoutCandidate,
  keys: ReturnType<typeof giftCardPayoutIdempotencyKeys>
) {
  const payload = evidence.payload;
  if (evidence.idempotencyKey !== keys.plan) return "payout_plan_idempotency_mismatch";
  if (evidence.eventType !== "payout_eligible" || evidence.entityType !== "gift_card_payout_obligation" || evidence.entityId !== candidate.obligation.id) return "payout_plan_identity_mismatch";
  if (text(payload.obligationId) !== candidate.obligation.id) return "payout_plan_obligation_mismatch";
  if (text(payload.applicationId) !== candidate.obligation.applicationId) return "payout_plan_application_mismatch";
  if (text(payload.appointmentId) !== candidate.obligation.appointmentId) return "payout_plan_appointment_mismatch";
  if (text(payload.barberId) !== candidate.obligation.barberId) return "payout_plan_barber_mismatch";
  if (text(payload.provider) !== "stripe_connect") return "payout_plan_provider_mismatch";
  if (!text(payload.connectedAccountId)) return "payout_plan_connected_account_missing";
  if (integer(payload.amountCents) !== candidate.obligation.amountCents) return "payout_plan_amount_mismatch";
  if (text(payload.currency) !== candidate.currency) return "payout_plan_currency_mismatch";
  if (text(payload.transferIdempotencyKey) !== keys.transfer) return "payout_plan_idempotency_mismatch";
  if (payload.serviceOnly !== true || integer(payload.tipAppliedCents) !== 0) return "payout_plan_tip_invariant_failed";
  if (!text(payload.destinationAccountId)) return "payout_plan_destination_missing";
  return null;
}

function validateTransfer(
  transfer: GiftCardPayoutTransfer,
  candidate: GiftCardPayoutCandidate,
  destinationAccountId: string
) {
  if (!transfer.id.trim()) return "processor_transfer_id_missing";
  if (transfer.amountCents !== candidate.obligation.amountCents) return "processor_transfer_amount_mismatch";
  if (transfer.currency !== candidate.currency) return "processor_transfer_currency_mismatch";
  if (transfer.destinationAccountId !== destinationAccountId) return "processor_transfer_destination_mismatch";
  if (transfer.metadata.purpose !== "pr36_gift_card_service_payout") return "processor_transfer_purpose_mismatch";
  if (transfer.metadata.gift_card_payout_obligation_id !== candidate.obligation.id) return "processor_transfer_obligation_mismatch";
  if (transfer.metadata.gift_card_application_id !== candidate.obligation.applicationId) return "processor_transfer_application_mismatch";
  if (transfer.metadata.appointment_id !== candidate.obligation.appointmentId) return "processor_transfer_appointment_mismatch";
  if (transfer.metadata.barber_id !== candidate.obligation.barberId) return "processor_transfer_barber_mismatch";
  if (transfer.metadata.service_only !== "true" || transfer.metadata.tip_applied_cents !== "0") return "processor_transfer_tip_invariant_failed";
  return null;
}

function validateReleaseEvidence(
  evidence: GiftCardPayoutEventEvidence,
  candidate: GiftCardPayoutCandidate,
  destinationAccountId: string,
  keys: ReturnType<typeof giftCardPayoutIdempotencyKeys>,
  environmentMode: StripeConnectEnvironmentMode
) {
  const payload = evidence.payload;
  if (evidence.idempotencyKey !== keys.release) return "release_evidence_idempotency_mismatch";
  if (evidence.eventType !== "payout_released" || evidence.entityType !== "gift_card_payout_obligation" || evidence.entityId !== candidate.obligation.id) return "release_evidence_identity_mismatch";
  if (integer(payload.amountCents) !== candidate.obligation.amountCents) return "release_evidence_amount_mismatch";
  if (text(payload.currency) !== candidate.currency) return "release_evidence_currency_mismatch";
  if (text(payload.destinationAccountId) !== destinationAccountId) return "release_evidence_destination_mismatch";
  if (!text(payload.processorTransferId)) return "release_evidence_transfer_missing";
  if (text(payload.environmentMode) !== environmentMode) return "release_evidence_environment_mismatch";
  if (text(payload.transferIdempotencyKey) !== keys.transfer) return "release_evidence_transfer_idempotency_mismatch";
  if (payload.serviceOnly !== true || integer(payload.tipAppliedCents) !== 0) return "release_evidence_tip_invariant_failed";
  return null;
}

async function recordPlan(
  repository: GiftCardPayoutRepository,
  candidate: GiftCardPayoutCandidate,
  destinationAccountId: string,
  keys: ReturnType<typeof giftCardPayoutIdempotencyKeys>,
  now: string
) {
  await repository.recordEvent({
    eventType: "payout_eligible",
    entityType: "gift_card_payout_obligation",
    entityId: candidate.obligation.id,
    source: "system",
    relatedIds: {
      applicationId: candidate.obligation.applicationId,
      appointmentId: candidate.obligation.appointmentId,
      barberId: candidate.obligation.barberId,
      connectedAccountId: candidate.connectedAccount?.id ?? null
    },
    payload: planPayload(candidate, destinationAccountId, keys.transfer),
    idempotencyKey: keys.plan,
    occurredAt: now
  });
}

async function holdForReview(
  repository: GiftCardPayoutRepository,
  candidate: GiftCardPayoutCandidate,
  reason: string,
  now: string
): Promise<GiftCardPayoutWorkerItem> {
  await repository.recordEvent({
    eventType: "payout_held",
    entityType: "gift_card_payout_obligation",
    entityId: candidate.obligation.id,
    source: "system",
    relatedIds: {
      applicationId: candidate.obligation.applicationId,
      appointmentId: candidate.obligation.appointmentId,
      barberId: candidate.obligation.barberId
    },
    payload: {
      reason,
      amountCents: candidate.obligation.amountCents,
      currency: candidate.currency,
      serviceOnly: candidate.application?.serviceOnly ?? null,
      tipAppliedCents: candidate.application?.tipAppliedCents ?? null
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["pr36", "gift-payout", candidate.obligation.id, "needs-review", reason, "v1"]),
    occurredAt: now
  });
  const transition = await repository.transitionStatus({
    obligationId: candidate.obligation.id,
    from: "ready_for_payout",
    to: "needs_review",
    now
  });
  return {
    obligationId: candidate.obligation.id,
    outcome: transition === "conflict" ? "failed" : "needs_review",
    reason: transition === "conflict" ? "obligation_status_changed_before_review" : reason
  };
}

async function recordRelease(
  repository: GiftCardPayoutRepository,
  candidate: GiftCardPayoutCandidate,
  destinationAccountId: string,
  transfer: GiftCardPayoutTransfer,
  keys: ReturnType<typeof giftCardPayoutIdempotencyKeys>,
  now: string,
  environmentMode: StripeConnectEnvironmentMode
) {
  await repository.recordEvent({
    eventType: "payout_released",
    entityType: "gift_card_payout_obligation",
    entityId: candidate.obligation.id,
    source: "system",
    relatedIds: {
      applicationId: candidate.obligation.applicationId,
      appointmentId: candidate.obligation.appointmentId,
      barberId: candidate.obligation.barberId,
      connectedAccountId: candidate.connectedAccount?.id ?? null,
      processorTransferId: transfer.id
    },
    payload: {
      processorTransferId: transfer.id,
      destinationAccountId,
      amountCents: candidate.obligation.amountCents,
      currency: candidate.currency,
      environmentMode,
      serviceOnly: true,
      tipAppliedCents: 0,
      transferIdempotencyKey: keys.transfer
    },
    idempotencyKey: keys.release,
    occurredAt: now
  });
}

async function finalizePaid(
  repository: GiftCardPayoutRepository,
  obligationId: string,
  now: string,
  recovered: boolean,
  processorTransferId: string
): Promise<GiftCardPayoutWorkerItem> {
  const transition = await repository.transitionStatus({
    obligationId,
    from: "ready_for_payout",
    to: "paid",
    now
  });
  if (transition === "conflict") {
    return { obligationId, outcome: "failed", reason: "obligation_status_changed_before_paid" };
  }
  if (transition === "already_target") {
    return { obligationId, outcome: "already_paid", reason: "processor_evidence_already_finalized", processorTransferId };
  }
  return {
    obligationId,
    outcome: recovered ? "recovered" : "paid",
    reason: recovered ? "processor_evidence_recovered" : "processor_transfer_recorded",
    processorTransferId
  };
}

async function processCandidate(input: {
  candidate: GiftCardPayoutCandidate;
  repository: GiftCardPayoutRepository;
  provider: GiftCardPayoutProvider;
  now: string;
  availableByCurrency: Map<string, number>;
}): Promise<GiftCardPayoutWorkerItem> {
  const { candidate, repository, provider, now, availableByCurrency } = input;
  const { obligation } = candidate;
  if (obligation.status !== "ready_for_payout") {
    return { obligationId: obligation.id, outcome: "skipped", reason: "obligation_not_ready" };
  }

  const integrityReason = candidateIntegrityReason(candidate);
  if (integrityReason) return holdForReview(repository, candidate, integrityReason, now);

  const keys = giftCardPayoutIdempotencyKeys(obligation.id);
  const [existingPlan, existingRelease] = await Promise.all([
    repository.findEvent(keys.plan),
    repository.findEvent(keys.release)
  ]);

  if (existingRelease) {
    if (!existingPlan) return holdForReview(repository, candidate, "release_without_payout_plan", now);
    const planReason = validatePlan(existingPlan, candidate, keys);
    if (planReason) return holdForReview(repository, candidate, planReason, now);
    const destinationAccountId = text(existingPlan.payload.destinationAccountId)!;
    const releaseReason = validateReleaseEvidence(existingRelease, candidate, destinationAccountId, keys, provider.environmentMode);
    if (releaseReason) return holdForReview(repository, candidate, releaseReason, now);
    const transferId = text(existingRelease.payload.processorTransferId)!;
    const transfer = await provider.retrieveTransfer(transferId);
    const transferReason = validateTransfer(transfer, candidate, destinationAccountId);
    if (transferReason) return holdForReview(repository, candidate, transferReason, now);
    return finalizePaid(repository, obligation.id, now, true, transfer.id);
  }

  const accountReason = databaseAccountReadinessReason(candidate);
  if (accountReason) return { obligationId: obligation.id, outcome: "not_ready", reason: accountReason };
  const connectedAccount = candidate.connectedAccount!;
  const currentAccountId = connectedAccount.providerAccountId!;

  let plan = existingPlan;
  if (!plan) {
    await recordPlan(repository, candidate, currentAccountId, keys, now);
    plan = await repository.findEvent(keys.plan);
    if (!plan) throw new GiftCardPayoutWorkerError("Gift-card payout plan could not be recovered after persistence.");
  }
  const planReason = validatePlan(plan, candidate, keys);
  if (planReason) return holdForReview(repository, candidate, planReason, now);
  const destinationAccountId = text(plan.payload.destinationAccountId)!;
  if (destinationAccountId !== currentAccountId) {
    return holdForReview(repository, candidate, "planned_destination_changed", now);
  }

  const providerAccount = await provider.inspectConnectedAccount(destinationAccountId);
  const providerReason = providerAccountReadinessReason(destinationAccountId, providerAccount);
  if (providerReason) return { obligationId: obligation.id, outcome: "not_ready", reason: providerReason };

  const currency = candidate.currency!;
  if (!availableByCurrency.has(currency)) {
    availableByCurrency.set(currency, await provider.availableCents(currency));
  }
  const availableCents = availableByCurrency.get(currency) ?? 0;
  if (availableCents < obligation.amountCents) {
    return { obligationId: obligation.id, outcome: "not_ready", reason: "platform_balance_not_available" };
  }

  const transfer = await provider.createTransfer({
    amountCents: obligation.amountCents,
    currency,
    destinationAccountId,
    transferGroup: `bvrb3r:gift-card:${obligation.applicationId}`,
    metadata: {
      purpose: "pr36_gift_card_service_payout",
      gift_card_payout_obligation_id: obligation.id,
      gift_card_application_id: obligation.applicationId,
      appointment_id: obligation.appointmentId,
      barber_id: obligation.barberId,
      service_only: "true",
      tip_applied_cents: "0"
    },
    idempotencyKey: keys.transfer
  });
  const transferReason = validateTransfer(transfer, candidate, destinationAccountId);
  if (transferReason) return holdForReview(repository, candidate, transferReason, now);

  await recordRelease(repository, candidate, destinationAccountId, transfer, keys, now, provider.environmentMode);
  availableByCurrency.set(currency, Math.max(availableCents - obligation.amountCents, 0));
  return finalizePaid(repository, obligation.id, now, false, transfer.id);
}

function resultSummary(items: GiftCardPayoutWorkerItem[]): GiftCardPayoutWorkerResult {
  return {
    scanned: items.length,
    paid: items.filter((item) => item.outcome === "paid").length,
    recovered: items.filter((item) => item.outcome === "recovered").length,
    alreadyPaid: items.filter((item) => item.outcome === "already_paid").length,
    notReady: items.filter((item) => item.outcome === "not_ready").length,
    needsReview: items.filter((item) => item.outcome === "needs_review").length,
    failed: items.filter((item) => item.outcome === "failed").length,
    skipped: items.filter((item) => item.outcome === "skipped").length,
    items
  };
}

export async function runGiftCardPayoutWorker(options: {
  limit?: number;
  repository?: GiftCardPayoutRepository;
  provider?: GiftCardPayoutProvider;
  now?: () => Date;
} = {}): Promise<GiftCardPayoutWorkerResult> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 25), 1), 50);
  const repository = options.repository ?? (() => {
    const supabase = createSupabaseAdminClient();
    if (!supabase) throw new GiftCardPayoutWorkerError("Gift-card payout database authority is unavailable.");
    return createGiftCardPayoutRepository(supabase);
  })();
  const provider = options.provider ?? createStripeGiftCardPayoutProvider();
  const candidates = await repository.listReadyCandidates(limit);
  const availableByCurrency = new Map<string, number>();
  const items: GiftCardPayoutWorkerItem[] = [];

  for (const candidate of candidates) {
    try {
      items.push(await processCandidate({
        candidate,
        repository,
        provider,
        now: (options.now ?? (() => new Date()))().toISOString(),
        availableByCurrency
      }));
    } catch (error) {
      items.push({
        obligationId: candidate.obligation.id,
        outcome: "failed",
        reason: error instanceof GiftCardPayoutWorkerError
          ? error.message
          : "provider_or_evidence_write_failed"
      });
    }
  }

  return resultSummary(items);
}
