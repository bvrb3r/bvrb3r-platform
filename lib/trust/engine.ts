import { demoBarbers, demoLocations } from "@/lib/data/demo";
import { demoShops } from "@/lib/data/marketplace";
import {
  demoBarberVerifications,
  demoVerificationProfiles,
  demoVerificationProviderLinks,
  demoVerificationReviews,
  demoDisputeEvents,
  demoDisputes,
  demoModerationActions,
  demoReliabilityScores,
  demoReportEvents,
  demoReviewModeration,
  demoRiskFlags,
  demoSafetyReports,
  demoShopVerifications,
  demoTrustBadges,
  demoVerificationDocuments
} from "@/lib/data/trust";
import type { Role } from "@/types/domain";
import type {
  BarberTrustWorkspaceSummary,
  BarberVerificationCategory,
  BarberVerificationRecord,
  BarberVerificationStatusView,
  CanonicalVerificationStatus,
  DisputeRecord,
  LegacyVerificationStatus,
  OwnerTrustWorkspaceSummary,
  PublicTrustSignal,
  SafetyReportRecord,
  SafetyReportStatus,
  ShopVerificationCategory,
  ShopVerificationRecord,
  TrustState,
  VerificationBlockingReasonCode,
  VerificationGate,
  VerificationGateDecision,
  VerificationDocumentRecord,
  VerificationProfileDecision,
  VerificationProfileRecord,
  VerificationStatus
} from "@/types/trust";

const REPORT_OPEN = new Set<SafetyReportStatus>(["open", "under_review", "escalated"]);
const DISPUTE_OPEN = new Set(["open", "under_review", "escalated"]);
const BARBER_CATEGORIES: BarberVerificationCategory[] = [
  "identity_verification",
  "license_verification",
  "payout_verification",
  "shop_affiliation_verification"
];
const REPORT_SUBJECTS: Record<Role, readonly SafetyReportRecord["subjectType"][]> = {
  platform_admin: ["client", "barber", "shop", "review", "booking"],
  owner: ["client", "barber", "shop", "review", "booking"],
  manager: ["booking"],
  front_desk: ["booking"],
  commission_barber: ["client", "review", "booking"],
  booth_rent_barber: ["client", "review", "booking"],
  client: ["barber", "shop", "review", "booking"]
};

export interface TrustActor {
  role: Role;
  userEmail?: string;
  clientId?: string;
  barberId?: string;
  locationIds?: string[];
}

export interface SubmitBarberVerificationInput {
  category: BarberVerificationCategory;
  legalName: string;
  licenseType?: string;
  licenseNumber?: string;
  issuingState?: string;
  expirationDate?: string;
  documentPath?: string;
}

export interface SubmitShopVerificationInput {
  shopId: string;
  category: ShopVerificationCategory;
  businessName: string;
  documentPath?: string;
}

export interface SubmitSafetyReportInput {
  subjectType: SafetyReportRecord["subjectType"];
  subjectId: string;
  category: SafetyReportRecord["category"];
  details: string;
  locationId?: string;
}

export interface SubmitDisputeInput {
  disputeType: DisputeRecord["disputeType"];
  involvedPartyType: DisputeRecord["involvedPartyType"];
  involvedPartyId: string;
  summary: string;
  appointmentId?: string;
  locationId?: string;
}

export class TrustPermissionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "TrustPermissionError";
  }
}

export class TrustValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TrustValidationError";
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueCodes(values: VerificationBlockingReasonCode[]) {
  return Array.from(new Set(values));
}

function appendGateReason(
  codes: VerificationBlockingReasonCode[],
  reasons: string[],
  code: VerificationBlockingReasonCode,
  reason: string
) {
  if (!codes.includes(code)) {
    codes.push(code);
  }

  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function buildGateDecision(
  gate: VerificationGate,
  codes: VerificationBlockingReasonCode[],
  reasons: string[]
): VerificationGateDecision {
  return {
    gate,
    allowed: codes.length === 0,
    codes: uniqueCodes(codes),
    reasons: uniqueStrings(reasons),
    degraded: false
  };
}

function createAllowedGateDecision(gate: VerificationGate, degraded = false): VerificationGateDecision {
  return {
    gate,
    allowed: true,
    codes: [],
    reasons: [],
    degraded
  };
}

function appendOverallStatusBlocks(
  codes: VerificationBlockingReasonCode[],
  reasons: string[],
  status: CanonicalVerificationStatus,
  subjectLabel: string
) {
  if (status === "suspended") {
    appendGateReason(codes, reasons, "verification_suspended", `${subjectLabel} verification is suspended and must be cleared by the platform.`);
    return;
  }

  if (status === "expired") {
    appendGateReason(codes, reasons, "verification_expired", `${subjectLabel} verification has expired and must be renewed.`);
    return;
  }

  if (status === "rejected") {
    appendGateReason(codes, reasons, "verification_rejected", `${subjectLabel} verification was rejected and must be corrected before it can go live.`);
    return;
  }

  if (status === "needs_update") {
    appendGateReason(codes, reasons, "verification_needs_update", `${subjectLabel} verification needs updated information before it can go live.`);
  }
}

function appendApprovalRequirement(
  codes: VerificationBlockingReasonCode[],
  reasons: string[],
  status: CanonicalVerificationStatus,
  code: VerificationBlockingReasonCode,
  reason: string
) {
  if (status !== "approved") {
    appendGateReason(codes, reasons, code, reason);
  }
}

function createBarberGateDecision(
  gate: VerificationGate,
  decision: Omit<VerificationProfileDecision, "gates">
): VerificationGateDecision {
  const codes: VerificationBlockingReasonCode[] = [];
  const reasons: string[] = [];

  appendOverallStatusBlocks(codes, reasons, decision.canonicalOverallStatus, "Barber");

  if (gate === "discovery" || gate === "booking" || gate === "payout" || gate === "badge") {
    appendApprovalRequirement(
      codes,
      reasons,
      decision.identityStatus,
      "identity_verification_required",
      "Identity verification must be approved for this barber lane."
    );
    appendApprovalRequirement(
      codes,
      reasons,
      decision.licenseStatus,
      "license_verification_required",
      "License verification must be approved for this barber lane."
    );
    appendApprovalRequirement(
      codes,
      reasons,
      decision.payoutStatus,
      "payout_verification_required",
      "Payout verification must be approved for this barber lane."
    );
    appendApprovalRequirement(
      codes,
      reasons,
      decision.complianceStatus,
      "compliance_acceptance_required",
      "Required agreements must be accepted for this barber lane."
    );
  }

  if ((gate === "discovery" || gate === "badge") && !decision.publicVerified) {
    appendGateReason(
      codes,
      reasons,
      "public_visibility_disabled",
      "Public visibility is disabled until barber verification is fully approved."
    );
  }

  if ((gate === "discovery" || gate === "booking") && !decision.canAcceptBookings) {
    appendGateReason(
      codes,
      reasons,
      "booking_not_enabled",
      "Booking is disabled until this barber lane is fully verified."
    );
  }

  if (gate === "payout" && !decision.canReceivePayouts) {
    appendGateReason(
      codes,
      reasons,
      "payout_not_enabled",
      "Payouts are disabled until this barber lane is fully verified."
    );
  }

  return buildGateDecision(gate, codes, reasons);
}

function createShopGateDecision(
  gate: VerificationGate,
  decision: Omit<VerificationProfileDecision, "gates">
): VerificationGateDecision {
  const codes: VerificationBlockingReasonCode[] = [];
  const reasons: string[] = [];

  appendOverallStatusBlocks(codes, reasons, decision.canonicalOverallStatus, "Shop");

  if (gate === "shop_activation" || gate === "payout" || gate === "badge") {
    appendApprovalRequirement(
      codes,
      reasons,
      decision.businessStatus,
      "business_verification_required",
      "Business verification must be approved for this shop lane."
    );
    appendApprovalRequirement(
      codes,
      reasons,
      decision.payoutStatus,
      "payout_verification_required",
      "Payout verification must be approved for this shop lane."
    );
    appendApprovalRequirement(
      codes,
      reasons,
      decision.complianceStatus,
      "compliance_acceptance_required",
      "Required agreements must be accepted for this shop lane."
    );
  }

  if (decision.identityStatus !== "not_started") {
    appendApprovalRequirement(
      codes,
      reasons,
      decision.identityStatus,
      "identity_verification_required",
      "Owner identity verification must be resolved for this shop lane."
    );
  }

  if ((gate === "shop_activation" || gate === "badge") && !decision.publicVerified) {
    appendGateReason(
      codes,
      reasons,
      "public_visibility_disabled",
      "Public shop visibility is disabled until business verification is fully approved."
    );
  }

  if (gate === "shop_activation" && !decision.canCreateShopListing) {
    appendGateReason(
      codes,
      reasons,
      "shop_listing_not_enabled",
      "Shop activation is disabled until the business lane is approved."
    );
  }

  if (gate === "payout" && !decision.canReceivePayouts) {
    appendGateReason(
      codes,
      reasons,
      "payout_not_enabled",
      "Payouts are disabled until the shop lane is fully verified."
    );
  }

  return buildGateDecision(gate, codes, reasons);
}

export function getVerificationGateDecision(
  decision: VerificationProfileDecision | undefined,
  gate: VerificationGate
): VerificationGateDecision {
  if (!decision) {
    return {
      gate,
      allowed: false,
      codes: ["verification_status_unknown"],
      reasons: ["Verification status is unavailable for this lane right now."],
      degraded: true
    };
  }

  return decision.gates[gate] ?? createAllowedGateDecision(gate, decision.source === "fallback");
}

export function getPrimaryVerificationGateReason(
  decision: VerificationProfileDecision | undefined,
  gate: VerificationGate
) {
  return getVerificationGateDecision(decision, gate).reasons[0] ?? null;
}

function getVerificationLabel(category: BarberVerificationCategory) {
  return category === "identity_verification"
    ? "Identity verification"
    : category === "license_verification"
      ? "License verification"
      : category === "payout_verification"
        ? "Payout verification"
        : "Shop affiliation";
}

export function normalizeVerificationStatus(status?: VerificationStatus | null): CanonicalVerificationStatus {
  switch (status) {
    case "approved":
    case "verified":
      return "approved";
    case "submitted":
    case "pending":
      return "submitted";
    case "under_review":
      return "under_review";
    case "in_progress":
      return "in_progress";
    case "expired":
      return "expired";
    case "suspended":
      return "suspended";
    case "needs_update":
      return "needs_update";
    case "rejected":
      return "rejected";
    case "not_started":
    case "unverified":
    default:
      return "not_started";
  }
}

export function toLegacyVerificationStatus(status?: VerificationStatus | null): LegacyVerificationStatus {
  const canonical = normalizeVerificationStatus(status);
  switch (canonical) {
    case "approved":
      return "verified";
    case "submitted":
    case "under_review":
    case "in_progress":
      return "pending";
    case "expired":
      return "expired";
    case "needs_update":
    case "rejected":
    case "suspended":
      return "rejected";
    case "not_started":
    default:
      return "unverified";
  }
}

function isVerificationApproved(status?: VerificationStatus | null) {
  return normalizeVerificationStatus(status) === "approved";
}

function getStatusWeight(status?: VerificationStatus | null) {
  switch (normalizeVerificationStatus(status)) {
    case "approved":
      return 1;
    case "under_review":
      return 0.75;
    case "submitted":
      return 0.6;
    case "in_progress":
      return 0.35;
    case "expired":
      return 0.25;
    case "needs_update":
    case "rejected":
      return 0.1;
    case "suspended":
    case "not_started":
    default:
      return 0;
  }
}

function isOpenReport(status: SafetyReportStatus) {
  return REPORT_OPEN.has(status);
}

function isOpenDispute(status: DisputeRecord["disputeStatus"]) {
  return DISPUTE_OPEN.has(status);
}

function getBarberVerificationRecord(state: TrustState, barberId: string, category: BarberVerificationCategory) {
  return state.barberVerifications.find((record) => record.barberId === barberId && record.category === category);
}

function getBarberVerificationProfile(state: TrustState, barberId: string): VerificationProfileRecord | undefined {
  const profileId = state.barberVerifications.find(
    (record) => record.barberId === barberId && record.verificationProfileId
  )?.verificationProfileId;

  if (!profileId) {
    return undefined;
  }

  return state.verificationProfiles?.find((profile) => profile.id === profileId);
}

function resolveVerificationShopId(state: TrustState, shopId: string) {
  if (state.shopVerifications.some((record) => record.shopId === shopId)) {
    return shopId;
  }

  const linkedDemoShop = demoShops.find((shop) => shop.id === shopId || shop.locationIds.includes(shopId));
  if (linkedDemoShop && state.shopVerifications.some((record) => record.shopId === linkedDemoShop.id)) {
    return linkedDemoShop.id;
  }

  return shopId;
}

function getShopVerificationProfile(state: TrustState, shopId: string): VerificationProfileRecord | undefined {
  const resolvedShopId = resolveVerificationShopId(state, shopId);
  const profileId = state.shopVerifications.find(
    (record) => record.shopId === resolvedShopId && record.verificationProfileId
  )?.verificationProfileId;

  if (!profileId) {
    return undefined;
  }

  return state.verificationProfiles?.find((profile) => profile.id === profileId);
}

function getReliabilityRecord(state: TrustState, barberId: string) {
  return state.reliabilityScores.find((record) => record.barberId === barberId);
}

function getOpenRiskPenalty(state: TrustState, barberId: string) {
  return state.riskFlags
    .filter((flag) => flag.entityType === "barber" && flag.entityId === barberId && flag.open)
    .reduce((sum, flag) => sum + (flag.severity === "high" ? 12 : flag.severity === "medium" ? 6 : 3), 0);
}

function getReviewPenalty(state: TrustState, barberId: string) {
  return state.reviewModeration
    .filter((record) => record.barberId === barberId && ["flagged", "removed", "under_review"].includes(record.moderationStatus))
    .reduce((sum, record) => sum + Math.max(2, Math.round((100 - record.integrityScore) / 10)), 0);
}

function resolveComponentStatus(profileStatus?: VerificationStatus | null, legacyStatus?: VerificationStatus | null) {
  const normalizedProfileStatus = normalizeVerificationStatus(profileStatus);
  return normalizedProfileStatus !== "not_started"
    ? normalizedProfileStatus
    : normalizeVerificationStatus(legacyStatus);
}

function deriveCanonicalOverallStatus(statuses: CanonicalVerificationStatus[]) {
  if (statuses.some((status) => status === "suspended")) return "suspended";
  if (statuses.some((status) => status === "expired")) return "expired";
  if (statuses.some((status) => status === "needs_update")) return "needs_update";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.every((status) => status === "approved")) return "approved";
  if (statuses.some((status) => status === "under_review")) return "under_review";
  if (statuses.some((status) => status === "submitted")) return "submitted";
  if (statuses.some((status) => status === "in_progress")) return "in_progress";
  return "not_started";
}

function applyOverallProfileOverride(
  profile: VerificationProfileRecord | undefined,
  fallback: CanonicalVerificationStatus
) {
  const profileOverall = normalizeVerificationStatus(profile?.overallStatus);
  return profileOverall !== "not_started" ? profileOverall : fallback;
}

function deriveBarberRequirements(input: {
  identityStatus: CanonicalVerificationStatus;
  licenseStatus: CanonicalVerificationStatus;
  payoutStatus: CanonicalVerificationStatus;
  complianceStatus: CanonicalVerificationStatus;
}) {
  return uniqueStrings([
    input.identityStatus === "approved" ? "" : "Verify identity",
    input.licenseStatus === "approved" ? "" : "Add professional license",
    input.payoutStatus === "approved" ? "" : "Connect payouts",
    input.complianceStatus === "approved" ? "" : "Accept required agreements"
  ]);
}

function deriveShopRequirements(input: {
  businessStatus: CanonicalVerificationStatus;
  payoutStatus: CanonicalVerificationStatus;
  complianceStatus: CanonicalVerificationStatus;
  identityStatus: CanonicalVerificationStatus;
}) {
  return uniqueStrings([
    input.businessStatus === "approved" ? "" : "Complete business verification",
    input.payoutStatus === "approved" ? "" : "Connect payouts",
    input.complianceStatus === "approved" ? "" : "Accept required agreements",
    input.identityStatus !== "not_started" && input.identityStatus !== "approved" ? "Resolve owner identity check" : ""
  ]);
}

function getNextStep(status?: VerificationStatus | null) {
  switch (normalizeVerificationStatus(status)) {
    case "approved":
      return "Verification complete.";
    case "under_review":
      return "Verification is under review.";
    case "submitted":
      return "Submission received and queued for review.";
    case "in_progress":
      return "Complete the remaining verification steps.";
    case "expired":
      return "Upload a renewal document to restore verification.";
    case "needs_update":
      return "Fix the requested items and resubmit.";
    case "rejected":
      return "Review notes and resubmit updated documentation.";
    case "suspended":
      return "Verification access is paused pending platform review.";
    case "not_started":
    default:
      return "Submit documentation to unlock this trust badge.";
  }
}

export function computeBarberVerificationDecision(state: TrustState, barberId: string): VerificationProfileDecision {
  const profile = getBarberVerificationProfile(state, barberId);
  const identityRecord = getBarberVerificationRecord(state, barberId, "identity_verification");
  const licenseRecord = getBarberVerificationRecord(state, barberId, "license_verification");
  const payoutRecord = getBarberVerificationRecord(state, barberId, "payout_verification");

  const identityStatus = resolveComponentStatus(profile?.identityStatus, identityRecord?.verificationStatus);
  const licenseStatus = resolveComponentStatus(profile?.licenseStatus, licenseRecord?.verificationStatus);
  const payoutStatus = resolveComponentStatus(
    profile?.payoutStatus,
    payoutRecord?.payoutStatus ?? payoutRecord?.verificationStatus
  );
  const complianceStatus = resolveComponentStatus(profile?.complianceStatus, payoutRecord?.complianceStatus);
  const businessStatus = "not_started" as const;
  const canonicalOverallStatus = applyOverallProfileOverride(
    profile,
    deriveCanonicalOverallStatus([identityStatus, licenseStatus, payoutStatus, complianceStatus])
  );
  const blocked = ["suspended", "expired", "rejected", "needs_update"].includes(canonicalOverallStatus);
  const currentRequirements = profile?.currentRequirements?.length
    ? profile.currentRequirements
    : deriveBarberRequirements({
        identityStatus,
        licenseStatus,
        payoutStatus,
        complianceStatus
      });
  const baseApproved = canonicalOverallStatus === "approved";
  const publicVerified = !blocked && baseApproved;
  const canAcceptBookings = !blocked && baseApproved;
  const canReceivePayouts = !blocked && baseApproved;

  const decisionBase = {
    subjectRole: "barber" as const,
    source: profile ? "profile" as const : "legacy_records" as const,
    canonicalOverallStatus,
    legacyOverallStatus: toLegacyVerificationStatus(canonicalOverallStatus),
    identityStatus,
    licenseStatus,
    businessStatus,
    payoutStatus,
    complianceStatus,
    publicVerified,
    canAcceptBookings,
    canReceivePayouts,
    canCreateShopListing: false,
    currentRequirements
  };

  return {
    ...decisionBase,
    gates: {
      discovery: createBarberGateDecision("discovery", decisionBase),
      booking: createBarberGateDecision("booking", decisionBase),
      payout: createBarberGateDecision("payout", decisionBase),
      badge: createBarberGateDecision("badge", decisionBase)
    }
  };
}

export function computeShopVerificationDecision(state: TrustState, shopId: string): VerificationProfileDecision {
  const resolvedShopId = resolveVerificationShopId(state, shopId);
  const profile = getShopVerificationProfile(state, resolvedShopId);
  const businessStatuses = state.shopVerifications
    .filter((record) => record.shopId === resolvedShopId)
    .map((record) => normalizeVerificationStatus(record.verificationStatus));
  const identityStatuses = state.shopVerifications
    .filter((record) => record.shopId === resolvedShopId)
    .map((record) => normalizeVerificationStatus(record.identityStatus));
  const businessStatus = resolveComponentStatus(
    profile?.businessStatus,
    businessStatuses.length ? deriveCanonicalOverallStatus(businessStatuses) : undefined
  );
  const payoutStatus = resolveComponentStatus(profile?.payoutStatus, undefined);
  const complianceStatus = resolveComponentStatus(profile?.complianceStatus, undefined);
  const identityStatus = resolveComponentStatus(
    profile?.identityStatus,
    identityStatuses.find((status) => status !== "not_started")
  );
  const statusesForOverall = [
    businessStatus,
    payoutStatus,
    complianceStatus,
    ...(identityStatus !== "not_started" ? [identityStatus] : [])
  ];
  const canonicalOverallStatus = applyOverallProfileOverride(
    profile,
    deriveCanonicalOverallStatus(statusesForOverall)
  );
  const blocked = ["suspended", "expired", "rejected", "needs_update"].includes(canonicalOverallStatus);
  const currentRequirements = profile?.currentRequirements?.length
    ? profile.currentRequirements
    : deriveShopRequirements({
        businessStatus,
        payoutStatus,
        complianceStatus,
        identityStatus
      });
  const baseApproved = canonicalOverallStatus === "approved";
  const publicVerified = !blocked && baseApproved;
  const canReceivePayouts = !blocked && baseApproved;
  const canCreateShopListing = !blocked && baseApproved;

  const decisionBase = {
    subjectRole: "shop_owner" as const,
    source: profile ? "profile" as const : "legacy_records" as const,
    canonicalOverallStatus,
    legacyOverallStatus: toLegacyVerificationStatus(canonicalOverallStatus),
    identityStatus,
    licenseStatus: "not_started" as const,
    businessStatus,
    payoutStatus,
    complianceStatus,
    publicVerified,
    canAcceptBookings: false,
    canReceivePayouts,
    canCreateShopListing,
    currentRequirements
  };

  return {
    ...decisionBase,
    gates: {
      payout: createShopGateDecision("payout", decisionBase),
      badge: createShopGateDecision("badge", decisionBase),
      shop_activation: createShopGateDecision("shop_activation", decisionBase)
    }
  };
}

export function createInitialTrustState(): TrustState {
  return cloneState({
    barberVerifications: demoBarberVerifications,
    shopVerifications: demoShopVerifications,
    verificationDocuments: demoVerificationDocuments,
    verificationProfiles: demoVerificationProfiles,
    verificationReviews: demoVerificationReviews,
    verificationProviderLinks: demoVerificationProviderLinks,
    trustBadges: demoTrustBadges,
    reviewModeration: demoReviewModeration,
    safetyReports: demoSafetyReports,
    reportEvents: demoReportEvents,
    disputes: demoDisputes,
    disputeEvents: demoDisputeEvents,
    riskFlags: demoRiskFlags,
    moderationActions: demoModerationActions,
    reliabilityScores: demoReliabilityScores
  });
}

export function createEmptyTrustState(): TrustState {
  return {
    barberVerifications: [],
    shopVerifications: [],
    verificationDocuments: [],
    verificationProfiles: [],
    verificationReviews: [],
    verificationProviderLinks: [],
    trustBadges: [],
    reviewModeration: [],
    safetyReports: [],
    reportEvents: [],
    disputes: [],
    disputeEvents: [],
    riskFlags: [],
    moderationActions: [],
    reliabilityScores: []
  };
}

export function buildPublicTrustSignal(state: TrustState, barberId: string, shopId?: string): PublicTrustSignal {
  const verificationDecision = computeBarberVerificationDecision(state, barberId);
  const shopDecision = shopId ? computeShopVerificationDecision(state, shopId) : undefined;
  const badgeGate = getVerificationGateDecision(verificationDecision, "badge");
  const identityVerified = badgeGate.allowed && verificationDecision.identityStatus === "approved";
  const licenseVerified = badgeGate.allowed && verificationDecision.licenseStatus === "approved";
  const shopVerified = shopId
    ? getVerificationGateDecision(shopDecision, "shop_activation").allowed && Boolean(shopDecision?.publicVerified)
    : false;
  const reliability = getReliabilityRecord(state, barberId);
  const approvedReviews = state.reviewModeration.filter(
    (record) => record.barberId === barberId && record.moderationStatus === "approved"
  );
  const reviewIntegrityScore = approvedReviews.length
    ? Math.round(approvedReviews.reduce((sum, record) => sum + record.integrityScore, 0) / approvedReviews.length)
    : Math.round(reliability?.reviewIntegrityScore ?? 82);
  const trustScore = clamp(
    Math.round(
      (reliability?.overallTrustScore ?? 78)
      + (identityVerified ? 4 : 0)
      + (licenseVerified ? 8 : 0)
      + (shopVerified ? 4 : 0)
      - getReviewPenalty(state, barberId)
      - getOpenRiskPenalty(state, barberId)
    ),
    48,
    100
  );
  const completionRate = Math.round(reliability?.completionRate ?? 88);
  const trustLabel = trustScore >= 92 ? "Trusted Pro" : trustScore >= 84 ? "Trusted Barber" : undefined;
  const badgeLabels = badgeGate.allowed
    ? uniqueStrings([
        identityVerified ? "Verified barber" : "",
        licenseVerified ? "Verified license" : "",
        shopVerified ? "Verified shop" : "",
        ...state.trustBadges
          .filter((badge) => badge.scopeType === "barber" && badge.scopeId === barberId && badge.publicVisible)
          .map((badge) => badge.label),
        ...state.trustBadges
          .filter((badge) => badge.scopeType === "shop" && badge.scopeId === shopId && badge.publicVisible)
          .map((badge) => badge.label),
        trustLabel ?? ""
      ])
    : [];

  return {
    barberId,
    shopId,
    trustScore,
    completionRate,
    reviewIntegrityScore,
    verifiedBarber: identityVerified,
    verifiedLicense: licenseVerified,
    verifiedShop: shopVerified,
    trustLabel,
    publicBadgeLabels: badgeLabels,
    reliabilityLabel: completionRate >= 96 ? "High booking reliability" : completionRate >= 90 ? "Strong completion record" : "Building reliability history",
    reviewIntegrityLabel: reviewIntegrityScore >= 94 ? "Verified review integrity" : reviewIntegrityScore >= 84 ? "Review integrity monitored" : "Review watch",
    moderationState: reviewIntegrityScore >= 84 ? "clear" : "watch",
    verificationDecision
  };
}

function buildBarberVerificationView(
  record: BarberVerificationRecord | undefined,
  fallbackCategory: BarberVerificationCategory
): BarberVerificationStatusView {
  const rawStatus = record?.verificationStatus ?? "unverified";

  return {
    category: record?.category ?? fallbackCategory,
    label: getVerificationLabel(record?.category ?? fallbackCategory),
    status: toLegacyVerificationStatus(rawStatus),
    canonicalStatus: normalizeVerificationStatus(rawStatus),
    submittedAt: record?.verificationSubmittedAt,
    reviewedAt: record?.verificationReviewedAt ?? record?.lastReviewedAt,
    expiresAt: record?.expirationDate,
    notes: record?.verificationNotes,
    nextStep: getNextStep(rawStatus)
  };
}

export function getBarberTrustSummary(state: TrustState, barberId: string): BarberTrustWorkspaceSummary {
  const verificationItems = BARBER_CATEGORIES.map((category) =>
    buildBarberVerificationView(getBarberVerificationRecord(state, barberId, category), category)
  );
  const verificationDecision = computeBarberVerificationDecision(state, barberId);
  const publicTrust = buildPublicTrustSignal(state, barberId, "shop-bvrb3r");
  const overallStatus = verificationItems.every((item) => item.status === "verified")
    ? "verified"
    : verificationItems.some((item) => item.status === "pending")
      ? "pending"
      : verificationItems.some((item) => item.status === "expired")
        ? "expired"
        : verificationItems.some((item) => item.status === "rejected")
          ? "rejected"
          : "unverified";
  const activeRiskFlags = state.riskFlags
    .filter((flag) => flag.entityType === "barber" && flag.entityId === barberId && flag.open)
    .map((flag) => ({ signalType: flag.signalType, severity: flag.severity, label: flag.notes }));

  return {
    barberId,
    overallStatus,
    canonicalOverallStatus: verificationDecision.canonicalOverallStatus,
    verificationProgress: Math.round(
      (verificationItems.reduce((sum, item) => sum + getStatusWeight(item.canonicalStatus ?? item.status), 0) / verificationItems.length) * 100
    ),
    trustScore: publicTrust.trustScore,
    completionRate: publicTrust.completionRate,
    publicBadgePreview: publicTrust.publicBadgeLabels,
    verificationItems,
    openReports: state.safetyReports.filter((report) => report.subjectType === "barber" && report.subjectId === barberId && isOpenReport(report.status)).length,
    openDisputes: state.disputes.filter((dispute) => dispute.involvedPartyType === "barber" && dispute.involvedPartyId === barberId && isOpenDispute(dispute.disputeStatus)).length,
    activeRiskFlags,
    reminders: uniqueStrings([
      verificationItems.filter((item) => item.status !== "verified").map((item) => item.nextStep).join(" "),
      publicTrust.trustLabel ? `Public trust signal live: ${publicTrust.trustLabel}.` : "",
      verificationDecision.currentRequirements.length ? `Still needed: ${verificationDecision.currentRequirements.join(", ")}.` : "",
      activeRiskFlags.length ? "One or more trust signals need review before they affect long-term ranking performance." : ""
    ]).filter(Boolean),
    verificationDecision
  };
}

function getLegacyShopStatus(records: ShopVerificationRecord[]) {
  if (!records.length) {
    return "unverified" as const;
  }

  if (records.every((record) => isVerificationApproved(record.verificationStatus))) {
    return "verified" as const;
  }
  if (records.some((record) => toLegacyVerificationStatus(record.verificationStatus) === "pending")) {
    return "pending" as const;
  }
  if (records.some((record) => toLegacyVerificationStatus(record.verificationStatus) === "rejected")) {
    return "rejected" as const;
  }
  if (records.some((record) => toLegacyVerificationStatus(record.verificationStatus) === "expired")) {
    return "expired" as const;
  }

  return "unverified" as const;
}

export function getOwnerTrustSummary(state: TrustState, locationIds: string[]): OwnerTrustWorkspaceSummary {
  const scopedLocations = locationIds.length ? locationIds : demoLocations.map((location) => location.id);
  const scopedBarbers = demoBarbers.filter((barber) => barber.locationIds.some((locationId) => scopedLocations.includes(locationId)));
  const scopedBarberIds = new Set(scopedBarbers.map((barber) => barber.id));
  const barberSummaries = scopedBarbers.map((barber) => ({
    barber,
    summary: getBarberTrustSummary(state, barber.id)
  }));
  const allStatuses = barberSummaries.map((entry) => entry.summary.overallStatus);
  const shopStatuses = demoShops
    .filter((shop) => shop.locationIds.some((locationId) => scopedLocations.includes(locationId)))
    .map((shop) => {
      const records = state.shopVerifications.filter((record) => record.shopId === shop.id);
      const verificationDecision = computeShopVerificationDecision(state, shop.id);
      const status = getLegacyShopStatus(records);

      return {
        shopId: shop.id,
        shopName: shop.name,
        status,
        canonicalStatus: verificationDecision.canonicalOverallStatus,
        badgeLabel: status === "verified" ? "Verified shop" : status === "pending" ? "Verification pending" : "Verification needed",
        verifiedCategories: records.filter((record) => isVerificationApproved(record.verificationStatus)).map((record) => record.category),
        verificationDecision
      };
    });

  return {
    shopStatuses,
    staffVerification: {
      verified: allStatuses.filter((status) => status === "verified").length,
      pending: allStatuses.filter((status) => status === "pending").length,
      expired: allStatuses.filter((status) => status === "expired").length,
      rejected: allStatuses.filter((status) => status === "rejected").length,
      unverified: allStatuses.filter((status) => status === "unverified").length
    },
    openReports: state.safetyReports.filter((report) => isOpenReport(report.status) && (report.locationId ? scopedLocations.includes(report.locationId) : true)).length,
    openDisputes: state.disputes.filter((dispute) => isOpenDispute(dispute.disputeStatus) && (dispute.locationId ? scopedLocations.includes(dispute.locationId) : true)).length,
    highRiskFlags: state.riskFlags.filter((flag) => flag.open && flag.severity === "high").length,
    reviewIntegrityAlerts: state.reviewModeration.filter((record) => scopedBarberIds.has(record.barberId) && ["flagged", "under_review", "removed"].includes(record.moderationStatus)).length,
    pendingBarbers: barberSummaries
      .filter((entry) => entry.summary.overallStatus !== "verified")
      .map((entry) => ({
        barberId: entry.barber.id,
        barberName: entry.barber.name,
        status: entry.summary.overallStatus,
        canonicalStatus: entry.summary.canonicalOverallStatus,
        nextStep: entry.summary.verificationItems.find((item) => item.status !== "verified")?.nextStep ?? "Review trust checklist."
      }))
      .slice(0, 4),
    recentQueue: [
      ...state.safetyReports
        .filter((report) => isOpenReport(report.status) && (report.locationId ? scopedLocations.includes(report.locationId) : true))
        .map((report) => ({
          id: report.id,
          type: "report" as const,
          label: `${report.category.replaceAll("_", " ")} report on ${report.subjectType}`,
          status: report.status,
          createdAt: report.createdAt
        })),
      ...state.disputes
        .filter((dispute) => isOpenDispute(dispute.disputeStatus) && (dispute.locationId ? scopedLocations.includes(dispute.locationId) : true))
        .map((dispute) => ({
          id: dispute.id,
          type: "dispute" as const,
          label: `${dispute.disputeType.replaceAll("_", " ")} dispute`,
          status: dispute.disputeStatus,
          createdAt: dispute.createdAt
        })),
      ...state.barberVerifications
        .filter((record) => scopedBarberIds.has(record.barberId) && toLegacyVerificationStatus(record.verificationStatus) !== "verified")
        .map((record) => ({
          id: record.id,
          type: "verification" as const,
          label: `${demoBarbers.find((barber) => barber.id === record.barberId)?.name ?? record.barberId} ${getVerificationLabel(record.category).toLowerCase()}`,
          status: record.verificationStatus,
          createdAt: record.verificationSubmittedAt ?? record.updatedAt
        })),
      ...state.riskFlags
        .filter((flag) => flag.open)
        .map((flag) => ({
          id: flag.id,
          type: "risk_flag" as const,
          label: `${flag.signalType.replaceAll("_", " ")} flagged`,
          status: "under_review" as const,
          createdAt: flag.createdAt
        }))
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 6),
    shopTrustBadges: uniqueStrings(
      state.trustBadges.filter((badge) => badge.scopeType === "shop" && badge.publicVisible).map((badge) => badge.label)
    )
  };
}

export function submitBarberVerification(state: TrustState, actor: TrustActor, input: SubmitBarberVerificationInput) {
  if (!actor.barberId || !["commission_barber", "booth_rent_barber"].includes(actor.role)) {
    throw new TrustPermissionError("Only a barber can submit their own verification updates.");
  }
  if (!input.legalName.trim()) {
    throw new TrustValidationError("A legal name is required to submit verification.");
  }
  if (
    input.category === "license_verification"
    && (!input.licenseNumber || !input.issuingState || !input.expirationDate)
  ) {
    throw new TrustValidationError("License number, issuing state, and expiration date are required for license verification.");
  }

  const now = new Date().toISOString();
  const existing = getBarberVerificationRecord(state, actor.barberId, input.category);
  const verification: BarberVerificationRecord = {
    id: existing?.id ?? createId("barber-verification"),
    barberId: actor.barberId,
    category: input.category,
    legalName: input.legalName.trim(),
    licenseType: input.licenseType?.trim() || undefined,
    licenseNumber: input.licenseNumber?.trim() || undefined,
    issuingState: input.issuingState?.trim() || undefined,
    expirationDate: input.expirationDate || undefined,
    verificationStatus: "pending",
    verificationSubmittedAt: now,
    verificationReviewedAt: existing?.verificationReviewedAt,
    verificationNotes: "Submission received and queued for trust review.",
    documentPath: input.documentPath ?? existing?.documentPath,
    updatedAt: now
  };
  const document: VerificationDocumentRecord | undefined = input.documentPath
    ? {
        id: createId("verification-document"),
        ownerType: "barber" as const,
        ownerId: actor.barberId,
        category: input.category,
        storagePath: input.documentPath,
        uploadedAt: now,
        expiresAt: input.expirationDate,
        status: "submitted" as const
      }
    : undefined;

  return {
    state: {
      ...state,
      barberVerifications: [
        verification,
        ...state.barberVerifications.filter(
          (record) => !(record.barberId === actor.barberId && record.category === input.category)
        )
      ],
      verificationDocuments: document ? [document, ...state.verificationDocuments] : state.verificationDocuments
    },
    verification,
    document
  };
}

export function submitShopVerification(state: TrustState, actor: TrustActor, input: SubmitShopVerificationInput) {
  if (actor.role !== "owner") {
    throw new TrustPermissionError("Only the owner can submit shop verification updates.");
  }
  if (!input.businessName.trim()) {
    throw new TrustValidationError("A business name is required to submit shop verification.");
  }

  const now = new Date().toISOString();
  const existing = state.shopVerifications.find(
    (record) => record.shopId === input.shopId && record.category === input.category
  );
  const verification: ShopVerificationRecord = {
    id: existing?.id ?? createId("shop-verification"),
    shopId: input.shopId,
    category: input.category,
    businessName: input.businessName.trim(),
    verificationStatus: "pending",
    verificationSubmittedAt: now,
    verificationReviewedAt: existing?.verificationReviewedAt,
    verificationNotes: "Submission received and queued for trust review.",
    documentPath: input.documentPath ?? existing?.documentPath,
    updatedAt: now
  };
  const document: VerificationDocumentRecord | undefined = input.documentPath
    ? {
        id: createId("verification-document"),
        ownerType: "shop" as const,
        ownerId: input.shopId,
        category: input.category,
        storagePath: input.documentPath,
        uploadedAt: now,
        status: "submitted" as const
      }
    : undefined;

  return {
    state: {
      ...state,
      shopVerifications: [
        verification,
        ...state.shopVerifications.filter(
          (record) => !(record.shopId === input.shopId && record.category === input.category)
        )
      ],
      verificationDocuments: document ? [document, ...state.verificationDocuments] : state.verificationDocuments
    },
    verification,
    document
  };
}

export function submitSafetyReport(state: TrustState, actor: TrustActor, input: SubmitSafetyReportInput) {
  if (!["client", "commission_barber", "booth_rent_barber", "owner"].includes(actor.role)) {
    throw new TrustPermissionError("You do not have access to submit a safety report.");
  }
  if (!REPORT_SUBJECTS[actor.role].includes(input.subjectType)) {
    throw new TrustPermissionError("This role cannot report that kind of subject.");
  }
  if (input.details.trim().length < 12) {
    throw new TrustValidationError("Please include a short explanation so the trust team can understand the concern.");
  }
  const reporterId = actor.clientId ?? actor.barberId ?? actor.userEmail;
  if (!reporterId) {
    throw new TrustValidationError("A valid reporting identity is required.");
  }

  const now = new Date().toISOString();
  const report = {
    id: createId("safety-report"),
    reporterRole: actor.role,
    reporterId,
    reporterEmail: actor.userEmail,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    category: input.category,
    details: input.details.trim(),
    status: "open" as const,
    locationId: input.locationId,
    createdAt: now,
    updatedAt: now
  };
  const reportEvent = {
    id: createId("report-event"),
    reportId: report.id,
    actorRole: actor.role,
    actorId: reporterId,
    actionLabel: "Report submitted",
    notes: report.details,
    createdAt: now
  };
  const riskFlag = input.category === "fake_profile" || input.category === "fake_review"
    ? {
        id: createId("risk-flag"),
        entityType: input.subjectType === "review"
          ? "review" as const
          : input.subjectType === "barber"
            ? "barber" as const
            : input.subjectType === "shop"
              ? "shop" as const
              : "booking" as const,
        entityId: input.subjectId,
        signalType: input.category === "fake_review"
          ? "suspicious_review_pattern" as const
          : "duplicate_account_indicator" as const,
        severity: "medium" as const,
        score: 60,
        publicImpact: true,
        open: true,
        notes: `Raised from ${input.category.replaceAll("_", " ")} report.`,
        createdAt: now
      }
    : undefined;

  return {
    state: {
      ...state,
      safetyReports: [report, ...state.safetyReports],
      reportEvents: [reportEvent, ...state.reportEvents],
      riskFlags: riskFlag ? [riskFlag, ...state.riskFlags] : state.riskFlags
    },
    report,
    reportEvent,
    riskFlag
  };
}

export function submitDispute(state: TrustState, actor: TrustActor, input: SubmitDisputeInput) {
  if (!["client", "commission_barber", "booth_rent_barber", "owner"].includes(actor.role)) {
    throw new TrustPermissionError("You do not have access to submit a dispute.");
  }
  if (input.summary.trim().length < 12) {
    throw new TrustValidationError("Please include enough detail for the dispute team to review the request.");
  }
  const submittedById = actor.clientId ?? actor.barberId ?? actor.userEmail;
  if (!submittedById) {
    throw new TrustValidationError("A valid dispute identity is required.");
  }

  const now = new Date().toISOString();
  const dispute = {
    id: createId("dispute"),
    disputeType: input.disputeType,
    disputeStatus: "open" as const,
    submittedByRole: actor.role,
    submittedById,
    involvedPartyType: input.involvedPartyType,
    involvedPartyId: input.involvedPartyId,
    appointmentId: input.appointmentId,
    locationId: input.locationId,
    summary: input.summary.trim(),
    createdAt: now,
    updatedAt: now
  };
  const disputeEvent = {
    id: createId("dispute-event"),
    disputeId: dispute.id,
    actorRole: actor.role,
    actorId: submittedById,
    actionLabel: "Dispute submitted",
    notes: dispute.summary,
    createdAt: now
  };

  return {
    state: {
      ...state,
      disputes: [dispute, ...state.disputes],
      disputeEvents: [disputeEvent, ...state.disputeEvents]
    },
    dispute,
    disputeEvent
  };
}
