import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole } from "@/lib/auth/roles";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRoleLike =
  | "barber_user"
  | "barber"
  | "commission_barber"
  | "booth_rent_barber"
  | "freelance_barber";

type ProfileRow = {
  id: string;
  role?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_onboarding_role?: string | null;
};

type BarberRow = {
  id: string;
  reference_code?: string | null;
  profile_id: string;
  compensation_model?: string | null;
  barber_subtype?: string | null;
  app_approval_status?: string | null;
  shop_approval_status?: string | null;
  bio?: string | null;
  booking_slug?: string | null;
};

type BarberProfileRow = {
  id?: string | null;
  barber_reference: string;
  barber_id?: string | null;
  profile_id?: string | null;
  user_id?: string | null;
  barber_email?: string | null;
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  years_experience?: number | null;
  shop_reference?: string | null;
  specialties?: string[] | null;
  badges?: string[] | null;
  service_area_label?: string | null;
  next_available_at?: string | null;
  visibility_state?: string | null;
};

type BarberStatusRow = {
  barber_reference: string;
  shop_reference?: string | null;
  status?: string | null;
  accepting_bookings?: boolean | null;
  availability_note?: string | null;
};

type MarketplaceVisibilityRow = {
  barber_reference: string;
  visibility_state?: string | null;
  accepts_instant_bookings?: boolean | null;
};

type VerificationProfileRow = {
  overall_status?: string | null;
  public_verified?: boolean | null;
  can_accept_bookings?: boolean | null;
  can_receive_payouts?: boolean | null;
};

export type BarberProfileRepairReason =
  | "missing_auth_user"
  | "role_not_barber"
  | "missing_barbers_row"
  | "barber_profile_insert_failed"
  | "barber_profile_link_failed"
  | "column_missing"
  | "not_null_violation"
  | "unique_conflict"
  | "rls_denied"
  | "invalid_foreign_key"
  | "invalid_conflict_target"
  | "schema_cache_mismatch"
  | "schema_mismatch"
  | "verification_not_found"
  | "database_write_failed"
  | "duplicate_conflict"
  | "unknown";

export class BarberProfileRepairError extends Error {
  reason: BarberProfileRepairReason;
  details?: Record<string, unknown>;

  constructor(reason: BarberProfileRepairReason, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BarberProfileRepairError";
    this.reason = reason;
    this.details = details;
  }
}

export type BarberProfileRepairInput = {
  userId: string;
  barberId?: string | null;
  role?: string | null;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  preferredUsername?: string | null;
  appApprovalStatus?: string | null;
};

export type BarberProfileRepairResult = {
  success: boolean;
  attempted: boolean;
  repaired: boolean;
  createdBarber: boolean;
  createdProfile: boolean;
  createdStatus: boolean;
  linkedLegacyProfile: boolean;
  verified: boolean;
  reason: BarberProfileRepairReason | null;
  profileId: string;
  barberRowId: string;
  barberReference: string;
  barberProfileReference: string | null;
  username: string;
  barber: BarberRow;
  barberProfile: BarberProfileRow;
  canonical: {
    authUserId: string;
    profileId: string;
    barberId: string;
    barberReference: string;
    barberProfileId: string;
    barberProfileReference: string;
    username: string;
  };
  readChecks: {
    byReference: boolean;
    byBarberId: boolean;
    byProfileUser: boolean;
  };
  message: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type RepairWriteContext = {
  table: string;
  operation: "insert" | "update" | "upsert";
  payloadKeys: string[];
  conflictTarget?: string;
};

function isMissingRelationOrColumn(error: SupabaseLikeError | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return error.code === "42P01"
    || error.code === "42703"
    || error.code === "PGRST204"
    || text.includes("does not exist")
    || text.includes("could not find")
    || text.includes("schema cache");
}

function classifySupabaseRepairError(error: SupabaseLikeError): BarberProfileRepairReason {
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (error.code === "PGRST204" || text.includes("schema cache")) return "schema_cache_mismatch";
  if (error.code === "23502" || text.includes("null value")) return "not_null_violation";
  if (error.code === "23505" || text.includes("duplicate key")) return "unique_conflict";
  if (error.code === "23503" || text.includes("foreign key")) return "invalid_foreign_key";
  if (error.code === "42P10" || text.includes("no unique or exclusion constraint")) return "invalid_conflict_target";
  if (error.code === "42501" || text.includes("row-level security") || text.includes("rls")) return "rls_denied";
  if (error.code === "42703" || text.includes("could not find") || text.includes("column")) return "column_missing";
  if (error.code === "42P01" || text.includes("does not exist")) return "schema_mismatch";
  return "database_write_failed";
}

function throwSupabaseRepairWriteError(error: SupabaseLikeError, context: RepairWriteContext): never {
  const reason = classifySupabaseRepairError(error);
  const details = {
    table: context.table,
    operation: context.operation,
    payloadKeys: context.payloadKeys,
    conflictTarget: context.conflictTarget,
    code: error.code ?? null,
    message: error.message ?? null,
    supabaseDetails: error.details ?? null,
    hint: error.hint ?? null
  };
  console.error("[barber-profile-repair] database write failed", details);
  throw new BarberProfileRepairError(
    reason,
    `${reason}: ${context.table}.${context.operation} failed${error.code ? ` (${error.code})` : ""}: ${error.message ?? "Unknown Supabase error"}`,
    details
  );
}

function toReference(row: Pick<BarberRow, "id" | "reference_code">) {
  return row.reference_code ?? row.id;
}

function shortReference(userId: string) {
  return `barber-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "profile"}`;
}

function fallbackBarberSlug(barberReference: string) {
  const shortId = barberReference
    .replace(/^barber[-_]?/i, "")
    .replace(/[^a-z0-9_-]+/gi, "")
    .slice(0, 18)
    .toLowerCase();
  return `barber-${shortId || "profile"}`;
}

function isBarberRole(value?: string | null): value is BarberRoleLike {
  return isBarberAccountRole(value);
}

function normalizeUsernameCandidate(value?: string | null) {
  const normalized = `${value ?? ""}`.trim().toLowerCase().replace(/^@+/, "");
  return /^[a-z0-9_-]{3,32}$/.test(normalized) ? normalized : null;
}

function isApprovedStatus(value?: string | null) {
  return ["approved", "verified", "active"].includes(`${value ?? ""}`.toLowerCase());
}

function firstString(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}

async function maybeSingle<T>(
  query: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
) {
  const result = await query;
  if (result.error && !isMissingRelationOrColumn(result.error)) {
    throw result.error;
  }
  return result.error ? null : result.data;
}

async function listRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>
) {
  const result = await query;
  if (result.error && !isMissingRelationOrColumn(result.error)) {
    throw result.error;
  }
  return result.error ? [] : result.data ?? [];
}

async function readProfile(supabase: SupabaseClient, userId: string) {
  return maybeSingle<ProfileRow>(
    supabase
      .from("profiles")
      .select("id, role, full_name, email, phone, primary_onboarding_role")
      .eq("id", userId)
      .maybeSingle()
  );
}

async function readVerification(supabase: SupabaseClient, userId: string) {
  return maybeSingle<VerificationProfileRow>(
    supabase
      .from("verification_profiles")
      .select("overall_status, public_verified, can_accept_bookings, can_receive_payouts")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

async function readBarberByProfile(supabase: SupabaseClient, userId: string) {
  return maybeSingle<BarberRow>(
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
  );
}

async function readBarberByIdentifier(supabase: SupabaseClient, identifier?: string | null) {
  if (!identifier) return null;

  const byReference = await maybeSingle<BarberRow>(
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
      .eq("reference_code", identifier)
      .maybeSingle()
  );
  if (byReference) return byReference;

  const byId = await maybeSingle<BarberRow>(
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
      .eq("id", identifier)
      .maybeSingle()
  );
  if (byId) return byId;

  return maybeSingle<BarberRow>(
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
      .eq("booking_slug", normalizeUsernameCandidate(identifier) ?? identifier)
      .maybeSingle()
  );
}

async function readBarberProfile(supabase: SupabaseClient, reference: string) {
  return maybeSingle<BarberProfileRow>(
    supabase
      .from("barber_profiles")
      .select("*")
      .eq("barber_reference", reference)
      .maybeSingle()
  );
}

async function readBarberProfileByBarberId(supabase: SupabaseClient, barberId: string) {
  return maybeSingle<BarberProfileRow>(
    supabase
      .from("barber_profiles")
      .select("*")
      .eq("barber_id", barberId)
      .maybeSingle()
  );
}

async function readBarberProfileByProfileId(supabase: SupabaseClient, profileId: string) {
  return maybeSingle<BarberProfileRow>(
    supabase
      .from("barber_profiles")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle()
  );
}

async function readBarberProfileByUserId(supabase: SupabaseClient, userId: string) {
  return maybeSingle<BarberProfileRow>(
    supabase
      .from("barber_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
  );
}

async function readBarberProfileChecks(supabase: SupabaseClient, input: {
  userId: string;
  barberId: string;
  barberReference: string;
}) {
  const [byReference, byBarberId, byProfileId, byUserId] = await Promise.all([
    readBarberProfile(supabase, input.barberReference),
    readBarberProfileByBarberId(supabase, input.barberId),
    readBarberProfileByProfileId(supabase, input.userId),
    readBarberProfileByUserId(supabase, input.userId)
  ]);

  return {
    byReference,
    byBarberId,
    byProfileUser: byProfileId ?? byUserId
  };
}

async function verifyCanonicalBarberProfile(supabase: SupabaseClient, input: {
  userId: string;
  barberReference: string;
}) {
  const barber = await readBarberByIdentifier(supabase, input.barberReference);
  const checks = barber
    ? await readBarberProfileChecks(supabase, {
      userId: input.userId,
      barberId: barber.id,
      barberReference: input.barberReference
    })
    : { byReference: null, byBarberId: null, byProfileUser: null };
  const profileRow = checks.byReference;
  return {
    verified: Boolean(barber && profileRow && barber.profile_id === input.userId && profileRow.barber_reference === input.barberReference),
    barber,
    profileRow,
    readChecks: {
      byReference: Boolean(checks.byReference),
      byBarberId: Boolean(checks.byBarberId),
      byProfileUser: Boolean(checks.byProfileUser)
    }
  };
}

async function readBarberStatus(supabase: SupabaseClient, reference: string) {
  return maybeSingle<BarberStatusRow>(
    supabase
      .from("barber_status")
      .select("barber_reference, shop_reference, status, accepting_bookings, availability_note")
      .eq("barber_reference", reference)
      .maybeSingle()
  );
}

async function readMarketplaceVisibility(supabase: SupabaseClient, reference: string) {
  return maybeSingle<MarketplaceVisibilityRow>(
    supabase
      .from("marketplace_visibility")
      .select("barber_reference, visibility_state, accepts_instant_bookings")
      .eq("barber_reference", reference)
      .maybeSingle()
  );
}

async function updateReferenceKey(
  supabase: SupabaseClient,
  table: "barber_profiles" | "barber_status" | "marketplace_visibility",
  legacyReference: string,
  barberReference: string
) {
  if (legacyReference === barberReference) return false;
  const update = await supabase
    .from(table)
    .update({ barber_reference: barberReference })
    .eq("barber_reference", legacyReference);
  if (update.error && !isMissingRelationOrColumn(update.error)) {
    throw update.error;
  }
  return !update.error;
}

async function updateBarberProfileByLink(
  supabase: SupabaseClient,
  field: "barber_id" | "profile_id" | "user_id",
  value: string,
  payload: BarberProfileRow
) {
  const writePayload = toBarberProfileWritePayload(payload);
  const update = await supabase
    .from("barber_profiles")
    .update(writePayload)
    .eq(field, value);
  if (!update.error) {
    return true;
  }
  if (!isMissingRelationOrColumn(update.error)) {
    throwSupabaseRepairWriteError(update.error, {
      table: "barber_profiles",
      operation: "update",
      payloadKeys: Object.keys(writePayload)
    });
  }
  console.info("[barber-profile-repair] skipped legacy link update because link column is unavailable", {
    table: "barber_profiles",
    operation: "update",
    linkField: field,
    code: update.error.code ?? null,
    message: update.error.message ?? null,
    details: update.error.details ?? null,
    hint: update.error.hint ?? null
  });

  return false;
}

function toBarberProfileWritePayload(payload: BarberProfileRow) {
  return {
    barber_reference: payload.barber_reference,
    barber_email: payload.barber_email ?? "",
    username: payload.username ?? fallbackBarberSlug(payload.barber_reference),
    display_name: payload.display_name ?? payload.username ?? payload.barber_reference,
    bio: payload.bio ?? "",
    years_experience: payload.years_experience ?? 0,
    shop_reference: payload.shop_reference ?? null,
    specialties: payload.specialties ?? [],
    badges: payload.badges ?? [],
    service_area_label: payload.service_area_label ?? null,
    next_available_at: payload.next_available_at ?? null,
    visibility_state: payload.visibility_state ?? "hidden",
    updated_at: new Date().toISOString()
  };
}

async function writeBarberProfile(
  supabase: SupabaseClient,
  payload: BarberProfileRow
) {
  const writePayload = toBarberProfileWritePayload(payload);
  const existing = await readBarberProfile(supabase, payload.barber_reference);

  if (existing) {
    const update = await supabase
      .from("barber_profiles")
      .update(writePayload)
      .eq("barber_reference", payload.barber_reference);
    if (update.error) {
      throwSupabaseRepairWriteError(update.error, {
        table: "barber_profiles",
        operation: "update",
        payloadKeys: Object.keys(writePayload)
      });
    }
    return true;
  }

  const insert = await supabase
    .from("barber_profiles")
    .insert(writePayload);
  if (!insert.error) {
    return true;
  }

  if (classifySupabaseRepairError(insert.error) === "unique_conflict") {
    const update = await supabase
      .from("barber_profiles")
      .update(writePayload)
      .eq("barber_reference", payload.barber_reference);
    if (update.error) {
      throwSupabaseRepairWriteError(update.error, {
        table: "barber_profiles",
        operation: "update",
        payloadKeys: Object.keys(writePayload)
      });
    }
    return true;
  }

  throwSupabaseRepairWriteError(insert.error, {
    table: "barber_profiles",
    operation: "insert",
    payloadKeys: Object.keys(writePayload)
  });
}

async function upsertBarberStatus(
  supabase: SupabaseClient,
  payload: BarberStatusRow
) {
  const result = await supabase
    .from("barber_status")
    .upsert(payload, { onConflict: "barber_reference" });
  if (result.error && !isMissingRelationOrColumn(result.error)) {
    throwSupabaseRepairWriteError(result.error, {
      table: "barber_status",
      operation: "upsert",
      payloadKeys: Object.keys(payload),
      conflictTarget: "barber_reference"
    });
  }
  return !result.error;
}

async function upsertUserRole(
  supabase: SupabaseClient,
  input: { email?: string | null; barberReference: string; compensationModel?: string | null }
) {
  if (!input.email) return false;
  const result = await supabase
    .from("user_roles")
    .upsert({
      user_email: input.email,
      role: "barber_user",
      client_reference: null,
      barber_reference: input.barberReference,
      location_references: []
    }, { onConflict: "user_email" });
  if (result.error && !isMissingRelationOrColumn(result.error)) {
    throwSupabaseRepairWriteError(result.error, {
      table: "user_roles",
      operation: "upsert",
      payloadKeys: ["user_email", "role", "client_reference", "barber_reference", "location_references"],
      conflictTarget: "user_email"
    });
  }
  return !result.error;
}

export async function ensureBarberProfileForUser(
  input: BarberProfileRepairInput,
  client?: SupabaseClient | null
): Promise<BarberProfileRepairResult> {
  const supabase = client ?? createSupabaseAdminClient();
  if (!supabase || !input.userId) {
    throw new BarberProfileRepairError("missing_auth_user", "A signed-in barber is required before profile repair can run.");
  }

  try {
    const [profile, existingByProfile, existingByIdentifier, verification] = await Promise.all([
      readProfile(supabase, input.userId),
      readBarberByProfile(supabase, input.userId),
      readBarberByIdentifier(supabase, input.barberId),
      readVerification(supabase, input.userId)
    ]);
    const existingBarber = existingByProfile ?? existingByIdentifier;
    const profileRole = profile?.primary_onboarding_role ?? profile?.role ?? input.role;
    if (!profile && !existingBarber) {
      throw new BarberProfileRepairError("missing_barbers_row", "No platform profile or barber row could be linked to this user.");
    }
    if (!existingBarber && !isBarberRole(profileRole) && !isBarberRole(input.role)) {
      throw new BarberProfileRepairError("role_not_barber", "Only barber accounts can create a canonical barber profile row.");
    }

    const barberReference = existingBarber ? toReference(existingBarber) : input.barberId ?? shortReference(input.userId);
    const approved = isApprovedStatus(input.appApprovalStatus)
      || isApprovedStatus(existingBarber?.app_approval_status)
      || isApprovedStatus(verification?.overall_status)
      || verification?.public_verified === true;
    let barber = existingBarber;
    let createdBarber = false;
    let repaired = false;

    if (!barber) {
      const insert = await supabase
        .from("barbers")
        .insert({
          profile_id: input.userId,
          reference_code: barberReference,
          compensation_model: "booth_rent",
          barber_subtype: "freelance",
          app_approval_status: approved ? "approved" : "pending",
          shop_approval_status: "not_required",
          bio: null,
          booking_slug: normalizeUsernameCandidate(input.preferredUsername) ?? barberReference
        })
        .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
        .single();
      if (insert.error) {
        throwSupabaseRepairWriteError(insert.error, {
          table: "barbers",
          operation: "insert",
          payloadKeys: ["profile_id", "reference_code", "compensation_model", "barber_subtype", "app_approval_status", "shop_approval_status", "bio", "booking_slug"]
        });
      }
      barber = insert.data as BarberRow;
      createdBarber = true;
      repaired = true;
    } else if (barber.profile_id !== input.userId || !barber.reference_code) {
      const update = await supabase
        .from("barbers")
        .update({
          profile_id: input.userId,
          reference_code: barber.reference_code ?? barberReference,
          booking_slug: barber.booking_slug ?? normalizeUsernameCandidate(input.preferredUsername) ?? barber.reference_code ?? barberReference
        })
        .eq("id", barber.id);
      if (update.error && !isMissingRelationOrColumn(update.error)) {
        throwSupabaseRepairWriteError(update.error, {
          table: "barbers",
          operation: "update",
          payloadKeys: ["profile_id", "reference_code", "booking_slug"]
        });
      }
      barber = {
        ...barber,
        profile_id: input.userId,
        reference_code: barber.reference_code ?? barberReference,
        booking_slug: barber.booking_slug ?? normalizeUsernameCandidate(input.preferredUsername) ?? barber.reference_code ?? barberReference
      };
      repaired = true;
    }

    const effectiveReference = toReference(barber);
    const legacyReferences = [barber.id, input.barberId].filter((value): value is string =>
      Boolean(value && value !== effectiveReference)
    );
    let profileRow = await readBarberProfile(supabase, effectiveReference);
    let linkedLegacyProfile = false;
    for (const legacyReference of legacyReferences) {
      if (profileRow) break;
      const legacyProfile = await readBarberProfile(supabase, legacyReference);
      if (legacyProfile) {
        linkedLegacyProfile = await updateReferenceKey(supabase, "barber_profiles", legacyReference, effectiveReference);
        profileRow = linkedLegacyProfile ? { ...legacyProfile, barber_reference: effectiveReference } : legacyProfile;
        repaired = repaired || linkedLegacyProfile;
      }
    }

    if (!profileRow) {
      const legacyChecks = await readBarberProfileChecks(supabase, {
        userId: input.userId,
        barberId: barber.id,
        barberReference: effectiveReference
      });
      const legacyProfile = legacyChecks.byBarberId ?? legacyChecks.byProfileUser;
      if (legacyProfile) {
        const normalizedLegacyProfile = {
          ...legacyProfile,
          barber_reference: effectiveReference,
          barber_id: barber.id,
          profile_id: input.userId,
          user_id: input.userId
        };
        if (legacyChecks.byBarberId) {
          await updateBarberProfileByLink(supabase, "barber_id", barber.id, normalizedLegacyProfile);
        }
        if (legacyChecks.byProfileUser) {
          await updateBarberProfileByLink(supabase, "profile_id", input.userId, normalizedLegacyProfile);
          await updateBarberProfileByLink(supabase, "user_id", input.userId, normalizedLegacyProfile);
        }
        profileRow = normalizedLegacyProfile;
        linkedLegacyProfile = true;
        repaired = true;
      }
    }

    for (const legacyReference of legacyReferences) {
      if (await readBarberStatus(supabase, effectiveReference)) break;
      const legacyStatus = await readBarberStatus(supabase, legacyReference);
      if (legacyStatus) {
        repaired = (await updateReferenceKey(supabase, "barber_status", legacyReference, effectiveReference)) || repaired;
      }
    }

    for (const legacyReference of legacyReferences) {
      if (await readMarketplaceVisibility(supabase, effectiveReference)) break;
      const legacyVisibility = await readMarketplaceVisibility(supabase, legacyReference);
      if (legacyVisibility) {
        repaired = (await updateReferenceKey(supabase, "marketplace_visibility", legacyReference, effectiveReference)) || repaired;
      }
    }

    const [statusRow, visibilityRow] = await Promise.all([
      readBarberStatus(supabase, effectiveReference),
      readMarketplaceVisibility(supabase, effectiveReference)
    ]);
    const username = normalizeUsernameCandidate(profileRow?.username)
      ?? normalizeUsernameCandidate(input.preferredUsername)
      ?? normalizeUsernameCandidate(barber.booking_slug)
      ?? fallbackBarberSlug(effectiveReference);
    const displayName = firstString(
      profileRow?.display_name,
      input.fullName,
      profile?.full_name,
      profile?.email,
      input.email,
      effectiveReference
    );
    const email = firstString(profileRow?.barber_email, input.email, profile?.email);
    const visibilityState = profileRow?.visibility_state
      ?? visibilityRow?.visibility_state
      ?? (verification?.can_accept_bookings ? "public" : "hidden");
    const createdProfile = !profileRow;
    const profileWritten = await writeBarberProfile(supabase, {
      barber_reference: effectiveReference,
      barber_id: barber.id,
      profile_id: input.userId,
      user_id: input.userId,
      barber_email: email ?? null,
      username,
      display_name: displayName,
      bio: firstString(profileRow?.bio, barber.bio) ?? "",
      years_experience: profileRow?.years_experience ?? 0,
      shop_reference: profileRow?.shop_reference ?? statusRow?.shop_reference ?? null,
      specialties: profileRow?.specialties ?? [],
      badges: profileRow?.badges ?? [],
      service_area_label: profileRow?.service_area_label ?? "Getting started",
      next_available_at: profileRow?.next_available_at ?? null,
      visibility_state: visibilityState
    });

    if (!profileWritten) {
      throw new BarberProfileRepairError("barber_profile_insert_failed", "Barber profile repair could not write the public profile row.");
    }

    if (barber.booking_slug !== username) {
      const slugUpdate = await supabase.from("barbers").update({ booking_slug: username }).eq("id", barber.id);
      if (slugUpdate.error && !isMissingRelationOrColumn(slugUpdate.error)) {
        throwSupabaseRepairWriteError(slugUpdate.error, {
          table: "barbers",
          operation: "update",
          payloadKeys: ["booking_slug"]
        });
      }
      repaired = true;
    }

    const createdStatus = !statusRow;
    await upsertBarberStatus(supabase, {
      barber_reference: effectiveReference,
      shop_reference: statusRow?.shop_reference ?? profileRow?.shop_reference ?? null,
      status: statusRow?.status ?? (visibilityRow?.accepts_instant_bookings ? "active" : "offline"),
      accepting_bookings: statusRow?.accepting_bookings ?? visibilityRow?.accepts_instant_bookings ?? false,
      availability_note: statusRow?.availability_note ?? "Finish setup to go live."
    });
    await upsertUserRole(supabase, {
      email,
      barberReference: effectiveReference,
      compensationModel: barber.compensation_model
    });
    const verificationResult = await verifyCanonicalBarberProfile(supabase, {
      userId: input.userId,
      barberReference: effectiveReference
    });
    if (!verificationResult.verified) {
      throw new BarberProfileRepairError("barber_profile_link_failed", "Barber profile repair wrote data, but canonical profile linkage did not verify.");
    }
    if (!verificationResult.barber || !verificationResult.profileRow) {
      throw new BarberProfileRepairError("barber_profile_link_failed", "Barber profile repair wrote data, but the post-repair final read did not return the barber_profiles row.");
    }

    const result = {
      success: true,
      attempted: true,
      repaired: repaired || createdBarber || createdProfile || createdStatus,
      createdBarber,
      createdProfile,
      createdStatus,
      linkedLegacyProfile,
      verified: verificationResult.verified,
      reason: null,
      profileId: input.userId,
      barberRowId: verificationResult.barber?.id ?? barber.id,
      barberReference: effectiveReference,
      barberProfileReference: verificationResult.profileRow?.barber_reference ?? null,
      username,
      barber: verificationResult.barber,
      barberProfile: verificationResult.profileRow,
      canonical: {
        authUserId: input.userId,
        profileId: input.userId,
        barberId: verificationResult.barber.id,
        barberReference: effectiveReference,
        barberProfileId: verificationResult.profileRow.id ?? verificationResult.profileRow.barber_reference,
        barberProfileReference: verificationResult.profileRow.barber_reference,
        username
      },
      readChecks: verificationResult.readChecks,
      message: repaired || createdBarber || createdProfile || createdStatus
        ? "Profile repaired and synced."
        : "Profile already synced."
    } satisfies BarberProfileRepairResult;
    console.info("barber_profile_repair_result", {
      authUserId: input.userId,
      barberId: result.barberRowId,
      barberReference: result.barberReference,
      profileId: result.profileId,
      barberProfileId: result.barberProfileReference,
      repaired: result.repaired,
      reason: result.reason
    });

    return result;
  } catch (error) {
    if (error instanceof BarberProfileRepairError) {
      console.info("barber_profile_repair_result", {
        authUserId: input.userId,
        barberId: input.barberId ?? null,
        barberReference: input.barberId ?? null,
        profileId: input.userId,
        barberProfileId: null,
        repaired: false,
        reason: error.reason,
        details: error.details ?? null
      });
      throw error;
    }

    const supabaseError = error as SupabaseLikeError;
    const message = error instanceof Error ? error.message : String(error);
    const reason = classifySupabaseRepairError({
      code: supabaseError.code,
      message,
      details: supabaseError.details,
      hint: supabaseError.hint
    });
    console.info("barber_profile_repair_result", {
      authUserId: input.userId,
      barberId: input.barberId ?? null,
      barberReference: input.barberId ?? null,
      profileId: input.userId,
      barberProfileId: null,
      repaired: false,
      reason,
      code: supabaseError.code ?? null,
      details: supabaseError.details ?? null,
      hint: supabaseError.hint ?? null
    });
    throw new BarberProfileRepairError(reason, `barber_profile_repair_failed: ${message}`, {
      code: supabaseError.code ?? null,
      message,
      supabaseDetails: supabaseError.details ?? null,
      hint: supabaseError.hint ?? null
    });
  }
}

export async function ensureBarberProfileForIdentifier(
  identifier: string,
  client?: SupabaseClient | null
) {
  const supabase = client ?? createSupabaseAdminClient();
  if (!supabase || !identifier) return null;

  const barber = await readBarberByIdentifier(supabase, identifier);
  if (!barber) return null;
  const profile = await readProfile(supabase, barber.profile_id);
  return ensureBarberProfileForUser({
    userId: barber.profile_id,
    barberId: toReference(barber),
    role: profile?.primary_onboarding_role ?? profile?.role ?? "barber",
    email: profile?.email,
    fullName: profile?.full_name,
    phone: profile?.phone,
    preferredUsername: barber.booking_slug,
    appApprovalStatus: barber.app_approval_status
  }, supabase);
}

export async function ensureMarketplaceBarberProfileRows(client?: SupabaseClient | null) {
  const supabase = client ?? createSupabaseAdminClient();
  if (!supabase) {
    return { checked: 0, repaired: 0, skipped: 0 };
  }

  const [barbers, profileRows, profiles] = await Promise.all([
    listRows<BarberRow>(
      supabase
        .from("barbers")
        .select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, bio, booking_slug")
    ),
    listRows<BarberProfileRow>(
      supabase
        .from("barber_profiles")
        .select("barber_reference, username, display_name, bio, years_experience, shop_reference, specialties, badges, service_area_label, next_available_at, visibility_state")
    ),
    listRows<ProfileRow>(
      supabase
        .from("profiles")
        .select("id, role, full_name, email, phone, primary_onboarding_role")
    )
  ]);
  const existingReferences = new Set(profileRows.map((row) => row.barber_reference));
  const profilesById = new Map(profiles.map((row) => [row.id, row]));
  let repaired = 0;
  let skipped = 0;

  for (const barber of barbers) {
    const reference = toReference(barber);
    const legacyExists = barber.id !== reference && existingReferences.has(barber.id);
    if (existingReferences.has(reference) && !legacyExists) {
      skipped += 1;
      continue;
    }

    const profile = profilesById.get(barber.profile_id);
    try {
      const result = await ensureBarberProfileForUser({
        userId: barber.profile_id,
        barberId: reference,
        role: profile?.primary_onboarding_role ?? profile?.role ?? "barber",
        email: profile?.email,
        fullName: profile?.full_name,
        phone: profile?.phone,
        preferredUsername: barber.booking_slug,
        appApprovalStatus: barber.app_approval_status
      }, supabase);
      if (result.repaired) repaired += 1;
    } catch (error) {
      skipped += 1;
      console.error("[barber-profile-repair] marketplace profile row repair skipped", {
        barberReference: reference,
        profileId: barber.profile_id,
        reason: error instanceof BarberProfileRepairError ? error.reason : "unknown",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { checked: barbers.length, repaired, skipped };
}
