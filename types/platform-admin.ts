import type {
  BarberVerificationCategory,
  BusinessLicenseType,
  CanonicalVerificationStatus,
  ProfessionalLicenseType,
  ShopVerificationCategory,
  VerificationActionType,
  VerificationDocumentType,
  VerificationReviewType,
  VerificationStatus,
  VerificationSubjectRole
} from "@/types/trust";

export type PlatformAdminActionClass = "safe" | "sensitive" | "critical";
export type PlatformAdminAccountStatus = "active" | "deactivated" | "suspended" | "banned" | "profile_only";
export type PlatformAdminShopStatus = "active" | "inactive";
export type PlatformAdminTargetType =
  | "user"
  | "shop"
  | "dispute"
  | "financial_anomaly"
  | "barber_verification"
  | "shop_verification"
  | "verification_profile"
  | "verification_document"
  | "control";

export interface PlatformAdminVerificationItem {
  category: string;
  label: string;
  status: string;
}

export interface PlatformAdminAuditLogEntry {
  id: string;
  actorUserId: string;
  actorRole: string;
  actionClass: PlatformAdminActionClass;
  actionType: string;
  targetType: PlatformAdminTargetType;
  targetId: string;
  note?: string | null;
  beforeSummary?: string | null;
  afterSummary?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformAdminOverview {
  totalUsers: number;
  activeClients: number;
  activeBarbers: number;
  activeShops: number;
  bookingsToday: number;
  revenueToday: number;
  payoutIssues: number;
  billingIssues: number;
  fraudFlags: number;
  kioskActiveCount: number;
  aiManagerActiveCount: number;
  releaseReadyCount: number;
  releaseAttentionCount: number;
}

export interface PlatformAdminUserView {
  id: string;
  authUserId?: string;
  barberId?: string;
  clientId?: string;
  name: string;
  email: string;
  phone?: string;
  primaryRole: string;
  title: string;
  accountStatus: PlatformAdminAccountStatus;
  verificationStatus: string;
  shopRelationships: string[];
  accountHealth: string[];
  bookingSummary: {
    completed: number;
    active: number;
    cancelled: number;
    lifetimeValue: number;
  };
  pointsSummary: {
    totalPoints: number;
    unlockedPoints: number;
    pendingPoints: number;
  };
  referralSummary: {
    invited: number;
    completed: number;
    credited: number;
  };
  verificationItems: PlatformAdminVerificationItem[];
  supportFlags: string[];
  canManageAccess: boolean;
  isPlatformAdmin: boolean;
}

export interface PlatformAdminShopView {
  id: string;
  name: string;
  ownerLabel: string;
  status: PlatformAdminShopStatus;
  locationLabels: string[];
  activeBarbers: number;
  kioskEnabled: boolean;
  aiManagerEnabled: boolean;
  billingHealth: string;
  verificationStatus: string;
  verificationItems: PlatformAdminVerificationItem[];
  revenueToday: number;
  growthSummary: string;
  accountHealth: string[];
}

export interface PlatformAdminMoneyRiskView {
  openAnomalies: number;
  criticalAnomalies: number;
  billingFailures: number;
  disputesOpen: number;
  pointsLiabilityValue: number;
  fraudReviewRate: number;
  reversalRate: number;
  overdueBoothRent: number;
  recentAnomalies: Array<{
    id: string;
    summary: string;
    status: string;
    severity: string;
    description?: string | null;
  }>;
  recentCashouts: Array<{
    requestId: string;
    userLabel: string;
    role: string;
    status: string;
    cashValue: number;
  }>;
  recentDisputes: Array<{
    id: string;
    summary: string;
    status: string;
    locationId?: string;
  }>;
}

export interface PlatformAdminSupportItem {
  id: string;
  kind: "booking" | "payout" | "points" | "referral" | "queue" | "kiosk";
  title: string;
  detail: string;
  statusLabel: string;
  relatedUserLabel?: string;
  relatedShopLabel?: string;
  href?: string;
}

export interface PlatformAdminControlsView {
  shops: Array<{
    shopId: string;
    shopName: string;
    shopStatus: PlatformAdminShopStatus;
    kioskEnabled: boolean;
    aiManagerEnabled: boolean;
    billingHealth: string;
    verificationStatus: string;
  }>;
  release: {
    readyCount: number;
    attentionCount: number;
  };
}

export interface PlatformAdminConsolePayload {
  actorName: string;
  overview: PlatformAdminOverview;
  users: PlatformAdminUserView[];
  shops: PlatformAdminShopView[];
  moneyRisk: PlatformAdminMoneyRiskView;
  support: PlatformAdminSupportItem[];
  controls: PlatformAdminControlsView;
  auditLog: PlatformAdminAuditLogEntry[];
  warnings: string[];
}

export interface ArchitectVerificationQueueFilters {
  search?: string;
  role?: VerificationSubjectRole | "all";
  overallStatus?: VerificationStatus | "all";
  identityStatus?: VerificationStatus | "all";
  licenseStatus?: VerificationStatus | "all";
  businessStatus?: VerificationStatus | "all";
  payoutStatus?: VerificationStatus | "all";
  complianceStatus?: VerificationStatus | "all";
  submittedOnly?: boolean;
}

export interface ArchitectVerificationQueueItem {
  profileId: string;
  source: "profile" | "legacy_records" | "fallback";
  userId?: string;
  subjectName: string;
  subjectEmail?: string;
  subjectPhone?: string;
  role: VerificationSubjectRole;
  barberId?: string;
  shopId?: string;
  shopName?: string;
  overallStatus: VerificationStatus;
  canonicalOverallStatus: CanonicalVerificationStatus;
  identityStatus: VerificationStatus;
  licenseStatus: VerificationStatus;
  businessStatus: VerificationStatus;
  payoutStatus: VerificationStatus;
  complianceStatus: VerificationStatus;
  publicVerified: boolean;
  canAcceptBookings: boolean;
  canReceivePayouts: boolean;
  canCreateShopListing: boolean;
  lastReviewedAt?: string;
  submittedAt?: string;
  updatedAt: string;
  currentRequirementsCount: number;
  currentRequirements: string[];
  legalBusinessName?: string;
  licenseNumber?: string;
}

export interface ArchitectVerificationQueuePayload {
  items: ArchitectVerificationQueueItem[];
  warnings: string[];
}

export interface ArchitectVerificationDocumentView {
  id: string;
  documentType?: VerificationDocumentType;
  legacyCategory: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedAt: string;
  expiresAt?: string;
  status?: VerificationStatus;
  reviewNotes?: string;
}

export interface ArchitectVerificationReviewView {
  id: string;
  reviewType: VerificationReviewType;
  actionType: VerificationActionType;
  fromStatus?: VerificationStatus;
  toStatus?: VerificationStatus;
  reviewedBy: string;
  reviewerLabel: string;
  reason?: string;
  internalNotes?: string;
  createdAt: string;
}

export interface ArchitectVerificationProviderView {
  id: string;
  provider: string;
  providerSubject: string;
  providerReferenceId: string;
  providerStatus?: string;
  summary: string;
  remediationMessage?: string;
  disabledReason?: string;
  lastErrorCode?: string;
  lastErrorReason?: string;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ArchitectVerificationDetailPayload {
  profile: {
    profileId: string;
    source: "profile" | "legacy_records" | "fallback";
    userId?: string;
    subjectName: string;
    subjectEmail?: string;
    subjectPhone?: string;
    role: VerificationSubjectRole;
    barberId?: string;
    shopId?: string;
    shopName?: string;
    overallStatus: VerificationStatus;
    canonicalOverallStatus: CanonicalVerificationStatus;
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
    submittedAt?: string;
    updatedAt: string;
    barberDetail?: {
      legalName?: string;
      professionalLicenseType?: ProfessionalLicenseType;
      licenseNumber?: string;
      issuingState?: string;
      expirationDate?: string;
      providerIdentityStatus?: string;
      providerConnectStatus?: string;
    };
    shopDetail?: {
      businessName?: string;
      dbaName?: string;
      einLast4?: string;
      stateOfRegistration?: string;
      businessLicenseType?: BusinessLicenseType;
      shopLicenseNumber?: string;
      providerConnectStatus?: string;
    };
    documents: ArchitectVerificationDocumentView[];
    reviews: ArchitectVerificationReviewView[];
    providerLinks: ArchitectVerificationProviderView[];
    auditTrail: PlatformAdminAuditLogEntry[];
  } | null;
  warnings: string[];
}

export interface ArchitectVerificationActionInput {
  reason: string;
  internalNotes?: string;
}

export type ArchitectAccountRoleFilter = "all" | "client" | "barber" | "shop_owner" | "platform_admin";
export type ArchitectAccountStatusFilter =
  | "all"
  | "active"
  | "profile_only"
  | "deactivated"
  | "suspended"
  | "banned"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_update";
export type ArchitectAccountOnboardingFilter =
  | "all"
  | "missing_profile"
  | "awaiting_contact_verification"
  | "awaiting_role_selection"
  | "role_selected"
  | "active"
  | "complete";

export interface ArchitectAccountDirectoryFilters {
  search?: string;
  role?: ArchitectAccountRoleFilter;
  status?: ArchitectAccountStatusFilter;
  onboarding?: ArchitectAccountOnboardingFilter;
}

export interface ArchitectAccountSummaryCounts {
  totalAccounts: number;
  totalClients: number;
  totalBarbers: number;
  totalShopOwners: number;
  totalPlatformAdmins: number;
  pendingBarberApprovals: number;
  pendingShopOwnerApprovals: number;
  approvedBarbers: number;
  approvedShops: number;
  suspendedAccounts: number;
  bannedAccounts: number;
}

export interface ArchitectAccountDirectoryItem {
  profileId: string;
  authUserId: string;
  profileExists: boolean;
  fullName: string;
  email: string;
  phone?: string;
  authProvider?: string;
  authProviders?: string[];
  authCreatedAt?: string | null;
  lastSignInAt?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  role: ArchitectAccountRoleFilter;
  roleLabel: string;
  primaryOnboardingRole?: string | null;
  onboardingState?: string | null;
  accountStatus: PlatformAdminAccountStatus;
  approvalStatus: string;
  verificationStatus: string;
  verificationProfileId?: string;
  barberId?: string;
  barberReference?: string;
  barberSubtype?: string | null;
  shopId?: string;
  shopName?: string;
  clientId?: string;
  username?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  serviceCount: number;
  availabilityCount: number;
  documentCount: number;
  reviewCount: number;
  marketplaceBlockers: string[];
  searchText: string;
}

export interface ArchitectDashboardPayload {
  actorName: string;
  counts: ArchitectAccountSummaryCounts;
  recentSignups: ArchitectAccountDirectoryItem[];
  recentApprovalActions: PlatformAdminAuditLogEntry[];
  warnings: string[];
}

export interface ArchitectAccountDirectoryPayload {
  accounts: ArchitectAccountDirectoryItem[];
  counts: ArchitectAccountSummaryCounts;
  filters: ArchitectAccountDirectoryFilters;
  warnings: string[];
}

export interface ArchitectAccountDetailPayload {
  account: (ArchitectAccountDirectoryItem & {
    profile: {
      id: string;
      exists: boolean;
      role?: string | null;
      fullName?: string | null;
      email?: string | null;
      phone?: string | null;
      primaryOnboardingRole?: string | null;
      onboardingState?: string | null;
      phoneVerifiedAt?: string | null;
      lastOnboardedAt?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    };
    authIdentity?: {
      id: string;
      email?: string | null;
      phone?: string | null;
      providers: string[];
      createdAt?: string | null;
      updatedAt?: string | null;
      lastSignInAt?: string | null;
      emailVerified: boolean;
      phoneVerified: boolean;
    };
    barber?: {
      id: string;
      referenceCode?: string | null;
      compensationModel?: string | null;
      barberSubtype?: string | null;
      appApprovalStatus?: string | null;
      shopApprovalStatus?: string | null;
      status?: string | null;
      acceptingBookings?: boolean | null;
      nextAvailableAt?: string | null;
      visibilityState?: string | null;
      acceptsInstantBookings?: boolean | null;
      servicesCount: number;
      availabilityRulesCount: number;
      workingHoursCount: number;
      linkedShopIds: string[];
    };
    shopOwner?: {
      shopExists: boolean;
      id?: string;
      name?: string | null;
      appApprovalStatus?: string | null;
      city?: string | null;
      state?: string | null;
      address?: string | null;
      phone?: string | null;
      activeLinkedBarbers: number;
      serviceCount: number;
      locationLabels: string[];
      shopStatus?: PlatformAdminShopStatus;
    };
    client?: {
      id?: string;
      referenceCode?: string | null;
      retentionTag?: string | null;
      loyaltyPoints?: number | null;
      bookingCounts: {
        total: number;
        completed: number;
        active: number;
        cancelled: number;
      };
    };
    verificationProfiles: Array<{
      id: string;
      role: string;
      overallStatus: string;
      identityStatus: string;
      licenseStatus: string;
      businessStatus: string;
      payoutStatus: string;
      complianceStatus: string;
      publicVerified: boolean;
      canAcceptBookings: boolean;
      canReceivePayouts: boolean;
      canCreateShopListing: boolean;
      currentRequirements: string[];
      reviewNotes?: string | null;
      lastReviewedAt?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
    documents: ArchitectVerificationDocumentView[];
    reviews: ArchitectVerificationReviewView[];
    auditTrail: PlatformAdminAuditLogEntry[];
  }) | null;
  warnings: string[];
}

export type PlatformAdminActionInput =
  | {
      type: "set_user_status";
      userId: string;
      nextStatus: Exclude<PlatformAdminAccountStatus, "profile_only">;
      note?: string;
    }
  | {
      type: "set_shop_status";
      shopId: string;
      nextStatus: PlatformAdminShopStatus;
      note?: string;
    }
  | {
      type: "set_shop_control";
      shopId: string;
      controlKey: "kiosk_enabled" | "ai_manager_enabled";
      enabled: boolean;
      note?: string;
    }
  | {
      type: "update_barber_verification";
      barberId: string;
      category: BarberVerificationCategory;
      status: VerificationStatus;
      note?: string;
    }
  | {
      type: "update_shop_verification";
      shopId: string;
      category: ShopVerificationCategory;
      status: VerificationStatus;
      note?: string;
    }
  | {
      type: "resolve_dispute";
      disputeId: string;
      note?: string;
    }
  | {
      type: "resolve_financial_anomaly";
      anomalyId: string;
      note?: string;
    }
  | {
      type: "dismiss_financial_anomaly";
      anomalyId: string;
      note?: string;
    };
