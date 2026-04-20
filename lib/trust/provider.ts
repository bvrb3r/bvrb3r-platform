/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordPlatformEvent
} from "@/lib/core/platform-events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createEmptyTrustState,
  submitBarberVerification as submitBarberVerificationInState,
  submitShopVerification as submitShopVerificationInState,
  submitDispute as submitDisputeInState,
  submitSafetyReport as submitSafetyReportInState,
  type SubmitBarberVerificationInput,
  type SubmitDisputeInput,
  type SubmitShopVerificationInput,
  type SubmitSafetyReportInput,
  type TrustActor
} from "@/lib/trust/engine";
import type { TrustState } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type VerificationResult = ReturnType<typeof submitBarberVerificationInState>;
type ShopVerificationResult = ReturnType<typeof submitShopVerificationInState>;
type SafetyReportResult = ReturnType<typeof submitSafetyReportInState>;
type DisputeResult = ReturnType<typeof submitDisputeInState>;

export interface TrustProvider {
  kind: "demo" | "supabase";
  readState(): Promise<TrustState>;
  submitBarberVerification(actor: TrustActor, input: SubmitBarberVerificationInput): Promise<VerificationResult>;
  submitShopVerification(actor: TrustActor, input: SubmitShopVerificationInput): Promise<ShopVerificationResult>;
  submitSafetyReport(actor: TrustActor, input: SubmitSafetyReportInput): Promise<SafetyReportResult>;
  submitDispute(actor: TrustActor, input: SubmitDisputeInput): Promise<DisputeResult>;
}

function assertNoError(result: { error: unknown }) {
  if (result.error) {
    throw result.error;
  }
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

async function insertRows(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return;
  }

  const result = await supabase.from(table).insert(rows);
  assertNoError(result);
}

async function upsertRows(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!rows.length) {
    return;
  }

  const result = await supabase.from(table).upsert(rows, { onConflict });
  assertNoError(result);
}

async function readOrderedRowsOptional(supabase: SupabaseClient, table: string, orderBy: string) {
  try {
    const result = await supabase.from(table).select("*").order(orderBy, { ascending: false });
    if (result.error) {
      if (isMissingTableError(result.error)) {
        return [];
      }

      throw result.error;
    }

    return result.data ?? [];
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
}

async function readSupabaseState(supabase: SupabaseClient): Promise<TrustState> {
  const verificationProfiles = await readOrderedRowsOptional(supabase, "verification_profiles", "updated_at");
  const verificationReviews = await readOrderedRowsOptional(supabase, "verification_reviews", "created_at");
  const verificationProviderLinks = await readOrderedRowsOptional(supabase, "verification_provider_links", "updated_at");
  const [
    barberVerifications,
    shopVerifications,
    verificationDocuments,
    trustBadges,
    reviewModeration,
    safetyReports,
    reportEvents,
    disputes,
    disputeEvents,
    riskFlags,
    moderationActions,
    reliabilityScores
  ] = await Promise.all([
    readOrderedRowsOptional(supabase, "barber_verifications", "updated_at"),
    readOrderedRowsOptional(supabase, "shop_verifications", "updated_at"),
    readOrderedRowsOptional(supabase, "verification_documents", "uploaded_at"),
    readOrderedRowsOptional(supabase, "trust_badges", "granted_at"),
    readOrderedRowsOptional(supabase, "review_moderation", "updated_at"),
    readOrderedRowsOptional(supabase, "safety_reports", "created_at"),
    readOrderedRowsOptional(supabase, "report_events", "created_at"),
    readOrderedRowsOptional(supabase, "disputes", "created_at"),
    readOrderedRowsOptional(supabase, "dispute_events", "created_at"),
    readOrderedRowsOptional(supabase, "risk_flags", "created_at"),
    readOrderedRowsOptional(supabase, "moderation_actions", "created_at"),
    readOrderedRowsOptional(supabase, "reliability_scores", "updated_at")
  ]);

  return {
    barberVerifications: barberVerifications.map((record: any) => ({
      id: record.id,
      barberId: record.barber_reference,
      category: record.category,
      legalName: record.legal_name,
      userId: record.user_id ?? undefined,
      verificationProfileId: record.verification_profile_id ?? undefined,
      licenseType: record.license_type ?? undefined,
      professionalLicenseType: record.professional_license_type ?? undefined,
      licenseNumber: record.license_number ?? undefined,
      issuingState: record.issuing_state ?? undefined,
      expirationDate: record.expiration_date ?? undefined,
      verificationStatus: record.verification_status,
      identityStatus: record.identity_status ?? undefined,
      payoutStatus: record.payout_status ?? undefined,
      complianceStatus: record.compliance_status ?? undefined,
      providerIdentityStatus: record.provider_identity_status ?? undefined,
      providerConnectStatus: record.provider_connect_status ?? undefined,
      verificationSubmittedAt: record.verification_submitted_at ?? undefined,
      verificationReviewedAt: record.verification_reviewed_at ?? undefined,
      reviewedBy: record.reviewed_by ?? undefined,
      lastReviewedAt: record.last_reviewed_at ?? undefined,
      verificationNotes: record.verification_notes ?? undefined,
      currentRequirements: Array.isArray(record.current_requirements) ? record.current_requirements : [],
      documentPath: record.document_path ?? undefined,
      updatedAt: record.updated_at
    })),
    shopVerifications: shopVerifications.map((record: any) => ({
      id: record.id,
      shopId: record.shop_reference,
      category: record.category,
      businessName: record.business_name,
      userId: record.user_id ?? undefined,
      verificationProfileId: record.verification_profile_id ?? undefined,
      dbaName: record.dba_name ?? undefined,
      einLast4: record.ein_last4 ?? undefined,
      stateOfRegistration: record.state_of_registration ?? undefined,
      businessLicenseType: record.business_license_type ?? undefined,
      shopLicenseNumber: record.shop_license_number ?? undefined,
      verificationStatus: record.verification_status,
      identityStatus: record.identity_status ?? undefined,
      payoutStatus: record.payout_status ?? undefined,
      complianceStatus: record.compliance_status ?? undefined,
      providerConnectStatus: record.provider_connect_status ?? undefined,
      verificationSubmittedAt: record.verification_submitted_at ?? undefined,
      verificationReviewedAt: record.verification_reviewed_at ?? undefined,
      reviewedBy: record.reviewed_by ?? undefined,
      lastReviewedAt: record.last_reviewed_at ?? undefined,
      verificationNotes: record.verification_notes ?? undefined,
      currentRequirements: Array.isArray(record.current_requirements) ? record.current_requirements : [],
      documentPath: record.document_path ?? undefined,
      updatedAt: record.updated_at
    })),
    verificationDocuments: verificationDocuments.map((record: any) => ({
      id: record.id,
      ownerType: record.owner_type,
      ownerId: record.owner_reference,
      userId: record.user_id ?? undefined,
      shopId: record.shop_id ?? undefined,
      verificationProfileId: record.verification_profile_id ?? undefined,
      category: record.category,
      documentType: record.document_type ?? undefined,
      status: record.status ?? undefined,
      storageBucket: record.storage_bucket ?? undefined,
      storagePath: record.storage_path,
      secureReference: record.secure_reference ?? undefined,
      fileName: record.file_name ?? undefined,
      contentType: record.content_type ?? undefined,
      mimeType: record.mime_type ?? undefined,
      fileSizeBytes: record.file_size_bytes !== null && record.file_size_bytes !== undefined ? Number(record.file_size_bytes) : undefined,
      uploadedByRole: record.uploaded_by_role ?? undefined,
      uploadedAt: record.uploaded_at,
      expiresAt: record.expires_at ?? undefined,
      issuingState: record.issuing_state ?? undefined,
      documentLast4: record.document_last4 ?? undefined,
      issuedAt: record.issued_at ?? undefined,
      reviewedAt: record.reviewed_at ?? undefined,
      reviewedBy: record.reviewed_by ?? undefined,
      reviewNotes: record.review_notes ?? undefined,
      updatedAt: record.updated_at ?? undefined
    })),
    verificationProfiles: verificationProfiles.map((record: any) => ({
      id: record.id,
      userId: record.user_id,
      role: record.role,
      overallStatus: record.overall_status,
      identityStatus: record.identity_status,
      licenseStatus: record.license_status,
      businessStatus: record.business_status,
      payoutStatus: record.payout_status,
      complianceStatus: record.compliance_status,
      publicVerified: Boolean(record.public_verified),
      canAcceptBookings: Boolean(record.can_accept_bookings),
      canReceivePayouts: Boolean(record.can_receive_payouts),
      canCreateShopListing: Boolean(record.can_create_shop_listing),
      currentRequirements: Array.isArray(record.current_requirements) ? record.current_requirements : [],
      reviewNotes: record.review_notes ?? undefined,
      lastReviewedAt: record.last_reviewed_at ?? undefined,
      reviewedBy: record.reviewed_by ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    })),
    verificationReviews: verificationReviews.map((record: any) => ({
      id: record.id,
      verificationProfileId: record.verification_profile_id,
      reviewType: record.review_type,
      actionType: record.action_type,
      fromStatus: record.from_status ?? undefined,
      toStatus: record.to_status ?? undefined,
      reviewedBy: record.reviewed_by,
      reason: record.reason ?? undefined,
      internalNotes: record.internal_notes ?? undefined,
      createdAt: record.created_at
    })),
    verificationProviderLinks: verificationProviderLinks.map((record: any) => ({
      id: record.id,
      verificationProfileId: record.verification_profile_id,
      userId: record.user_id,
      provider: record.provider,
      providerSubject: record.provider_subject,
      providerReferenceId: record.provider_reference_id,
      providerStatus: record.provider_status ?? undefined,
      metadata: record.metadata ?? {},
      createdAt: record.created_at,
      updatedAt: record.updated_at
    })),
    trustBadges: trustBadges.map((record: any) => ({
      id: record.id,
      scopeType: record.scope_type,
      scopeId: record.scope_reference,
      badge: record.badge_kind,
      label: record.label,
      publicVisible: record.public_visible,
      grantedAt: record.granted_at,
      expiresAt: record.expires_at ?? undefined
    })),
    reviewModeration: reviewModeration.map((record: any) => ({
      id: record.id,
      reviewId: record.review_reference,
      barberId: record.barber_reference,
      clientId: record.client_reference,
      appointmentId: record.appointment_reference ?? undefined,
      eligible: record.eligible,
      moderationStatus: record.moderation_status,
      suspiciousFlags: record.suspicious_flags ?? [],
      abuseReported: record.abuse_reported,
      integrityScore: Number(record.integrity_score ?? 0),
      reviewedAt: record.reviewed_at ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    })),
    safetyReports: safetyReports.map((record: any) => ({
      id: record.id,
      reporterRole: record.reporter_role,
      reporterId: record.reporter_reference,
      reporterEmail: record.reporter_email ?? undefined,
      subjectType: record.subject_type,
      subjectId: record.subject_reference,
      category: record.category,
      details: record.details,
      status: record.status,
      locationId: record.location_reference ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    })),
    reportEvents: reportEvents.map((record: any) => ({
      id: record.id,
      reportId: record.report_reference,
      actorRole: record.actor_role,
      actorId: record.actor_reference,
      actionLabel: record.action_label,
      notes: record.notes ?? undefined,
      createdAt: record.created_at
    })),
    disputes: disputes.map((record: any) => ({
      id: record.id,
      disputeType: record.dispute_type,
      disputeStatus: record.dispute_status,
      submittedByRole: record.submitted_by_role,
      submittedById: record.submitted_by_reference,
      involvedPartyType: record.involved_party_type,
      involvedPartyId: record.involved_party_reference,
      appointmentId: record.appointment_reference ?? undefined,
      locationId: record.location_reference ?? undefined,
      summary: record.summary,
      resolutionNotes: record.resolution_notes ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    })),
    disputeEvents: disputeEvents.map((record: any) => ({
      id: record.id,
      disputeId: record.dispute_reference,
      actorRole: record.actor_role,
      actorId: record.actor_reference,
      actionLabel: record.action_label,
      notes: record.notes ?? undefined,
      createdAt: record.created_at
    })),
    riskFlags: riskFlags.map((record: any) => ({
      id: record.id,
      entityType: record.entity_type,
      entityId: record.entity_reference,
      signalType: record.signal_type,
      severity: record.severity,
      score: Number(record.score ?? 0),
      publicImpact: record.public_impact,
      open: record.is_open,
      notes: record.notes,
      createdAt: record.created_at,
      resolvedAt: record.resolved_at ?? undefined
    })),
    moderationActions: moderationActions.map((record: any) => ({
      id: record.id,
      targetType: record.target_type,
      targetId: record.target_reference,
      actionLabel: record.action_label,
      actorRole: record.actor_role,
      actorId: record.actor_reference,
      createdAt: record.created_at
    })),
    reliabilityScores: reliabilityScores.map((record: any) => ({
      barberId: record.barber_reference,
      completionRate: Number(record.completion_rate ?? 0),
      onTimeRate: Number(record.on_time_rate ?? 0),
      rebookingRate: Number(record.rebooking_rate ?? 0),
      reviewIntegrityScore: Number(record.review_integrity_score ?? 0),
      overallTrustScore: Number(record.overall_trust_score ?? 0),
      updatedAt: record.updated_at
    }))
  };
}

function createEmptyProvider(): TrustProvider {
  const unavailable = (): never => {
    throw new Error("Trust data is unavailable because Supabase is not configured.");
  };

  return {
    kind: "supabase",
    async readState() {
      return createEmptyTrustState();
    },
    async submitBarberVerification() {
      return unavailable();
    },
    async submitShopVerification() {
      return unavailable();
    },
    async submitSafetyReport() {
      return unavailable();
    },
    async submitDispute() {
      return unavailable();
    }
  };
}

function createSupabaseProvider(supabase: SupabaseClient): TrustProvider {
  return {
    kind: "supabase",
    async readState() {
      return readSupabaseState(supabase);
    },
    async submitBarberVerification(actor, input) {
      const result = submitBarberVerificationInState(await readSupabaseState(supabase), actor, input);

      await upsertRows(
        supabase,
        "barber_verifications",
        [{
          id: result.verification.id,
          barber_reference: result.verification.barberId,
          category: result.verification.category,
          legal_name: result.verification.legalName,
          license_type: result.verification.licenseType ?? null,
          license_number: result.verification.licenseNumber ?? null,
          issuing_state: result.verification.issuingState ?? null,
          expiration_date: result.verification.expirationDate ?? null,
          verification_status: result.verification.verificationStatus,
          verification_submitted_at: result.verification.verificationSubmittedAt ?? null,
          verification_reviewed_at: result.verification.verificationReviewedAt ?? null,
          verification_notes: result.verification.verificationNotes ?? null,
          document_path: result.verification.documentPath ?? null,
          updated_at: result.verification.updatedAt
        }],
        "id"
      );

      if (result.document) {
        await upsertRows(
          supabase,
          "verification_documents",
          [{
            id: result.document.id,
            owner_type: result.document.ownerType,
            owner_reference: result.document.ownerId,
            category: result.document.category,
            storage_path: result.document.storagePath,
            uploaded_at: result.document.uploadedAt,
            expires_at: result.document.expiresAt ?? null,
            status: result.document.status ?? null
          }],
          "id"
        );
      }

      return result;
    },
    async submitShopVerification(actor, input) {
      const result = submitShopVerificationInState(await readSupabaseState(supabase), actor, input);

      await upsertRows(
        supabase,
        "shop_verifications",
        [{
          id: result.verification.id,
          shop_reference: result.verification.shopId,
          category: result.verification.category,
          business_name: result.verification.businessName,
          verification_status: result.verification.verificationStatus,
          verification_submitted_at: result.verification.verificationSubmittedAt ?? null,
          verification_reviewed_at: result.verification.verificationReviewedAt ?? null,
          verification_notes: result.verification.verificationNotes ?? null,
          document_path: result.verification.documentPath ?? null,
          updated_at: result.verification.updatedAt
        }],
        "id"
      );

      if (result.document) {
        await upsertRows(
          supabase,
          "verification_documents",
          [{
            id: result.document.id,
            owner_type: result.document.ownerType,
            owner_reference: result.document.ownerId,
            category: result.document.category,
            storage_path: result.document.storagePath,
            uploaded_at: result.document.uploadedAt,
            expires_at: result.document.expiresAt ?? null,
            status: result.document.status ?? null
          }],
          "id"
        );
      }

      return result;
    },
    async submitSafetyReport(actor, input) {
      const result = submitSafetyReportInState(await readSupabaseState(supabase), actor, input);

      await insertRows(supabase, "safety_reports", [{
        id: result.report.id,
        reporter_role: result.report.reporterRole,
        reporter_reference: result.report.reporterId,
        reporter_email: result.report.reporterEmail ?? null,
        subject_type: result.report.subjectType,
        subject_reference: result.report.subjectId,
        category: result.report.category,
        details: result.report.details,
        status: result.report.status,
        location_reference: result.report.locationId ?? null,
        created_at: result.report.createdAt,
        updated_at: result.report.updatedAt
      }]);

      await insertRows(supabase, "report_events", [{
        id: result.reportEvent.id,
        report_reference: result.reportEvent.reportId,
        actor_role: result.reportEvent.actorRole,
        actor_reference: result.reportEvent.actorId,
        action_label: result.reportEvent.actionLabel,
        notes: result.reportEvent.notes ?? null,
        created_at: result.reportEvent.createdAt
      }]);

      if (result.riskFlag) {
        await insertRows(supabase, "risk_flags", [{
          id: result.riskFlag.id,
          entity_type: result.riskFlag.entityType,
          entity_reference: result.riskFlag.entityId,
          signal_type: result.riskFlag.signalType,
          severity: result.riskFlag.severity,
          score: result.riskFlag.score,
          public_impact: result.riskFlag.publicImpact,
          is_open: result.riskFlag.open,
          notes: result.riskFlag.notes,
          created_at: result.riskFlag.createdAt,
          resolved_at: null
        }]);
      }

      return result;
    },
    async submitDispute(actor, input) {
      const result = submitDisputeInState(await readSupabaseState(supabase), actor, input);

      await insertRows(supabase, "disputes", [{
        id: result.dispute.id,
        dispute_type: result.dispute.disputeType,
        dispute_status: result.dispute.disputeStatus,
        submitted_by_role: result.dispute.submittedByRole,
        submitted_by_reference: result.dispute.submittedById,
        involved_party_type: result.dispute.involvedPartyType,
        involved_party_reference: result.dispute.involvedPartyId,
        appointment_reference: result.dispute.appointmentId ?? null,
        location_reference: result.dispute.locationId ?? null,
        summary: result.dispute.summary,
        resolution_notes: null,
        created_at: result.dispute.createdAt,
        updated_at: result.dispute.updatedAt
      }]);

      await insertRows(supabase, "dispute_events", [{
        id: result.disputeEvent.id,
        dispute_reference: result.disputeEvent.disputeId,
        actor_role: result.disputeEvent.actorRole,
        actor_reference: result.disputeEvent.actorId,
        action_label: result.disputeEvent.actionLabel,
        notes: result.disputeEvent.notes ?? null,
        created_at: result.disputeEvent.createdAt
      }]);

      await recordPlatformEvent(supabase, {
        eventType: "dispute_created",
        entityType: "dispute",
        entityId: result.dispute.id,
        actorId: result.dispute.submittedById,
        actorRole: result.dispute.submittedByRole,
        source: "api",
        relatedIds: {
          disputeId: result.dispute.id,
          appointmentId: result.dispute.appointmentId,
          locationId: result.dispute.locationId,
          involvedPartyType: result.dispute.involvedPartyType,
          involvedPartyId: result.dispute.involvedPartyId
        },
        payload: {
          disputeType: result.dispute.disputeType,
          disputeStatus: result.dispute.disputeStatus,
          summary: result.dispute.summary
        },
        idempotencyKey: buildPlatformEventIdempotencyKey(["dispute", result.dispute.id, "created"]),
        occurredAt: result.dispute.createdAt
      });

      return result;
    }
  };
}

export async function getTrustProvider(): Promise<TrustProvider> {
  if (!isSupabaseEnabled()) {
    return createEmptyProvider();
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return createEmptyProvider();
  }

  return createSupabaseProvider(supabase);
}





