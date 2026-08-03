import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import {
  PUBLIC_QUEUE_STATE_COPY,
  RENT_SETUP_GATE_KEYS,
  type PublicQueueState,
  type RentSetupGateKey,
  type RentSetupGateStatus
} from "@/lib/rent/domain";
import {
  buildRentStatement,
  buildRentStatementCsv,
  buildRentStatementPdf,
  type RentStatement
} from "@/lib/rent/operations-domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserAccount } from "@/types/domain";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export class RentServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code?: string
  ) {
    super(message);
  }
}

export type RentAgreementView = {
  id: string;
  relationshipId: string;
  shopId: string;
  barberId: string;
  version: number;
  model: "booth_rent" | "autobooth_rent";
  status: string;
  rentAmountCents: number;
  billingFrequency: "weekly" | "monthly";
  autoBoothBasisPoints: number;
  ownerAcceptedAt: string | null;
  barberAcceptedAt: string | null;
  effectiveAt: string;
  termsHash: string;
};

export type RentObligationView = {
  id: string;
  agreementId: string;
  shopId: string;
  barberId: string;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  status: string;
  obligationCents: number;
  settledCents: number;
  remainingCents: number;
  graceUsedAt: string | null;
  graceExpiresAt: string | null;
  lateFeeAppliedAt: string | null;
  waiverReason: string | null;
};

export type RentContributionView = {
  id: string;
  obligationId: string;
  kind: string;
  status: string;
  appliedCents: number;
  eligibleServiceCents: number | null;
  excludedTipCents: number | null;
  excludedTaxCents: number | null;
  excludedExternalCents: number | null;
  refundedServiceCents: number | null;
  requestedCents: number | null;
  appointmentId: string | null;
  paymentId: string | null;
  providerEventId: string | null;
  evidenceReference: string | null;
  reversalOfContributionId: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type RentActionView = {
  id: string;
  obligationId: string | null;
  actionType: string;
  actorRole: string;
  reason: string | null;
  createdAt: string;
};

export type RentWorkspacePayload = {
  viewer: "owner" | "barber";
  scope: {
    shopId: string | null;
  };
  relationships: Array<{
    id: string;
    shopId: string;
    barberId: string;
    status: string;
  }>;
  agreements: RentAgreementView[];
  obligations: RentObligationView[];
  contributions: RentContributionView[];
  actions: RentActionView[];
  autopay: Array<{
    agreementId: string;
    enabled: boolean;
    version: number;
    enabledAt: string | null;
    disabledAt: string | null;
  }>;
  paymentRequests: Array<{
    id: string;
    obligationId: string;
    rail: "card" | "barber_balance" | "cash";
    status: string;
    requestedCents: number;
    appliedCents: number;
    providerReference: string | null;
    evidenceReference: string | null;
    createdAt: string;
    settledAt: string | null;
  }>;
  disputes: Array<{
    id: string;
    contributionId: string;
    obligationId: string;
    status: "open" | "under_review" | "released" | "reversed";
    heldCents: number;
    reappliedCents: number;
    returnedCents: number;
    reason: string;
    evidenceReference: string;
    resolutionReason: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  lifecycleRequests: Array<{
    id: string;
    relationshipId: string;
    type: "change_terms" | "pause" | "leave" | "end";
    status: string;
    reason: string;
    proposedTerms: Record<string, unknown>;
    requestedEffectiveAt: string;
    createdAt: string;
  }>;
  warnings: string[];
};

type AgreementRow = {
  id: string;
  relationship_id: string;
  shop_id: string;
  barber_id: string;
  version: number;
  model: "booth_rent" | "autobooth_rent";
  status: string;
  rent_amount_cents: number;
  billing_frequency: "weekly" | "monthly";
  autobooth_basis_points: number;
  owner_accepted_at: string | null;
  barber_accepted_at: string | null;
  effective_at: string;
  terms_hash: string;
};

type ObligationRow = {
  id: string;
  agreement_id: string;
  shop_id: string;
  barber_id: string;
  period_start: string;
  period_end: string;
  due_at: string;
  base_rent_cents: number;
  late_fee_cents: number;
  amount_settled_cents: number;
  status: string;
  grace_used_at: string | null;
  grace_expires_at: string | null;
  late_fee_applied_at: string | null;
  waiver_reason: string | null;
};

type ContributionRow = {
  id: string;
  obligation_id: string;
  contribution_kind: string;
  status: string;
  applied_cents: number;
  eligible_service_cents?: number;
  excluded_tip_cents?: number;
  excluded_tax_cents?: number;
  excluded_external_cents?: number;
  refunded_service_cents?: number;
  requested_cents?: number;
  appointment_id?: string | null;
  payment_id?: string | null;
  provider_event_id?: string | null;
  evidence_reference: string | null;
  reversal_of_contribution_id?: string | null;
  created_at: string;
  settled_at: string | null;
};

type ActionRow = {
  id: string;
  obligation_id: string | null;
  action_type: string;
  actor_role: string;
  reason: string | null;
  created_at: string;
};

function isMissingContract(error: SupabaseErrorLike | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /(rent_(agreements|obligations|contributions|actions_audit)|shop_setup_gates).*not found/i.test(error?.message ?? "");
}

function isMissingPr26Contract(error: SupabaseErrorLike | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /(rent_(autopay_preferences|payment_requests|line_disputes|lifecycle_requests)).*not found/i.test(
      error?.message ?? ""
    );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapAgreement(row: AgreementRow): RentAgreementView {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    shopId: row.shop_id,
    barberId: row.barber_id,
    version: row.version,
    model: row.model,
    status: row.status,
    rentAmountCents: row.rent_amount_cents,
    billingFrequency: row.billing_frequency,
    autoBoothBasisPoints: row.autobooth_basis_points,
    ownerAcceptedAt: row.owner_accepted_at,
    barberAcceptedAt: row.barber_accepted_at,
    effectiveAt: row.effective_at,
    termsHash: row.terms_hash
  };
}

function mapObligation(row: ObligationRow): RentObligationView {
  const obligationCents = row.base_rent_cents + row.late_fee_cents;
  return {
    id: row.id,
    agreementId: row.agreement_id,
    shopId: row.shop_id,
    barberId: row.barber_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueAt: row.due_at,
    status: row.status,
    obligationCents,
    settledCents: row.amount_settled_cents,
    remainingCents: Math.max(obligationCents - row.amount_settled_cents, 0),
    graceUsedAt: row.grace_used_at,
    graceExpiresAt: row.grace_expires_at,
    lateFeeAppliedAt: row.late_fee_applied_at,
    waiverReason: row.waiver_reason
  };
}

function resolveScope(user: UserAccount, requestedShopId?: string | null) {
  if (isShopOwnerRole(user.role)) {
    const shopIds = Array.from(new Set(
      [user.ownedShopId, ...user.locationIds].filter((value): value is string => Boolean(value))
    ));
    if (!shopIds.length) {
      throw new RentServiceError("No shop is attached to this owner account.", 403);
    }
    const requested = requestedShopId?.trim();
    if (requested && !shopIds.includes(requested)) {
      throw new RentServiceError("That shop is outside your owner scope.", 403);
    }
    if (!requested && shopIds.length > 1) {
      throw new RentServiceError("Choose one shop before opening rent operations.", 400);
    }
    return {
      viewer: "owner" as const,
      shopIds,
      shopId: requested ?? shopIds[0],
      barberId: null
    };
  }

  if (isBarberAccountRole(user.role) && user.barberId) {
    return { viewer: "barber" as const, shopIds: [], shopId: null, barberId: user.barberId };
  }

  throw new RentServiceError("Booth rent is available to shop owners and barbers.", 403);
}

export async function getRentWorkspacePayload(
  user: UserAccount,
  requestedShopId?: string | null
): Promise<RentWorkspacePayload> {
  const scope = resolveScope(user, requestedShopId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      viewer: scope.viewer,
      scope: { shopId: scope.shopId },
      relationships: [],
      agreements: [],
      obligations: [],
      contributions: [],
      actions: [],
      autopay: [],
      paymentRequests: [],
      disputes: [],
      lifecycleRequests: [],
      warnings: ["Rent truth is temporarily unavailable."]
    };
  }

  let agreementQuery = supabase
    .from("rent_agreements")
    .select("id, relationship_id, shop_id, barber_id, version, model, status, rent_amount_cents, billing_frequency, autobooth_basis_points, owner_accepted_at, barber_accepted_at, effective_at, terms_hash")
    .order("effective_at", { ascending: false });
  let relationshipQuery = supabase
    .from("shop_barber_relationships")
    .select("id, shop_id, barber_id, status")
    .in("status", ["invited", "active", "suspended"])
    .order("updated_at", { ascending: false });
  let obligationQuery = supabase
    .from("rent_obligations")
    .select("id, agreement_id, shop_id, barber_id, period_start, period_end, due_at, base_rent_cents, late_fee_cents, amount_settled_cents, status, grace_used_at, grace_expires_at, late_fee_applied_at, waiver_reason")
    .order("period_start", { ascending: false });
  // Owner queries deliberately request only rent-funding columns. The table's
  // service/tip/tax evidence never enters the owner payload.
  const contributionColumns = scope.viewer === "owner"
    ? "id, obligation_id, contribution_kind, status, applied_cents, evidence_reference, reversal_of_contribution_id, created_at, settled_at"
    : "id, obligation_id, contribution_kind, status, applied_cents, eligible_service_cents, excluded_tip_cents, excluded_tax_cents, excluded_external_cents, refunded_service_cents, requested_cents, appointment_id, payment_id, provider_event_id, evidence_reference, reversal_of_contribution_id, created_at, settled_at";
  let contributionQuery = supabase
    .from("rent_contributions")
    .select(contributionColumns)
    .order("created_at", { ascending: false });
  let actionQuery = supabase
    .from("rent_actions_audit")
    .select("id, obligation_id, action_type, actor_role, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (scope.viewer === "owner") {
    agreementQuery = agreementQuery.eq("shop_id", scope.shopId);
    relationshipQuery = relationshipQuery.eq("shop_id", scope.shopId);
    obligationQuery = obligationQuery.eq("shop_id", scope.shopId);
    contributionQuery = contributionQuery.eq("shop_id", scope.shopId);
    actionQuery = actionQuery.eq("shop_id", scope.shopId);
  } else {
    agreementQuery = agreementQuery.eq("barber_id", scope.barberId);
    relationshipQuery = relationshipQuery.eq("barber_id", scope.barberId);
    obligationQuery = obligationQuery.eq("barber_id", scope.barberId);
    contributionQuery = contributionQuery.eq("barber_id", scope.barberId);
    actionQuery = actionQuery.eq("barber_id", scope.barberId);
  }

  const [relationshipsResult, agreementsResult, obligationsResult, contributionsResult, actionsResult] = await Promise.all([
    relationshipQuery,
    agreementQuery,
    obligationQuery,
    contributionQuery,
    actionQuery
  ]);
  const errors = [
    relationshipsResult.error,
    agreementsResult.error,
    obligationsResult.error,
    contributionsResult.error,
    actionsResult.error
  ].filter(Boolean) as SupabaseErrorLike[];

  if (errors.length) {
    if (errors.every((error) => isMissingContract(error))) {
      return {
        viewer: scope.viewer,
        scope: { shopId: scope.shopId },
        relationships: [],
        agreements: [],
        obligations: [],
        contributions: [],
        actions: [],
        autopay: [],
        paymentRequests: [],
        disputes: [],
        lifecycleRequests: [],
        warnings: ["The PR22 rent contract is awaiting its database migration."]
      };
    }
    throw new RentServiceError("Unable to load canonical booth-rent truth.", 500, errors[0]?.code);
  }

  return {
    viewer: scope.viewer,
    scope: { shopId: scope.shopId },
    relationships: ((relationshipsResult.data ?? []) as Array<{
      id: string;
      shop_id: string;
      barber_id: string;
      status: string;
    }>).map((row) => ({
      id: row.id,
      shopId: row.shop_id,
      barberId: row.barber_id,
      status: row.status
    })),
    agreements: ((agreementsResult.data ?? []) as AgreementRow[]).map(mapAgreement),
    obligations: ((obligationsResult.data ?? []) as ObligationRow[]).map(mapObligation),
    contributions: ((contributionsResult.data ?? []) as unknown as ContributionRow[]).map((row) => ({
      id: row.id,
      obligationId: row.obligation_id,
      kind: row.contribution_kind,
      status: row.status,
      appliedCents: row.applied_cents,
      eligibleServiceCents: row.eligible_service_cents ?? null,
      excludedTipCents: row.excluded_tip_cents ?? null,
      excludedTaxCents: row.excluded_tax_cents ?? null,
      excludedExternalCents: row.excluded_external_cents ?? null,
      refundedServiceCents: row.refunded_service_cents ?? null,
      requestedCents: row.requested_cents ?? null,
      appointmentId: row.appointment_id ?? null,
      paymentId: row.payment_id ?? null,
      providerEventId: row.provider_event_id ?? null,
      evidenceReference: row.evidence_reference,
      reversalOfContributionId: row.reversal_of_contribution_id ?? null,
      createdAt: row.created_at,
      settledAt: row.settled_at
    })),
    actions: ((actionsResult.data ?? []) as ActionRow[]).map((row) => ({
      id: row.id,
      obligationId: row.obligation_id,
      actionType: row.action_type,
      actorRole: row.actor_role,
      reason: row.reason,
      createdAt: row.created_at
    })),
    autopay: [],
    paymentRequests: [],
    disputes: [],
    lifecycleRequests: [],
    warnings: []
  };
}

export async function getRentOperationsPayload(
  user: UserAccount,
  requestedShopId?: string | null
): Promise<RentWorkspacePayload> {
  const base = await getRentWorkspacePayload(user, requestedShopId);
  const scope = resolveScope(user, requestedShopId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return base;

  let autopayQuery = supabase
    .from("rent_autopay_preferences")
    .select("agreement_id, enabled, version, enabled_at, disabled_at")
    .order("updated_at", { ascending: false });
  let paymentQuery = supabase
    .from("rent_payment_requests")
    .select("id, obligation_id, payment_rail, status, requested_cents, applied_cents, provider_reference, evidence_reference, created_at, settled_at")
    .order("created_at", { ascending: false });
  let disputeQuery = supabase
    .from("rent_line_disputes")
    .select("id, contribution_id, obligation_id, status, held_cents, reapplied_cents, returned_cents, reason, evidence_reference, resolution_reason, created_at, resolved_at")
    .order("created_at", { ascending: false });
  let lifecycleQuery = supabase
    .from("rent_lifecycle_requests")
    .select("id, relationship_id, request_type, status, reason, proposed_terms, requested_effective_at, created_at")
    .order("created_at", { ascending: false });

  if (scope.viewer === "owner") {
    autopayQuery = autopayQuery.eq("shop_id", scope.shopId);
    paymentQuery = paymentQuery.eq("shop_id", scope.shopId);
    disputeQuery = disputeQuery.eq("shop_id", scope.shopId);
    lifecycleQuery = lifecycleQuery.eq("shop_id", scope.shopId);
  } else {
    autopayQuery = autopayQuery.eq("barber_id", scope.barberId);
    paymentQuery = paymentQuery.eq("barber_id", scope.barberId);
    disputeQuery = disputeQuery.eq("barber_id", scope.barberId);
    lifecycleQuery = lifecycleQuery.eq("barber_id", scope.barberId);
  }

  const [autopayResult, paymentResult, disputeResult, lifecycleResult] = await Promise.all([
    autopayQuery,
    paymentQuery,
    disputeQuery,
    lifecycleQuery
  ]);
  const errors = [
    autopayResult.error,
    paymentResult.error,
    disputeResult.error,
    lifecycleResult.error
  ].filter(Boolean) as SupabaseErrorLike[];

  if (errors.length) {
    if (errors.every((error) => isMissingPr26Contract(error))) {
      return {
        ...base,
        warnings: [...base.warnings, "PR26 rent operations are awaiting their forward database migration."]
      };
    }
    throw new RentServiceError("Unable to load rent operations.", 500, errors[0]?.code);
  }

  return {
    ...base,
    autopay: ((autopayResult.data ?? []) as Array<{
      agreement_id: string;
      enabled: boolean;
      version: number;
      enabled_at: string | null;
      disabled_at: string | null;
    }>).map((row) => ({
      agreementId: row.agreement_id,
      enabled: row.enabled,
      version: row.version,
      enabledAt: row.enabled_at,
      disabledAt: row.disabled_at
    })),
    paymentRequests: ((paymentResult.data ?? []) as Array<{
      id: string;
      obligation_id: string;
      payment_rail: "card" | "barber_balance" | "cash";
      status: string;
      requested_cents: number;
      applied_cents: number;
      provider_reference: string | null;
      evidence_reference: string | null;
      created_at: string;
      settled_at: string | null;
    }>).map((row) => ({
      id: row.id,
      obligationId: row.obligation_id,
      rail: row.payment_rail,
      status: row.status,
      requestedCents: row.requested_cents,
      appliedCents: row.applied_cents,
      providerReference: row.provider_reference,
      evidenceReference: row.evidence_reference,
      createdAt: row.created_at,
      settledAt: row.settled_at
    })),
    disputes: ((disputeResult.data ?? []) as Array<{
      id: string;
      contribution_id: string;
      obligation_id: string;
      status: "open" | "under_review" | "released" | "reversed";
      held_cents: number;
      reapplied_cents: number;
      returned_cents: number;
      reason: string;
      evidence_reference: string;
      resolution_reason: string | null;
      created_at: string;
      resolved_at: string | null;
    }>).map((row) => ({
      id: row.id,
      contributionId: row.contribution_id,
      obligationId: row.obligation_id,
      status: row.status,
      heldCents: row.held_cents,
      reappliedCents: row.reapplied_cents,
      returnedCents: row.returned_cents,
      reason: row.reason,
      evidenceReference: row.evidence_reference,
      resolutionReason: row.resolution_reason,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at
    })),
    lifecycleRequests: ((lifecycleResult.data ?? []) as Array<{
      id: string;
      relationship_id: string;
      request_type: "change_terms" | "pause" | "leave" | "end";
      status: string;
      reason: string;
      proposed_terms: Record<string, unknown> | null;
      requested_effective_at: string;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      relationshipId: row.relationship_id,
      type: row.request_type,
      status: row.status,
      reason: row.reason,
      proposedTerms: row.proposed_terms ?? {},
      requestedEffectiveAt: row.requested_effective_at,
      createdAt: row.created_at
    }))
  };
}

export async function getRentStatement(
  user: UserAccount,
  obligationId: string,
  requestedShopId?: string | null
): Promise<RentStatement> {
  const payload = await getRentOperationsPayload(user, requestedShopId);
  const obligation = payload.obligations.find((row) => row.id === obligationId);
  if (!obligation) {
    throw new RentServiceError("That rent statement is not available to this account.", 403);
  }
  const disputes = new Map(
    payload.disputes.map((row) => [row.contributionId, row])
  );

  return buildRentStatement({
    obligationId: obligation.id,
    periodStart: obligation.periodStart,
    periodEnd: obligation.periodEnd,
    obligationCents: obligation.obligationCents,
    settledCents: obligation.settledCents,
    remainingCents: obligation.remainingCents,
    lines: payload.contributions
      .filter((row) => row.obligationId === obligation.id)
      .map((row) => {
        const dispute = disputes.get(row.id);
        const state = row.reversalOfContributionId
          ? "reversed" as const
          : dispute && ["open", "under_review"].includes(dispute.status)
            ? "held" as const
            : row.status === "settled"
              ? "settled" as const
              : row.status === "pending"
                ? "pending" as const
                : row.status === "failed"
                  ? "failed" as const
                  : "canceled" as const;
        return {
          id: row.id,
          kind: row.kind,
          state,
          appliedCents: row.appliedCents,
          createdAt: row.createdAt,
          reference: dispute?.evidenceReference
            ?? row.evidenceReference
            ?? row.providerEventId,
          disputed: state === "held",
          reversalOfContributionId: row.reversalOfContributionId
        };
      })
  });
}

export async function exportRentStatement(
  user: UserAccount,
  obligationId: string,
  format: "csv" | "pdf",
  requestedShopId?: string | null
) {
  const statement = await getRentStatement(user, obligationId, requestedShopId);
  if (!statement.reconciled) {
    throw new RentServiceError(
      "This statement is not ready because its ledger does not reconcile to $0.00.",
      409,
      "rent_statement_not_reconciled"
    );
  }

  if (format === "csv") {
    return {
      body: buildRentStatementCsv(statement),
      contentType: "text/csv; charset=utf-8",
      extension: "csv"
    };
  }
  return {
    body: buildRentStatementPdf(statement),
    contentType: "application/pdf",
    extension: "pdf"
  };
}

async function authenticatedRpc<T>(
  functionName: string,
  params: Record<string, unknown>
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new RentServiceError("Authenticated rent actions are unavailable.", 503);
  }
  const { data, error } = await supabase.rpc(functionName, params);
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23514" ? 409 : 500;
    throw new RentServiceError(error.message, status, error.code);
  }
  return data as T;
}

export async function acceptRentAgreement(agreementId: string) {
  return authenticatedRpc<AgreementRow>("pr22_accept_rent_agreement", {
    p_agreement_id: agreementId
  });
}

export async function createRentAgreement(input: {
  relationshipId: string;
  model: "booth_rent" | "autobooth_rent";
  rentAmountCents: number;
  billingFrequency: "weekly" | "monthly";
  autoBoothBasisPoints: number;
  graceHours: number;
  lateFeeCents: number;
  cashSettlementMethod: "provider_transfer" | "manual_transfer_with_evidence";
  termsSnapshot: Record<string, unknown>;
  effectiveAt: string;
}) {
  return authenticatedRpc<AgreementRow>("pr26_create_rent_agreement_version", {
    p_relationship_id: input.relationshipId,
    p_model: input.model,
    p_rent_amount_cents: input.rentAmountCents,
    p_billing_frequency: input.billingFrequency,
    p_autobooth_basis_points: input.autoBoothBasisPoints,
    p_grace_hours: input.graceHours,
    p_late_fee_cents: input.lateFeeCents,
    p_cash_settlement_method: input.cashSettlementMethod,
    p_terms_snapshot: input.termsSnapshot,
    p_effective_at: input.effectiveAt
  });
}

export async function setRentAutopay(input: {
  agreementId: string;
  enabled: boolean;
  paymentMethodReference?: string | null;
}) {
  return authenticatedRpc("pr26_set_rent_autopay", {
    p_agreement_id: input.agreementId,
    p_enabled: input.enabled,
    p_payment_method_reference: input.paymentMethodReference ?? null
  });
}

export async function requestRentPayment(input: {
  obligationId: string;
  rail: "card" | "barber_balance" | "cash";
  amountCents: number;
  idempotencyKey: string;
}) {
  return authenticatedRpc("pr26_request_rent_payment", {
    p_obligation_id: input.obligationId,
    p_payment_rail: input.rail,
    p_amount_cents: input.amountCents,
    p_idempotency_key: input.idempotencyKey
  });
}

export async function disputeRentLine(input: {
  contributionId: string;
  reason: string;
  evidenceReference: string;
}) {
  return authenticatedRpc("pr26_dispute_rent_line", {
    p_contribution_id: input.contributionId,
    p_reason: input.reason,
    p_evidence_reference: input.evidenceReference
  });
}

export async function applyRentRelationshipLifecycle(input: {
  relationshipId: string;
  type: "change_terms" | "pause" | "leave" | "end";
  reason: string;
  effectiveAt: string;
  idempotencyKey: string;
  proposedTerms?: Record<string, unknown>;
}) {
  return authenticatedRpc("pr26_apply_relationship_lifecycle", {
    p_relationship_id: input.relationshipId,
    p_request_type: input.type,
    p_reason: input.reason,
    p_effective_at: input.effectiveAt,
    p_idempotency_key: input.idempotencyKey,
    p_proposed_terms: input.proposedTerms ?? {}
  });
}

export async function applyRentAction(input: {
  obligationId: string;
  action: "remind" | "retry" | "grace" | "late_fee" | "waive";
  reason?: string;
}) {
  return authenticatedRpc<ObligationRow>("pr22_apply_rent_action", {
    p_obligation_id: input.obligationId,
    p_action: input.action,
    p_reason: input.reason ?? null
  });
}

export async function settleCashContribution(input: {
  contributionId: string;
  evidenceReference: string;
}) {
  return authenticatedRpc<ContributionRow>("pr22_settle_cash_contribution", {
    p_contribution_id: input.contributionId,
    p_evidence_reference: input.evidenceReference
  });
}

export type ShopSetupSnapshot = {
  shopId: string;
  locationId: string;
  requiredCount: number;
  passedCount: number;
  operational: boolean;
  gates: Array<{
    key: RentSetupGateKey;
    status: RentSetupGateStatus;
    exceptionReason: string | null;
    evidence: Record<string, unknown>;
    updatedAt: string | null;
  }>;
};

export async function getShopSetupSnapshot(user: UserAccount): Promise<ShopSetupSnapshot> {
  const scope = resolveScope(user, user.ownedShopId ?? user.locationIds[0] ?? null);
  if (scope.viewer !== "owner") {
    throw new RentServiceError("Only shop owners can manage shop setup.", 403);
  }
  const shopId = scope.shopIds[0];
  const supabase = createSupabaseAdminClient();
  if (!supabase || !shopId) {
    throw new RentServiceError("Shop setup is temporarily unavailable.", 503);
  }

  let locationId = user.locationIds.find((value) => UUID_PATTERN.test(value)) ?? null;
  if (!locationId) {
    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("reference_code", shopId)
      .limit(1)
      .maybeSingle();
    if (locationError) {
      throw new RentServiceError("Unable to resolve this shop location.", 500, locationError.code);
    }
    locationId = typeof location?.id === "string" && UUID_PATTERN.test(location.id)
      ? location.id
      : null;
  }
  if (!locationId) {
    throw new RentServiceError("No canonical location is attached to this shop.", 409);
  }

  const { data, error } = await supabase
    .from("shop_setup_gates")
    .select("gate_key, status, exception_reason, evidence, updated_at")
    .eq("shop_id", shopId)
    .eq("location_id", locationId);
  if (error && !isMissingContract(error)) {
    throw new RentServiceError("Unable to load shop setup truth.", 500, error.code);
  }

  const rows = (data ?? []) as Array<{
    gate_key: RentSetupGateKey;
    status: RentSetupGateStatus;
    exception_reason: string | null;
    evidence: Record<string, unknown> | null;
    updated_at: string | null;
  }>;
  const byKey = new Map(rows.map((row) => [row.gate_key, row]));
  const gates = RENT_SETUP_GATE_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      status: row?.status ?? "pending" as RentSetupGateStatus,
      exceptionReason: row?.exception_reason ?? null,
      evidence: row?.evidence ?? {},
      updatedAt: row?.updated_at ?? null
    };
  });
  const passedCount = gates.filter((gate) => (
    gate.status === "passed" || gate.status === "approved_exception"
  )).length;

  return {
    shopId,
    locationId,
    requiredCount: RENT_SETUP_GATE_KEYS.length,
    passedCount,
    operational: passedCount === RENT_SETUP_GATE_KEYS.length,
    gates
  };
}

export async function updateShopSetupGate(input: {
  shopId: string;
  locationId: string;
  gateKey: RentSetupGateKey;
  status: RentSetupGateStatus;
  evidence?: Record<string, unknown>;
  exceptionReason?: string;
}) {
  return authenticatedRpc("pr22_update_shop_setup_gate", {
    p_shop_id: input.shopId,
    p_location_id: input.locationId,
    p_gate_key: input.gateKey,
    p_status: input.status,
    p_evidence: input.evidence ?? {},
    p_exception_reason: input.exceptionReason ?? null
  });
}

export type PublicQueueStatusView = {
  queueId: string;
  queueReference: string;
  state: PublicQueueState;
  position: number | null;
  estimatedWaitMinutes: number | null;
  waitReason: string | null;
  waitVersion: number;
  readyGraceExpiresAt: string | null;
  shopName: string;
  sourceProvider: "bvrb3r" | "booksy" | "square" | "thecut";
  paymentOwner: "bvrb3r_card" | "bvrb3r_cash" | "unpaid_manual" | "external:booksy" | "external:square" | "external:thecut";
  assignmentLocked: boolean;
  reassignedBarberLabel: string | null;
  activationOffered: boolean;
  lastSyncedAt: string;
  updatedAt: string;
  copy: (typeof PUBLIC_QUEUE_STATE_COPY)[PublicQueueState];
};

export async function getPublicQueueStatus(token: string): Promise<PublicQueueStatusView | null> {
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return null;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RentServiceError("Queue status is temporarily unavailable.", 503);
  }
  const { data, error } = await supabase.rpc("pr23_get_public_queue_status", {
    p_token: token
  });
  if (error) {
    if (isMissingContract(error)) return null;
    throw new RentServiceError("Unable to load this queue status.", 500, error.code);
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    queue_id: string;
    queue_reference: string;
    queue_state: PublicQueueState;
    position: number | null;
    estimated_wait_minutes: number | null;
    wait_reason: string | null;
    wait_version: number;
    ready_grace_expires_at: string | null;
    shop_name: string;
    source_provider: PublicQueueStatusView["sourceProvider"];
    payment_owner: PublicQueueStatusView["paymentOwner"];
    assignment_locked: boolean;
    reassigned_barber_label: string | null;
    activation_offered: boolean;
    last_synced_at: string;
    updated_at: string;
  } | null;
  if (!row || !(row.queue_state in PUBLIC_QUEUE_STATE_COPY)) {
    return null;
  }

  return {
    queueId: row.queue_id,
    queueReference: row.queue_reference,
    state: row.queue_state,
    position: row.position,
    estimatedWaitMinutes: row.estimated_wait_minutes,
    waitReason: row.wait_reason,
    waitVersion: row.wait_version,
    readyGraceExpiresAt: row.ready_grace_expires_at,
    shopName: row.shop_name,
    sourceProvider: row.source_provider,
    paymentOwner: row.payment_owner,
    assignmentLocked: row.assignment_locked,
    reassignedBarberLabel: row.reassigned_barber_label,
    activationOffered: row.activation_offered,
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
    copy: PUBLIC_QUEUE_STATE_COPY[row.queue_state]
  };
}

export async function rejoinPublicQueue(token: string, idempotencyKey: string) {
  if (!/^[a-f0-9]{32,128}$/i.test(token) || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new RentServiceError("This rejoin request is invalid.", 400);
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RentServiceError("Queue rejoin is temporarily unavailable.", 503);
  }
  const { data, error } = await supabase.rpc("pr23_rejoin_public_queue", {
    p_token: token,
    p_idempotency_key: idempotencyKey
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "23514" ? 409 : 500;
    throw new RentServiceError(
      status === 409 ? "Only a missed or canceled queue visit can rejoin." : "Unable to rejoin the queue.",
      status,
      error.code
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    waitlist_entry_id: string;
    public_token: string;
    duplicate: boolean;
  } | null;
  if (!row?.public_token) {
    throw new RentServiceError("The queue rejoin completed without a readable status link.", 500);
  }
  return {
    entryId: row.waitlist_entry_id,
    token: row.public_token,
    duplicate: row.duplicate
  };
}

export async function getRentReleaseSnapshot() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RentServiceError("Architect release truth is temporarily unavailable.", 503);
  }
  const { data, error } = await supabase.rpc("pr22_rent_release_snapshot");
  if (error) {
    throw new RentServiceError("Unable to load PR22 release truth.", 500, error.code);
  }
  return data as {
    mission: string;
    generatedAt: string;
    reconciliationDeltaCents: number;
    checkCount: number;
    passedCount: number;
    certifiable: boolean;
    checks: Array<{ key: string; passed: boolean; detail: string }>;
  };
}

export type RentReleaseCertificateView = {
  id: string;
  commitSha: string;
  deploymentId: string;
  reconciliationDeltaCents: number;
  issuedAt: string;
};

export async function issueRentReleaseCertificate(input: {
  commitSha: string;
  deploymentId: string;
}): Promise<RentReleaseCertificateView> {
  const commitSha = input.commitSha.trim().toLowerCase();
  const deploymentId = input.deploymentId.trim();
  if (!/^[a-f0-9]{40}$/.test(commitSha)) {
    throw new RentServiceError("A full deployed Git commit SHA is required.", 409);
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new RentServiceError("A canonical Vercel deployment ID is required.", 409);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RentServiceError("Architect release certification is temporarily unavailable.", 503);
  }
  const { data, error } = await supabase.rpc("pr22_issue_release_certificate", {
    p_commit_sha: commitSha,
    p_deployment_id: deploymentId
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23514" ? 409 : 500;
    throw new RentServiceError(error.message, status, error.code);
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    commit_sha: string;
    deployment_id: string;
    reconciliation_delta_cents: number;
    issued_at: string;
  } | null;
  if (!row) {
    throw new RentServiceError("The release certificate was not returned.", 500);
  }

  return {
    id: row.id,
    commitSha: row.commit_sha,
    deploymentId: row.deployment_id,
    reconciliationDeltaCents: row.reconciliation_delta_cents,
    issuedAt: row.issued_at
  };
}
