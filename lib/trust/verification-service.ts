import Stripe from "stripe";
import { createInitialTrustState, computeBarberVerificationDecision, computeShopVerificationDecision } from "@/lib/trust/engine";
import { syncStripeIdentityVerificationLane } from "@/lib/trust/provider-sync";
import { getTrustProvider } from "@/lib/trust/provider";
import { serializeVerificationProfileForSubject } from "@/lib/trust/serialization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  createStripeIdentityVerificationSession,
  getStripeIdentitySessionStatus,
  retrieveStripeIdentityVerificationSession,
  StripeIdentityError,
  verifyStripeIdentityWebhookEvent
} from "@/lib/stripe/identity";
import { StripeConnectError } from "@/lib/stripe/connect";
import {
  beginStripeWebhookAudit,
  completeStripeWebhookAudit,
  StripeWebhookAuditError
} from "@/lib/stripe/webhook-audit";
import { createStripeConnectOnboardingSession } from "@/lib/fintech/service";
import { isRoleAllowed } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";
import type {
  TrustState,
  VerificationMePayload,
  VerificationProfileRecord
} from "@/types/trust";

const VERIFICATION_DEGRADED_WARNING = "Verification data is partially unavailable. Core access is still active.";

function logVerificationError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[Verification] ${context}`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return;
  }

  console.error(`[Verification] ${context}`, error);
}

function pushWarning(warnings: string[], message: string) {
  if (!message.trim() || warnings.includes(message)) {
    return;
  }

  warnings.push(message);
}

function createEmptyVerificationMePayload(warnings: string[] = []): VerificationMePayload {
  return {
    profiles: [],
    warnings
  };
}

type VerificationSessionLaunchResult = {
  profileId: string;
  sessionId: string;
  clientSecret: string | null;
  url: string | null;
  status: string;
  degraded: boolean;
};

type ConnectOnboardingLaunchResult = {
  profileId: string;
  url: string;
  account: {
    subjectType: string;
    operationalStatus: string;
    onboardingStatus: string;
    payoutReadinessStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirementsCurrentlyDue: string[];
    requirementsPastDue: string[];
    disabledReason: string | null;
    missingSteps: string[];
  };
};

type VerificationWebhookResult = {
  received: boolean;
  duplicate: boolean;
  status: "processed" | "ignored";
};

export class VerificationFlowError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "VerificationFlowError";
    this.status = status;
    this.code = code;
  }
}

function sortByMostRecent<T extends { updatedAt?: string; uploadedAt?: string; createdAt?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftValue = left.updatedAt ?? left.uploadedAt ?? left.createdAt ?? "";
    const rightValue = right.updatedAt ?? right.uploadedAt ?? right.createdAt ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

function getVerificationRoleCountForUser(state: TrustState, user: UserAccount) {
  const roles = new Set<string>();

  for (const profile of state.verificationProfiles ?? []) {
    if (profile.userId === user.id) {
      roles.add(profile.role);
    }
  }

  if (user.barberId || state.barberVerifications.some((record) => record.userId === user.id)) {
    roles.add("barber");
  }

  if (state.shopVerifications.some((record) => record.userId === user.id)) {
    roles.add("shop_owner");
  }

  return roles.size;
}

function getDocumentsForProfile(state: TrustState, profile: VerificationProfileRecord, user: UserAccount) {
  let documents = state.verificationDocuments.filter((document) => document.verificationProfileId === profile.id);
  if (documents.length) {
    return sortByMostRecent(documents);
  }

  if (profile.role === "barber" && user.barberId) {
    documents = state.verificationDocuments.filter((document) =>
      document.ownerType === "barber" && document.ownerId === user.barberId
    );
    if (documents.length) {
      return sortByMostRecent(documents);
    }
  }

  if (profile.role === "shop_owner") {
    const relatedShopIds = new Set(
      state.shopVerifications
        .filter((record) => record.verificationProfileId === profile.id || record.userId === user.id)
        .map((record) => record.shopId)
    );

    documents = state.verificationDocuments.filter((document) =>
      document.ownerType === "shop" && relatedShopIds.has(document.ownerId)
    );
    if (documents.length) {
      return sortByMostRecent(documents);
    }
  }

  if (getVerificationRoleCountForUser(state, user) <= 1) {
    return sortByMostRecent(
      state.verificationDocuments.filter((document) => document.userId === user.id)
    );
  }

  return [];
}

function getReviewsForProfile(state: TrustState, profile: VerificationProfileRecord) {
  return sortByMostRecent(
    (state.verificationReviews ?? []).filter((review) => review.verificationProfileId === profile.id)
  );
}

function getProviderLinksForProfile(state: TrustState, profile: VerificationProfileRecord, user: UserAccount) {
  let providers = (state.verificationProviderLinks ?? []).filter((record) => record.verificationProfileId === profile.id);
  if (providers.length) {
    return sortByMostRecent(providers);
  }

  if (getVerificationRoleCountForUser(state, user) <= 1) {
    providers = (state.verificationProviderLinks ?? []).filter((record) => record.userId === user.id);
    return sortByMostRecent(providers);
  }

  return [];
}

function createFallbackBarberProfile(state: TrustState, user: UserAccount): VerificationProfileRecord | null {
  if (!user.barberId) {
    return null;
  }

  const decision = computeBarberVerificationDecision(state, user.barberId);
  const relatedRecords = state.barberVerifications.filter((record) => record.barberId === user.barberId);
  const updatedAt = sortByMostRecent(relatedRecords)[0]?.updatedAt ?? new Date().toISOString();
  const createdAt = relatedRecords
    .map((record) => record.verificationSubmittedAt ?? record.updatedAt)
    .sort((left, right) => `${left ?? ""}`.localeCompare(`${right ?? ""}`))[0] ?? updatedAt;

  return {
    id: `fallback-barber-${user.barberId}`,
    userId: user.id,
    role: "barber",
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
    createdAt,
    updatedAt
  };
}

function createFallbackShopProfiles(state: TrustState, user: UserAccount) {
  const relatedShops = Array.from(
    new Set(
      state.shopVerifications
        .filter((record) => record.userId === user.id)
        .map((record) => record.shopId)
    )
  );

  return relatedShops.map((shopId) => {
    const decision = computeShopVerificationDecision(state, shopId);
    const relatedRecords = state.shopVerifications.filter((record) => record.shopId === shopId);
    const updatedAt = sortByMostRecent(relatedRecords)[0]?.updatedAt ?? new Date().toISOString();
    const createdAt = relatedRecords
      .map((record) => record.verificationSubmittedAt ?? record.updatedAt)
      .sort((left, right) => `${left ?? ""}`.localeCompare(`${right ?? ""}`))[0] ?? updatedAt;

    return {
      id: `fallback-shop-${shopId}`,
      userId: user.id,
      role: "shop_owner" as const,
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
      createdAt,
      updatedAt
    } satisfies VerificationProfileRecord;
  });
}

function getSubjectProfiles(state: TrustState, user: UserAccount) {
  const profiles = sortByMostRecent(
    (state.verificationProfiles ?? []).filter((profile) => profile.userId === user.id)
  );

  if (profiles.length) {
    return profiles.map((profile) => alignProfileWithCanonicalApproval(profile, user));
  }

  const fallbackProfiles: VerificationProfileRecord[] = [];
  const barberProfile = createFallbackBarberProfile(state, user);
  if (barberProfile) {
    fallbackProfiles.push(barberProfile);
  }

  fallbackProfiles.push(...createFallbackShopProfiles(state, user));
  return fallbackProfiles;
}

function normalizeApprovalStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "approved" || normalized === "active" || normalized === "verified") {
    return "approved" as const;
  }
  if (normalized === "rejected" || normalized === "suspended" || normalized === "banned" || normalized === "deactivated") {
    return normalized === "rejected" ? "rejected" as const : "suspended" as const;
  }
  if (normalized === "needs_update") {
    return "needs_update" as const;
  }
  if (normalized === "pending" || normalized === "submitted" || normalized === "under_review" || normalized === "in_progress") {
    return normalized as "pending" | "submitted" | "under_review" | "in_progress";
  }
  return null;
}

function getCanonicalApprovalForProfile(profile: VerificationProfileRecord, user: UserAccount) {
  if (profile.role === "barber") {
    return normalizeApprovalStatus(user.appApprovalStatus);
  }

  if (profile.role === "shop_owner") {
    const shopApproval = user.shopApprovalStatus && user.shopApprovalStatus !== "not_required"
      ? user.shopApprovalStatus
      : user.appApprovalStatus;
    return normalizeApprovalStatus(shopApproval);
  }

  return null;
}

function alignProfileWithCanonicalApproval(profile: VerificationProfileRecord, user: UserAccount): VerificationProfileRecord {
  const canonicalApproval = getCanonicalApprovalForProfile(profile, user);
  if (!canonicalApproval) {
    return profile;
  }

  if (canonicalApproval === "rejected" || canonicalApproval === "suspended" || canonicalApproval === "needs_update") {
    return {
      ...profile,
      overallStatus: canonicalApproval,
      publicVerified: false,
      canAcceptBookings: false,
      canReceivePayouts: false,
      canCreateShopListing: false
    };
  }

  if (canonicalApproval !== "approved") {
    return profile;
  }

  if (profile.role === "barber") {
    return {
      ...profile,
      overallStatus: "approved",
      identityStatus: "approved",
      licenseStatus: "approved",
      complianceStatus: "approved",
      publicVerified: true,
      canAcceptBookings: true,
      canCreateShopListing: false,
      currentRequirements: profile.currentRequirements.filter((requirement) => !/approval|identity|license|compliance/i.test(requirement))
    };
  }

  if (profile.role === "shop_owner") {
    return {
      ...profile,
      overallStatus: "approved",
      businessStatus: "approved",
      complianceStatus: "approved",
      identityStatus: profile.identityStatus === "not_started" ? profile.identityStatus : "approved",
      publicVerified: true,
      canAcceptBookings: false,
      canCreateShopListing: true,
      currentRequirements: profile.currentRequirements.filter((requirement) => !/approval|business|compliance/i.test(requirement))
    };
  }

  return profile;
}

async function readVerificationState(warnings: string[]) {
  try {
    const provider = await getTrustProvider();
    return await provider.readState();
  } catch (error) {
    logVerificationError("reading trust state", error);
    pushWarning(warnings, VERIFICATION_DEGRADED_WARNING);
    return createInitialTrustState();
  }
}

function requireSubjectRole(user: UserAccount, roles: UserAccount["role"][]) {
  if (!isRoleAllowed(user.role, roles)) {
    throw new VerificationFlowError("You do not have access to this verification action.", 403, "verification_forbidden");
  }
}

function getProfileForRole(state: TrustState, user: UserAccount, role: "barber" | "shop_owner") {
  return (state.verificationProfiles ?? []).find((profile) => profile.userId === user.id && profile.role === role) ?? null;
}

function getBarberIdentityProviderLink(state: TrustState, profileId: string) {
  return (state.verificationProviderLinks ?? []).find((record) =>
    record.verificationProfileId === profileId
    && record.provider === "stripe"
    && record.providerSubject === "identity_session"
  ) ?? null;
}

function getFirstShopIdForUser(state: TrustState, user: UserAccount, explicitShopId?: string | null) {
  if (explicitShopId?.trim()) {
    return explicitShopId;
  }

  const scopedShopId = state.shopVerifications.find((record) => record.userId === user.id)?.shopId;
  if (scopedShopId) {
    return scopedShopId;
  }

  const fromLocations = user.locationIds.length
    ? state.shopVerifications.find((record) => user.locationIds.some((locationId) => locationId === record.shopId))?.shopId
    : null;

  return fromLocations ?? null;
}

function isTerminalIdentityStatus(status: string | undefined) {
  return status === "verified" || status === "canceled" || status === "redacted";
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

async function resolveIdentityWebhookLane(
  sessionId: string,
  metadata: Record<string, string>
) {
  const state = await readVerificationState([]);
  const linkedProvider = (state.verificationProviderLinks ?? []).find((record) =>
    record.provider === "stripe"
    && record.providerSubject === "identity_session"
    && record.providerReferenceId === sessionId
  );

  const verificationProfileId = metadata.verificationProfileId?.trim() || linkedProvider?.verificationProfileId;
  const userId = metadata.userId?.trim() || linkedProvider?.userId;
  const barberId = metadata.barberId?.trim()
    || state.barberVerifications.find((record) => record.verificationProfileId === verificationProfileId || (userId && record.userId === userId))?.barberId;

  if (!userId || !barberId) {
    throw new VerificationFlowError("Unable to resolve the Stripe Identity verification subject.", 404, "verification_subject_not_found");
  }

  return {
    userId,
    barberId,
    verificationProfileId
  };
}

export async function getVerificationMePayload(user: UserAccount): Promise<VerificationMePayload> {
  const warnings: string[] = [];

  try {
    const state = await readVerificationState(warnings);
    const profiles = getSubjectProfiles(state, user).map((profile) =>
      serializeVerificationProfileForSubject({
        profile,
        documents: getDocumentsForProfile(state, profile, user),
        reviews: getReviewsForProfile(state, profile),
        providerStatuses: getProviderLinksForProfile(state, profile, user)
      })
    );

    return {
      profiles,
      warnings
    };
  } catch (error) {
    logVerificationError("building verification payload", error);
    pushWarning(warnings, VERIFICATION_DEGRADED_WARNING);
    return createEmptyVerificationMePayload(warnings);
  }
}

export async function startBarberIdentityVerificationSession(user: UserAccount): Promise<VerificationSessionLaunchResult> {
  requireSubjectRole(user, ["barber_user"]);
  if (!user.barberId) {
    throw new VerificationFlowError("A barber lane is required before starting identity verification.", 409, "barber_lane_required");
  }

  const state = await readVerificationState([]);
  const profile = getProfileForRole(state, user, "barber");
  const existingProviderLink = profile ? getBarberIdentityProviderLink(state, profile.id) : null;

  if (existingProviderLink && !isTerminalIdentityStatus(existingProviderLink.providerStatus)) {
    try {
      const existingSession = await retrieveStripeIdentityVerificationSession(existingProviderLink.providerReferenceId);
      const providerStatus = getStripeIdentitySessionStatus(existingSession);
      const syncResult = await syncStripeIdentityVerificationLane({
        userId: user.id,
        barberId: user.barberId,
        verificationProfileId: profile?.id,
        sessionId: existingSession.id,
        providerStatus,
        lastErrorCode: existingSession.last_error?.code ?? null,
        lastErrorReason: existingSession.last_error?.reason ?? null,
        redactionStatus: existingSession.redaction?.status ?? null,
        livemode: existingSession.livemode
      });

      return {
        profileId: syncResult.profile.id,
        sessionId: existingSession.id,
        clientSecret: existingSession.client_secret ?? null,
        url: existingSession.url ?? null,
        status: providerStatus,
        degraded: syncResult.degraded
      };
    } catch (error) {
      logVerificationError("reusing Stripe Identity session", error);
    }
  }

  const session = await createStripeIdentityVerificationSession({
    metadata: {
      userId: user.id,
      barberId: user.barberId,
      verificationProfileId: profile?.id ?? ""
    },
    returnPath: "/profile",
    idempotencyKey: `identity-session:${user.id}:barber`
  });
  const providerStatus = getStripeIdentitySessionStatus(session);
  const syncResult = await syncStripeIdentityVerificationLane({
    userId: user.id,
    barberId: user.barberId,
    verificationProfileId: profile?.id,
    sessionId: session.id,
    providerStatus,
    lastErrorCode: session.last_error?.code ?? null,
    lastErrorReason: session.last_error?.reason ?? null,
    redactionStatus: session.redaction?.status ?? null,
    livemode: session.livemode
  });

  return {
    profileId: syncResult.profile.id,
    sessionId: session.id,
    clientSecret: session.client_secret ?? null,
    url: session.url ?? null,
    status: providerStatus,
    degraded: syncResult.degraded
  };
}

export async function startBarberConnectVerificationOnboarding(user: UserAccount): Promise<ConnectOnboardingLaunchResult> {
  requireSubjectRole(user, ["barber_user"]);
  if (!user.barberId) {
    throw new VerificationFlowError("A barber lane is required before starting payouts onboarding.", 409, "barber_lane_required");
  }

  const result = await createStripeConnectOnboardingSession(user, { subjectType: "barber" });
  const refreshedState = await readVerificationState([]);
  const profile = getProfileForRole(refreshedState, user, "barber");

  return {
    profileId: profile?.id ?? "",
    url: result.url,
    account: {
      subjectType: result.account.subjectType,
      operationalStatus: result.account.operationalStatus,
      onboardingStatus: result.account.onboardingStatus,
      payoutReadinessStatus: result.account.payoutReadinessStatus,
      chargesEnabled: result.account.chargesEnabled,
      payoutsEnabled: result.account.payoutsEnabled,
      requirementsCurrentlyDue: result.account.requirementsCurrentlyDue,
      requirementsPastDue: result.account.requirementsPastDue,
      disabledReason: result.account.disabledReason,
      missingSteps: result.account.missingSteps
    }
  };
}

export async function startOwnerConnectVerificationOnboarding(
  user: UserAccount,
  input?: { shopId?: string | null }
): Promise<ConnectOnboardingLaunchResult> {
  requireSubjectRole(user, ["shop_owner_user"]);
  const state = await readVerificationState([]);
  const shopId = getFirstShopIdForUser(state, user, input?.shopId);
  if (!shopId) {
    throw new VerificationFlowError("A shop lane is required before starting payouts onboarding.", 409, "shop_lane_required");
  }

  const result = await createStripeConnectOnboardingSession(user, {
    subjectType: "shop",
    shopId
  });
  const refreshedState = await readVerificationState([]);
  const profile = getProfileForRole(refreshedState, user, "shop_owner");

  return {
    profileId: profile?.id ?? "",
    url: result.url,
    account: {
      subjectType: result.account.subjectType,
      operationalStatus: result.account.operationalStatus,
      onboardingStatus: result.account.onboardingStatus,
      payoutReadinessStatus: result.account.payoutReadinessStatus,
      chargesEnabled: result.account.chargesEnabled,
      payoutsEnabled: result.account.payoutsEnabled,
      requirementsCurrentlyDue: result.account.requirementsCurrentlyDue,
      requirementsPastDue: result.account.requirementsPastDue,
      disabledReason: result.account.disabledReason,
      missingSteps: result.account.missingSteps
    }
  };
}

export async function processStripeIdentityWebhook(
  payload: string,
  signature: string
): Promise<VerificationWebhookResult> {
  let event: Stripe.Event;

  try {
    event = verifyStripeIdentityWebhookEvent(payload, signature);
  } catch (error) {
    if (
      (error instanceof StripeIdentityError || error instanceof StripeConnectError)
      && error.status === 503
    ) {
      throw new VerificationFlowError(
        error.message,
        503,
        error.code ?? "identity_webhook_not_configured"
      );
    }

    throw new VerificationFlowError(
      error instanceof Error ? error.message : "Unable to verify the Stripe Identity webhook signature.",
      400,
      "identity_webhook_invalid_signature"
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new VerificationFlowError(
      "Stripe Identity webhook audit storage is not configured for this environment.",
      503,
      "identity_webhook_audit_unavailable"
    );
  }

  let audit;
  try {
    audit = await beginStripeWebhookAudit(supabase, "identity", event);
  } catch (error) {
    if (error instanceof StripeWebhookAuditError) {
      throw new VerificationFlowError(error.message, error.status, error.code);
    }
    throw error;
  }

  if (audit.duplicate) {
    return {
      received: true,
      duplicate: true,
      status: audit.row.processing_status === "ignored" ? "ignored" : "processed"
    };
  }

  try {
    const supportedEvents = new Set([
      "identity.verification_session.processing",
      "identity.verification_session.requires_input",
      "identity.verification_session.verified",
      "identity.verification_session.canceled",
      "identity.verification_session.redacted"
    ]);
    if (!supportedEvents.has(event.type)) {
      await completeStripeWebhookAudit(supabase, audit.row.id, {
        processingStatus: "ignored",
        attemptCount: audit.row.attempt_count
      });

      return {
        received: true,
        duplicate: false,
        status: "ignored"
      };
    }

    const session = event.data.object as Stripe.Identity.VerificationSession;
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const lane = await resolveIdentityWebhookLane(session.id, metadata);
    const providerStatus = getStripeIdentitySessionStatus(session, event.type);

    const syncResult = await syncStripeIdentityVerificationLane({
      userId: lane.userId,
      barberId: lane.barberId,
      verificationProfileId: lane.verificationProfileId,
      sessionId: session.id,
      providerStatus,
      lastErrorCode: session.last_error?.code ?? null,
      lastErrorReason: session.last_error?.reason ?? null,
      redactionStatus: session.redaction?.status ?? null,
      lastEventId: event.id,
      lastEventType: event.type,
      livemode: session.livemode
    });

    if (syncResult.degraded) {
      throw new VerificationFlowError(
        "Stripe Identity state could not be persisted durably.",
        503,
        "identity_webhook_persistence_degraded"
      );
    }

    await completeStripeWebhookAudit(supabase, audit.row.id, {
      processingStatus: "processed",
      attemptCount: audit.row.attempt_count
    });

    return {
      received: true,
      duplicate: false,
      status: "processed"
    };
  } catch (error) {
    try {
      await completeStripeWebhookAudit(supabase, audit.row.id, {
        processingStatus: "failed",
        attemptCount: audit.row.attempt_count,
        errorMessage: error instanceof Error ? error.message : "Identity webhook sync failed."
      });
    } catch (auditError) {
      if (auditError instanceof StripeWebhookAuditError) {
        throw new VerificationFlowError(auditError.message, auditError.status, auditError.code);
      }
      throw auditError;
    }
    throw error;
  }
}

export { createEmptyVerificationMePayload };
