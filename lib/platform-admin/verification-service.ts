import { randomUUID } from "node:crypto";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoBarbers, demoUsers } from "@/lib/data/demo";
import { demoShops } from "@/lib/data/marketplace";
import {
  assertPlatformAdminAccess,
  readPlatformAdminAuditLogEntries,
  recordPlatformAdminAuditLog
} from "@/lib/platform-admin/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  computeBarberVerificationDecision,
  computeShopVerificationDecision,
  createInitialTrustState,
  normalizeVerificationStatus
} from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import {
  serializeVerificationDocumentForAdmin,
  summarizeVerificationProviderStatus
} from "@/lib/trust/serialization";
import { getTrustState, setTrustState } from "@/lib/trust/state";
import type { UserAccount } from "@/types/domain";
import type {
  ArchitectVerificationActionInput,
  ArchitectVerificationDetailPayload,
  ArchitectVerificationDocumentView,
  ArchitectVerificationProviderView,
  ArchitectVerificationQueueFilters,
  ArchitectVerificationQueueItem,
  ArchitectVerificationQueuePayload,
  ArchitectVerificationReviewView,
  PlatformAdminActionClass
} from "@/types/platform-admin";
import type {
  BarberVerificationRecord,
  ShopVerificationRecord,
  TrustState,
  VerificationActionType,
  VerificationDocumentRecord,
  VerificationProfileDecision,
  VerificationProfileRecord,
  VerificationReviewRecord,
  VerificationStatus,
  VerificationSubjectRole
} from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type VerificationSubject = {
  profileId: string;
  source: "profile" | "legacy_records" | "fallback";
  role: VerificationSubjectRole;
  userId?: string;
  barberId?: string;
  shopId?: string;
  profile?: VerificationProfileRecord;
};

const VERIFICATION_DEGRADED_WARNING = "Verification review data is partially unavailable. Core architect access is still active.";
const DOCUMENT_FALLBACK_BUCKET = "verification-private";

let trustOverlayState: Partial<TrustState> | null = null;

export class VerificationAccessError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "VerificationAccessError";
    this.status = status;
  }
}

export function isVerificationAccessError(error: unknown): error is VerificationAccessError {
  return error instanceof VerificationAccessError;
}

export function resetArchitectVerificationStateForTests() {
  trustOverlayState = null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function logArchitectVerificationError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[Architect Verification] ${context}`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return;
  }

  console.error(`[Architect Verification] ${context}`, error);
}

function pushWarning(warnings: string[], value: string) {
  const next = value.trim();
  if (!next || warnings.includes(next)) {
    return;
  }

  warnings.push(next);
}

function createSyntheticProfileId(role: VerificationSubjectRole, referenceId: string) {
  return role === "barber" ? `legacy-barber-${referenceId}` : `legacy-shop-${referenceId}`;
}

function isSyntheticProfileId(profileId: string) {
  return profileId.startsWith("legacy-barber-") || profileId.startsWith("legacy-shop-");
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

function mergeRowsById<T extends { id: string }>(base: T[] | undefined, overlay: T[] | undefined) {
  const rows = new Map<string, T>();

  for (const row of base ?? []) {
    rows.set(row.id, clone(row));
  }

  for (const row of overlay ?? []) {
    rows.set(row.id, clone(row));
  }

  return Array.from(rows.values());
}

function mergeTrustState(base: TrustState, overlay: Partial<TrustState> | null): TrustState {
  if (!overlay) {
    return base;
  }

  return {
    ...base,
    barberVerifications: mergeRowsById(base.barberVerifications, overlay.barberVerifications),
    shopVerifications: mergeRowsById(base.shopVerifications, overlay.shopVerifications),
    verificationDocuments: mergeRowsById(base.verificationDocuments, overlay.verificationDocuments),
    verificationProfiles: mergeRowsById(base.verificationProfiles, overlay.verificationProfiles),
    verificationReviews: mergeRowsById(base.verificationReviews, overlay.verificationReviews),
    verificationProviderLinks: mergeRowsById(base.verificationProviderLinks, overlay.verificationProviderLinks)
  };
}

function stageTrustOverlay(nextState: TrustState) {
  trustOverlayState = {
    barberVerifications: clone(nextState.barberVerifications),
    shopVerifications: clone(nextState.shopVerifications),
    verificationDocuments: clone(nextState.verificationDocuments),
    verificationProfiles: clone(nextState.verificationProfiles ?? []),
    verificationReviews: clone(nextState.verificationReviews ?? []),
    verificationProviderLinks: clone(nextState.verificationProviderLinks ?? [])
  };
}

async function readArchitectTrustState(warnings: string[] = []) {
  try {
    const provider = await getTrustProvider();
    const base = await provider.readState();
    return mergeTrustState(base, trustOverlayState);
  } catch (error) {
    logArchitectVerificationError("reading trust state", error);
    pushWarning(warnings, VERIFICATION_DEGRADED_WARNING);
    if (isSupabaseEnabled()) {
      return mergeTrustState(createInitialTrustState(), trustOverlayState);
    }

    return clone(getTrustState());
  }
}

export function createEmptyArchitectVerificationQueuePayload(warnings: string[] = []): ArchitectVerificationQueuePayload {
  return {
    items: [],
    warnings
  };
}

export function createEmptyArchitectVerificationDetailPayload(warnings: string[] = []): ArchitectVerificationDetailPayload {
  return {
    profile: null,
    warnings
  };
}

function getUser(userId?: string) {
  return userId ? demoUsers.find((user) => user.id === userId) : undefined;
}

function getReviewerLabel(userId: string) {
  return getUser(userId)?.name ?? userId;
}

function getShopForBarber(barberId: string) {
  const barber = demoBarbers.find((entry) => entry.id === barberId);
  if (!barber) {
    return undefined;
  }

  return demoShops.find((shop) => shop.locationIds.some((locationId) => barber.locationIds.includes(locationId)));
}

function toDisplayStatus(status?: VerificationStatus | null) {
  return status ?? "not_started";
}

function maxTimestamp(...values: Array<string | undefined>) {
  return values
    .filter(Boolean)
    .sort((left, right) => `${right}`.localeCompare(`${left}`))[0];
}

function getBarberRecords(state: TrustState, barberId: string) {
  return state.barberVerifications.filter((record) => record.barberId === barberId);
}

function getShopRecords(state: TrustState, shopId: string) {
  return state.shopVerifications.filter((record) => record.shopId === shopId);
}

function getBarberSubjectFromProfile(state: TrustState, profile: VerificationProfileRecord): VerificationSubject {
  const matchingRecord = state.barberVerifications.find((record) => record.verificationProfileId === profile.id || record.userId === profile.userId);
  const barber = matchingRecord ? demoBarbers.find((entry) => entry.id === matchingRecord.barberId) : demoBarbers.find((entry) => entry.userId === profile.userId);

  return {
    profileId: profile.id,
    source: "profile",
    role: "barber",
    userId: profile.userId,
    barberId: barber?.id ?? matchingRecord?.barberId,
    shopId: getShopForBarber(barber?.id ?? matchingRecord?.barberId ?? "")?.id,
    profile
  };
}

function getShopSubjectFromProfile(state: TrustState, profile: VerificationProfileRecord): VerificationSubject {
  const matchingRecord = state.shopVerifications.find((record) => record.verificationProfileId === profile.id || record.userId === profile.userId);

  return {
    profileId: profile.id,
    source: "profile",
    role: "shop_owner",
    userId: profile.userId,
    shopId: matchingRecord?.shopId,
    profile
  };
}

function collectVerificationSubjects(state: TrustState) {
  const subjects: VerificationSubject[] = [];
  const seenBarbers = new Set<string>();
  const seenShops = new Set<string>();

  for (const profile of state.verificationProfiles ?? []) {
    if (profile.role === "barber") {
      const subject = getBarberSubjectFromProfile(state, profile);
      if (subject.barberId) {
        seenBarbers.add(subject.barberId);
      }
      subjects.push(subject);
      continue;
    }

    if (profile.role === "shop_owner") {
      const subject = getShopSubjectFromProfile(state, profile);
      if (subject.shopId) {
        seenShops.add(subject.shopId);
      }
      subjects.push(subject);
    }
  }

  for (const record of state.barberVerifications) {
    if (seenBarbers.has(record.barberId)) {
      continue;
    }

    const barber = demoBarbers.find((entry) => entry.id === record.barberId);
    subjects.push({
      profileId: createSyntheticProfileId("barber", record.barberId),
      source: "legacy_records",
      role: "barber",
      userId: record.userId ?? barber?.userId,
      barberId: record.barberId,
      shopId: getShopForBarber(record.barberId)?.id
    });
    seenBarbers.add(record.barberId);
  }

  for (const record of state.shopVerifications) {
    if (seenShops.has(record.shopId)) {
      continue;
    }

    subjects.push({
      profileId: createSyntheticProfileId("shop_owner", record.shopId),
      source: "legacy_records",
      role: "shop_owner",
      userId: record.userId ?? "user-owner",
      shopId: record.shopId
    });
    seenShops.add(record.shopId);
  }

  return subjects;
}

function getSubjectByProfileId(state: TrustState, profileId: string) {
  const directProfile = (state.verificationProfiles ?? []).find((profile) => profile.id === profileId);
  if (directProfile) {
    return directProfile.role === "barber"
      ? getBarberSubjectFromProfile(state, directProfile)
      : getShopSubjectFromProfile(state, directProfile);
  }

  if (profileId.startsWith("legacy-barber-")) {
    const barberId = profileId.replace("legacy-barber-", "");
    const barber = demoBarbers.find((entry) => entry.id === barberId);
    if (!barber) {
      return null;
    }

    return {
      profileId,
      source: "legacy_records" as const,
      role: "barber" as const,
      userId: barber.userId,
      barberId,
      shopId: getShopForBarber(barberId)?.id
    };
  }

  if (profileId.startsWith("legacy-shop-")) {
    const shopId = profileId.replace("legacy-shop-", "");
    const record = state.shopVerifications.find((entry) => entry.shopId === shopId);
    if (!record) {
      return null;
    }

    return {
      profileId,
      source: "legacy_records" as const,
      role: "shop_owner" as const,
      userId: record.userId ?? "user-owner",
      shopId
    };
  }

  return null;
}

function buildQueueItemFromSubject(state: TrustState, subject: VerificationSubject): ArchitectVerificationQueueItem | null {
  if (subject.role === "barber" && subject.barberId) {
    const barber = demoBarbers.find((entry) => entry.id === subject.barberId);
    if (!barber) {
      return null;
    }

    const user = getUser(subject.userId ?? barber.userId);
    const decision = computeBarberVerificationDecision(state, subject.barberId);
    const records = getBarberRecords(state, subject.barberId);
    const licenseRecord = records.find((record) => record.category === "license_verification");
    const submittedAt = maxTimestamp(subject.profile?.createdAt, ...records.map((record) => record.verificationSubmittedAt ?? record.updatedAt));
    const lastReviewedAt = maxTimestamp(subject.profile?.lastReviewedAt, ...records.map((record) => record.lastReviewedAt ?? record.verificationReviewedAt));
    const updatedAt = maxTimestamp(subject.profile?.updatedAt, ...records.map((record) => record.updatedAt)) ?? new Date().toISOString();

    return {
      profileId: subject.profileId,
      source: subject.profile ? "profile" : subject.source,
      userId: user?.id ?? subject.userId,
      subjectName: user?.name ?? barber.name,
      subjectEmail: user?.email,
      subjectPhone: undefined,
      role: "barber",
      barberId: barber.id,
      shopId: subject.shopId,
      shopName: getShopForBarber(barber.id)?.name,
      overallStatus: subject.profile?.overallStatus ?? decision.canonicalOverallStatus,
      canonicalOverallStatus: decision.canonicalOverallStatus,
      identityStatus: toDisplayStatus(decision.identityStatus),
      licenseStatus: toDisplayStatus(decision.licenseStatus),
      businessStatus: toDisplayStatus(decision.businessStatus),
      payoutStatus: toDisplayStatus(decision.payoutStatus),
      complianceStatus: toDisplayStatus(decision.complianceStatus),
      publicVerified: decision.publicVerified,
      canAcceptBookings: decision.canAcceptBookings,
      canReceivePayouts: decision.canReceivePayouts,
      canCreateShopListing: decision.canCreateShopListing,
      lastReviewedAt,
      submittedAt,
      updatedAt,
      currentRequirementsCount: decision.currentRequirements.length,
      currentRequirements: decision.currentRequirements,
      licenseNumber: licenseRecord?.licenseNumber
    };
  }

  if (subject.role === "shop_owner" && subject.shopId) {
    const shop = demoShops.find((entry) => entry.id === subject.shopId);
    if (!shop) {
      return null;
    }

    const decision = computeShopVerificationDecision(state, subject.shopId);
    const records = getShopRecords(state, subject.shopId);
    const businessRecord = records.find((record) => record.category === "business_verification");
    const user = getUser(subject.userId ?? businessRecord?.userId);
    const submittedAt = maxTimestamp(subject.profile?.createdAt, ...records.map((record) => record.verificationSubmittedAt ?? record.updatedAt));
    const lastReviewedAt = maxTimestamp(subject.profile?.lastReviewedAt, ...records.map((record) => record.lastReviewedAt ?? record.verificationReviewedAt));
    const updatedAt = maxTimestamp(subject.profile?.updatedAt, ...records.map((record) => record.updatedAt)) ?? new Date().toISOString();

    return {
      profileId: subject.profileId,
      source: subject.profile ? "profile" : subject.source,
      userId: user?.id ?? subject.userId,
      subjectName: businessRecord?.businessName ?? shop.name,
      subjectEmail: user?.email,
      subjectPhone: undefined,
      role: "shop_owner",
      shopId: shop.id,
      shopName: shop.name,
      overallStatus: subject.profile?.overallStatus ?? decision.canonicalOverallStatus,
      canonicalOverallStatus: decision.canonicalOverallStatus,
      identityStatus: toDisplayStatus(decision.identityStatus),
      licenseStatus: toDisplayStatus(decision.licenseStatus),
      businessStatus: toDisplayStatus(decision.businessStatus),
      payoutStatus: toDisplayStatus(decision.payoutStatus),
      complianceStatus: toDisplayStatus(decision.complianceStatus),
      publicVerified: decision.publicVerified,
      canAcceptBookings: decision.canAcceptBookings,
      canReceivePayouts: decision.canReceivePayouts,
      canCreateShopListing: decision.canCreateShopListing,
      lastReviewedAt,
      submittedAt,
      updatedAt,
      currentRequirementsCount: decision.currentRequirements.length,
      currentRequirements: decision.currentRequirements,
      legalBusinessName: businessRecord?.businessName ?? shop.name
    };
  }

  return null;
}

function matchesStatusFilter(status: VerificationStatus, filter?: VerificationStatus | "all") {
  if (!filter || filter === "all") {
    return true;
  }

  return status === filter;
}

function matchesFilters(item: ArchitectVerificationQueueItem, filters: ArchitectVerificationQueueFilters) {
  if (filters.role && filters.role !== "all" && item.role !== filters.role) {
    return false;
  }

  if (!matchesStatusFilter(item.overallStatus, filters.overallStatus)) return false;
  if (!matchesStatusFilter(item.identityStatus, filters.identityStatus)) return false;
  if (!matchesStatusFilter(item.licenseStatus, filters.licenseStatus)) return false;
  if (!matchesStatusFilter(item.businessStatus, filters.businessStatus)) return false;
  if (!matchesStatusFilter(item.payoutStatus, filters.payoutStatus)) return false;
  if (!matchesStatusFilter(item.complianceStatus, filters.complianceStatus)) return false;

  if (filters.submittedOnly) {
    const submittedStatuses = new Set<VerificationStatus>(["submitted", "under_review", "pending"]);
    const hasSubmitted =
      submittedStatuses.has(item.overallStatus)
      || submittedStatuses.has(item.identityStatus)
      || submittedStatuses.has(item.licenseStatus)
      || submittedStatuses.has(item.businessStatus)
      || submittedStatuses.has(item.payoutStatus)
      || submittedStatuses.has(item.complianceStatus);

    if (!hasSubmitted) {
      return false;
    }
  }

  const query = filters.search?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const values = [
    item.subjectName,
    item.subjectEmail,
    item.barberId,
    item.shopId,
    item.shopName,
    item.licenseNumber,
    item.legalBusinessName
  ];

  return values.some((value) => `${value ?? ""}`.toLowerCase().includes(query));
}

function toDocumentView(document: VerificationDocumentRecord): ArchitectVerificationDocumentView {
  const view = serializeVerificationDocumentForAdmin(document);
  return {
    id: view.id,
    documentType: view.documentType,
    legacyCategory: view.legacyCategory,
    fileName: view.fileName,
    mimeType: view.mimeType,
    fileSizeBytes: view.fileSizeBytes,
    uploadedAt: view.uploadedAt,
    expiresAt: view.expiresAt,
    status: view.status,
    reviewNotes: view.reviewNotes
  };
}

function toReviewView(review: VerificationReviewRecord): ArchitectVerificationReviewView {
  return {
    id: review.id,
    reviewType: review.reviewType,
    actionType: review.actionType,
    fromStatus: review.fromStatus,
    toStatus: review.toStatus,
    reviewedBy: review.reviewedBy,
    reviewerLabel: getReviewerLabel(review.reviewedBy),
    reason: review.reason,
    internalNotes: review.internalNotes,
    createdAt: review.createdAt
  };
}

function toProviderView(record: NonNullable<TrustState["verificationProviderLinks"]>[number]): ArchitectVerificationProviderView {
  const summary = summarizeVerificationProviderStatus(record);
  return {
    id: record.id,
    provider: record.provider,
    providerSubject: record.providerSubject,
    providerReferenceId: record.providerReferenceId,
    providerStatus: record.providerStatus,
    summary: summary.summary,
    remediationMessage: summary.remediationMessage,
    disabledReason: summary.disabledReason,
    lastErrorCode: summary.lastErrorCode,
    lastErrorReason: summary.lastErrorReason,
    requirementsCurrentlyDue: summary.requirementsCurrentlyDue,
    requirementsPastDue: summary.requirementsPastDue,
    metadata: record.metadata,
    updatedAt: record.updatedAt
  };
}

function allowUserWideVerificationFallback(state: TrustState, subject: VerificationSubject) {
  if (!subject.userId) {
    return true;
  }

  return (state.verificationProfiles ?? []).filter((profile) => profile.userId === subject.userId).length <= 1;
}

function getProfileDocuments(state: TrustState, subject: VerificationSubject) {
  return state.verificationDocuments.filter((document) => {
    if (subject.profile?.id && document.verificationProfileId === subject.profile.id) {
      return true;
    }

    if (subject.role === "barber" && subject.barberId) {
      return document.ownerType === "barber" && document.ownerId === subject.barberId;
    }

    if (subject.role === "shop_owner" && subject.shopId) {
      return document.ownerType === "shop" && document.ownerId === subject.shopId;
    }

    return false;
  }).sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

function documentBelongsToSubject(document: VerificationDocumentRecord, subject: VerificationSubject) {
  if (subject.profile?.id && document.verificationProfileId === subject.profile.id) {
    return true;
  }

  if (subject.role === "barber" && subject.barberId) {
    return document.ownerType === "barber" && document.ownerId === subject.barberId;
  }

  if (subject.role === "shop_owner" && subject.shopId) {
    return document.ownerType === "shop" && document.ownerId === subject.shopId;
  }

  return false;
}

function getProfileReviews(state: TrustState, subject: VerificationSubject) {
  const profileIds = new Set<string>();
  if (subject.profile?.id) {
    profileIds.add(subject.profile.id);
  }
  if (!isSyntheticProfileId(subject.profileId)) {
    profileIds.add(subject.profileId);
  }

  return (state.verificationReviews ?? [])
    .filter((review) => profileIds.has(review.verificationProfileId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getProfileProviderLinks(state: TrustState, subject: VerificationSubject) {
  const allowUserFallback = allowUserWideVerificationFallback(state, subject);

  return (state.verificationProviderLinks ?? [])
    .filter((record) => {
      if (subject.profile?.id && record.verificationProfileId === subject.profile.id) {
        return true;
      }

      if (allowUserFallback && subject.userId && record.userId === subject.userId) {
        return true;
      }

      return false;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function getRelevantAuditEntries(
  auditEntries: Awaited<ReturnType<typeof readPlatformAdminAuditLogEntries>>,
  subject: VerificationSubject,
  documents: VerificationDocumentRecord[]
) {
  const targets = new Set<string>();
  targets.add(subject.profileId);
  if (subject.profile?.id) {
    targets.add(subject.profile.id);
  }
  if (subject.barberId) {
    targets.add(subject.barberId);
  }
  if (subject.shopId) {
    targets.add(subject.shopId);
  }
  for (const document of documents) {
    targets.add(document.id);
  }

  return auditEntries
    .filter((entry) =>
      entry.targetType === "verification_profile"
      || entry.targetType === "barber_verification"
      || entry.targetType === "shop_verification"
      || entry.targetType === "verification_document"
    )
    .filter((entry) => targets.has(entry.targetId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function resolveDetailPayload(profileId: string, warnings: string[]) {
  const state = await readArchitectTrustState(warnings);
  const subject = getSubjectByProfileId(state, profileId);
  if (!subject) {
    return createEmptyArchitectVerificationDetailPayload(warnings);
  }

  const item = buildQueueItemFromSubject(state, subject);
  if (!item) {
    return createEmptyArchitectVerificationDetailPayload(warnings);
  }

  const documents = getProfileDocuments(state, subject);
  const auditEntries = await readPlatformAdminAuditLogEntries().catch((error) => {
    logArchitectVerificationError("reading platform audit entries", error);
    pushWarning(warnings, "Verification audit history is temporarily unavailable.");
    return [];
  });

  const barberDetail = subject.role === "barber" && subject.barberId
    ? (() => {
        const records = getBarberRecords(state, subject.barberId);
        const identityRecord = records.find((record) => record.category === "identity_verification");
        const licenseRecord = records.find((record) => record.category === "license_verification");
        const payoutRecord = records.find((record) => record.category === "payout_verification");

        return {
          legalName: licenseRecord?.legalName ?? identityRecord?.legalName,
          professionalLicenseType: licenseRecord?.professionalLicenseType,
          licenseNumber: licenseRecord?.licenseNumber,
          issuingState: licenseRecord?.issuingState,
          expirationDate: licenseRecord?.expirationDate,
          providerIdentityStatus: identityRecord?.providerIdentityStatus,
          providerConnectStatus: payoutRecord?.providerConnectStatus ?? identityRecord?.providerConnectStatus
        };
      })()
    : undefined;

  const shopDetail = subject.role === "shop_owner" && subject.shopId
    ? (() => {
        const records = getShopRecords(state, subject.shopId);
        const businessRecord = records.find((record) => record.category === "business_verification");

        return {
          businessName: businessRecord?.businessName ?? item.legalBusinessName,
          dbaName: businessRecord?.dbaName,
          einLast4: businessRecord?.einLast4,
          stateOfRegistration: businessRecord?.stateOfRegistration,
          businessLicenseType: businessRecord?.businessLicenseType,
          shopLicenseNumber: businessRecord?.shopLicenseNumber,
          providerConnectStatus: businessRecord?.providerConnectStatus
        };
      })()
    : undefined;

  return {
    profile: {
      profileId: subject.profile?.id ?? subject.profileId,
      source: subject.profile ? "profile" : subject.source,
      userId: item.userId,
      subjectName: item.subjectName,
      subjectEmail: item.subjectEmail,
      subjectPhone: item.subjectPhone,
      role: item.role,
      barberId: item.barberId,
      shopId: item.shopId,
      shopName: item.shopName,
      overallStatus: item.overallStatus,
      canonicalOverallStatus: item.canonicalOverallStatus,
      identityStatus: item.identityStatus,
      licenseStatus: item.licenseStatus,
      businessStatus: item.businessStatus,
      payoutStatus: item.payoutStatus,
      complianceStatus: item.complianceStatus,
      publicVerified: item.publicVerified,
      canAcceptBookings: item.canAcceptBookings,
      canReceivePayouts: item.canReceivePayouts,
      canCreateShopListing: item.canCreateShopListing,
      currentRequirements: item.currentRequirements,
      reviewNotes: subject.profile?.reviewNotes,
      lastReviewedAt: item.lastReviewedAt,
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
      barberDetail,
      shopDetail,
      documents: documents.map(toDocumentView),
      reviews: getProfileReviews(state, subject).map(toReviewView),
      providerLinks: getProfileProviderLinks(state, subject).map(toProviderView),
      auditTrail: getRelevantAuditEntries(auditEntries, subject, documents)
    },
    warnings
  } satisfies ArchitectVerificationDetailPayload;
}

function getPayoutProviderReady(subject: VerificationSubject, state: TrustState, decision: VerificationProfileDecision) {
  if (normalizeVerificationStatus(decision.payoutStatus) === "approved") {
    return true;
  }

  const allowUserFallback = allowUserWideVerificationFallback(state, subject);

  return (state.verificationProviderLinks ?? []).some((record) => {
    if (subject.profile?.id && record.verificationProfileId && record.verificationProfileId !== subject.profile.id) {
      return false;
    }
    if (subject.userId && record.userId && record.userId !== subject.userId) {
      return false;
    }
    if (!allowUserFallback && subject.profile?.id && !record.verificationProfileId) {
      return false;
    }

    if (record.providerSubject !== "connect_account") {
      return false;
    }

    const payoutsEnabled = record.metadata?.payoutsEnabled;
    return payoutsEnabled === true || record.providerStatus === "payouts_enabled" || record.providerStatus === "approved";
  });
}

function setRelevantBarberStatuses(state: TrustState, barberId: string, status: VerificationStatus, note: string, reviewerId: string) {
  const now = new Date().toISOString();
  state.barberVerifications = state.barberVerifications.map((record) => {
    if (record.barberId !== barberId) {
      return record;
    }

    return {
      ...record,
      verificationStatus: status,
      verificationNotes: note,
      verificationReviewedAt: now,
      reviewedBy: reviewerId,
      lastReviewedAt: now,
      updatedAt: now
    };
  });
}

function setRelevantShopStatuses(state: TrustState, shopId: string, status: VerificationStatus, note: string, reviewerId: string) {
  const now = new Date().toISOString();
  state.shopVerifications = state.shopVerifications.map((record) => {
    if (record.shopId !== shopId) {
      return record;
    }

    return {
      ...record,
      verificationStatus: status,
      verificationNotes: note,
      verificationReviewedAt: now,
      reviewedBy: reviewerId,
      lastReviewedAt: now,
      updatedAt: now
    };
  });
}

function setDocumentReviewState(state: TrustState, documents: VerificationDocumentRecord[], status: VerificationStatus, note: string, reviewerId: string) {
  const targetIds = new Set(documents.map((document) => document.id));
  const now = new Date().toISOString();

  state.verificationDocuments = state.verificationDocuments.map((document) => {
    if (!targetIds.has(document.id)) {
      return document;
    }

    return {
      ...document,
      status,
      reviewedAt: now,
      reviewedBy: reviewerId,
      reviewNotes: note,
      updatedAt: now
    };
  });
}

function applyActionOverrides(
  profile: VerificationProfileRecord,
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate"
): VerificationProfileRecord {
  if (action === "reject") {
    return {
      ...profile,
      overallStatus: "rejected",
      publicVerified: false,
      canAcceptBookings: false,
      canReceivePayouts: false,
      canCreateShopListing: false
    };
  }

  if (action === "request_update") {
    return {
      ...profile,
      overallStatus: "needs_update",
      publicVerified: false,
      canAcceptBookings: false,
      canReceivePayouts: false,
      canCreateShopListing: false
    };
  }

  if (action === "suspend") {
    return {
      ...profile,
      overallStatus: "suspended",
      publicVerified: false,
      canAcceptBookings: false,
      canReceivePayouts: false,
      canCreateShopListing: false
    };
  }

  return profile;
}

function getProfileForSubject(state: TrustState, subject: VerificationSubject) {
  return (state.verificationProfiles ?? []).find((profile) =>
    profile.id === subject.profile?.id
    || (subject.userId && profile.userId === subject.userId && profile.role === subject.role)
  );
}

function replaceProfile(state: TrustState, profile: VerificationProfileRecord) {
  state.verificationProfiles = [
    profile,
    ...(state.verificationProfiles ?? []).filter((record) => record.id !== profile.id)
  ];
}

function linkSubjectRowsToProfile(state: TrustState, subject: VerificationSubject, profileId: string) {
  if (subject.role === "barber" && subject.barberId) {
    state.barberVerifications = state.barberVerifications.map((record) =>
      record.barberId === subject.barberId
        ? { ...record, userId: subject.userId ?? record.userId, verificationProfileId: profileId }
        : record
    );
    state.verificationDocuments = state.verificationDocuments.map((document) =>
      document.ownerType === "barber" && document.ownerId === subject.barberId
        ? { ...document, userId: subject.userId ?? document.userId, verificationProfileId: profileId }
        : document
    );
  }

  if (subject.role === "shop_owner" && subject.shopId) {
    state.shopVerifications = state.shopVerifications.map((record) =>
      record.shopId === subject.shopId
        ? { ...record, userId: subject.userId ?? record.userId, verificationProfileId: profileId }
        : record
    );
    state.verificationDocuments = state.verificationDocuments.map((document) =>
      document.ownerType === "shop" && document.ownerId === subject.shopId
        ? { ...document, userId: subject.userId ?? document.userId, shopId: subject.shopId ?? document.shopId, verificationProfileId: profileId }
        : document
    );
  }
}

function ensureReviewStateCollections(state: TrustState) {
  if (!state.verificationProfiles) state.verificationProfiles = [];
  if (!state.verificationReviews) state.verificationReviews = [];
  if (!state.verificationProviderLinks) state.verificationProviderLinks = [];
}

function ensureProfileForSubject(state: TrustState, subject: VerificationSubject) {
  const existing = getProfileForSubject(state, subject);
  if (existing) {
    subject.profile = existing;
    subject.profileId = existing.id;
    return existing;
  }

  const profile: VerificationProfileRecord = {
    id: `verification-profile-${randomUUID().slice(0, 8)}`,
    userId: subject.userId ?? `unknown-${subject.profileId}`,
    role: subject.role,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  replaceProfile(state, profile);
  linkSubjectRowsToProfile(state, subject, profile.id);
  subject.profile = profile;
  subject.profileId = profile.id;
  return profile;
}

function recomputeProfileState(state: TrustState, subject: VerificationSubject) {
  const profile = ensureProfileForSubject(state, subject);
  const now = new Date().toISOString();
  const decision = subject.role === "barber" && subject.barberId
    ? computeBarberVerificationDecision(state, subject.barberId)
    : subject.role === "shop_owner" && subject.shopId
      ? computeShopVerificationDecision(state, subject.shopId)
      : null;

  if (!decision) {
    return profile;
  }

  const nextProfile: VerificationProfileRecord = {
    ...profile,
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
    updatedAt: now
  };

  replaceProfile(state, nextProfile);
  subject.profile = nextProfile;
  subject.profileId = nextProfile.id;
  return nextProfile;
}

async function upsertSupabaseRows(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!rows.length) {
    return true;
  }

  const result = await supabase.from(table).upsert(rows, { onConflict });
  if (result.error) {
    if (isMissingTableError(result.error)) {
      return false;
    }

    throw result.error;
  }

  return true;
}

async function insertSupabaseRows(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return true;
  }

  const result = await supabase.from(table).insert(rows);
  if (result.error) {
    if (isMissingTableError(result.error)) {
      return false;
    }

    throw result.error;
  }

  return true;
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

function toVerificationDocumentRow(record: VerificationDocumentRecord) {
  return {
    id: record.id,
    owner_type: record.ownerType,
    owner_reference: record.ownerId,
    user_id: record.userId ?? null,
    shop_id: record.shopId ?? null,
    verification_profile_id: record.verificationProfileId ?? null,
    category: record.category,
    document_type: record.documentType ?? null,
    status: record.status ?? null,
    storage_bucket: record.storageBucket ?? DOCUMENT_FALLBACK_BUCKET,
    storage_path: record.storagePath,
    file_name: record.fileName ?? null,
    content_type: record.contentType ?? null,
    mime_type: record.mimeType ?? null,
    file_size_bytes: record.fileSizeBytes ?? null,
    secure_reference: record.secureReference ?? null,
    uploaded_at: record.uploadedAt,
    expires_at: record.expiresAt ?? null,
    issuing_state: record.issuingState ?? null,
    document_last4: record.documentLast4 ?? null,
    issued_at: record.issuedAt ?? null,
    reviewed_at: record.reviewedAt ?? null,
    reviewed_by: record.reviewedBy ?? null,
    review_notes: record.reviewNotes ?? null,
    updated_at: record.updatedAt ?? record.uploadedAt
  };
}

function toVerificationReviewRow(record: VerificationReviewRecord) {
  return {
    id: record.id,
    verification_profile_id: record.verificationProfileId,
    review_type: record.reviewType,
    action_type: record.actionType,
    from_status: record.fromStatus ?? null,
    to_status: record.toStatus ?? null,
    reviewed_by: record.reviewedBy,
    reason: record.reason ?? null,
    internal_notes: record.internalNotes ?? null,
    created_at: record.createdAt
  };
}

async function persistVerificationState(nextState: TrustState, subject: VerificationSubject, review?: VerificationReviewRecord) {
  const supabase = getSupabase();
  if (!supabase) {
    setTrustState(clone(nextState));
    return;
  }

  let usedFallback = false;
  const profile = subject.profile ? getProfileForSubject(nextState, subject) : null;
  const documents = getProfileDocuments(nextState, subject);

  try {
    if (profile) {
      const persisted = await upsertSupabaseRows(supabase, "verification_profiles", [toProfileRow(profile)], "user_id,role");
      usedFallback = usedFallback || !persisted;
    }

    if (subject.role === "barber" && subject.barberId) {
      const records = getBarberRecords(nextState, subject.barberId);
      const persisted = await upsertSupabaseRows(supabase, "barber_verifications", records.map(toBarberVerificationRow), "id");
      usedFallback = usedFallback || !persisted;
    }

    if (subject.role === "shop_owner" && subject.shopId) {
      const records = getShopRecords(nextState, subject.shopId);
      const persisted = await upsertSupabaseRows(supabase, "shop_verifications", records.map(toShopVerificationRow), "id");
      usedFallback = usedFallback || !persisted;
    }

    if (documents.length) {
      const persisted = await upsertSupabaseRows(supabase, "verification_documents", documents.map(toVerificationDocumentRow), "id");
      usedFallback = usedFallback || !persisted;
    }

    if (review) {
      const persisted = await insertSupabaseRows(supabase, "verification_reviews", [toVerificationReviewRow(review)]);
      usedFallback = usedFallback || !persisted;
    }
  } catch (error) {
    logArchitectVerificationError("persisting verification state", error);
    usedFallback = true;
  }

  if (usedFallback) {
    stageTrustOverlay(nextState);
  }
}

function updateProfileForAction(
  state: TrustState,
  subject: VerificationSubject,
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate",
  actor: UserAccount,
  input: ArchitectVerificationActionInput
) {
  ensureReviewStateCollections(state);
  const profile = ensureProfileForSubject(state, subject);
  const now = new Date().toISOString();
  const decision = subject.role === "barber" && subject.barberId
    ? computeBarberVerificationDecision(state, subject.barberId)
    : subject.role === "shop_owner" && subject.shopId
      ? computeShopVerificationDecision(state, subject.shopId)
      : null;
  const note = input.internalNotes?.trim() || input.reason.trim();
  const documents = getProfileDocuments(state, subject);

  if (action === "approve") {
    if (subject.role === "barber") {
      profile.identityStatus = "approved";
      profile.licenseStatus = "approved";
      profile.complianceStatus = "approved";
      if (decision && getPayoutProviderReady(subject, state, decision)) {
        profile.payoutStatus = "approved";
      }
      if (subject.barberId) {
        setRelevantBarberStatuses(state, subject.barberId, "approved", note, actor.id);
      }
    } else {
      profile.businessStatus = "approved";
      profile.complianceStatus = "approved";
      if (decision && getPayoutProviderReady(subject, state, decision)) {
        profile.payoutStatus = "approved";
      }
      if (subject.shopId) {
        setRelevantShopStatuses(state, subject.shopId, "approved", note, actor.id);
      }
    }

    setDocumentReviewState(state, documents, "approved", note, actor.id);
    profile.overallStatus = "not_started";
  }

  if (action === "reject") {
    profile.overallStatus = "rejected";
    if (subject.role === "barber" && subject.barberId) {
      if (normalizeVerificationStatus(profile.identityStatus) !== "approved") profile.identityStatus = "rejected";
      if (normalizeVerificationStatus(profile.licenseStatus) !== "approved") profile.licenseStatus = "rejected";
      if (normalizeVerificationStatus(profile.complianceStatus) !== "approved") profile.complianceStatus = "rejected";
      setRelevantBarberStatuses(state, subject.barberId, "rejected", note, actor.id);
    }
    if (subject.role === "shop_owner" && subject.shopId) {
      if (normalizeVerificationStatus(profile.businessStatus) !== "approved") profile.businessStatus = "rejected";
      if (normalizeVerificationStatus(profile.complianceStatus) !== "approved") profile.complianceStatus = "rejected";
      setRelevantShopStatuses(state, subject.shopId, "rejected", note, actor.id);
    }
    setDocumentReviewState(state, documents, "rejected", note, actor.id);
  }

  if (action === "request_update") {
    profile.overallStatus = "needs_update";
    if (subject.role === "barber" && subject.barberId) {
      if (normalizeVerificationStatus(profile.identityStatus) !== "approved") profile.identityStatus = "needs_update";
      if (normalizeVerificationStatus(profile.licenseStatus) !== "approved") profile.licenseStatus = "needs_update";
      if (normalizeVerificationStatus(profile.complianceStatus) !== "approved") profile.complianceStatus = "needs_update";
      setRelevantBarberStatuses(state, subject.barberId, "needs_update", note, actor.id);
    }
    if (subject.role === "shop_owner" && subject.shopId) {
      if (normalizeVerificationStatus(profile.businessStatus) !== "approved") profile.businessStatus = "needs_update";
      if (normalizeVerificationStatus(profile.complianceStatus) !== "approved") profile.complianceStatus = "needs_update";
      setRelevantShopStatuses(state, subject.shopId, "needs_update", note, actor.id);
    }
    setDocumentReviewState(state, documents, "needs_update", note, actor.id);
  }

  if (action === "suspend") {
    profile.overallStatus = "suspended";
    profile.publicVerified = false;
    profile.canAcceptBookings = false;
    profile.canReceivePayouts = false;
    profile.canCreateShopListing = false;
  }

  if (action === "reactivate" && normalizeVerificationStatus(profile.overallStatus) === "suspended") {
    profile.overallStatus = "not_started";
  }

  profile.reviewNotes = note;
  profile.reviewedBy = actor.id;
  profile.lastReviewedAt = now;
  profile.updatedAt = now;
  replaceProfile(state, profile);
  const nextProfile = applyActionOverrides(recomputeProfileState(state, subject), action);
  nextProfile.reviewNotes = note;
  nextProfile.reviewedBy = actor.id;
  nextProfile.lastReviewedAt = now;
  nextProfile.updatedAt = now;
  replaceProfile(state, nextProfile);
  subject.profile = nextProfile;

  return nextProfile;
}

function createReviewRecord(
  profile: VerificationProfileRecord,
  actor: UserAccount,
  actionType: VerificationActionType,
  fromStatus: VerificationStatus,
  toStatus: VerificationStatus,
  input: ArchitectVerificationActionInput
): VerificationReviewRecord {
  return {
    id: `verification-review-${randomUUID().slice(0, 8)}`,
    verificationProfileId: profile.id,
    reviewType: "overall",
    actionType,
    fromStatus,
    toStatus,
    reviewedBy: actor.id,
    reason: input.reason.trim(),
    internalNotes: input.internalNotes?.trim() || undefined,
    createdAt: new Date().toISOString()
  };
}

function getActionClass(action: "approve" | "reject" | "request_update" | "suspend" | "reactivate"): PlatformAdminActionClass {
  return action === "suspend" ? "critical" : "sensitive";
}

const auditActionMap: Record<"approve" | "reject" | "request_update" | "suspend" | "reactivate", string> = {
  approve: "verification_approved",
  reject: "verification_rejected",
  request_update: "verification_requested_update",
  suspend: "verification_suspended",
  reactivate: "verification_reactivated"
};

async function executeReviewAction(
  actor: UserAccount,
  profileId: string,
  input: ArchitectVerificationActionInput,
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate"
) {
  assertPlatformAdminAccess(actor);

  const state = clone(await readArchitectTrustState());
  const subject = getSubjectByProfileId(state, profileId);
  if (!subject) {
    throw new Error("Verification profile not found.");
  }

  const before = buildQueueItemFromSubject(state, subject);
  if (!before) {
    throw new Error("Verification profile could not be resolved.");
  }

  const beforeStatus = before.canonicalOverallStatus;
  const nextProfile = updateProfileForAction(state, subject, action, actor, input);
  const after = buildQueueItemFromSubject(state, subject);
  if (!after) {
    throw new Error("Updated verification profile could not be resolved.");
  }

  ensureReviewStateCollections(state);
  const reviewActionType: VerificationActionType =
    action === "approve" ? "approved" :
    action === "reject" ? "rejected" :
    action === "request_update" ? "requested_update" :
    action === "reactivate" ? "reactivated" :
    "suspended";
  const review = createReviewRecord(nextProfile, actor, reviewActionType, beforeStatus, after.canonicalOverallStatus, input);
  state.verificationReviews = [review, ...(state.verificationReviews ?? [])];

  await persistVerificationState(state, subject, review);
  if (!getSupabase()) {
    setTrustState(clone(state));
  }

  await recordPlatformAdminAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    actionClass: getActionClass(action),
    actionType: auditActionMap[action],
    targetType: "verification_profile",
    targetId: nextProfile.id,
    note: input.reason.trim(),
    beforeSummary: `${before.subjectName} verification was ${before.canonicalOverallStatus}.`,
    afterSummary: `${after.subjectName} verification is now ${after.canonicalOverallStatus}.`,
    metadata: {
      profileId: nextProfile.id,
      role: nextProfile.role,
      subjectName: after.subjectName,
      internalNotes: input.internalNotes?.trim() || null
    }
  });

  return {
    ok: true,
    profileId: nextProfile.id
  };
}

export async function listVerificationProfilesForArchitect(
  actor: UserAccount,
  filters: ArchitectVerificationQueueFilters = {}
): Promise<ArchitectVerificationQueuePayload> {
  assertPlatformAdminAccess(actor);
  const warnings: string[] = [];

  try {
    const state = await readArchitectTrustState(warnings);
    const items = collectVerificationSubjects(state)
      .map((subject) => buildQueueItemFromSubject(state, subject))
      .filter((item): item is ArchitectVerificationQueueItem => Boolean(item))
      .filter((item) => matchesFilters(item, filters))
      .sort((left, right) => `${right.updatedAt}`.localeCompare(`${left.updatedAt}`));

    return {
      items,
      warnings
    };
  } catch (error) {
    logArchitectVerificationError("listing verification profiles", error);
    pushWarning(warnings, VERIFICATION_DEGRADED_WARNING);
    return createEmptyArchitectVerificationQueuePayload(warnings);
  }
}

export async function getVerificationProfileDetail(actor: UserAccount, profileId: string): Promise<ArchitectVerificationDetailPayload> {
  assertPlatformAdminAccess(actor);
  const warnings: string[] = [];

  try {
    return await resolveDetailPayload(profileId, warnings);
  } catch (error) {
    logArchitectVerificationError("loading verification profile detail", error);
    pushWarning(warnings, VERIFICATION_DEGRADED_WARNING);
    return createEmptyArchitectVerificationDetailPayload(warnings);
  }
}

export async function approveVerificationProfile(actor: UserAccount, profileId: string, input: ArchitectVerificationActionInput) {
  return executeReviewAction(actor, profileId, input, "approve");
}

export async function rejectVerificationProfile(actor: UserAccount, profileId: string, input: ArchitectVerificationActionInput) {
  return executeReviewAction(actor, profileId, input, "reject");
}

export async function requestVerificationUpdate(actor: UserAccount, profileId: string, input: ArchitectVerificationActionInput) {
  return executeReviewAction(actor, profileId, input, "request_update");
}

export async function suspendVerificationProfile(actor: UserAccount, profileId: string, input: ArchitectVerificationActionInput) {
  return executeReviewAction(actor, profileId, input, "suspend");
}

export async function reactivateVerificationProfile(actor: UserAccount, profileId: string, input: ArchitectVerificationActionInput) {
  return executeReviewAction(actor, profileId, input, "reactivate");
}

export async function assertVerificationDocumentAccess(documentId: string, actor: UserAccount): Promise<VerificationDocumentRecord> {
  const state = await readArchitectTrustState();
  const document = state.verificationDocuments.find((entry) => entry.id === documentId);
  if (!document) {
    throw new VerificationAccessError("Verification document not found.", 404);
  }

  if (isPlatformAdminUser(actor)) {
    return document;
  }

  if (document.userId && actor.id === document.userId) {
    return document;
  }

  if (document.ownerType === "barber" && actor.barberId && actor.barberId === document.ownerId) {
    return document;
  }

  throw new VerificationAccessError("You do not have access to this verification document.", 403);
}

export async function createVerificationDocumentSignedUrl(documentId: string, actor: UserAccount) {
  const document = await assertVerificationDocumentAccess(documentId, actor);
  const bucket = document.storageBucket ?? DOCUMENT_FALLBACK_BUCKET;
  const supabase = getSupabase();

  if (!supabase) {
    return {
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(`Demo verification document preview for ${document.fileName ?? document.id}. Secure storage path remains private.`)}`
    };
  }

  const result = await supabase.storage.from(bucket).createSignedUrl(document.storagePath, 60);
  if (result.error) {
    throw new VerificationAccessError("Unable to create a secure verification document URL.", 500);
  }

  return {
    url: result.data.signedUrl
  };
}

export async function createArchitectVerificationDocumentSignedUrl(profileId: string, documentId: string, actor: UserAccount) {
  assertPlatformAdminAccess(actor);

  const state = await readArchitectTrustState();
  const subject = getSubjectByProfileId(state, profileId);
  if (!subject) {
    throw new VerificationAccessError("Verification profile not found.", 404);
  }

  const document = state.verificationDocuments.find((entry) => entry.id === documentId);
  if (!document || !documentBelongsToSubject(document, subject)) {
    throw new VerificationAccessError("Verification document not found for this profile.", 404);
  }

  const result = await createVerificationDocumentSignedUrl(documentId, actor);
  await recordPlatformAdminAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    actionClass: "sensitive",
    actionType: "verification_document_signed_url_issued",
    targetType: "verification_document",
    targetId: document.id,
    note: "Secure verification document access issued for architect review.",
    beforeSummary: `${subject.profileId} document access requested.`,
    afterSummary: `${document.fileName ?? document.id} secure review link issued.`,
    metadata: {
      profileId,
      documentId: document.id
    }
  });

  return result;
}
