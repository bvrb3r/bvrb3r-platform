import { createHmac, randomBytes, randomInt } from "node:crypto";
import { buildPr27BarberSetup, resolvePr27DeletionEligibility } from "@/lib/trust/product-pr27-domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/config/runtime";
import type { UserAccount } from "@/types/domain";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class ProductPr27ServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "product_pr27_error"
  ) {
    super(message);
    this.name = "ProductPr27ServiceError";
  }
}

function requireAuthenticatedUser(user: UserAccount) {
  if (!user.id || user.id === "guest-user") {
    throw new ProductPr27ServiceError("Authentication required.", 401, "auth_required");
  }
}

function requireAdminClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new ProductPr27ServiceError("This control requires connected server truth.", 503, "server_truth_unavailable");
  }
  return supabase;
}

function isApproved(value: unknown) {
  return ["approved", "verified"].includes(String(value ?? "").toLowerCase());
}

function isInReview(value: unknown) {
  return ["pending", "submitted", "under_review", "in_progress"].includes(String(value ?? "").toLowerCase());
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toSetupStatus(approved: boolean, inReview = false) {
  return approved ? "done" as const : inReview ? "in_review" as const : "to_do" as const;
}

function demoBarberSetup(user: UserAccount) {
  return {
    firstName: user.firstName ?? user.name.split(/\s+/)[0] ?? "Barber",
    live: false,
    demo: true,
    ...buildPr27BarberSetup({
      public_profile: "done",
      services_prices: "done",
      license_verification: "done",
      stripe_payouts: "done",
      shop_link_or_independent: "in_review",
      chairsync: "to_do",
      portfolio_culture: "to_do",
      chair_qr_nfc: "to_do"
    })
  };
}

export async function getPr27BarberSetup(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) return demoBarberSetup(user);
  if (!user.barberId) {
    throw new ProductPr27ServiceError("A canonical Barber record is required.", 409, "barber_record_required");
  }

  const supabase = requireAdminClient();
  const publicProfileResult = await supabase
    .from("barber_profiles")
    .select("barber_reference, display_name, bio, profile_photo_path, specialties")
    .eq("barber_email", user.email)
    .maybeSingle();

  if (publicProfileResult.error) {
    throw new ProductPr27ServiceError("Unable to read Barber profile evidence.", 500, "profile_evidence_failed");
  }

  const publicProfile = publicProfileResult.data as {
    barber_reference?: string | null;
    display_name?: string | null;
    bio?: string | null;
    profile_photo_path?: string | null;
    specialties?: string[] | null;
  } | null;
  const barberReference = publicProfile?.barber_reference ?? user.barberId;

  const [
    storedEvidenceResult,
    servicesResult,
    licenseResult,
    payoutResult,
    relationshipResult,
    chairSyncResult,
    portfolioResult,
    activationResult
  ] = await Promise.all([
    supabase.from("barber_setup_evidence").select("setup_key, status").eq("barber_id", user.barberId),
    supabase
      .from("services")
      .select("id, price, duration_min, active")
      .eq("barber_reference", barberReference)
      .eq("active", true),
    supabase
      .from("barber_verifications")
      .select("verification_status, updated_at")
      .eq("barber_reference", barberReference)
      .eq("category", "license_verification")
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("connected_accounts")
      .select("payout_readiness_status, payouts_enabled, onboarding_status")
      .eq("barber_id", user.barberId)
      .maybeSingle(),
    supabase
      .from("shop_barber_relationships")
      .select("id, status")
      .eq("barber_id", user.barberId)
      .in("status", ["active", "suspended"]),
    supabase
      .from("chairsync_appointments")
      .select("id", { count: "exact", head: true })
      .eq("barber_id", user.barberId),
    supabase
      .from("barber_portfolios")
      .select("id", { count: "exact", head: true })
      .eq("barber_reference", barberReference),
    supabase
      .from("barber_setup_activations")
      .select("status, activated_at")
      .eq("barber_id", user.barberId)
      .maybeSingle()
  ]);

  const hardErrors = [
    storedEvidenceResult.error,
    servicesResult.error,
    licenseResult.error,
    payoutResult.error,
    relationshipResult.error,
    activationResult.error
  ].filter(Boolean);
  if (hardErrors.length) {
    throw new ProductPr27ServiceError("Unable to resolve Barber setup truth.", 500, "setup_truth_failed");
  }

  const serviceRows = (servicesResult.data ?? []) as Array<{
    price?: number | string | null;
    duration_min?: number | null;
  }>;
  const licenseRow = (licenseResult.data?.[0] ?? null) as {
    verification_status?: string | null;
  } | null;
  const payoutRow = payoutResult.data as {
    payout_readiness_status?: string | null;
    payouts_enabled?: boolean | null;
    onboarding_status?: string | null;
  } | null;
  const profileComplete = Boolean(
    safeText(publicProfile?.display_name)
    && safeText(publicProfile?.bio)
    && safeText(publicProfile?.profile_photo_path)
    && publicProfile?.specialties?.length
  );
  const servicesComplete = serviceRows.some((row) => safeNumber(row.price) > 0 && safeNumber(row.duration_min) > 0);
  const relationshipComplete = user.barberSubtype === "freelance"
    || (relationshipResult.data ?? []).some((row) => row.status === "active");
  const computed = {
    public_profile: toSetupStatus(profileComplete),
    services_prices: toSetupStatus(servicesComplete),
    license_verification: toSetupStatus(
      isApproved(licenseRow?.verification_status),
      isInReview(licenseRow?.verification_status)
    ),
    stripe_payouts: toSetupStatus(
      payoutRow?.payouts_enabled === true && payoutRow?.payout_readiness_status === "ready",
      Boolean(payoutRow && payoutRow.onboarding_status !== "not_started")
    ),
    shop_link_or_independent: toSetupStatus(relationshipComplete, !relationshipComplete && Boolean(relationshipResult.data?.length)),
    chairsync: toSetupStatus((chairSyncResult.count ?? 0) > 0),
    portfolio_culture: toSetupStatus((portfolioResult.count ?? 0) > 0),
    chair_qr_nfc: "to_do" as const
  };

  const requiredEvidenceRows = Object.entries(computed)
    .filter(([setupKey]) => [
      "public_profile",
      "services_prices",
      "license_verification",
      "stripe_payouts",
      "shop_link_or_independent"
    ].includes(setupKey))
    .map(([setupKey, status]) => ({
      barber_id: user.barberId,
      setup_key: setupKey,
      status,
      evidence: {
        source: "canonical_server_truth",
        resolved_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    }));
  const evidenceWriteResult = await supabase
    .from("barber_setup_evidence")
    .upsert(requiredEvidenceRows, { onConflict: "barber_id,setup_key" });
  if (evidenceWriteResult.error) {
    throw new ProductPr27ServiceError(
      "Unable to persist canonical setup evidence.",
      500,
      "setup_evidence_write_failed"
    );
  }

  const stored = Object.fromEntries(
    ((storedEvidenceResult.data ?? []) as Array<{ setup_key: string; status: "to_do" | "in_review" | "done" }>)
      .map((row) => [row.setup_key, row.status])
  );
  // Required steps are always resolved from canonical server truth. Stored
  // evidence may retain optional progress but can never spoof go-live.
  const setup = buildPr27BarberSetup({ ...stored, ...computed });

  return {
    firstName: user.firstName ?? user.name.split(/\s+/)[0] ?? "Barber",
    live: activationResult.data?.status === "live",
    demo: false,
    ...setup
  };
}

export async function activatePr27BarberSetup(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (!user.barberId) {
    throw new ProductPr27ServiceError("A canonical Barber record is required.", 409, "barber_record_required");
  }
  if (isDemoMode()) return { live: true, activatedAt: new Date().toISOString(), demo: true };
  const setup = await getPr27BarberSetup(user);
  if (!setup.requiredComplete) {
    throw new ProductPr27ServiceError(
      "Finish all five required setup steps before going live.",
      409,
      "required_setup_incomplete"
    );
  }
  const supabase = requireAdminClient();
  const activatedAt = new Date().toISOString();
  const result = await supabase.from("barber_setup_activations").upsert({
    barber_id: user.barberId,
    status: "live",
    activated_at: activatedAt,
    paused_at: null,
    activated_by_profile_id: user.id,
    updated_at: activatedAt
  }, { onConflict: "barber_id" });
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to activate this chair.", 500, "setup_activation_failed");
  }
  return { live: true, activatedAt, demo: false };
}

async function countOpenAppointments(supabase: AdminClient, user: UserAccount) {
  const statuses = ["pending", "confirmed", "booked", "checked_in", "in_service"];
  const queries = [];
  if (user.clientId) {
    queries.push(
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("client_id", user.clientId)
        .in("status", statuses)
    );
  }
  if (user.barberId) {
    queries.push(
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("barber_id", user.barberId)
        .in("status", statuses)
    );
  }
  const results = await Promise.all(queries);
  if (results.some((result) => result.error)) {
    throw new ProductPr27ServiceError("Unable to verify open bookings.", 500, "booking_precondition_failed");
  }
  return results.reduce((sum, result) => sum + (result.count ?? 0), 0);
}

function demoPrivacySnapshot(user: UserAccount) {
  return {
    demo: true,
    firstName: user.firstName ?? user.name.split(/\s+/)[0] ?? "Member",
    memberSince: "2024",
    visitCount: 31,
    openBookingCount: 1,
    lifecycle: {
      status: "active",
      deletionGraceEndsAt: null,
      canRestore: false
    },
    exports: []
  };
}

export async function getPr27PrivacySnapshot(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) return demoPrivacySnapshot(user);
  const supabase = requireAdminClient();
  const [profileResult, lifecycleResult, exportResult, openBookingCount] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("account_privacy_lifecycles")
      .select("status, deletion_grace_ends_at, restored_at, deleted_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("account_export_deliveries")
      .select("id, status, requested_at, ready_at, expires_at, downloaded_at")
      .eq("profile_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(10),
    countOpenAppointments(supabase, user)
  ]);
  if (profileResult.error || lifecycleResult.error || exportResult.error) {
    throw new ProductPr27ServiceError("Unable to load account privacy state.", 500, "privacy_snapshot_failed");
  }

  const lifecycle = lifecycleResult.data as {
    status?: string | null;
    deletion_grace_ends_at?: string | null;
  } | null;
  const createdAt = safeText((profileResult.data as { created_at?: string | null } | null)?.created_at);

  return {
    demo: false,
    firstName: user.firstName ?? user.name.split(/\s+/)[0] ?? "Member",
    memberSince: createdAt ? String(new Date(createdAt).getUTCFullYear()) : null,
    visitCount: null,
    openBookingCount,
    lifecycle: {
      status: lifecycle?.status ?? "active",
      deletionGraceEndsAt: lifecycle?.deletion_grace_ends_at ?? null,
      canRestore: lifecycle?.status === "deletion_grace"
        && Boolean(lifecycle.deletion_grace_ends_at && new Date(lifecycle.deletion_grace_ends_at) > new Date())
    },
    exports: exportResult.data ?? []
  };
}

function challengeSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXTAUTH_SECRET ?? "bvrb3r-development-challenge";
}

function hashChallenge(profileId: string, challenge: string) {
  return createHmac("sha256", challengeSecret())
    .update(`${profileId}:${challenge.trim().toUpperCase()}`)
    .digest("hex");
}

export async function requestPr27DeletionChallenge(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) {
    return { challenge: "BVR-2614", expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), demo: true };
  }
  const supabase = requireAdminClient();
  const openBookingCount = await countOpenAppointments(supabase, user);
  if (openBookingCount > 0) {
    throw new ProductPr27ServiceError(
      `Open bookings must be canceled or completed first — ${openBookingCount} upcoming ${openBookingCount === 1 ? "appointment" : "appointments"} found.`,
      409,
      "open_bookings"
    );
  }

  const challenge = `BVR-${randomInt(1000, 10000)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = await supabase
    .schema("compliance_private")
    .from("account_deletion_challenges")
    .upsert({
      profile_id: user.id,
      challenge_hash: hashChallenge(user.id, challenge),
      expires_at: expiresAt,
      failed_attempts: 0,
      created_at: new Date().toISOString()
    }, { onConflict: "profile_id" });
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to issue a deletion challenge.", 500, "challenge_issue_failed");
  }
  return { challenge, expiresAt, demo: false };
}

export async function requestPr27AccountExport(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) {
    return {
      id: "demo-export",
      status: "requested",
      requestedAt: new Date().toISOString(),
      deliveryWindowHours: 24,
      linkValidityDays: 7,
      demo: true
    };
  }
  const supabase = requireAdminClient();
  const requestedAt = new Date().toISOString();
  const rightsResult = await supabase
    .from("data_rights_requests")
    .insert({
      profile_id: user.id,
      request_type: "export",
      status: "pending",
      requested_at: requestedAt,
      acknowledged_at: requestedAt,
      request_metadata: {
        delivery: "email_link",
        formats: ["readable", "json"],
        delivery_window_hours: 24,
        link_validity_days: 7
      }
    })
    .select("id")
    .single();
  if (rightsResult.error) {
    throw new ProductPr27ServiceError("Unable to request an account export.", 500, "export_request_failed");
  }
  const deliveryResult = await supabase
    .from("account_export_deliveries")
    .insert({
      profile_id: user.id,
      data_rights_request_id: rightsResult.data.id,
      status: "requested",
      requested_at: requestedAt
    })
    .select("id, status, requested_at")
    .single();
  if (deliveryResult.error) {
    throw new ProductPr27ServiceError("Unable to queue the account export.", 500, "export_delivery_failed");
  }
  return {
    id: deliveryResult.data.id,
    status: deliveryResult.data.status,
    requestedAt: deliveryResult.data.requested_at,
    deliveryWindowHours: 24,
    linkValidityDays: 7,
    demo: false
  };
}

export async function setPr27AccountDeactivated(user: UserAccount, deactivated: boolean) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) {
    return { status: deactivated ? "deactivated" : "restored", demo: true };
  }
  const supabase = requireAdminClient();
  const now = new Date().toISOString();
  const status = deactivated ? "deactivated" : "restored";
  const result = await supabase.from("account_privacy_lifecycles").upsert({
    profile_id: user.id,
    status,
    deactivated_at: deactivated ? now : null,
    deletion_requested_at: null,
    deletion_grace_ends_at: null,
    restored_at: deactivated ? null : now,
    deleted_at: null,
    profile_visible: !deactivated,
    notifications_enabled: !deactivated,
    updated_at: now
  }, { onConflict: "profile_id" }).select("status").single();
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to update account visibility.", 500, "account_lifecycle_update_failed");
  }
  return { status: result.data.status, demo: false };
}

export async function schedulePr27AccountDeletion(user: UserAccount, input: {
  typedConfirmation: string;
  submittedChallenge: string;
}) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) {
    const eligibility = resolvePr27DeletionEligibility({
      openBookingCount: 0,
      typedConfirmation: input.typedConfirmation,
      challenge: "BVR-2614",
      submittedChallenge: input.submittedChallenge
    });
    if (!eligibility.allowed) {
      throw new ProductPr27ServiceError(eligibility.message, 400, eligibility.code);
    }
    return {
      status: "deletion_grace",
      deletionGraceEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      demo: true
    };
  }

  const supabase = requireAdminClient();
  const [challengeResult, openBookingCount] = await Promise.all([
    supabase
      .schema("compliance_private")
      .from("account_deletion_challenges")
      .select("challenge_hash, expires_at, failed_attempts")
      .eq("profile_id", user.id)
      .maybeSingle(),
    countOpenAppointments(supabase, user)
  ]);
  if (challengeResult.error || !challengeResult.data) {
    throw new ProductPr27ServiceError("Request a fresh verification code.", 409, "challenge_required");
  }
  if (new Date(challengeResult.data.expires_at) <= new Date()) {
    throw new ProductPr27ServiceError("The verification code expired. Request a new one.", 409, "challenge_expired");
  }

  const expectedHash = challengeResult.data.challenge_hash;
  const submittedHash = hashChallenge(user.id, input.submittedChallenge);
  const eligibility = resolvePr27DeletionEligibility({
    openBookingCount,
    typedConfirmation: input.typedConfirmation,
    challenge: expectedHash,
    submittedChallenge: submittedHash
  });
  if (!eligibility.allowed) {
    if (eligibility.code === "challenge_mismatch") {
      await supabase
        .schema("compliance_private")
        .from("account_deletion_challenges")
        .update({ failed_attempts: Math.min(Number(challengeResult.data.failed_attempts ?? 0) + 1, 10) })
        .eq("profile_id", user.id);
    }
    throw new ProductPr27ServiceError(eligibility.message, eligibility.code === "open_bookings" ? 409 : 400, eligibility.code);
  }

  const requestedAt = new Date();
  const deletionGraceEndsAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const requestedAtIso = requestedAt.toISOString();
  const lifecycleResult = await supabase.from("account_privacy_lifecycles").upsert({
    profile_id: user.id,
    status: "deletion_grace",
    deactivated_at: requestedAtIso,
    deletion_requested_at: requestedAtIso,
    deletion_grace_ends_at: deletionGraceEndsAt.toISOString(),
    restored_at: null,
    deleted_at: null,
    profile_visible: false,
    notifications_enabled: false,
    updated_at: requestedAtIso
  }, { onConflict: "profile_id" });
  if (lifecycleResult.error) {
    throw new ProductPr27ServiceError("Unable to schedule account deletion.", 500, "deletion_schedule_failed");
  }

  const requestResult = await supabase.from("data_rights_requests").insert({
    profile_id: user.id,
    request_type: "deletion",
    status: "processing",
    requested_at: requestedAtIso,
    acknowledged_at: requestedAtIso,
    request_metadata: {
      source: "product_pr27_account_privacy",
      grace_ends_at: deletionGraceEndsAt.toISOString(),
      sealed_finance_retention: true
    }
  });
  if (requestResult.error && requestResult.error.code !== "23505") {
    throw new ProductPr27ServiceError("Unable to record deletion evidence.", 500, "deletion_evidence_failed");
  }
  await supabase
    .schema("compliance_private")
    .from("account_deletion_challenges")
    .delete()
    .eq("profile_id", user.id);

  return {
    status: "deletion_grace",
    deletionGraceEndsAt: deletionGraceEndsAt.toISOString(),
    demo: false
  };
}

function demoCultureSafetySnapshot() {
  return {
    demo: true,
    blockedAccounts: [],
    mutedAccounts: [],
    reports: [],
    appeals: [],
    standing: {
      activeStrikeCount: 0,
      enforcement: "clear",
      postingPausedUntil: null,
      bookingAndMoneyUnaffected: true
    }
  };
}

export async function getPr27CultureSafetySnapshot(user: UserAccount) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) return demoCultureSafetySnapshot();
  const supabase = requireAdminClient();
  const [blocksResult, mutesResult, reportsResult, appealsResult, strikesResult] = await Promise.all([
    supabase
      .from("culture_profile_blocks")
      .select("id, blocked_profile_id, reason, created_at")
      .eq("blocker_profile_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("culture_profile_mutes")
      .select("muted_profile_id, created_at")
      .eq("muter_profile_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("culture_safety_reports")
      .select("id, reporter_reference, category, status, created_at, resolved_at")
      .eq("reporter_profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("culture_appeals")
      .select("id, case_id, status, submitted_at, decided_at, decision_reasoning")
      .eq("appellant_profile_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(25),
    supabase
      .from("culture_strikes")
      .select("id, status, issued_at, expires_at")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("issued_at", { ascending: false })
  ]);
  if ([blocksResult, mutesResult, reportsResult, appealsResult, strikesResult].some((result) => result.error)) {
    throw new ProductPr27ServiceError("Unable to load Culture safety state.", 500, "culture_safety_snapshot_failed");
  }

  const activeStrikeCount = strikesResult.data?.length ?? 0;
  const latestStrikeAt = safeText(strikesResult.data?.[0]?.issued_at);
  const canModerate = user.role === "platform_admin" || user.role === "architect";
  const [moderationQueueResult, appealQueueResult] = canModerate
    ? await Promise.all([
        supabase
          .from("culture_moderation_cases")
          .select("id, severity, status, post_id, reported_profile_id, created_at")
          .in("status", ["open", "reviewing", "appealed"])
          .order("created_at", { ascending: true })
          .limit(100),
        supabase
          .from("culture_appeals")
          .select("id, case_id, status, submitted_at")
          .in("status", ["submitted", "under_review"])
          .order("submitted_at", { ascending: true })
          .limit(100)
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (moderationQueueResult.error || appealQueueResult.error) {
    throw new ProductPr27ServiceError("Unable to load the Culture moderation queue.", 500, "moderation_queue_failed");
  }
  return {
    demo: false,
    blockedAccounts: blocksResult.data ?? [],
    mutedAccounts: mutesResult.data ?? [],
    reports: reportsResult.data ?? [],
    appeals: appealsResult.data ?? [],
    moderationQueue: moderationQueueResult.data ?? [],
    appealQueue: appealQueueResult.data ?? [],
    standing: {
      activeStrikeCount,
      enforcement: activeStrikeCount >= 3
        ? "culture_ban"
        : activeStrikeCount === 2
          ? "posting_pause"
          : activeStrikeCount === 1
            ? "warning"
            : "clear",
      postingPausedUntil: activeStrikeCount === 2 && latestStrikeAt
        ? new Date(new Date(latestStrikeAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      bookingAndMoneyUnaffected: true
    }
  };
}

function cultureReference() {
  return `CUL-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function submitPr27CultureReport(user: UserAccount, input: {
  reportedProfileId: string;
  postId?: string | null;
  category: "spam" | "harassment" | "stolen_work" | "explicit_content" | "dangerous_services" | "other";
  details?: string | null;
}) {
  requireAuthenticatedUser(user);
  if (input.reportedProfileId === user.id) {
    throw new ProductPr27ServiceError("You cannot report your own account.", 400, "self_report_not_allowed");
  }
  if (isDemoMode()) {
    return { reference: "CUL-4471", status: "received", autoHidden: false, demo: true };
  }
  const supabase = requireAdminClient();
  if (input.postId) {
    const postResult = await supabase
      .from("culture_posts")
      .select("author_profile_id")
      .eq("id", input.postId)
      .maybeSingle();
    if (postResult.error || !postResult.data || postResult.data.author_profile_id !== input.reportedProfileId) {
      throw new ProductPr27ServiceError("The reported post does not belong to that account.", 400, "report_target_mismatch");
    }
  }

  const reference = cultureReference();
  const reportResult = await supabase.from("culture_safety_reports").insert({
    reporter_profile_id: user.id,
    reported_profile_id: input.reportedProfileId,
    post_id: input.postId ?? null,
    category: input.category,
    details: safeText(input.details),
    reporter_reference: reference
  }).select("id, status, auto_hidden_at").single();
  if (reportResult.error) {
    throw new ProductPr27ServiceError("Unable to submit the Culture report.", 500, "culture_report_failed");
  }
  const severity = ["harassment", "explicit_content", "dangerous_services"].includes(input.category)
    ? "high"
    : "normal";
  const caseResult = await supabase.from("culture_moderation_cases").insert({
    report_id: reportResult.data.id,
    reported_profile_id: input.reportedProfileId,
    post_id: input.postId ?? null,
    severity,
    status: "open"
  });
  if (caseResult.error) {
    throw new ProductPr27ServiceError("The report was received but its moderation case was not opened.", 500, "moderation_case_failed");
  }
  return {
    reference,
    status: reportResult.data.status,
    autoHidden: Boolean(reportResult.data.auto_hidden_at),
    demo: false
  };
}

export async function setPr27CultureBlock(user: UserAccount, input: {
  targetProfileId: string;
  active: boolean;
  reason?: string | null;
}) {
  requireAuthenticatedUser(user);
  if (input.targetProfileId === user.id) {
    throw new ProductPr27ServiceError("You cannot block your own account.", 400, "self_block_not_allowed");
  }
  if (isDemoMode()) return { active: input.active, demo: true };
  const supabase = requireAdminClient();
  const now = new Date().toISOString();
  const result = await supabase.from("culture_profile_blocks").upsert({
    blocker_profile_id: user.id,
    blocked_profile_id: input.targetProfileId,
    reason: safeText(input.reason),
    active: input.active,
    reversed_at: input.active ? null : now,
    created_at: now
  }, { onConflict: "blocker_profile_id,blocked_profile_id" });
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to update the blocked account.", 500, "culture_block_failed");
  }
  return { active: input.active, demo: false };
}

export async function setPr27CultureMute(user: UserAccount, input: {
  targetProfileId: string;
  active: boolean;
}) {
  requireAuthenticatedUser(user);
  if (input.targetProfileId === user.id) {
    throw new ProductPr27ServiceError("You cannot mute your own account.", 400, "self_mute_not_allowed");
  }
  if (isDemoMode()) return { active: input.active, demo: true };
  const supabase = requireAdminClient();
  const now = new Date().toISOString();
  const result = await supabase.from("culture_profile_mutes").upsert({
    muter_profile_id: user.id,
    muted_profile_id: input.targetProfileId,
    active: input.active,
    reversed_at: input.active ? null : now,
    created_at: now
  }, { onConflict: "muter_profile_id,muted_profile_id" });
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to update the muted account.", 500, "culture_mute_failed");
  }
  return { active: input.active, demo: false };
}

export async function submitPr27CultureAppeal(user: UserAccount, input: {
  caseId: string;
  reason: string;
}) {
  requireAuthenticatedUser(user);
  if (isDemoMode()) return { status: "submitted", demo: true };
  const supabase = requireAdminClient();
  const caseResult = await supabase
    .from("culture_moderation_cases")
    .select("id, reported_profile_id, decided_by_profile_id, status")
    .eq("id", input.caseId)
    .maybeSingle();
  if (caseResult.error || !caseResult.data) {
    throw new ProductPr27ServiceError("The moderation decision was not found.", 404, "moderation_case_not_found");
  }
  if (caseResult.data.reported_profile_id !== user.id || !caseResult.data.decided_by_profile_id) {
    throw new ProductPr27ServiceError("This moderation decision cannot be appealed by this account.", 403, "appeal_not_allowed");
  }
  const result = await supabase.from("culture_appeals").insert({
    case_id: input.caseId,
    appellant_profile_id: user.id,
    reason: input.reason.trim(),
    original_reviewer_profile_id: caseResult.data.decided_by_profile_id,
    status: "submitted"
  }).select("id, status, submitted_at").single();
  if (result.error) {
    if (result.error.code === "23505") {
      throw new ProductPr27ServiceError("One appeal is already attached to this decision.", 409, "appeal_already_exists");
    }
    throw new ProductPr27ServiceError("Unable to submit the Culture appeal.", 500, "culture_appeal_failed");
  }
  await supabase.from("culture_moderation_cases").update({ status: "appealed" }).eq("id", input.caseId);
  return { ...result.data, demo: false };
}

function requireCultureModerator(user: UserAccount) {
  if (user.role !== "platform_admin" && user.role !== "architect") {
    throw new ProductPr27ServiceError("Culture moderation requires Architect authority.", 403, "moderator_required");
  }
}

export async function moderatePr27CultureCase(user: UserAccount, input: {
  caseId: string;
  decision: "keep" | "warn" | "remove" | "escalate";
  reasoning: string;
}) {
  requireAuthenticatedUser(user);
  requireCultureModerator(user);
  if (isDemoMode()) return { status: input.decision === "escalate" ? "reviewing" : "decided", decision: input.decision, demo: true };
  const supabase = requireAdminClient();
  const caseResult = await supabase
    .from("culture_moderation_cases")
    .select("id, report_id, reported_profile_id, post_id, status, decision, decided_by_profile_id")
    .eq("id", input.caseId)
    .maybeSingle();
  if (caseResult.error || !caseResult.data) {
    throw new ProductPr27ServiceError("The moderation case was not found.", 404, "moderation_case_not_found");
  }
  const now = new Date().toISOString();
  const beforeState = caseResult.data;
  const nextStatus = input.decision === "escalate" ? "reviewing" : "decided";
  const updateResult = await supabase.from("culture_moderation_cases").update({
    status: nextStatus,
    decision: input.decision,
    decision_reasoning: input.reasoning.trim(),
    decided_by_profile_id: user.id,
    decided_at: now,
    updated_at: now
  }).eq("id", input.caseId);
  if (updateResult.error) {
    throw new ProductPr27ServiceError("Unable to record the moderation decision.", 500, "moderation_decision_failed");
  }

  if (input.decision === "warn" || input.decision === "remove") {
    const strikeResult = await supabase.from("culture_strikes").upsert({
      case_id: input.caseId,
      profile_id: caseResult.data.reported_profile_id,
      status: "active",
      reason: input.reasoning.trim(),
      issued_at: now,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: "case_id,profile_id" });
    if (strikeResult.error) {
      throw new ProductPr27ServiceError("Unable to record the Culture strike.", 500, "culture_strike_failed");
    }
  }

  if (caseResult.data.post_id && input.decision === "remove") {
    const postResult = await supabase.from("culture_posts").update({
      moderation_status: "removed",
      updated_at: now
    }).eq("id", caseResult.data.post_id);
    if (postResult.error) {
      throw new ProductPr27ServiceError("Unable to remove the reported Culture post.", 500, "culture_post_removal_failed");
    }
  }

  await supabase.from("culture_safety_reports").update({
    status: input.decision === "keep" ? "resolved_keep" : input.decision === "escalate" ? "under_review" : "resolved_action",
    resolved_at: input.decision === "escalate" ? null : now
  }).eq("id", caseResult.data.report_id);
  await supabase.from("culture_moderation_audit").insert({
    case_id: input.caseId,
    actor_profile_id: user.id,
    action: `decision:${input.decision}`,
    reasoning: input.reasoning.trim(),
    before_state: beforeState,
    after_state: {
      status: nextStatus,
      decision: input.decision,
      decided_by_profile_id: user.id,
      decided_at: now
    }
  });

  return { status: nextStatus, decision: input.decision, demo: false };
}

export async function resolvePr27CultureAppeal(user: UserAccount, input: {
  appealId: string;
  outcome: "upheld" | "denied";
  reasoning: string;
}) {
  requireAuthenticatedUser(user);
  requireCultureModerator(user);
  if (isDemoMode()) {
    return {
      status: input.outcome,
      restored: input.outcome === "upheld",
      strikeRemoved: input.outcome === "upheld",
      demo: true
    };
  }
  const supabase = requireAdminClient();
  const appealResult = await supabase
    .from("culture_appeals")
    .select("id, case_id, status, original_reviewer_profile_id, appeal_reviewer_profile_id")
    .eq("id", input.appealId)
    .maybeSingle();
  if (appealResult.error || !appealResult.data) {
    throw new ProductPr27ServiceError("The Culture appeal was not found.", 404, "culture_appeal_not_found");
  }
  if (appealResult.data.original_reviewer_profile_id === user.id) {
    throw new ProductPr27ServiceError("A different reviewer must decide this appeal.", 409, "fresh_reviewer_required");
  }
  const caseResult = await supabase
    .from("culture_moderation_cases")
    .select("id, post_id, reported_profile_id, decision")
    .eq("id", appealResult.data.case_id)
    .maybeSingle();
  if (caseResult.error || !caseResult.data) {
    throw new ProductPr27ServiceError("The appealed moderation case was not found.", 404, "moderation_case_not_found");
  }
  const now = new Date().toISOString();
  const updateResult = await supabase.from("culture_appeals").update({
    status: input.outcome,
    appeal_reviewer_profile_id: user.id,
    decision_reasoning: input.reasoning.trim(),
    decided_at: now
  }).eq("id", input.appealId);
  if (updateResult.error) {
    throw new ProductPr27ServiceError("Unable to resolve the Culture appeal.", 500, "culture_appeal_resolution_failed");
  }

  if (input.outcome === "upheld") {
    if (caseResult.data.post_id) {
      await supabase.from("culture_posts").update({
        moderation_status: "approved",
        updated_at: now
      }).eq("id", caseResult.data.post_id);
    }
    await supabase.from("culture_strikes").update({
      status: "removed",
      removed_at: now,
      removed_by_profile_id: user.id
    }).eq("case_id", caseResult.data.id).eq("profile_id", caseResult.data.reported_profile_id);
  }

  await supabase.from("culture_moderation_cases").update({
    status: "closed",
    updated_at: now
  }).eq("id", caseResult.data.id);
  await supabase.from("culture_moderation_audit").insert({
    case_id: caseResult.data.id,
    appeal_id: input.appealId,
    actor_profile_id: user.id,
    action: `appeal:${input.outcome}`,
    reasoning: input.reasoning.trim(),
    before_state: appealResult.data,
    after_state: {
      status: input.outcome,
      appeal_reviewer_profile_id: user.id,
      content_restored: input.outcome === "upheld",
      strike_removed: input.outcome === "upheld"
    }
  });

  return {
    status: input.outcome,
    restored: input.outcome === "upheld",
    strikeRemoved: input.outcome === "upheld",
    demo: false
  };
}
