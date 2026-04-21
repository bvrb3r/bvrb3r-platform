import { randomUUID } from "node:crypto";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvents,
  type PlatformEventType
} from "@/lib/core/platform-events";
import {
  assertPlatformAdminAccess,
  readPlatformAdminAuditLogEntries,
  recordPlatformAdminAuditLog
} from "@/lib/platform-admin/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  computeBarberVerificationDecision,
  computeShopVerificationDecision,
  createEmptyTrustState,
  normalizeVerificationStatus
} from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import {
  serializeVerificationDocumentForAdmin,
  summarizeVerificationProviderStatus
} from "@/lib/trust/serialization";
import { getTrustState, setTrustState } from "@/lib/trust/state";
import type { ApprovalStatus, UserAccount } from "@/types/domain";
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
  profileRow?: ProductionProfileRow;
  barberRow?: ProductionBarberRow;
  shopRow?: ProductionShopRow;
};

type ProductionProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role: string | null;
  onboarding_state: string | null;
  created_at?: string | null;
};

type ProductionBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: string | null;
  barber_subtype?: string | null;
  app_approval_status?: ApprovalStatus | null;
  shop_approval_status?: ApprovalStatus | null;
  created_at?: string | null;
};

type ProductionShopRow = {
  id: string;
  name: string | null;
  owner_profile_id: string | null;
  app_approval_status?: ApprovalStatus | null;
  created_at?: string | null;
};

type ProductionVerificationIndex = {
  profilesById: Map<string, ProductionProfileRow>;
  barbersByReference: Map<string, ProductionBarberRow>;
  barbersByProfileId: Map<string, ProductionBarberRow>;
  shopsById: Map<string, ProductionShopRow>;
  shopsByOwnerProfileId: Map<string, ProductionShopRow>;
};

const VERIFICATION_DEGRADED_WARNING = "Verification review data is partially unavailable. Core architect access is still active.";
const DOCUMENT_FALLBACK_BUCKET = "verification-private";

let trustOverlayState: Partial<TrustState> | null = null;
let productionOverlayIndex: ProductionVerificationIndex | null = null;

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
  stageTrustOverlay(getTrustState());
  productionOverlayIndex = null;
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

function createEmptyProductionVerificationIndex(): ProductionVerificationIndex {
  return {
    profilesById: new Map(),
    barbersByReference: new Map(),
    barbersByProfileId: new Map(),
    shopsById: new Map(),
    shopsByOwnerProfileId: new Map()
  };
}

function cloneProductionVerificationIndex(index: ProductionVerificationIndex): ProductionVerificationIndex {
  const cloneIndex = createEmptyProductionVerificationIndex();
  for (const [key, value] of index.profilesById) cloneIndex.profilesById.set(key, clone(value));
  for (const [key, value] of index.barbersByReference) cloneIndex.barbersByReference.set(key, clone(value));
  for (const [key, value] of index.barbersByProfileId) cloneIndex.barbersByProfileId.set(key, clone(value));
  for (const [key, value] of index.shopsById) cloneIndex.shopsById.set(key, clone(value));
  for (const [key, value] of index.shopsByOwnerProfileId) cloneIndex.shopsByOwnerProfileId.set(key, clone(value));
  return cloneIndex;
}

export function stageArchitectProductionVerificationRowsForTests(input: {
  profiles?: ProductionProfileRow[];
  barbers?: ProductionBarberRow[];
  shops?: ProductionShopRow[];
}) {
  const index = createEmptyProductionVerificationIndex();
  for (const profile of input.profiles ?? []) {
    index.profilesById.set(profile.id, clone(profile));
  }
  for (const barber of input.barbers ?? []) {
    const barberReference = productionReference(barber);
    if (barberReference) {
      index.barbersByReference.set(barberReference, clone(barber));
    }
    index.barbersByProfileId.set(barber.profile_id, clone(barber));
  }
  for (const shop of input.shops ?? []) {
    index.shopsById.set(shop.id, clone(shop));
    if (shop.owner_profile_id) {
      index.shopsByOwnerProfileId.set(shop.owner_profile_id, clone(shop));
    }
  }
  productionOverlayIndex = index;
}

function productionReference(row: { id?: string; reference_code?: string | null } | null | undefined) {
  return row?.reference_code ?? row?.id ?? "";
}

async function readProductionVerificationIndex(warnings: string[] = []): Promise<ProductionVerificationIndex> {
  const supabase = getSupabase();
  if (!supabase) {
    return productionOverlayIndex ? cloneProductionVerificationIndex(productionOverlayIndex) : createEmptyProductionVerificationIndex();
  }

  try {
    const [profilesResult, barbersResult, shopsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, primary_onboarding_role, onboarding_state, created_at")
        .in("primary_onboarding_role", ["barber", "shop_owner"]),
      supabase
        .from("barbers")
        .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, created_at"),
      supabase
        .from("shops")
        .select("id, name, owner_profile_id, app_approval_status, created_at")
    ]);

    for (const result of [profilesResult, barbersResult, shopsResult]) {
      if (result.error) {
        throw result.error;
      }
    }

    const profiles = (profilesResult.data ?? []) as ProductionProfileRow[];
    const barbers = (barbersResult.data ?? []) as ProductionBarberRow[];
    const shops = (shopsResult.data ?? []) as ProductionShopRow[];
    const index = createEmptyProductionVerificationIndex();

    for (const profile of profiles) {
      index.profilesById.set(profile.id, profile);
    }

    for (const barber of barbers) {
      const barberReference = productionReference(barber);
      if (barberReference) {
        index.barbersByReference.set(barberReference, barber);
      }
      index.barbersByProfileId.set(barber.profile_id, barber);
    }

    for (const shop of shops) {
      index.shopsById.set(shop.id, shop);
      if (shop.owner_profile_id) {
        index.shopsByOwnerProfileId.set(shop.owner_profile_id, shop);
      }
    }

    return productionOverlayIndex ? cloneProductionVerificationIndex(productionOverlayIndex) : index;
  } catch (error) {
    logArchitectVerificationError("reading production verification subjects", error);
    pushWarning(warnings, "Canonical barber and shop-owner account rows are temporarily unavailable.");
    return productionOverlayIndex ? cloneProductionVerificationIndex(productionOverlayIndex) : createEmptyProductionVerificationIndex();
  }
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
      return mergeTrustState(createEmptyTrustState(), trustOverlayState);
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

function getReviewerLabel(userId: string) {
  return userId;
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

function approvalStatusToVerificationStatus(status?: ApprovalStatus | null): VerificationStatus | null {
  switch (status) {
    case "approved":
      return "approved";
    case "under_review":
      return "under_review";
    case "pending":
      return "submitted";
    case "rejected":
      return "rejected";
    case "not_required":
    default:
      return null;
  }
}

function getProductionProfileForRole(
  production: ProductionVerificationIndex,
  profileId: string | undefined,
  role: VerificationSubjectRole
) {
  if (!profileId) {
    return undefined;
  }

  const profile = production.profilesById.get(profileId);
  return profile?.primary_onboarding_role === role ? profile : undefined;
}

function getBarberSubjectFromProfile(state: TrustState, profile: VerificationProfileRecord, production = createEmptyProductionVerificationIndex()): VerificationSubject | null {
  const matchingRecord = state.barberVerifications.find((record) => record.verificationProfileId === profile.id || record.userId === profile.userId);
  const productionBarber = matchingRecord
    ? production.barbersByReference.get(matchingRecord.barberId)
    : production.barbersByProfileId.get(profile.userId);
  const profileRow = getProductionProfileForRole(production, productionBarber?.profile_id ?? profile.userId, "barber");
  const barberId = productionBarber ? productionReference(productionBarber) : "";

  if (!profileRow || !productionBarber || !barberId) {
    return null;
  }

  return {
    profileId: profile.id,
    source: "profile",
    role: "barber",
    userId: profileRow.id,
    barberId,
    profile,
    profileRow,
    barberRow: productionBarber
  };
}

function getShopSubjectFromProfile(state: TrustState, profile: VerificationProfileRecord, production = createEmptyProductionVerificationIndex()): VerificationSubject | null {
  const matchingRecord = state.shopVerifications.find((record) => record.verificationProfileId === profile.id || record.userId === profile.userId);
  const productionShop = matchingRecord
    ? production.shopsById.get(matchingRecord.shopId)
    : production.shopsByOwnerProfileId.get(profile.userId);
  const profileRow = getProductionProfileForRole(production, productionShop?.owner_profile_id ?? profile.userId, "shop_owner");

  if (!profileRow || !productionShop?.id) {
    return null;
  }

  return {
    profileId: profile.id,
    source: "profile",
    role: "shop_owner",
    userId: profileRow.id,
    shopId: productionShop.id,
    profile,
    profileRow,
    shopRow: productionShop
  };
}

function collectVerificationSubjects(state: TrustState, production = createEmptyProductionVerificationIndex()) {
  const subjects: VerificationSubject[] = [];
  const seenBarbers = new Set<string>();
  const seenShops = new Set<string>();

  for (const profile of state.verificationProfiles ?? []) {
    if (profile.role === "barber") {
      const subject = getBarberSubjectFromProfile(state, profile, production);
      if (subject?.barberId) {
        seenBarbers.add(subject.barberId);
        subjects.push(subject);
      }
      continue;
    }

    if (profile.role === "shop_owner") {
      const subject = getShopSubjectFromProfile(state, profile, production);
      if (subject?.shopId) {
        seenShops.add(subject.shopId);
        subjects.push(subject);
      }
    }
  }

  for (const record of state.barberVerifications) {
    if (seenBarbers.has(record.barberId)) {
      continue;
    }

    const productionBarber = production.barbersByReference.get(record.barberId);
    const profileRow = getProductionProfileForRole(production, record.userId ?? productionBarber?.profile_id, "barber");
    if (!productionBarber || !profileRow) {
      continue;
    }
    const barberReference = productionReference(productionBarber);
    if (!barberReference) {
      continue;
    }
    subjects.push({
      profileId: createSyntheticProfileId("barber", barberReference),
      source: "legacy_records",
      role: "barber",
      userId: profileRow.id,
      barberId: barberReference,
      profileRow,
      barberRow: productionBarber
    });
    seenBarbers.add(barberReference);
  }

  for (const record of state.shopVerifications) {
    if (seenShops.has(record.shopId)) {
      continue;
    }

    const productionShop = production.shopsById.get(record.shopId);
    const profileRow = getProductionProfileForRole(production, record.userId ?? productionShop?.owner_profile_id ?? undefined, "shop_owner");
    if (!productionShop || !profileRow) {
      continue;
    }

    subjects.push({
      profileId: createSyntheticProfileId("shop_owner", record.shopId),
      source: "legacy_records",
      role: "shop_owner",
      userId: profileRow.id,
      shopId: record.shopId,
      profileRow,
      shopRow: productionShop
    });
    seenShops.add(record.shopId);
  }

  return subjects;
}

function getSubjectByProfileId(state: TrustState, profileId: string, production = createEmptyProductionVerificationIndex()) {
  const directProfile = (state.verificationProfiles ?? []).find((profile) => profile.id === profileId);
  if (directProfile) {
    return directProfile.role === "barber"
      ? getBarberSubjectFromProfile(state, directProfile, production)
      : getShopSubjectFromProfile(state, directProfile, production);
  }

  if (profileId.startsWith("legacy-barber-")) {
    const barberId = profileId.replace("legacy-barber-", "");
    const productionBarber = production.barbersByReference.get(barberId);
    const profileRow = getProductionProfileForRole(production, productionBarber?.profile_id, "barber");
    if (!productionBarber || !profileRow) {
      return null;
    }

    return {
      profileId,
      source: "legacy_records" as const,
      role: "barber" as const,
      userId: profileRow.id,
      barberId,
      profileRow,
      barberRow: productionBarber
    };
  }

  if (profileId.startsWith("legacy-shop-")) {
    const shopId = profileId.replace("legacy-shop-", "");
    const record = state.shopVerifications.find((entry) => entry.shopId === shopId);
    const productionShop = production.shopsById.get(shopId);
    const profileRow = getProductionProfileForRole(production, record?.userId ?? productionShop?.owner_profile_id ?? undefined, "shop_owner");
    if (!record || !productionShop || !profileRow) {
      return null;
    }

    return {
      profileId,
      source: "legacy_records" as const,
      role: "shop_owner" as const,
      userId: profileRow.id,
      shopId,
      profileRow,
      shopRow: productionShop
    };
  }

  return null;
}

function buildQueueItemFromSubject(state: TrustState, subject: VerificationSubject): ArchitectVerificationQueueItem | null {
  if (subject.role === "barber" && subject.barberId) {
    const productionBarber = subject.barberRow;
    const profileRow = subject.profileRow;
    if (!productionBarber || !profileRow) {
      return null;
    }

    const decision = computeBarberVerificationDecision(state, subject.barberId);
    const approvalStatus = approvalStatusToVerificationStatus(productionBarber.app_approval_status ?? productionBarber.shop_approval_status);
    const overallStatus = subject.profile?.overallStatus ?? approvalStatus ?? decision.canonicalOverallStatus;
    const records = getBarberRecords(state, subject.barberId);
    const licenseRecord = records.find((record) => record.category === "license_verification");
    const submittedAt = maxTimestamp(subject.profile?.createdAt, profileRow?.created_at ?? undefined, productionBarber?.created_at ?? undefined, ...records.map((record) => record.verificationSubmittedAt ?? record.updatedAt));
    const lastReviewedAt = maxTimestamp(subject.profile?.lastReviewedAt, ...records.map((record) => record.lastReviewedAt ?? record.verificationReviewedAt));
    const updatedAt = maxTimestamp(subject.profile?.updatedAt, productionBarber?.created_at ?? undefined, ...records.map((record) => record.updatedAt)) ?? new Date().toISOString();

    return {
      profileId: subject.profileId,
      source: subject.profile ? "profile" : subject.source,
      userId: profileRow.id,
      subjectName: profileRow.full_name ?? profileRow.email ?? productionReference(productionBarber) ?? "Barber",
      subjectEmail: profileRow.email ?? undefined,
      subjectPhone: profileRow.phone ?? undefined,
      role: "barber",
      barberId: subject.barberId,
      shopId: subject.shopId,
      shopName: subject.shopRow?.name ?? undefined,
      overallStatus,
      canonicalOverallStatus: normalizeVerificationStatus(overallStatus),
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
    const productionShop = subject.shopRow;
    const profileRow = subject.profileRow;
    if (!productionShop || !profileRow) {
      return null;
    }

    const decision = computeShopVerificationDecision(state, subject.shopId);
    const approvalStatus = approvalStatusToVerificationStatus(productionShop.app_approval_status);
    const overallStatus = subject.profile?.overallStatus ?? approvalStatus ?? decision.canonicalOverallStatus;
    const records = getShopRecords(state, subject.shopId);
    const businessRecord = records.find((record) => record.category === "business_verification");
    const submittedAt = maxTimestamp(subject.profile?.createdAt, profileRow?.created_at ?? undefined, productionShop?.created_at ?? undefined, ...records.map((record) => record.verificationSubmittedAt ?? record.updatedAt));
    const lastReviewedAt = maxTimestamp(subject.profile?.lastReviewedAt, ...records.map((record) => record.lastReviewedAt ?? record.verificationReviewedAt));
    const updatedAt = maxTimestamp(subject.profile?.updatedAt, productionShop?.created_at ?? undefined, ...records.map((record) => record.updatedAt)) ?? new Date().toISOString();
    const shopName = productionShop.name ?? subject.shopId;

    return {
      profileId: subject.profileId,
      source: subject.profile ? "profile" : subject.source,
      userId: profileRow.id,
      subjectName: businessRecord?.businessName ?? shopName,
      subjectEmail: profileRow.email ?? undefined,
      subjectPhone: profileRow.phone ?? undefined,
      role: "shop_owner",
      shopId: subject.shopId,
      shopName,
      overallStatus,
      canonicalOverallStatus: normalizeVerificationStatus(overallStatus),
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
      legalBusinessName: businessRecord?.businessName ?? shopName
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
  const production = await readProductionVerificationIndex(warnings);
  const subject = getSubjectByProfileId(state, profileId, production);
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
    id: randomUUID(),
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

function getSubjectDisplayName(subject: VerificationSubject) {
  if (subject.role === "shop_owner") {
    return subject.shopRow?.name ?? subject.profileRow?.full_name ?? subject.shopId ?? subject.userId ?? "Shop owner";
  }

  return subject.profileRow?.full_name
    ?? subject.profileRow?.email
    ?? subject.barberId
    ?? "Barber";
}

function ensureSubjectVerificationRecords(
  state: TrustState,
  subject: VerificationSubject,
  profile: VerificationProfileRecord,
  initialStatus: VerificationStatus = "submitted"
) {
  const now = new Date().toISOString();

  if (subject.role === "barber" && subject.barberId) {
    const legalName = getSubjectDisplayName(subject);
    const categories: BarberVerificationRecord["category"][] = [
      "identity_verification",
      "license_verification",
      "payout_verification"
    ];

    for (const category of categories) {
      if (state.barberVerifications.some((record) => record.barberId === subject.barberId && record.category === category)) {
        continue;
      }

      state.barberVerifications.push({
        id: `barber-verification-${randomUUID().slice(0, 8)}`,
        barberId: subject.barberId,
        category,
        legalName,
        userId: subject.userId,
        verificationProfileId: profile.id,
        verificationStatus: initialStatus,
        verificationSubmittedAt: now,
        updatedAt: now
      });
    }
  }

  if (subject.role === "shop_owner" && subject.shopId) {
    const businessName = getSubjectDisplayName(subject);
    const categories: ShopVerificationRecord["category"][] = [
      "business_verification",
      "ownership_verification"
    ];

    for (const category of categories) {
      if (state.shopVerifications.some((record) => record.shopId === subject.shopId && record.category === category)) {
        continue;
      }

      state.shopVerifications.push({
        id: `shop-verification-${randomUUID().slice(0, 8)}`,
        shopId: subject.shopId,
        category,
        businessName,
        userId: subject.userId,
        verificationProfileId: profile.id,
        verificationStatus: initialStatus,
        verificationSubmittedAt: now,
        updatedAt: now
      });
    }
  }
}

function getCanonicalApprovalStatusForAction(
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate",
  profile: VerificationProfileRecord
): ApprovalStatus {
  if (action === "approve") {
    return "approved";
  }

  if (action === "reject") {
    return "rejected";
  }

  if (action === "reactivate" && normalizeVerificationStatus(profile.overallStatus) === "approved") {
    return "approved";
  }

  return "under_review";
}

async function persistCanonicalApprovalStatus(
  subject: VerificationSubject,
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate",
  profile: VerificationProfileRecord,
  note: string
) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const nextApprovalStatus = getCanonicalApprovalStatusForAction(action, profile);

  try {
    if (subject.role === "barber" && subject.barberId) {
      const result = await supabase
        .from("barbers")
        .update({
          app_approval_status: nextApprovalStatus,
          approval_notes: note || null
        })
        .or(`reference_code.eq.${subject.barberId},id.eq.${subject.barberRow?.id ?? subject.barberId}`);

      if (result.error && !isMissingTableError(result.error)) {
        throw result.error;
      }
      return;
    }

    if (subject.role === "shop_owner" && subject.shopId) {
      const result = await supabase
        .from("shops")
        .update({
          app_approval_status: nextApprovalStatus
        })
        .eq("id", subject.shopId);

      if (result.error && !isMissingTableError(result.error)) {
        throw result.error;
      }
    }
  } catch (error) {
    logArchitectVerificationError("persisting canonical approval status", error);
    throw error;
  }
}

function recomputeProfileState(state: TrustState, subject: VerificationSubject) {
  const profile = ensureProfileForSubject(state, subject);
  ensureSubjectVerificationRecords(state, subject, profile);
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
    if (trustOverlayState) {
      stageTrustOverlay(nextState);
    }
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

  if (usedFallback || trustOverlayState) {
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
    id: randomUUID(),
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

async function recordVerificationPlatformEvents(input: {
  actor: UserAccount;
  subject: VerificationSubject;
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate";
  before: ArchitectVerificationQueueItem;
  after: ArchitectVerificationQueueItem;
  profile: VerificationProfileRecord;
  review: VerificationReviewRecord;
  note: string;
}) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const eventTypes: PlatformEventType[] = ["verification_updated"];
  if (input.action === "approve") {
    eventTypes.push("verification_approved");
  }
  if (input.action === "reject") {
    eventTypes.push("verification_rejected");
  }

  await recordRequiredPlatformEvents(supabase, eventTypes.map((eventType) => ({
    eventType,
    entityType: "verification_profile",
    entityId: input.profile.id,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    source: "api",
    relatedIds: {
      verificationProfileId: input.profile.id,
      reviewId: input.review.id,
      subjectUserId: input.subject.userId,
      barberId: input.subject.barberId,
      shopId: input.subject.shopId,
      role: input.profile.role
    },
    payload: {
      action: input.action,
      reviewActionType: input.review.actionType,
      fromStatus: input.before.canonicalOverallStatus,
      toStatus: input.after.canonicalOverallStatus,
      canonicalApprovalStatus: getCanonicalApprovalStatusForAction(input.action, input.profile),
      subjectName: input.after.subjectName,
      subjectEmail: input.after.subjectEmail,
      note: input.note
    },
    idempotencyKey: buildPlatformEventIdempotencyKey([
      "verification",
      input.profile.id,
      input.review.id,
      eventType
    ]),
    occurredAt: input.review.createdAt
  })));
}

async function executeReviewAction(
  actor: UserAccount,
  profileId: string,
  input: ArchitectVerificationActionInput,
  action: "approve" | "reject" | "request_update" | "suspend" | "reactivate"
) {
  assertPlatformAdminAccess(actor);

  const state = clone(await readArchitectTrustState());
  const production = await readProductionVerificationIndex();
  const subject = getSubjectByProfileId(state, profileId, production);
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
  await persistCanonicalApprovalStatus(subject, action, nextProfile, input.internalNotes?.trim() || input.reason.trim());
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
      canonicalApprovalStatus: getCanonicalApprovalStatusForAction(action, nextProfile),
      internalNotes: input.internalNotes?.trim() || null
    }
  });
  await recordVerificationPlatformEvents({
    actor,
    subject,
    action,
    before,
    after,
    profile: nextProfile,
    review,
    note: input.reason.trim()
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
    const production = await readProductionVerificationIndex(warnings);
    const items = collectVerificationSubjects(state, production)
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
    throw new VerificationAccessError("Secure verification document storage is unavailable.", 503);
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
  const production = await readProductionVerificationIndex();
  const subject = getSubjectByProfileId(state, profileId, production);
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
