import type {
  BarberVerificationRecord,
  DisputeEventRecord,
  DisputeRecord,
  ModerationActionRecord,
  ReliabilityScoreRecord,
  ReportEventRecord,
  ReviewModerationRecord,
  RiskFlagRecord,
  SafetyReportRecord,
  ShopVerificationRecord,
  TrustBadgeRecord,
  VerificationDocumentRecord,
  VerificationProfileRecord,
  VerificationProviderLinkRecord,
  VerificationReviewRecord
} from "@/types/trust";

export const demoBarberVerifications: BarberVerificationRecord[] = [
  { id: "verify-wave-identity", barberId: "barber-wave", category: "identity_verification", legalName: "Wave Carter", userId: "user-wave", verificationProfileId: "vprof-barber-wave", verificationStatus: "verified", identityStatus: "approved", payoutStatus: "approved", complianceStatus: "approved", providerIdentityStatus: "verified", providerConnectStatus: "charges_enabled", verificationSubmittedAt: "2026-02-10T09:00:00-05:00", verificationReviewedAt: "2026-02-10T15:30:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-10T15:30:00-05:00", verificationNotes: "Identity match approved.", documentPath: "verification/barber-wave/identity.pdf", updatedAt: "2026-02-10T15:30:00-05:00" },
  { id: "verify-wave-license", barberId: "barber-wave", category: "license_verification", legalName: "Wave Carter", userId: "user-wave", verificationProfileId: "vprof-barber-wave", licenseType: "Florida Barber License", professionalLicenseType: "barber", licenseNumber: "FL-BR-884201", issuingState: "FL", expirationDate: "2027-06-30", verificationStatus: "verified", verificationSubmittedAt: "2026-02-10T09:10:00-05:00", verificationReviewedAt: "2026-02-10T16:00:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-10T16:00:00-05:00", verificationNotes: "License verified and current.", documentPath: "verification/barber-wave/license.pdf", updatedAt: "2026-02-10T16:00:00-05:00" },
  { id: "verify-wave-payout", barberId: "barber-wave", category: "payout_verification", legalName: "Wave Carter", userId: "user-wave", verificationProfileId: "vprof-barber-wave", verificationStatus: "verified", payoutStatus: "approved", complianceStatus: "approved", providerConnectStatus: "payouts_enabled", verificationSubmittedAt: "2026-02-10T09:20:00-05:00", verificationReviewedAt: "2026-02-11T10:00:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-11T10:00:00-05:00", verificationNotes: "Payout profile cleared.", updatedAt: "2026-02-11T10:00:00-05:00" },
  { id: "verify-wave-shop", barberId: "barber-wave", category: "shop_affiliation_verification", legalName: "Wave Carter", userId: "user-wave", verificationProfileId: "vprof-barber-wave", verificationStatus: "verified", verificationSubmittedAt: "2026-02-10T09:25:00-05:00", verificationReviewedAt: "2026-02-11T10:05:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-11T10:05:00-05:00", verificationNotes: "Affiliation confirmed with The BVRB3R Shop(TM).", updatedAt: "2026-02-11T10:05:00-05:00" },
  { id: "verify-fade-identity", barberId: "barber-fade", category: "identity_verification", legalName: "Fade Monroe", userId: "user-fade", verificationProfileId: "vprof-barber-fade", verificationStatus: "pending", identityStatus: "submitted", payoutStatus: "not_started", complianceStatus: "approved", providerIdentityStatus: "processing", providerConnectStatus: "requirements_due", verificationSubmittedAt: "2026-03-06T11:10:00-05:00", verificationNotes: "Waiting on manual identity review.", currentRequirements: ["Verify identity", "Connect payouts"], documentPath: "verification/barber-fade/identity.pdf", updatedAt: "2026-03-06T11:10:00-05:00" },
  { id: "verify-fade-license", barberId: "barber-fade", category: "license_verification", legalName: "Fade Monroe", userId: "user-fade", verificationProfileId: "vprof-barber-fade", licenseType: "Florida Barber License", professionalLicenseType: "barber", licenseNumber: "FL-BR-781144", issuingState: "FL", expirationDate: "2026-11-30", verificationStatus: "verified", verificationSubmittedAt: "2026-02-18T09:00:00-05:00", verificationReviewedAt: "2026-02-18T14:20:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-18T14:20:00-05:00", verificationNotes: "License current.", updatedAt: "2026-02-18T14:20:00-05:00" },
  { id: "verify-blaze-identity", barberId: "barber-blaze", category: "identity_verification", legalName: "Blaze King", userId: "user-blaze", verificationProfileId: "vprof-barber-blaze", verificationStatus: "verified", identityStatus: "approved", payoutStatus: "approved", complianceStatus: "approved", providerIdentityStatus: "verified", providerConnectStatus: "payouts_enabled", verificationSubmittedAt: "2026-02-08T08:30:00-05:00", verificationReviewedAt: "2026-02-08T13:20:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-08T13:20:00-05:00", verificationNotes: "Identity verified.", updatedAt: "2026-02-08T13:20:00-05:00" },
  { id: "verify-blaze-license", barberId: "barber-blaze", category: "license_verification", legalName: "Blaze King", userId: "user-blaze", verificationProfileId: "vprof-barber-blaze", licenseType: "Florida Barber License", professionalLicenseType: "barber", licenseNumber: "FL-BR-902713", issuingState: "FL", expirationDate: "2027-04-30", verificationStatus: "verified", verificationSubmittedAt: "2026-02-08T08:35:00-05:00", verificationReviewedAt: "2026-02-08T13:30:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-08T13:30:00-05:00", verificationNotes: "License approved.", updatedAt: "2026-02-08T13:30:00-05:00" },
  { id: "verify-blaze-payout", barberId: "barber-blaze", category: "payout_verification", legalName: "Blaze King", userId: "user-blaze", verificationProfileId: "vprof-barber-blaze", verificationStatus: "verified", payoutStatus: "approved", complianceStatus: "approved", providerConnectStatus: "payouts_enabled", verificationSubmittedAt: "2026-02-08T08:45:00-05:00", verificationReviewedAt: "2026-02-09T09:10:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-09T09:10:00-05:00", verificationNotes: "Payout routing approved.", updatedAt: "2026-02-09T09:10:00-05:00" },
  { id: "verify-blaze-shop", barberId: "barber-blaze", category: "shop_affiliation_verification", legalName: "Blaze King", userId: "user-blaze", verificationProfileId: "vprof-barber-blaze", verificationStatus: "verified", verificationSubmittedAt: "2026-02-08T08:50:00-05:00", verificationReviewedAt: "2026-02-09T09:15:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-09T09:15:00-05:00", verificationNotes: "Affiliation confirmed with flagship floor.", updatedAt: "2026-02-09T09:15:00-05:00" },
  { id: "verify-luxe-identity", barberId: "barber-luxe", category: "identity_verification", legalName: "Luxe Reed", userId: "user-luxe", verificationProfileId: "vprof-barber-luxe", verificationStatus: "verified", identityStatus: "approved", payoutStatus: "submitted", complianceStatus: "approved", providerIdentityStatus: "verified", providerConnectStatus: "pending_requirements", verificationSubmittedAt: "2026-02-12T09:15:00-05:00", verificationReviewedAt: "2026-02-12T16:00:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-12T16:00:00-05:00", verificationNotes: "Identity approved.", currentRequirements: ["Connect payouts"], updatedAt: "2026-02-12T16:00:00-05:00" },
  { id: "verify-luxe-license", barberId: "barber-luxe", category: "license_verification", legalName: "Luxe Reed", userId: "user-luxe", verificationProfileId: "vprof-barber-luxe", licenseType: "Florida Barber License", professionalLicenseType: "barber", licenseNumber: "FL-BR-664120", issuingState: "FL", expirationDate: "2026-12-31", verificationStatus: "verified", verificationSubmittedAt: "2026-02-12T09:20:00-05:00", verificationReviewedAt: "2026-02-12T16:10:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-02-12T16:10:00-05:00", verificationNotes: "License confirmed.", updatedAt: "2026-02-12T16:10:00-05:00" }
];

export const demoShopVerifications: ShopVerificationRecord[] = [
  { id: "shop-verify-business", shopId: "shop-bvrb3r", category: "business_verification", businessName: "The BVRB3R Shop(TM) & Co.", userId: "user-owner", verificationProfileId: "vprof-shop-bvrb3r", dbaName: "The BVRB3R Shop", einLast4: "4821", stateOfRegistration: "FL", businessLicenseType: "barber_shop", shopLicenseNumber: "FL-SH-338812", verificationStatus: "verified", identityStatus: "approved", payoutStatus: "approved", complianceStatus: "approved", providerConnectStatus: "payouts_enabled", verificationSubmittedAt: "2026-01-15T10:00:00-05:00", verificationReviewedAt: "2026-01-18T13:00:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-01-18T13:00:00-05:00", verificationNotes: "Business registration confirmed.", documentPath: "verification/shop-bvrb3r/business.pdf", updatedAt: "2026-01-18T13:00:00-05:00" },
  { id: "shop-verify-ownership", shopId: "shop-bvrb3r", category: "ownership_verification", businessName: "The BVRB3R Shop(TM) & Co.", userId: "user-owner", verificationProfileId: "vprof-shop-bvrb3r", dbaName: "The BVRB3R Shop", einLast4: "4821", stateOfRegistration: "FL", businessLicenseType: "barber_shop", shopLicenseNumber: "FL-SH-338812", verificationStatus: "verified", identityStatus: "approved", payoutStatus: "approved", complianceStatus: "approved", providerConnectStatus: "payouts_enabled", verificationSubmittedAt: "2026-01-15T10:20:00-05:00", verificationReviewedAt: "2026-01-18T14:15:00-05:00", reviewedBy: "user-architect", lastReviewedAt: "2026-01-18T14:15:00-05:00", verificationNotes: "Ownership documentation approved.", documentPath: "verification/shop-bvrb3r/ownership.pdf", updatedAt: "2026-01-18T14:15:00-05:00" }
];

export const demoVerificationDocuments: VerificationDocumentRecord[] = [
  { id: "doc-wave-license", ownerType: "barber", ownerId: "barber-wave", userId: "user-wave", verificationProfileId: "vprof-barber-wave", category: "license_verification", documentType: "barber_license", status: "approved", storageBucket: "verification-private", storagePath: "verification/barber-wave/license.pdf", secureReference: "secure-wave-license", fileName: "wave-barber-license.pdf", mimeType: "application/pdf", fileSizeBytes: 238144, uploadedAt: "2026-02-10T09:10:00-05:00", expiresAt: "2027-06-30", reviewedAt: "2026-02-10T16:00:00-05:00", reviewedBy: "user-architect", reviewNotes: "License copy is clear and current.", updatedAt: "2026-02-10T16:00:00-05:00" },
  { id: "doc-fade-identity", ownerType: "barber", ownerId: "barber-fade", userId: "user-fade", verificationProfileId: "vprof-barber-fade", category: "identity_verification", documentType: "drivers_license", status: "submitted", storageBucket: "verification-private", storagePath: "verification/barber-fade/identity.pdf", secureReference: "secure-fade-identity", fileName: "fade-driver-license.pdf", mimeType: "application/pdf", fileSizeBytes: 205120, uploadedAt: "2026-03-06T11:10:00-05:00", reviewNotes: "Pending manual review.", updatedAt: "2026-03-06T11:10:00-05:00" },
  { id: "doc-shop-business", ownerType: "shop", ownerId: "shop-bvrb3r", userId: "user-owner", shopId: "shop-bvrb3r", verificationProfileId: "vprof-shop-bvrb3r", category: "business_verification", documentType: "business_registration", status: "approved", storageBucket: "verification-private", storagePath: "verification/shop-bvrb3r/business.pdf", secureReference: "secure-shop-business", fileName: "shop-business-registration.pdf", mimeType: "application/pdf", fileSizeBytes: 312884, uploadedAt: "2026-01-15T10:00:00-05:00", reviewedAt: "2026-01-18T13:00:00-05:00", reviewedBy: "user-architect", reviewNotes: "Business registration confirmed.", updatedAt: "2026-01-18T13:00:00-05:00" }
];

export const demoVerificationProfiles: VerificationProfileRecord[] = [
  {
    id: "vprof-barber-wave",
    userId: "user-wave",
    role: "barber",
    overallStatus: "approved",
    identityStatus: "approved",
    licenseStatus: "approved",
    businessStatus: "not_started",
    payoutStatus: "approved",
    complianceStatus: "approved",
    publicVerified: true,
    canAcceptBookings: true,
    canReceivePayouts: true,
    canCreateShopListing: false,
    currentRequirements: [],
    reviewNotes: "Wave is fully cleared for public trust and bookings.",
    lastReviewedAt: "2026-02-11T10:05:00-05:00",
    reviewedBy: "user-architect",
    createdAt: "2026-02-10T09:00:00-05:00",
    updatedAt: "2026-02-11T10:05:00-05:00"
  },
  {
    id: "vprof-barber-fade",
    userId: "user-fade",
    role: "barber",
    overallStatus: "submitted",
    identityStatus: "submitted",
    licenseStatus: "approved",
    businessStatus: "not_started",
    payoutStatus: "not_started",
    complianceStatus: "approved",
    publicVerified: false,
    canAcceptBookings: false,
    canReceivePayouts: false,
    canCreateShopListing: false,
    currentRequirements: ["Verify identity", "Connect payouts"],
    reviewNotes: "Pending identity review before public activation.",
    createdAt: "2026-03-06T11:10:00-05:00",
    updatedAt: "2026-03-06T11:10:00-05:00"
  },
  {
    id: "vprof-barber-blaze",
    userId: "user-blaze",
    role: "barber",
    overallStatus: "approved",
    identityStatus: "approved",
    licenseStatus: "approved",
    businessStatus: "not_started",
    payoutStatus: "approved",
    complianceStatus: "approved",
    publicVerified: true,
    canAcceptBookings: true,
    canReceivePayouts: true,
    canCreateShopListing: false,
    currentRequirements: [],
    reviewNotes: "Blaze is cleared and payout-ready.",
    lastReviewedAt: "2026-02-09T09:15:00-05:00",
    reviewedBy: "user-architect",
    createdAt: "2026-02-08T08:30:00-05:00",
    updatedAt: "2026-02-09T09:15:00-05:00"
  },
  {
    id: "vprof-barber-luxe",
    userId: "user-luxe",
    role: "barber",
    overallStatus: "submitted",
    identityStatus: "approved",
    licenseStatus: "approved",
    businessStatus: "not_started",
    payoutStatus: "submitted",
    complianceStatus: "approved",
    publicVerified: false,
    canAcceptBookings: false,
    canReceivePayouts: false,
    canCreateShopListing: false,
    currentRequirements: ["Connect payouts"],
    reviewNotes: "Waiting on provider payout requirements.",
    lastReviewedAt: "2026-02-12T16:10:00-05:00",
    reviewedBy: "user-architect",
    createdAt: "2026-02-12T09:15:00-05:00",
    updatedAt: "2026-02-12T16:10:00-05:00"
  },
  {
    id: "vprof-shop-bvrb3r",
    userId: "user-owner",
    role: "shop_owner",
    overallStatus: "approved",
    identityStatus: "approved",
    licenseStatus: "not_started",
    businessStatus: "approved",
    payoutStatus: "approved",
    complianceStatus: "approved",
    publicVerified: true,
    canAcceptBookings: false,
    canReceivePayouts: true,
    canCreateShopListing: true,
    currentRequirements: [],
    reviewNotes: "Flagship shop is fully cleared.",
    lastReviewedAt: "2026-01-18T14:15:00-05:00",
    reviewedBy: "user-architect",
    createdAt: "2026-01-15T10:00:00-05:00",
    updatedAt: "2026-01-18T14:15:00-05:00"
  }
];

export const demoVerificationReviews: VerificationReviewRecord[] = [
  {
    id: "vreview-wave-approved",
    verificationProfileId: "vprof-barber-wave",
    reviewType: "overall",
    actionType: "approved",
    fromStatus: "submitted",
    toStatus: "approved",
    reviewedBy: "user-architect",
    reason: "Identity, license, and payout checks all cleared.",
    internalNotes: "Manual trust review completed.",
    createdAt: "2026-02-11T10:05:00-05:00"
  },
  {
    id: "vreview-fade-submitted",
    verificationProfileId: "vprof-barber-fade",
    reviewType: "identity",
    actionType: "submitted",
    fromStatus: "not_started",
    toStatus: "submitted",
    reviewedBy: "user-fade",
    reason: "Driver license uploaded for identity review.",
    createdAt: "2026-03-06T11:10:00-05:00"
  },
  {
    id: "vreview-luxe-payout",
    verificationProfileId: "vprof-barber-luxe",
    reviewType: "payout_tax",
    actionType: "submitted",
    fromStatus: "not_started",
    toStatus: "submitted",
    reviewedBy: "user-luxe",
    reason: "Connect onboarding launched for payout review.",
    createdAt: "2026-02-12T16:15:00-05:00"
  },
  {
    id: "vreview-shop-approved",
    verificationProfileId: "vprof-shop-bvrb3r",
    reviewType: "overall",
    actionType: "approved",
    fromStatus: "submitted",
    toStatus: "approved",
    reviewedBy: "user-architect",
    reason: "Business registration, ownership, and payout rails verified.",
    internalNotes: "Verified shop badge enabled.",
    createdAt: "2026-01-18T14:15:00-05:00"
  }
];

export const demoVerificationProviderLinks: VerificationProviderLinkRecord[] = [
  {
    id: "vprovider-wave-connect",
    verificationProfileId: "vprof-barber-wave",
    userId: "user-wave",
    provider: "stripe",
    providerSubject: "connect_account",
    providerReferenceId: "acct_wave_demo",
    providerStatus: "payouts_enabled",
    metadata: {
      payoutsEnabled: true,
      chargesEnabled: true,
      requirementsCurrentlyDue: []
    },
    createdAt: "2026-02-10T09:20:00-05:00",
    updatedAt: "2026-02-11T10:00:00-05:00"
  },
  {
    id: "vprovider-fade-identity",
    verificationProfileId: "vprof-barber-fade",
    userId: "user-fade",
    provider: "stripe",
    providerSubject: "identity_session",
    providerReferenceId: "vs_fade_demo",
    providerStatus: "processing",
    metadata: {
      lastEvent: "verification_session.processing"
    },
    createdAt: "2026-03-06T11:10:00-05:00",
    updatedAt: "2026-03-06T11:10:00-05:00"
  },
  {
    id: "vprovider-luxe-connect",
    verificationProfileId: "vprof-barber-luxe",
    userId: "user-luxe",
    provider: "stripe",
    providerSubject: "connect_account",
    providerReferenceId: "acct_luxe_demo",
    providerStatus: "requirements_due",
    metadata: {
      payoutsEnabled: false,
      chargesEnabled: true,
      requirementsCurrentlyDue: ["external_account"]
    },
    createdAt: "2026-02-12T16:15:00-05:00",
    updatedAt: "2026-02-12T16:15:00-05:00"
  },
  {
    id: "vprovider-shop-connect",
    verificationProfileId: "vprof-shop-bvrb3r",
    userId: "user-owner",
    provider: "stripe",
    providerSubject: "connect_account",
    providerReferenceId: "acct_shop_demo",
    providerStatus: "payouts_enabled",
    metadata: {
      payoutsEnabled: true,
      chargesEnabled: true,
      requirementsCurrentlyDue: []
    },
    createdAt: "2026-01-15T10:00:00-05:00",
    updatedAt: "2026-01-18T14:15:00-05:00"
  }
];

export const demoTrustBadges: TrustBadgeRecord[] = [
  { id: "badge-wave-trusted", scopeType: "barber", scopeId: "barber-wave", badge: "trusted_pro", label: "Trusted Pro", publicVisible: true, grantedAt: "2026-02-15T10:00:00-05:00" },
  { id: "badge-blaze-trusted", scopeType: "barber", scopeId: "barber-blaze", badge: "trusted_pro", label: "Trusted Pro", publicVisible: true, grantedAt: "2026-02-16T10:00:00-05:00" },
  { id: "badge-shop-verified", scopeType: "shop", scopeId: "shop-bvrb3r", badge: "verified_shop", label: "Verified Shop", publicVisible: true, grantedAt: "2026-01-18T14:20:00-05:00" },
  { id: "badge-fade-rising", scopeType: "barber", scopeId: "barber-fade", badge: "rising_barber", label: "Rising Barber", publicVisible: true, grantedAt: "2026-03-03T10:00:00-05:00" }
];

export const demoReviewModeration: ReviewModerationRecord[] = [
  { id: "review-mod-1", reviewId: "review-1", barberId: "barber-wave", clientId: "client-jordan", appointmentId: "appt-1", eligible: true, moderationStatus: "approved", suspiciousFlags: [], abuseReported: false, integrityScore: 99, reviewedAt: "2026-03-06T13:00:00-05:00", createdAt: "2026-03-06T12:30:00-05:00", updatedAt: "2026-03-06T13:00:00-05:00" },
  { id: "review-mod-2", reviewId: "review-2", barberId: "barber-blaze", clientId: "client-nova", appointmentId: "appt-4", eligible: true, moderationStatus: "approved", suspiciousFlags: [], abuseReported: false, integrityScore: 98, reviewedAt: "2026-03-05T15:20:00-05:00", createdAt: "2026-03-05T15:00:00-05:00", updatedAt: "2026-03-05T15:20:00-05:00" },
  { id: "review-mod-3", reviewId: "review-3", barberId: "barber-fade", clientId: "client-malik", appointmentId: "appt-5", eligible: true, moderationStatus: "approved", suspiciousFlags: [], abuseReported: false, integrityScore: 95, reviewedAt: "2026-03-02T11:15:00-05:00", createdAt: "2026-03-02T11:00:00-05:00", updatedAt: "2026-03-02T11:15:00-05:00" },
  { id: "review-mod-4", reviewId: "review-4", barberId: "barber-luxe", clientId: "client-zoe", appointmentId: "appt-7", eligible: true, moderationStatus: "approved", suspiciousFlags: [], abuseReported: false, integrityScore: 92, reviewedAt: "2026-03-01T17:10:00-05:00", createdAt: "2026-03-01T16:50:00-05:00", updatedAt: "2026-03-01T17:10:00-05:00" },
  { id: "review-mod-fade-watch", reviewId: "review-flagged-demo", barberId: "barber-fade", clientId: "client-sage", eligible: false, moderationStatus: "flagged", suspiciousFlags: ["duplicate_pattern", "no_completed_booking_match"], abuseReported: true, integrityScore: 52, reviewedAt: "2026-03-07T10:30:00-05:00", createdAt: "2026-03-07T10:00:00-05:00", updatedAt: "2026-03-07T10:30:00-05:00" }
];

export const demoSafetyReports: SafetyReportRecord[] = [
  { id: "report-no-show-lyric", reporterRole: "owner", reporterId: "user-owner", reporterEmail: "owner@bvrb3r.demo", subjectType: "client", subjectId: "client-lyric", category: "no_show_abuse", details: "Repeated late cancellations and a recent no-show are being tracked before stronger booking restrictions are applied.", status: "open", locationId: "loc-ybor", createdAt: "2026-03-07T18:25:00-05:00", updatedAt: "2026-03-07T18:25:00-05:00" },
  { id: "report-booking-dispute-ava", reporterRole: "client", reporterId: "client-ava", reporterEmail: "ava@example.com", subjectType: "booking", subjectId: "appt-7", category: "payment_dispute", details: "Client asked for review of a timing mismatch between confirmation and service completion notes.", status: "under_review", locationId: "loc-hyde", createdAt: "2026-03-08T09:40:00-05:00", updatedAt: "2026-03-08T10:05:00-05:00" }
];
export const demoReportEvents: ReportEventRecord[] = [
  { id: "report-event-1", reportId: "report-no-show-lyric", actorRole: "owner", actorId: "user-owner", actionLabel: "Case opened", notes: "Watchlist created for repeated no-show behavior.", createdAt: "2026-03-07T18:26:00-05:00" },
  { id: "report-event-2", reportId: "report-booking-dispute-ava", actorRole: "owner", actorId: "user-owner", actionLabel: "Review started", notes: "Payment and service notes pulled for moderation review.", createdAt: "2026-03-08T10:06:00-05:00" }
];
export const demoDisputes: DisputeRecord[] = [
  { id: "dispute-no-show-lyric", disputeType: "no_show", disputeStatus: "under_review", submittedByRole: "client", submittedById: "client-lyric", involvedPartyType: "booking", involvedPartyId: "appt-8", appointmentId: "appt-8", locationId: "loc-ybor", summary: "Client is asking for a courtesy review of retained deposit policy after a no-show.", createdAt: "2026-03-08T08:15:00-05:00", updatedAt: "2026-03-08T09:30:00-05:00" },
  { id: "dispute-quality-zoe", disputeType: "service_quality", disputeStatus: "resolved", submittedByRole: "client", submittedById: "client-zoe", involvedPartyType: "barber", involvedPartyId: "barber-luxe", appointmentId: "appt-7", locationId: "loc-hyde", summary: "Client requested a post-service credit review around confirmation timing.", resolutionNotes: "Owner approved courtesy add-on credit instead of refund.", createdAt: "2026-03-02T09:00:00-05:00", updatedAt: "2026-03-03T11:00:00-05:00" }
];
export const demoDisputeEvents: DisputeEventRecord[] = [
  { id: "dispute-event-1", disputeId: "dispute-no-show-lyric", actorRole: "owner", actorId: "user-owner", actionLabel: "Policy review opened", notes: "Deposit retention policy and reminder logs attached.", createdAt: "2026-03-08T09:31:00-05:00" },
  { id: "dispute-event-2", disputeId: "dispute-quality-zoe", actorRole: "owner", actorId: "user-owner", actionLabel: "Resolved with courtesy credit", notes: "No refund processed. Client retained.", createdAt: "2026-03-03T11:00:00-05:00" }
];
export const demoRiskFlags: RiskFlagRecord[] = [
  { id: "risk-client-lyric", entityType: "client", entityId: "client-lyric", signalType: "repeated_no_show", severity: "high", score: 82, publicImpact: false, open: true, notes: "Two recent late cancellations plus one retained-deposit no-show.", createdAt: "2026-03-07T18:20:00-05:00" },
  { id: "risk-review-fade", entityType: "review", entityId: "review-flagged-demo", signalType: "suspicious_review_pattern", severity: "medium", score: 58, publicImpact: true, open: true, notes: "Flagged review pattern held out of ranking until manually cleared.", createdAt: "2026-03-07T10:30:00-05:00" }
];
export const demoModerationActions: ModerationActionRecord[] = [
  { id: "moderation-action-1", targetType: "review", targetId: "review-flagged-demo", actionLabel: "Held from public display", actorRole: "platform", actorId: "trust-ops", createdAt: "2026-03-07T10:35:00-05:00" },
  { id: "moderation-action-2", targetType: "dispute", targetId: "dispute-quality-zoe", actionLabel: "Closed with courtesy resolution", actorRole: "owner", actorId: "user-owner", createdAt: "2026-03-03T11:00:00-05:00" }
];
export const demoReliabilityScores: ReliabilityScoreRecord[] = [
  { barberId: "barber-wave", completionRate: 98, onTimeRate: 97, rebookingRate: 84, reviewIntegrityScore: 99, overallTrustScore: 96, updatedAt: "2026-03-08T18:00:00-05:00" },
  { barberId: "barber-fade", completionRate: 91, onTimeRate: 89, rebookingRate: 68, reviewIntegrityScore: 81, overallTrustScore: 82, updatedAt: "2026-03-08T18:00:00-05:00" },
  { barberId: "barber-blaze", completionRate: 97, onTimeRate: 95, rebookingRate: 80, reviewIntegrityScore: 98, overallTrustScore: 94, updatedAt: "2026-03-08T18:00:00-05:00" },
  { barberId: "barber-luxe", completionRate: 93, onTimeRate: 90, rebookingRate: 74, reviewIntegrityScore: 92, overallTrustScore: 88, updatedAt: "2026-03-08T18:00:00-05:00" }
];
