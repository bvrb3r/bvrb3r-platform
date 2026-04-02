import type { Role } from "@/types/domain";

export type LegacyVerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "expired";
export type CanonicalVerificationStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "needs_update"
  | "expired"
  | "suspended";
export type VerificationStatus = LegacyVerificationStatus | CanonicalVerificationStatus;
export type VerificationGate = "discovery" | "booking" | "payout" | "badge" | "shop_activation";
export type VerificationBlockingReasonCode =
  | "verification_status_unknown"
  | "verification_suspended"
  | "verification_expired"
  | "verification_rejected"
  | "verification_needs_update"
  | "identity_verification_required"
  | "license_verification_required"
  | "business_verification_required"
  | "payout_verification_required"
  | "compliance_acceptance_required"
  | "public_visibility_disabled"
  | "booking_not_enabled"
  | "payout_not_enabled"
  | "shop_listing_not_enabled"
  | "provider_payouts_not_ready";

export type VerificationSubjectRole = "client" | "barber" | "shop_owner";
export type VerificationDocumentType =
  | "government_id_front"
  | "government_id_back"
  | "drivers_license"
  | "state_id"
  | "passport"
  | "barber_license"
  | "restricted_barber_license"
  | "cosmetology_license"
  | "specialty_license"
  | "shop_license"
  | "salon_license"
  | "business_registration"
  | "ein_letter"
  | "insurance_document"
  | "other";
export type ProfessionalLicenseType = "barber" | "restricted_barber" | "cosmetologist" | "specialist" | "braider" | "other";
export type BusinessLicenseType = "barber_shop" | "salon" | "cosmetology_salon" | "hybrid_shop" | "other";
export type VerificationReviewType = "identity" | "professional_license" | "business" | "payout_tax" | "compliance" | "overall";
export type VerificationActionType =
  | "submitted"
  | "approved"
  | "rejected"
  | "requested_update"
  | "expired"
  | "suspended"
  | "reactivated"
  | "visibility_enabled"
  | "visibility_disabled"
  | "booking_enabled"
  | "booking_disabled"
  | "payout_enabled"
  | "payout_disabled";
export type BarberVerificationCategory = "identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification";
export type ShopVerificationCategory = "business_verification" | "ownership_verification";
export type VerificationOwnerType = "barber" | "shop";
export type TrustBadgeKind = "verified_barber" | "verified_license" | "verified_shop" | "trusted_pro" | "top_rated" | "rising_barber";
export type ReviewModerationStatus = "eligible" | "approved" | "flagged" | "under_review" | "removed";
export type SafetyReportCategory =
  | "no_show_abuse"
  | "harassment"
  | "fraud"
  | "unsafe_conduct"
  | "fake_profile"
  | "fake_review"
  | "payment_dispute"
  | "inappropriate_behavior";
export type SafetyReportStatus = "open" | "under_review" | "resolved" | "dismissed" | "escalated";
export type SafetyReportSubjectType = "client" | "barber" | "shop" | "review" | "booking";
export type DisputeType = "refund_request" | "payment_dispute" | "chargeback" | "no_show" | "service_quality";
export type DisputeStatus = "open" | "under_review" | "resolved" | "dismissed" | "escalated";
export type DisputePartyType = "client" | "barber" | "shop" | "booking";
export type RiskFlagType =
  | "suspicious_account_creation"
  | "repeated_no_show"
  | "suspicious_review_pattern"
  | "repeated_cancellations"
  | "duplicate_account_indicator"
  | "booking_abuse_pattern"
  | "payout_risk";
export type RiskSeverity = "low" | "medium" | "high";
export type ReportQueueType = "report" | "dispute" | "verification" | "risk_flag";

export interface VerificationProfileRecord {
  id: string;
  userId: string;
  role: VerificationSubjectRole;
  overallStatus: VerificationStatus;
  identityStatus: VerificationStatus;
  licenseStatus: VerificationStatus;
  businessStatus: VerificationStatus;
  payoutStatus: VerificationStatus;
  complianceStatus: VerificationStatus;
  publicVerified: boolean;
  canAcceptBookings: boolean;
  canReceivePayouts: boolean;
  canCreateShopListing: boolean;
  currentRequirements: string[];
  reviewNotes?: string;
  lastReviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationProfileDecision {
  subjectRole: VerificationSubjectRole;
  source: "profile" | "legacy_records" | "fallback";
  canonicalOverallStatus: CanonicalVerificationStatus;
  legacyOverallStatus: LegacyVerificationStatus;
  identityStatus: CanonicalVerificationStatus;
  licenseStatus: CanonicalVerificationStatus;
  businessStatus: CanonicalVerificationStatus;
  payoutStatus: CanonicalVerificationStatus;
  complianceStatus: CanonicalVerificationStatus;
  publicVerified: boolean;
  canAcceptBookings: boolean;
  canReceivePayouts: boolean;
  canCreateShopListing: boolean;
  currentRequirements: string[];
  gates: Partial<Record<VerificationGate, VerificationGateDecision>>;
}

export interface VerificationGateDecision {
  gate: VerificationGate;
  allowed: boolean;
  codes: VerificationBlockingReasonCode[];
  reasons: string[];
  degraded: boolean;
}

export interface BarberVerificationRecord {
  id: string;
  barberId: string;
  category: BarberVerificationCategory;
  legalName: string;
  userId?: string;
  verificationProfileId?: string;
  licenseType?: string;
  professionalLicenseType?: ProfessionalLicenseType;
  licenseNumber?: string;
  issuingState?: string;
  expirationDate?: string;
  verificationStatus: VerificationStatus;
  identityStatus?: VerificationStatus;
  payoutStatus?: VerificationStatus;
  complianceStatus?: VerificationStatus;
  providerIdentityStatus?: string;
  providerConnectStatus?: string;
  verificationSubmittedAt?: string;
  verificationReviewedAt?: string;
  reviewedBy?: string;
  lastReviewedAt?: string;
  verificationNotes?: string;
  currentRequirements?: string[];
  documentPath?: string;
  updatedAt: string;
}

export interface ShopVerificationRecord {
  id: string;
  shopId: string;
  category: ShopVerificationCategory;
  businessName: string;
  userId?: string;
  verificationProfileId?: string;
  dbaName?: string;
  einLast4?: string;
  stateOfRegistration?: string;
  businessLicenseType?: BusinessLicenseType;
  shopLicenseNumber?: string;
  verificationStatus: VerificationStatus;
  identityStatus?: VerificationStatus;
  payoutStatus?: VerificationStatus;
  complianceStatus?: VerificationStatus;
  providerConnectStatus?: string;
  verificationSubmittedAt?: string;
  verificationReviewedAt?: string;
  reviewedBy?: string;
  lastReviewedAt?: string;
  verificationNotes?: string;
  currentRequirements?: string[];
  documentPath?: string;
  updatedAt: string;
}

export interface VerificationDocumentRecord {
  id: string;
  ownerType: VerificationOwnerType;
  ownerId: string;
  userId?: string;
  shopId?: string;
  verificationProfileId?: string;
  category: BarberVerificationCategory | ShopVerificationCategory;
  documentType?: VerificationDocumentType;
  status?: VerificationStatus;
  storageBucket?: string;
  storagePath: string;
  secureReference?: string;
  fileName?: string;
  contentType?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedByRole?: Role;
  uploadedAt: string;
  expiresAt?: string;
  issuingState?: string;
  documentLast4?: string;
  issuedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  updatedAt?: string;
}

export interface VerificationDocumentSubjectView {
  id: string;
  documentType?: VerificationDocumentType;
  legacyCategory: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedAt: string;
  expiresAt?: string;
  status?: VerificationStatus;
}

export interface VerificationDocumentAdminView extends VerificationDocumentSubjectView {
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface VerificationReviewRecord {
  id: string;
  verificationProfileId: string;
  reviewType: VerificationReviewType;
  actionType: VerificationActionType;
  fromStatus?: VerificationStatus;
  toStatus?: VerificationStatus;
  reviewedBy: string;
  reason?: string;
  internalNotes?: string;
  createdAt: string;
}

export interface VerificationReviewSubjectView {
  id: string;
  reviewType: VerificationReviewType;
  actionType: VerificationActionType;
  fromStatus?: VerificationStatus;
  toStatus?: VerificationStatus;
  reason?: string;
  createdAt: string;
}

export interface VerificationProviderLinkRecord {
  id: string;
  verificationProfileId: string;
  userId: string;
  provider: string;
  providerSubject: string;
  providerReferenceId: string;
  providerStatus?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationProviderStatusSummary {
  summary: string;
  remediationMessage?: string;
  disabledReason?: string;
  lastErrorCode?: string;
  lastErrorReason?: string;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
}

export interface VerificationProviderStatusView {
  id: string;
  provider: string;
  providerSubject: string;
  providerStatus?: string;
  summary: string;
  remediationMessage?: string;
  disabledReason?: string;
  lastErrorCode?: string;
  lastErrorReason?: string;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  updatedAt: string;
}

export interface VerificationSubjectProfileView {
  profileId: string;
  role: VerificationSubjectRole;
  overallStatus: VerificationStatus;
  identityStatus: VerificationStatus;
  licenseStatus: VerificationStatus;
  businessStatus: VerificationStatus;
  payoutStatus: VerificationStatus;
  complianceStatus: VerificationStatus;
  publicVerified: boolean;
  canAcceptBookings: boolean;
  canReceivePayouts: boolean;
  canCreateShopListing: boolean;
  currentRequirements: string[];
  lastReviewedAt?: string;
  updatedAt: string;
  documents: VerificationDocumentSubjectView[];
  reviews: VerificationReviewSubjectView[];
  providerStatuses: VerificationProviderStatusView[];
}

export interface VerificationMePayload {
  profiles: VerificationSubjectProfileView[];
  warnings: string[];
}

export interface TrustBadgeRecord {
  id: string;
  scopeType: VerificationOwnerType;
  scopeId: string;
  badge: TrustBadgeKind;
  label: string;
  publicVisible: boolean;
  grantedAt: string;
  expiresAt?: string;
}

export interface ReviewModerationRecord {
  id: string;
  reviewId: string;
  barberId: string;
  clientId: string;
  appointmentId?: string;
  eligible: boolean;
  moderationStatus: ReviewModerationStatus;
  suspiciousFlags: string[];
  abuseReported: boolean;
  integrityScore: number;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyReportRecord {
  id: string;
  reporterRole: Role;
  reporterId: string;
  reporterEmail?: string;
  subjectType: SafetyReportSubjectType;
  subjectId: string;
  category: SafetyReportCategory;
  details: string;
  status: SafetyReportStatus;
  locationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportEventRecord {
  id: string;
  reportId: string;
  actorRole: Role;
  actorId: string;
  actionLabel: string;
  notes?: string;
  createdAt: string;
}

export interface DisputeRecord {
  id: string;
  disputeType: DisputeType;
  disputeStatus: DisputeStatus;
  submittedByRole: Role;
  submittedById: string;
  involvedPartyType: DisputePartyType;
  involvedPartyId: string;
  appointmentId?: string;
  locationId?: string;
  summary: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEventRecord {
  id: string;
  disputeId: string;
  actorRole: Role;
  actorId: string;
  actionLabel: string;
  notes?: string;
  createdAt: string;
}

export interface RiskFlagRecord {
  id: string;
  entityType: "client" | "barber" | "shop" | "review" | "booking" | "payout";
  entityId: string;
  signalType: RiskFlagType;
  severity: RiskSeverity;
  score: number;
  publicImpact: boolean;
  open: boolean;
  notes: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ModerationActionRecord {
  id: string;
  targetType: "review" | "profile" | "report" | "dispute";
  targetId: string;
  actionLabel: string;
  actorRole: Role | "platform";
  actorId: string;
  createdAt: string;
}

export interface ReliabilityScoreRecord {
  barberId: string;
  completionRate: number;
  onTimeRate: number;
  rebookingRate: number;
  reviewIntegrityScore: number;
  overallTrustScore: number;
  updatedAt: string;
}

export interface PublicTrustSignal {
  barberId: string;
  shopId?: string;
  trustScore: number;
  completionRate: number;
  reviewIntegrityScore: number;
  verifiedBarber: boolean;
  verifiedLicense: boolean;
  verifiedShop: boolean;
  trustLabel?: string;
  publicBadgeLabels: string[];
  reliabilityLabel: string;
  reviewIntegrityLabel: string;
  moderationState: "clear" | "watch";
  verificationDecision?: VerificationProfileDecision;
}

export interface BarberVerificationStatusView {
  category: BarberVerificationCategory;
  label: string;
  status: LegacyVerificationStatus;
  canonicalStatus?: CanonicalVerificationStatus;
  submittedAt?: string;
  reviewedAt?: string;
  expiresAt?: string;
  notes?: string;
  nextStep: string;
}

export interface BarberTrustWorkspaceSummary {
  barberId: string;
  overallStatus: LegacyVerificationStatus;
  canonicalOverallStatus?: CanonicalVerificationStatus;
  verificationProgress: number;
  trustScore: number;
  completionRate: number;
  publicBadgePreview: string[];
  verificationItems: BarberVerificationStatusView[];
  openReports: number;
  openDisputes: number;
  activeRiskFlags: Array<{ signalType: RiskFlagType; severity: RiskSeverity; label: string }>;
  reminders: string[];
  verificationDecision?: VerificationProfileDecision;
}

export interface OwnerTrustWorkspaceSummary {
  shopStatuses: Array<{
    shopId: string;
    shopName: string;
    status: LegacyVerificationStatus;
    canonicalStatus?: CanonicalVerificationStatus;
    badgeLabel: string;
    verifiedCategories: ShopVerificationCategory[];
    verificationDecision?: VerificationProfileDecision;
  }>;
  staffVerification: {
    verified: number;
    pending: number;
    expired: number;
    rejected: number;
    unverified: number;
  };
  openReports: number;
  openDisputes: number;
  highRiskFlags: number;
  reviewIntegrityAlerts: number;
  pendingBarbers: Array<{
    barberId: string;
    barberName: string;
    status: LegacyVerificationStatus;
    canonicalStatus?: CanonicalVerificationStatus;
    nextStep: string;
  }>;
  recentQueue: Array<{
    id: string;
    type: ReportQueueType;
    label: string;
    status: VerificationStatus | SafetyReportStatus | DisputeStatus;
    createdAt: string;
  }>;
  shopTrustBadges: string[];
}

export interface TrustState {
  barberVerifications: BarberVerificationRecord[];
  shopVerifications: ShopVerificationRecord[];
  verificationDocuments: VerificationDocumentRecord[];
  verificationProfiles?: VerificationProfileRecord[];
  verificationReviews?: VerificationReviewRecord[];
  verificationProviderLinks?: VerificationProviderLinkRecord[];
  trustBadges: TrustBadgeRecord[];
  reviewModeration: ReviewModerationRecord[];
  safetyReports: SafetyReportRecord[];
  reportEvents: ReportEventRecord[];
  disputes: DisputeRecord[];
  disputeEvents: DisputeEventRecord[];
  riskFlags: RiskFlagRecord[];
  moderationActions: ModerationActionRecord[];
  reliabilityScores: ReliabilityScoreRecord[];
}
