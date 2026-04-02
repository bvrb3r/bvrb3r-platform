import type { VerificationUploadRecord, VerificationUploadView } from "@/types/activation";
import type {
  BarberVerificationRecord,
  ShopVerificationRecord,
  VerificationDocumentAdminView,
  VerificationDocumentRecord,
  VerificationDocumentSubjectView,
  VerificationProfileRecord,
  VerificationProviderLinkRecord,
  VerificationProviderStatusSummary,
  VerificationProviderStatusView,
  VerificationReviewRecord,
  VerificationReviewSubjectView,
  VerificationSubjectProfileView
} from "@/types/trust";

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => `${entry ?? ""}`.trim())
    .filter(Boolean);
}

function readOptionalString(value: unknown) {
  const normalized = `${value ?? ""}`.trim();
  return normalized ? normalized : undefined;
}

export function summarizeVerificationProviderStatus(
  providerLink: VerificationProviderLinkRecord
): VerificationProviderStatusSummary {
  const requirementsCurrentlyDue = normalizeStringList(providerLink.metadata.requirementsCurrentlyDue);
  const requirementsPastDue = normalizeStringList(providerLink.metadata.requirementsPastDue);
  const disabledReason = readOptionalString(providerLink.metadata.disabledReason);
  const lastErrorCode = readOptionalString(providerLink.metadata.lastErrorCode);
  const lastErrorReason = readOptionalString(providerLink.metadata.lastErrorReason);

  if (providerLink.providerSubject === "identity_session") {
    const summary =
      providerLink.providerStatus === "verified"
        ? "Stripe Identity verified this professional."
        : providerLink.providerStatus === "requires_input"
          ? "Stripe Identity needs updated information before this lane can be approved."
          : providerLink.providerStatus === "processing"
            ? "Stripe Identity is reviewing the submitted verification."
            : providerLink.providerStatus === "canceled"
              ? "The Stripe Identity session was canceled and must be restarted."
              : providerLink.providerStatus === "redacted"
                ? "This Stripe Identity session was redacted and no longer satisfies verification."
                : "Stripe Identity has not completed verification for this lane yet.";

    return {
      summary,
      remediationMessage:
        providerLink.providerStatus === "requires_input"
          ? lastErrorReason ?? "Open Stripe Identity again and resubmit the requested document."
          : providerLink.providerStatus === "canceled" || providerLink.providerStatus === "redacted"
            ? "Start a new Stripe Identity verification session to continue."
            : providerLink.providerStatus === "processing"
              ? "Wait for Stripe to finish reviewing the submission."
              : undefined,
      disabledReason,
      lastErrorCode,
      lastErrorReason,
      requirementsCurrentlyDue,
      requirementsPastDue
    };
  }

  const summary =
    providerLink.providerStatus === "payouts_enabled"
      ? "Stripe Connect has enabled payouts for this lane."
      : providerLink.providerStatus === "requirements_due"
        ? "Stripe Connect requires more information before payouts can be enabled."
        : providerLink.providerStatus === "restricted"
          ? "Stripe Connect has restricted this account until the listed requirements are resolved."
          : providerLink.providerStatus === "submitted"
            ? "Stripe Connect onboarding has been submitted and is pending review."
            : providerLink.providerStatus === "in_progress"
              ? "Stripe Connect onboarding has started but is not complete yet."
              : "Stripe Connect has not completed payout onboarding for this lane yet.";

  return {
    summary,
    remediationMessage:
      requirementsPastDue.length || requirementsCurrentlyDue.length || disabledReason
        ? disabledReason
          ?? (requirementsPastDue[0] ? `Resolve Stripe requirement: ${requirementsPastDue[0]}.` : `Complete Stripe requirement: ${requirementsCurrentlyDue[0]}.`)
        : providerLink.providerStatus === "in_progress" || providerLink.providerStatus === "submitted"
          ? "Continue Stripe onboarding to finish payout setup."
          : undefined,
    disabledReason,
    lastErrorCode,
    lastErrorReason,
    requirementsCurrentlyDue,
    requirementsPastDue
  };
}

export function serializeVerificationDocumentForSubject(
  document: VerificationDocumentRecord
): VerificationDocumentSubjectView {
  return {
    id: document.id,
    documentType: document.documentType,
    legacyCategory: document.category,
    fileName: document.fileName ?? "Verification document",
    mimeType: document.mimeType ?? document.contentType,
    fileSizeBytes: document.fileSizeBytes,
    uploadedAt: document.uploadedAt,
    expiresAt: document.expiresAt,
    status: document.status
  };
}

export function serializeVerificationDocumentForAdmin(
  document: VerificationDocumentRecord
): VerificationDocumentAdminView {
  return {
    ...serializeVerificationDocumentForSubject(document),
    reviewedAt: document.reviewedAt,
    reviewedBy: document.reviewedBy,
    reviewNotes: document.reviewNotes
  };
}

export function serializeVerificationReviewForSubject(
  review: VerificationReviewRecord
): VerificationReviewSubjectView {
  return {
    id: review.id,
    reviewType: review.reviewType,
    actionType: review.actionType,
    fromStatus: review.fromStatus,
    toStatus: review.toStatus,
    reason: review.reason,
    createdAt: review.createdAt
  };
}

export function serializeVerificationProviderStatus(
  providerLink: VerificationProviderLinkRecord
): VerificationProviderStatusView {
  const summary = summarizeVerificationProviderStatus(providerLink);
  return {
    id: providerLink.id,
    provider: providerLink.provider,
    providerSubject: providerLink.providerSubject,
    providerStatus: providerLink.providerStatus,
    summary: summary.summary,
    remediationMessage: summary.remediationMessage,
    disabledReason: summary.disabledReason,
    lastErrorCode: summary.lastErrorCode,
    lastErrorReason: summary.lastErrorReason,
    requirementsCurrentlyDue: summary.requirementsCurrentlyDue,
    requirementsPastDue: summary.requirementsPastDue,
    updatedAt: providerLink.updatedAt
  };
}

export function serializeVerificationUpload(upload: VerificationUploadRecord): VerificationUploadView {
  return {
    id: upload.id,
    ownerType: upload.ownerType,
    ownerId: upload.ownerId,
    category: upload.category,
    fileName: upload.fileName,
    contentType: upload.contentType,
    fileSizeBytes: upload.fileSizeBytes,
    uploadStatus: upload.uploadStatus,
    uploadedByRole: upload.uploadedByRole,
    uploadedAt: upload.uploadedAt,
    expiresAt: upload.expiresAt
  };
}

export function serializeBarberVerificationForSubject(verification: BarberVerificationRecord) {
  return {
    id: verification.id,
    category: verification.category,
    legalName: verification.legalName,
    licenseType: verification.licenseType,
    licenseNumber: verification.licenseNumber,
    issuingState: verification.issuingState,
    expirationDate: verification.expirationDate,
    verificationStatus: verification.verificationStatus,
    identityStatus: verification.identityStatus,
    payoutStatus: verification.payoutStatus,
    complianceStatus: verification.complianceStatus,
    verificationSubmittedAt: verification.verificationSubmittedAt,
    verificationReviewedAt: verification.verificationReviewedAt,
    verificationNotes: verification.verificationNotes,
    updatedAt: verification.updatedAt
  };
}

export function serializeShopVerificationForSubject(verification: ShopVerificationRecord) {
  return {
    id: verification.id,
    shopId: verification.shopId,
    category: verification.category,
    businessName: verification.businessName,
    dbaName: verification.dbaName,
    verificationStatus: verification.verificationStatus,
    identityStatus: verification.identityStatus,
    payoutStatus: verification.payoutStatus,
    complianceStatus: verification.complianceStatus,
    verificationSubmittedAt: verification.verificationSubmittedAt,
    verificationReviewedAt: verification.verificationReviewedAt,
    verificationNotes: verification.verificationNotes,
    updatedAt: verification.updatedAt
  };
}

export function serializeVerificationProfileForSubject(input: {
  profile: VerificationProfileRecord;
  documents: VerificationDocumentRecord[];
  reviews: VerificationReviewRecord[];
  providerStatuses: VerificationProviderLinkRecord[];
}): VerificationSubjectProfileView {
  return {
    profileId: input.profile.id,
    role: input.profile.role,
    overallStatus: input.profile.overallStatus,
    identityStatus: input.profile.identityStatus,
    licenseStatus: input.profile.licenseStatus,
    businessStatus: input.profile.businessStatus,
    payoutStatus: input.profile.payoutStatus,
    complianceStatus: input.profile.complianceStatus,
    publicVerified: input.profile.publicVerified,
    canAcceptBookings: input.profile.canAcceptBookings,
    canReceivePayouts: input.profile.canReceivePayouts,
    canCreateShopListing: input.profile.canCreateShopListing,
    currentRequirements: input.profile.currentRequirements,
    lastReviewedAt: input.profile.lastReviewedAt,
    updatedAt: input.profile.updatedAt,
    documents: input.documents.map(serializeVerificationDocumentForSubject),
    reviews: input.reviews.map(serializeVerificationReviewForSubject),
    providerStatuses: input.providerStatuses.map(serializeVerificationProviderStatus)
  };
}
