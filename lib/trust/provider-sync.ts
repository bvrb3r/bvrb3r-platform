import { randomUUID } from "node:crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoBarbers, demoUsers } from "@/lib/data/demo";
import { demoShops } from "@/lib/data/marketplace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeBarberVerificationDecision, computeShopVerificationDecision } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { getTrustState, setTrustState } from "@/lib/trust/state";
import type {
  BarberVerificationCategory,
  BarberVerificationRecord,
  CanonicalVerificationStatus,
  ShopVerificationRecord,
  TrustState,
  VerificationProfileRecord,
  VerificationProviderLinkRecord,
  VerificationStatus,
  VerificationSubjectRole
} from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class VerificationProviderSyncError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "VerificationProviderSyncError";
    this.status = status;
    this.code = code;
  }
}

export type StripeIdentityVerificationSyncInput = {
  userId: string;
  barberId: string;
  verificationProfileId?: string;
  sessionId: string;
  providerStatus: string;
  lastErrorCode?: string | null;
  lastErrorReason?: string | null;
  redactionStatus?: string | null;
  lastEventId?: string | null;
  lastEventType?: string | null;
  livemode?: boolean;
};

export type StripeConnectVerificationSyncInput = {
  role: "barber" | "shop_owner";
  userId?: string;
  barberId?: string | null;
  shopId?: string | null;
  verificationProfileId?: string;
  providerAccountId: string;
  providerStatus: string;
  onboardingStatus: string;
  operationalStatus: string;
  payoutReadinessStatus: string;
  legalReadinessStatus: string;
  taxReadinessStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted?: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  missingAgreements: string[];
  outdatedAgreements: string[];
  missingSteps: string[];
  disabledReason?: string | null;
  processorLastEventId?: string | null;
  processorLastEventType?: string | null;
  lastCheckedAt?: string | null;
};

type SyncResult = {
  profile: VerificationProfileRecord;
  degraded: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function logProviderSyncError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[Verification Provider Sync] ${context}`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return;
  }

  console.error(`[Verification Provider Sync] ${context}`, error);
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string | null; message?: string | null };
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find the table");
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

async function readTrustState() {
  try {
    const provider = await getTrustProvider();
    return await provider.readState();
  } catch (error) {
    logProviderSyncError("reading trust state", error);
    return clone(getTrustState());
  }
}

function ensureCollections(state: TrustState) {
  if (!state.verificationProfiles) {
    state.verificationProfiles = [];
  }

  if (!state.verificationProviderLinks) {
    state.verificationProviderLinks = [];
  }
}

function getUserLabel(userId: string) {
  return demoUsers.find((entry) => entry.id === userId)?.name ?? "Verification subject";
}

function getBarberLabel(barberId: string) {
  return demoBarbers.find((entry) => entry.id === barberId)?.name ?? "Professional";
}

function getShopLabel(shopId: string) {
  return demoShops.find((entry) => entry.id === shopId)?.name ?? "Business";
}

function upsertProfile(state: TrustState, profile: VerificationProfileRecord) {
  ensureCollections(state);
  state.verificationProfiles = [
    profile,
    ...(state.verificationProfiles ?? []).filter((record) => record.id !== profile.id)
  ];
}

function createProfile(userId: string, role: VerificationSubjectRole) {
  const now = new Date().toISOString();
  return {
    id: `vprof-sync-${randomUUID().slice(0, 8)}`,
    userId,
    role,
    overallStatus: "not_started",
    identityStatus: "not_started",
    licenseStatus: "not_started",
    businessStatus: "not_started",
    payoutStatus: "not_started",
    complianceStatus: "not_started",
    publicVerified: false,
    canAcceptBookings: false,
    canReceivePayouts: false,
    canCreateShopListing: false,
    currentRequirements: [],
    createdAt: now,
    updatedAt: now
  } satisfies VerificationProfileRecord;
}

function resolveLaneUserId(
  state: TrustState,
  input: {
    userId?: string;
    role: VerificationSubjectRole;
    verificationProfileId?: string;
    barberId?: string | null;
    shopId?: string | null;
  }
) {
  if (input.userId) {
    return input.userId;
  }

  const profileUserId = input.verificationProfileId
    ? (state.verificationProfiles ?? []).find((profile) => profile.id === input.verificationProfileId)?.userId
    : undefined;
  if (profileUserId) {
    return profileUserId;
  }

  if (input.role === "barber" && input.barberId) {
    const barberUserId =
      state.barberVerifications.find((record) => record.barberId === input.barberId)?.userId
      ?? demoBarbers.find((entry) => entry.id === input.barberId)?.userId;
    if (barberUserId) {
      return barberUserId;
    }
  }

  if (input.role === "shop_owner" && input.shopId) {
    const shopUserId = state.shopVerifications.find((record) => record.shopId === input.shopId)?.userId;
    if (shopUserId) {
      return shopUserId;
    }
  }

  throw new VerificationProviderSyncError(
    "Unable to resolve the verification subject for this provider update.",
    404,
    "verification_subject_not_found"
  );
}

function ensureProfile(
  state: TrustState,
  input: {
    userId?: string;
    role: VerificationSubjectRole;
    verificationProfileId?: string;
    barberId?: string | null;
    shopId?: string | null;
  }
) {
  ensureCollections(state);
  const userId = resolveLaneUserId(state, input);

  const existing =
    (input.verificationProfileId
      ? (state.verificationProfiles ?? []).find((profile) => profile.id === input.verificationProfileId && profile.role === input.role)
      : undefined)
    ?? (state.verificationProfiles ?? []).find((profile) => profile.userId === userId && profile.role === input.role);

  if (existing) {
    return existing;
  }

  const created = createProfile(userId, input.role);
  upsertProfile(state, created);
  return created;
}

function ensureBarberVerificationRecord(
  state: TrustState,
  input: {
    barberId: string;
    userId: string;
    verificationProfileId: string;
    category: BarberVerificationCategory;
  }
): BarberVerificationRecord {
  const existing = state.barberVerifications.find((record) =>
    record.barberId === input.barberId
    && record.category === input.category
    && (record.verificationProfileId === input.verificationProfileId || record.userId === input.userId)
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const created: BarberVerificationRecord = {
    id: `verify-${input.category}-${randomUUID().slice(0, 8)}`,
    barberId: input.barberId,
    category: input.category,
    legalName: getBarberLabel(input.barberId) || getUserLabel(input.userId),
    userId: input.userId,
    verificationProfileId: input.verificationProfileId,
    verificationStatus: "not_started",
    updatedAt: now
  };

  state.barberVerifications = [created, ...state.barberVerifications];
  return created;
}

function ensureShopVerificationRecord(
  state: TrustState,
  input: {
    shopId: string;
    userId: string;
    verificationProfileId: string;
  }
): ShopVerificationRecord {
  const existing = state.shopVerifications.find((record) =>
    record.shopId === input.shopId
    && (record.verificationProfileId === input.verificationProfileId || record.userId === input.userId)
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const created: ShopVerificationRecord = {
    id: `shop-verify-${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    category: "business_verification",
    businessName: getShopLabel(input.shopId),
    userId: input.userId,
    verificationProfileId: input.verificationProfileId,
    verificationStatus: "not_started",
    updatedAt: now
  };

  state.shopVerifications = [created, ...state.shopVerifications];
  return created;
}

function upsertProviderLink(state: TrustState, record: VerificationProviderLinkRecord) {
  ensureCollections(state);
  state.verificationProviderLinks = [
    record,
    ...(state.verificationProviderLinks ?? []).filter((entry) => entry.id !== record.id)
  ];
}

function ensureProviderLink(
  state: TrustState,
  input: {
    verificationProfileId: string;
    userId: string;
    providerSubject: string;
    providerReferenceId: string;
    providerStatus?: string;
    metadata: Record<string, unknown>;
  }
) {
  const existing = (state.verificationProviderLinks ?? []).find((record) =>
    record.verificationProfileId === input.verificationProfileId
    && record.provider === "stripe"
    && record.providerSubject === input.providerSubject
  );
  const now = new Date().toISOString();
  const next = {
    id: existing?.id ?? `vprovider-${randomUUID().slice(0, 8)}`,
    verificationProfileId: input.verificationProfileId,
    userId: input.userId,
    provider: "stripe",
    providerSubject: input.providerSubject,
    providerReferenceId: input.providerReferenceId,
    providerStatus: input.providerStatus,
    metadata: input.metadata,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  } satisfies VerificationProviderLinkRecord;

  upsertProviderLink(state, next);
  return next;
}

function replaceBarberRecord(state: TrustState, record: BarberVerificationRecord) {
  state.barberVerifications = [
    record,
    ...state.barberVerifications.filter((entry) => entry.id !== record.id)
  ];
}

function replaceShopRecord(state: TrustState, record: ShopVerificationRecord) {
  state.shopVerifications = [
    record,
    ...state.shopVerifications.filter((entry) => entry.id !== record.id)
  ];
}

function mapIdentityStatus(providerStatus: string): CanonicalVerificationStatus {
  switch (providerStatus) {
    case "verified":
      return "approved";
    case "processing":
      return "under_review";
    case "requires_input":
    case "canceled":
    case "redacted":
      return "needs_update";
    default:
      return "in_progress";
  }
}

function mapConnectPayoutStatus(input: StripeConnectVerificationSyncInput): CanonicalVerificationStatus {
  if (input.payoutsEnabled && input.chargesEnabled && !input.requirementsCurrentlyDue.length && !input.requirementsPastDue.length && !input.disabledReason) {
    return "approved";
  }

  if (input.disabledReason || input.requirementsPastDue.length) {
    return "needs_update";
  }

  if (input.onboardingStatus === "not_started") {
    return "not_started";
  }

  if (input.onboardingStatus === "invited" || input.onboardingStatus === "pending") {
    return "in_progress";
  }

  if (input.onboardingStatus === "submitted" || input.operationalStatus === "pending_verification") {
    return "under_review";
  }

  if (input.requirementsCurrentlyDue.length) {
    return "needs_update";
  }

  return "submitted";
}

function mapConnectComplianceStatus(input: StripeConnectVerificationSyncInput): CanonicalVerificationStatus {
  if (input.disabledReason || input.outdatedAgreements.length || input.requirementsPastDue.length) {
    return "needs_update";
  }

  if (input.legalReadinessStatus === "accepted" && (input.taxReadinessStatus === "verified" || input.taxReadinessStatus === "submitted") && !input.missingAgreements.length && input.detailsSubmitted) {
    return "approved";
  }

  if (input.onboardingStatus === "not_started" && input.legalReadinessStatus === "pending" && input.taxReadinessStatus === "pending") {
    return "not_started";
  }

  if (input.onboardingStatus === "invited" || input.onboardingStatus === "pending" || input.missingAgreements.length) {
    return "in_progress";
  }

  if (input.onboardingStatus === "submitted" || input.operationalStatus === "pending_verification") {
    return "under_review";
  }

  return "submitted";
}

function preserveOverallStatusForRecompute(status: VerificationStatus | undefined): VerificationStatus {
  const blockedStates = new Set<VerificationStatus>(["suspended", "expired", "rejected", "needs_update"]);
  return status && blockedStates.has(status) ? status : "not_started";
}

function recomputeProfileForBarber(
  state: TrustState,
  profile: VerificationProfileRecord,
  barberId: string
) {
  const seededProfile = {
    ...profile,
    overallStatus: preserveOverallStatusForRecompute(profile.overallStatus),
    currentRequirements: []
  };
  upsertProfile(state, seededProfile);

  const decision = computeBarberVerificationDecision(state, barberId);
  const next = {
    ...seededProfile,
    overallStatus: decision.canonicalOverallStatus,
    identityStatus: decision.identityStatus,
    licenseStatus: decision.licenseStatus,
    businessStatus: decision.businessStatus,
    payoutStatus: decision.payoutStatus,
    complianceStatus: decision.complianceStatus,
    publicVerified: decision.publicVerified,
    canAcceptBookings: decision.canAcceptBookings,
    canReceivePayouts: decision.canReceivePayouts,
    canCreateShopListing: decision.canCreateShopListing,
    currentRequirements: decision.currentRequirements,
    updatedAt: new Date().toISOString()
  } satisfies VerificationProfileRecord;

  upsertProfile(state, next);
  return next;
}

function recomputeProfileForShop(
  state: TrustState,
  profile: VerificationProfileRecord,
  shopId: string
) {
  const seededProfile = {
    ...profile,
    overallStatus: preserveOverallStatusForRecompute(profile.overallStatus),
    currentRequirements: []
  };
  upsertProfile(state, seededProfile);

  const decision = computeShopVerificationDecision(state, shopId);
  const next = {
    ...seededProfile,
    overallStatus: decision.canonicalOverallStatus,
    identityStatus: decision.identityStatus,
    licenseStatus: decision.licenseStatus,
    businessStatus: decision.businessStatus,
    payoutStatus: decision.payoutStatus,
    complianceStatus: decision.complianceStatus,
    publicVerified: decision.publicVerified,
    canAcceptBookings: decision.canAcceptBookings,
    canReceivePayouts: decision.canReceivePayouts,
    canCreateShopListing: decision.canCreateShopListing,
    currentRequirements: decision.currentRequirements,
    updatedAt: new Date().toISOString()
  } satisfies VerificationProfileRecord;

  upsertProfile(state, next);
  return next;
}

function toProfileRow(profile: VerificationProfileRecord) {
  return {
    id: profile.id,
    user_id: profile.userId,
    role: profile.role,
    overall_status: profile.overallStatus,
    identity_status: profile.identityStatus,
    license_status: profile.licenseStatus,
    business_status: profile.businessStatus,
    payout_status: profile.payoutStatus,
    compliance_status: profile.complianceStatus,
    public_verified: profile.publicVerified,
    can_accept_bookings: profile.canAcceptBookings,
    can_receive_payouts: profile.canReceivePayouts,
    can_create_shop_listing: profile.canCreateShopListing,
    current_requirements: profile.currentRequirements,
    review_notes: profile.reviewNotes ?? null,
    last_reviewed_at: profile.lastReviewedAt ?? null,
    reviewed_by: profile.reviewedBy ?? null,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt
  };
}

function toBarberVerificationRow(record: BarberVerificationRecord) {
  return {
    id: record.id,
    barber_reference: record.barberId,
    category: record.category,
    legal_name: record.legalName,
    user_id: record.userId ?? null,
    verification_profile_id: record.verificationProfileId ?? null,
    license_type: record.licenseType ?? null,
    professional_license_type: record.professionalLicenseType ?? null,
    license_number: record.licenseNumber ?? null,
    issuing_state: record.issuingState ?? null,
    expiration_date: record.expirationDate ?? null,
    verification_status: record.verificationStatus,
    identity_status: record.identityStatus ?? null,
    payout_status: record.payoutStatus ?? null,
    compliance_status: record.complianceStatus ?? null,
    provider_identity_status: record.providerIdentityStatus ?? null,
    provider_connect_status: record.providerConnectStatus ?? null,
    verification_submitted_at: record.verificationSubmittedAt ?? null,
    verification_reviewed_at: record.verificationReviewedAt ?? null,
    reviewed_by: record.reviewedBy ?? null,
    last_reviewed_at: record.lastReviewedAt ?? null,
    verification_notes: record.verificationNotes ?? null,
    current_requirements: record.currentRequirements ?? [],
    document_path: record.documentPath ?? null,
    updated_at: record.updatedAt
  };
}

function toShopVerificationRow(record: ShopVerificationRecord) {
  return {
    id: record.id,
    shop_reference: record.shopId,
    category: record.category,
    business_name: record.businessName,
    user_id: record.userId ?? null,
    verification_profile_id: record.verificationProfileId ?? null,
    dba_name: record.dbaName ?? null,
    ein_last4: record.einLast4 ?? null,
    state_of_registration: record.stateOfRegistration ?? null,
    business_license_type: record.businessLicenseType ?? null,
    shop_license_number: record.shopLicenseNumber ?? null,
    verification_status: record.verificationStatus,
    identity_status: record.identityStatus ?? null,
    payout_status: record.payoutStatus ?? null,
    compliance_status: record.complianceStatus ?? null,
    provider_connect_status: record.providerConnectStatus ?? null,
    verification_submitted_at: record.verificationSubmittedAt ?? null,
    verification_reviewed_at: record.verificationReviewedAt ?? null,
    reviewed_by: record.reviewedBy ?? null,
    last_reviewed_at: record.lastReviewedAt ?? null,
    verification_notes: record.verificationNotes ?? null,
    current_requirements: record.currentRequirements ?? [],
    document_path: record.documentPath ?? null,
    updated_at: record.updatedAt
  };
}

function toProviderLinkRow(record: VerificationProviderLinkRecord) {
  return {
    id: record.id,
    verification_profile_id: record.verificationProfileId,
    user_id: record.userId,
    provider: record.provider,
    provider_subject: record.providerSubject,
    provider_reference_id: record.providerReferenceId,
    provider_status: record.providerStatus ?? null,
    metadata: record.metadata,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

async function upsertRows(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  if (!rows.length) {
    return true;
  }

  const result = await supabase.from(table).upsert(rows, { onConflict });
  if (!result.error) {
    return true;
  }

  if (isMissingTableError(result.error)) {
    return false;
  }

  throw result.error;
}

async function persistSyncResult(
  state: TrustState,
  input: {
    profile: VerificationProfileRecord;
    providerLink: VerificationProviderLinkRecord;
    barberRecords?: BarberVerificationRecord[];
    shopRecords?: ShopVerificationRecord[];
  }
) {
  const supabase = getSupabase();
  if (!supabase) {
    setTrustState(clone(state));
    return false;
  }

  let degraded = false;

  try {
    degraded = !(await upsertRows(supabase, "verification_profiles", [toProfileRow(input.profile)], "user_id,role")) || degraded;
    degraded = !(await upsertRows(supabase, "verification_provider_links", [toProviderLinkRow(input.providerLink)], "provider,provider_subject,provider_reference_id")) || degraded;

    if (input.barberRecords?.length) {
      degraded = !(await upsertRows(supabase, "barber_verifications", input.barberRecords.map(toBarberVerificationRow), "id")) || degraded;
    }

    if (input.shopRecords?.length) {
      degraded = !(await upsertRows(supabase, "shop_verifications", input.shopRecords.map(toShopVerificationRow), "id")) || degraded;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      logProviderSyncError("persisting verification provider state", error);
    }
    degraded = true;
  }

  if (degraded) {
    setTrustState(clone(state));
  }

  return degraded;
}

export async function syncStripeIdentityVerificationLane(
  input: StripeIdentityVerificationSyncInput
): Promise<SyncResult> {
  const state = await readTrustState();
  const profile = ensureProfile(state, {
    userId: input.userId,
    role: "barber",
    verificationProfileId: input.verificationProfileId,
    barberId: input.barberId
  });
  const identityRecord = ensureBarberVerificationRecord(state, {
    barberId: input.barberId,
    userId: input.userId,
    verificationProfileId: profile.id,
    category: "identity_verification"
  });
  const canonicalStatus = mapIdentityStatus(input.providerStatus);
  const now = new Date().toISOString();

  const nextIdentityRecord = {
    ...identityRecord,
    verificationProfileId: profile.id,
    userId: input.userId,
    verificationStatus: canonicalStatus,
    identityStatus: canonicalStatus,
    providerIdentityStatus: input.providerStatus,
    verificationSubmittedAt: identityRecord.verificationSubmittedAt ?? now,
    verificationNotes: input.lastErrorReason ?? identityRecord.verificationNotes,
    updatedAt: now
  } satisfies BarberVerificationRecord;
  replaceBarberRecord(state, nextIdentityRecord);

  const providerLink = ensureProviderLink(state, {
    verificationProfileId: profile.id,
    userId: input.userId,
    providerSubject: "identity_session",
    providerReferenceId: input.sessionId,
    providerStatus: input.providerStatus,
    metadata: {
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorReason: input.lastErrorReason ?? null,
      redactionStatus: input.redactionStatus ?? null,
      lastEventId: input.lastEventId ?? null,
      lastEventType: input.lastEventType ?? null,
      livemode: input.livemode ?? false
    }
  });

  const nextProfile = recomputeProfileForBarber(state, {
    ...profile,
    identityStatus: canonicalStatus,
    updatedAt: now
  }, input.barberId);
  const degraded = await persistSyncResult(state, {
    profile: nextProfile,
    providerLink,
    barberRecords: [nextIdentityRecord]
  });

  return {
    profile: nextProfile,
    degraded
  };
}

export async function syncStripeConnectVerificationLane(
  input: StripeConnectVerificationSyncInput
): Promise<SyncResult> {
  const state = await readTrustState();
  const profile = ensureProfile(state, {
    userId: input.userId,
    role: input.role,
    verificationProfileId: input.verificationProfileId,
    barberId: input.barberId,
    shopId: input.shopId
  });
  const resolvedUserId = profile.userId;
  const payoutStatus = mapConnectPayoutStatus(input);
  const complianceStatus = mapConnectComplianceStatus(input);
  const now = new Date().toISOString();

  const providerLink = ensureProviderLink(state, {
    verificationProfileId: profile.id,
    userId: resolvedUserId,
    providerSubject: "connect_account",
    providerReferenceId: input.providerAccountId,
    providerStatus: input.providerStatus,
    metadata: {
      onboardingStatus: input.onboardingStatus,
      operationalStatus: input.operationalStatus,
      payoutReadinessStatus: input.payoutReadinessStatus,
      legalReadinessStatus: input.legalReadinessStatus,
      taxReadinessStatus: input.taxReadinessStatus,
      chargesEnabled: input.chargesEnabled,
      payoutsEnabled: input.payoutsEnabled,
      detailsSubmitted: input.detailsSubmitted ?? false,
      requirementsCurrentlyDue: input.requirementsCurrentlyDue,
      requirementsEventuallyDue: input.requirementsEventuallyDue,
      requirementsPastDue: input.requirementsPastDue,
      missingAgreements: input.missingAgreements,
      outdatedAgreements: input.outdatedAgreements,
      missingSteps: input.missingSteps,
      disabledReason: input.disabledReason ?? null,
      lastEventId: input.processorLastEventId ?? null,
      lastEventType: input.processorLastEventType ?? null,
      lastCheckedAt: input.lastCheckedAt ?? null
    }
  });

  if (input.role === "barber") {
    if (!input.barberId) {
      throw new VerificationProviderSyncError("Barber verification sync requires a barber lane.", 400, "barber_lane_required");
    }

    const payoutRecord = ensureBarberVerificationRecord(state, {
      barberId: input.barberId,
      userId: resolvedUserId,
      verificationProfileId: profile.id,
      category: "payout_verification"
    });
    const nextPayoutRecord = {
      ...payoutRecord,
      verificationProfileId: profile.id,
      userId: resolvedUserId,
      verificationStatus: payoutStatus,
      payoutStatus,
      complianceStatus,
      providerConnectStatus: input.providerStatus,
      verificationSubmittedAt: payoutRecord.verificationSubmittedAt ?? now,
      verificationNotes: input.disabledReason ?? payoutRecord.verificationNotes,
      updatedAt: now
    } satisfies BarberVerificationRecord;
    replaceBarberRecord(state, nextPayoutRecord);

    const nextProfile = recomputeProfileForBarber(state, {
      ...profile,
      payoutStatus,
      complianceStatus,
      updatedAt: now
    }, input.barberId);
    const degraded = await persistSyncResult(state, {
      profile: nextProfile,
      providerLink,
      barberRecords: [nextPayoutRecord]
    });

    return {
      profile: nextProfile,
      degraded
    };
  }

  if (!input.shopId) {
    throw new VerificationProviderSyncError("Shop-owner verification sync requires a shop lane.", 400, "shop_lane_required");
  }

  const shopRecord = ensureShopVerificationRecord(state, {
      shopId: input.shopId,
      userId: resolvedUserId,
    verificationProfileId: profile.id
  });
  const nextShopRecord = {
    ...shopRecord,
      verificationProfileId: profile.id,
      userId: resolvedUserId,
    payoutStatus,
    complianceStatus,
    providerConnectStatus: input.providerStatus,
    verificationNotes: input.disabledReason ?? shopRecord.verificationNotes,
    updatedAt: now
  } satisfies ShopVerificationRecord;
  replaceShopRecord(state, nextShopRecord);

  const nextProfile = recomputeProfileForShop(state, {
    ...profile,
    payoutStatus,
    complianceStatus,
    updatedAt: now
  }, input.shopId);
  const degraded = await persistSyncResult(state, {
    profile: nextProfile,
    providerLink,
    shopRecords: [nextShopRecord]
  });

  return {
    profile: nextProfile,
    degraded
  };
}
