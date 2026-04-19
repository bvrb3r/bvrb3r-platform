import { createHash, randomInt, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasTwilioDeliveryConfig, isSupabaseEnabled, runtimeConfig } from "@/lib/config/runtime";
import {
  getRuntimeRoleForSignupIntent,
  getSignupRoleIntentFromMetadata,
  isSignupRoleIntent,
  type SignupRoleIntent
} from "@/lib/auth/signup-role-intent";
import type {
  ApprovalStatus,
  BarberSubtype,
  CompensationModel,
  IdentityLane,
  IdentityOnboardingState,
  Role,
  UserAccount
} from "@/types/domain";
import type { VerificationStatus, VerificationSubjectRole } from "@/types/trust";

type AuthUserLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

type ProfileRow = {
  id: string;
  role: Role | "shop_owner" | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role?: IdentityLane | null;
  onboarding_state?: IdentityOnboardingState | null;
  phone_verified_at?: string | null;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  compensation_model: CompensationModel;
  barber_subtype?: BarberSubtype | null;
  app_approval_status?: ApprovalStatus | null;
  shop_approval_status?: ApprovalStatus | null;
};

type ClientRow = {
  id: string;
  reference_code: string | null;
};

type ShopRow = {
  id: string;
  name?: string | null;
  app_approval_status?: ApprovalStatus | null;
};

type UserRoleRow = {
  user_email?: string | null;
  role?: string | null;
  client_reference?: string | null;
  barber_reference?: string | null;
  location_references?: string[] | null;
};

type LocationAssignmentRow = {
  location_id: string;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
};

type PhoneChallengeRow = {
  id: string;
  profile_id: string;
  phone: string;
  code_hash: string;
  attempt_count: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type ContactVerificationState = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  canContinue: boolean;
  requiresRoleSelection: boolean;
  onboardingState: IdentityOnboardingState;
  missingFields: string[];
};

type CanonicalContactSnapshot = {
  profile: ProfileRow | null;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  primaryRole: IdentityLane | null;
  hasLaneRecord: boolean;
  onboardingState: IdentityOnboardingState;
  missingFields: string[];
};

function toContactVerificationState(snapshot: CanonicalContactSnapshot): ContactVerificationState {
  const contactComplete = snapshot.missingFields.length === 0 && snapshot.emailVerified && snapshot.phoneVerified;
  return {
    fullName: snapshot.fullName,
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
    email: snapshot.email,
    phone: snapshot.phone,
    emailVerified: snapshot.emailVerified,
    phoneVerified: snapshot.phoneVerified,
    canContinue: contactComplete,
    requiresRoleSelection: contactComplete && !snapshot.primaryRole,
    onboardingState: snapshot.onboardingState,
    missingFields: snapshot.missingFields
  };
}

type RoleSelectionInput = {
  role: Exclude<IdentityLane, "platform_admin">;
  barberSubtype?: BarberSubtype;
  shopName?: string;
};

type RoleSelectionResult = {
  user: UserAccount;
  seedProfileData: Record<string, unknown>;
};

type LaneRecordSnapshot = {
  client: ClientRow | null;
  barber: BarberRow | null;
  shop: ShopRow | null;
};

type SendPhoneChallengeResult = ContactVerificationState & {
  degraded: boolean;
};

type VerifyPhoneChallengeResult = ContactVerificationState;

type InMemoryPhoneChallenge = {
  id: string;
  profileId: string;
  phone: string;
  codeHash: string;
  attemptCount: number;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
};

type AnyPhoneChallenge = PhoneChallengeRow | InMemoryPhoneChallenge;

declare global {
  var __bvrb3rPhoneChallenges: InMemoryPhoneChallenge[] | undefined;
}

type SupabaseWriteMode = "service_role" | "authenticated" | "unavailable";
type VerificationQueueRole = Extract<VerificationSubjectRole, "barber" | "shop_owner">;

async function getSupabaseWithMode(): Promise<{
  client: Awaited<ReturnType<typeof createSupabaseServerClient>> | ReturnType<typeof createSupabaseAdminClient>;
  mode: SupabaseWriteMode;
}> {
  if (!isSupabaseEnabled()) {
    return { client: null, mode: "unavailable" };
  }

  const adminClient = createSupabaseAdminClient();
  if (adminClient) {
    return { client: adminClient, mode: "service_role" };
  }

  try {
    const serverClient = await createSupabaseServerClient();
    return {
      client: serverClient,
      mode: serverClient ? "authenticated" : "unavailable"
    };
  } catch (error) {
    console.warn("[auth] unable to create authenticated Supabase fallback client", { error });
    return { client: null, mode: "unavailable" };
  }
}

async function getSupabase() {
  const { client } = await getSupabaseWithMode();
  return client;
}

function getChallengeStore() {
  if (!globalThis.__bvrb3rPhoneChallenges) {
    globalThis.__bvrb3rPhoneChallenges = [];
  }

  return globalThis.__bvrb3rPhoneChallenges;
}

function isSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string | null; message?: string | null };
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "42703"
    || candidate.code === "PGRST204"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find the table")
    || message.includes("could not find the column");
}

function describeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return `${error ?? "unknown error"}`;
  }

  const candidate = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  };
  return [
    candidate.message,
    candidate.code ? `code=${candidate.code}` : null,
    candidate.details ? `details=${candidate.details}` : null,
    candidate.hint ? `hint=${candidate.hint}` : null
  ].filter(Boolean).join(" | ") || "unknown Supabase error";
}

function throwSupabaseLaneError(action: string, error: unknown): never {
  const message = describeSupabaseError(error);
  console.error("[auth] lane bootstrap failed", {
    action,
    error: message
  });
  throw new Error(`SERVER_WRITE_FAILED: ${action}: ${message}`);
}

function getVerificationQueueRequirements(role: VerificationQueueRole) {
  return role === "barber"
    ? [
        "Platform review required.",
        "Complete identity verification.",
        "Complete barber license verification.",
        "Connect payouts before going live."
      ]
    : [
        "Platform review required.",
        "Complete business verification.",
        "Connect payouts before going live.",
        "Complete shop readiness before public listing."
      ];
}

function getVerificationQueuePayload(profileId: string, role: VerificationQueueRole) {
  const submitted = "submitted" satisfies VerificationStatus;
  const notStarted = "not_started" satisfies VerificationStatus;

  return {
    user_id: profileId,
    role,
    overall_status: submitted,
    identity_status: notStarted,
    license_status: notStarted,
    business_status: notStarted,
    payout_status: notStarted,
    compliance_status: notStarted,
    public_verified: false,
    can_accept_bookings: false,
    can_receive_payouts: false,
    can_create_shop_listing: false,
    current_requirements: getVerificationQueueRequirements(role)
  };
}

function canResubmitVerificationProfile(status?: string | null) {
  return !status || ["unverified", "not_started", "pending", "in_progress", "submitted"].includes(status);
}

async function ensureVerificationProfileQueued(profileId: string, role: VerificationQueueRole) {
  const { client: supabase, mode: supabaseMode } = await getSupabaseWithMode();
  if (!supabase) {
    return;
  }

  const existing = await supabase
    .from("verification_profiles")
    .select("id, overall_status")
    .eq("user_id", profileId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && !isSchemaError(existing.error)) {
    throwSupabaseLaneError("Verification profile lookup", existing.error);
  }

  const payload = getVerificationQueuePayload(profileId, role);
  if (existing.data?.id) {
    if (!canResubmitVerificationProfile(`${existing.data.overall_status ?? ""}`)) {
      return;
    }

    const update = await supabase
      .from("verification_profiles")
      .update(payload)
      .eq("id", existing.data.id as string);

    if (update.error) {
      throwSupabaseLaneError("Verification profile queue update", update.error);
    }

    console.info("[auth] verification profile queued", {
      profileId,
      role,
      verificationProfileId: existing.data.id,
      supabaseMode,
      existed: true
    });
    return;
  }

  const insert = await supabase
    .from("verification_profiles")
    .insert(payload);

  if (insert.error) {
    throwSupabaseLaneError("Verification profile queue insert", insert.error);
  }

  console.info("[auth] verification profile queued", {
    profileId,
    role,
    supabaseMode,
    existed: false
  });
}

function getDisplayName(authUser: AuthUserLike, profile?: ProfileRow | null) {
  const canonicalName = getCanonicalNameState(authUser, profile);
  if (canonicalName.fullName) {
    return canonicalName.fullName;
  }

  return authUser.email?.split("@")[0] ?? "New account";
}

function normalizePhoneNumber(phone?: string | null) {
  const raw = `${phone ?? ""}`.trim();
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D+/g, "");
  if (!digits) {
    return "";
  }

  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return raw.startsWith("+") ? raw : `+${digits}`;
}

function splitFullName(fullName?: string | null) {
  const normalized = `${fullName ?? ""}`.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      firstName: "",
      lastName: "",
      fullName: ""
    };
  }

  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName: firstName ?? "",
    lastName: rest.join(" ").trim(),
    fullName: normalized
  };
}

function getMetadataNameParts(authUser: AuthUserLike) {
  const metadata = authUser.user_metadata ?? {};
  const givenName = typeof metadata.given_name === "string" ? metadata.given_name.trim() : "";
  const familyName = typeof metadata.family_name === "string" ? metadata.family_name.trim() : "";
  if (givenName && familyName) {
    return {
      firstName: givenName,
      lastName: familyName,
      fullName: `${givenName} ${familyName}`.trim()
    };
  }

  const firstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  if (firstName && lastName) {
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim()
    };
  }

  if (typeof metadata.full_name === "string" && metadata.full_name.trim()) {
    return splitFullName(metadata.full_name);
  }

  if (typeof metadata.name === "string" && metadata.name.trim()) {
    return splitFullName(metadata.name);
  }

  return {
    firstName: "",
    lastName: "",
    fullName: ""
  };
}

function getCanonicalNameState(authUser: AuthUserLike, profile?: ProfileRow | null) {
  const profileParts = splitFullName(profile?.full_name);
  if (profileParts.firstName && profileParts.lastName) {
    return profileParts;
  }

  const metadataParts = getMetadataNameParts(authUser);
  if (metadataParts.firstName && metadataParts.lastName) {
    return metadataParts;
  }

  if (profileParts.fullName) {
    return profileParts;
  }

  if (metadataParts.fullName) {
    return metadataParts;
  }

  return {
    firstName: "",
    lastName: "",
    fullName: ""
  };
}

function getResolvedEmail(authUser: AuthUserLike, profile?: ProfileRow | null) {
  return profile?.email ?? authUser.email ?? `${authUser.id}@bvrb3r.local`;
}

function getRequiredContactFields(authUser: AuthUserLike, profile?: ProfileRow | null) {
  const name = getCanonicalNameState(authUser, profile);
  const email = getResolvedEmail(authUser, profile).trim();
  const phone = normalizePhoneNumber(profile?.phone ?? authUser.phone ?? null);
  const missingFields: string[] = [];

  if (!name.fullName) {
    missingFields.push("full_name");
  }

  if (!email) {
    missingFields.push("email");
  }

  if (!phone) {
    missingFields.push("phone");
  }

  return {
    ...name,
    email,
    phone,
    missingFields
  };
}

function toRuntimeRole(input: {
  primaryRole?: IdentityLane | null;
  profileRole?: Role | "shop_owner" | null;
  compensationModel?: CompensationModel | null;
}) {
  if (input.primaryRole === "platform_admin") {
    return "platform_admin" as const;
  }

  if (input.primaryRole === "shop_owner" || input.profileRole === "owner" || input.profileRole === "shop_owner") {
    return "owner" as const;
  }

  if (input.primaryRole === "barber" || input.profileRole === "commission_barber" || input.profileRole === "booth_rent_barber") {
    return input.compensationModel === "commission" || input.profileRole === "commission_barber"
      ? "commission_barber"
      : "booth_rent_barber";
  }

  return "client" as const;
}

function getTitle(role: Role, subtype?: BarberSubtype | null) {
  if (role === "owner") {
    return "Shop Owner";
  }

  if (role === "commission_barber") {
    return "Commission Barber";
  }

  if (role === "booth_rent_barber") {
    if (subtype === "blueprint") {
      return "Blueprint Barber";
    }
    if (subtype === "freelance") {
      return "Freelance Barber";
    }
    return "Barber";
  }

  if (role === "platform_admin") {
    return "Platform Admin";
  }

  if (role === "manager") {
    return "Manager";
  }

  if (role === "front_desk") {
    return "Front Desk";
  }

  return "Client";
}

function inferOnboardingState(input: {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasRequiredContactFields: boolean;
  primaryRole?: IdentityLane | null;
  hasLaneRecord: boolean;
  persistedState?: IdentityOnboardingState | null;
}) {
  if (!input.hasRequiredContactFields || !input.emailVerified || !input.phoneVerified) {
    return "awaiting_contact_verification" satisfies IdentityOnboardingState;
  }

  if (!input.primaryRole) {
    return "awaiting_role_selection" satisfies IdentityOnboardingState;
  }

  if (!input.hasLaneRecord) {
    return "role_selected" satisfies IdentityOnboardingState;
  }

  return input.persistedState === "role_selected" ? "role_selected" : "active";
}

function buildMinimalRuntimeUser(authUser: AuthUserLike): UserAccount {
  const requiredContact = getRequiredContactFields(authUser);
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const phoneVerified = Boolean(authUser.phone_confirmed_at);
  const onboardingState = inferOnboardingState({
    emailVerified,
    phoneVerified,
    hasRequiredContactFields: requiredContact.missingFields.length === 0,
    primaryRole: null,
    hasLaneRecord: false
  });

  return {
    id: authUser.id,
    role: "client",
    email: requiredContact.email,
    password: "",
    name: getDisplayName(authUser),
    canonicalFullName: requiredContact.fullName || undefined,
    title: "Client",
    phone: requiredContact.phone,
    firstName: requiredContact.firstName || undefined,
    lastName: requiredContact.lastName || undefined,
    locationIds: [],
    accountStatus: "profile_only",
    onboardingState,
    emailVerified,
    phoneVerified
  };
}

function getProfileSyncPayload(authUser: AuthUserLike, profile?: ProfileRow | null) {
  const requiredContact = getRequiredContactFields(authUser, profile);
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const phoneVerified = Boolean(authUser.phone_confirmed_at);
  const onboardingState = inferOnboardingState({
    emailVerified,
    phoneVerified,
    hasRequiredContactFields: requiredContact.missingFields.length === 0,
    primaryRole: null,
    hasLaneRecord: false
  });

  return {
    fullName: requiredContact.fullName || authUser.email?.split("@")[0] || "New account",
    email: requiredContact.email,
    phone: requiredContact.phone,
    emailVerified,
    phoneVerified,
    onboardingState
  };
}

async function syncProfileFromAuth(authUser: AuthUserLike) {
  const supabase = await getSupabase();
  if (!supabase) {
    console.error("[auth] canonical profile sync skipped because no Supabase profile client is available", {
      userId: authUser.id,
      hasEmail: Boolean(authUser.email)
    });
    return;
  }

  const profile = await readProfile(authUser.id);
  const payload = getProfileSyncPayload(authUser, profile);
  const signupRoleIntent = getSignupRoleIntentFromMetadata(authUser.user_metadata);
  const nextPrimaryOnboardingRole = profile?.primary_onboarding_role ?? signupRoleIntent ?? null;
  const existingProfileRole = profile?.role === "shop_owner" ? "owner" : profile?.role ?? null;
  const nextProfileRole = profile?.primary_onboarding_role
    ? existingProfileRole ?? "client"
    : signupRoleIntent
      ? getRuntimeRoleForSignupIntent(signupRoleIntent)
      : existingProfileRole ?? "client";
  const nextPhoneVerifiedAt = profile?.phone_verified_at ?? (payload.phoneVerified ? new Date().toISOString() : null);
  const nextFullName = profile?.full_name?.trim()
    ? profile.full_name.trim()
    : payload.fullName;
  const nextEmail = profile?.email?.trim()
    ? profile.email.trim()
    : payload.email;
  const nextPhone = normalizePhoneNumber(profile?.phone ?? null) || payload.phone || null;

  if (profile?.id) {
    const update = await supabase
      .from("profiles")
      .update({
        role: nextProfileRole,
        full_name: nextFullName,
        email: nextEmail,
        phone: nextPhone,
        phone_verified_at: nextPhoneVerifiedAt,
        primary_onboarding_role: nextPrimaryOnboardingRole,
        onboarding_state: profile.onboarding_state ?? payload.onboardingState
      })
      .eq("id", authUser.id);

    if (update.error) {
      if (!isSchemaError(update.error)) {
        console.error("[auth] canonical profile sync update failed", {
          userId: authUser.id,
          error: describeSupabaseError(update.error)
        });
        throw new Error(`Profile sync failed: ${describeSupabaseError(update.error)}`);
      }

      const fallback = await supabase
        .from("profiles")
        .update({
          full_name: nextFullName,
          email: nextEmail,
          phone: nextPhone
        })
        .eq("id", authUser.id);

      if (fallback.error && !isSchemaError(fallback.error)) {
        console.error("[auth] canonical profile sync fallback update failed", {
          userId: authUser.id,
          error: describeSupabaseError(fallback.error)
        });
        throw new Error(`Profile sync fallback failed: ${describeSupabaseError(fallback.error)}`);
      }
    }

    return;
  }

  const insert = await supabase
    .from("profiles")
    .upsert({
      id: authUser.id,
      role: nextProfileRole,
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone || null,
      phone_verified_at: nextPhoneVerifiedAt,
      primary_onboarding_role: nextPrimaryOnboardingRole,
      onboarding_state: payload.onboardingState
    }, { onConflict: "id" });

  if (insert.error) {
    if (!isSchemaError(insert.error)) {
      console.error("[auth] canonical profile sync insert failed", {
        userId: authUser.id,
        error: describeSupabaseError(insert.error)
      });
      throw new Error(`Profile bootstrap failed: ${describeSupabaseError(insert.error)}`);
    }

    const fallback = await supabase
      .from("profiles")
      .upsert({
        id: authUser.id,
        role: "client",
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone || null
      }, { onConflict: "id" });

    if (fallback.error && !isSchemaError(fallback.error)) {
      console.error("[auth] canonical profile sync fallback insert failed", {
        userId: authUser.id,
        error: describeSupabaseError(fallback.error)
      });
      throw new Error(`Profile bootstrap fallback failed: ${describeSupabaseError(fallback.error)}`);
    }
  }
}

export async function ensureCanonicalProfileForAuthUser(authUser: AuthUserLike) {
  await syncProfileFromAuth(authUser);
  const profile = await readProfile(authUser.id);
  console.info("[auth] canonical profile ensured", {
    userId: authUser.id,
    profile
  });

  if (!profile?.id) {
    throw new Error("canonical_profile_missing");
  }

  return profile;
}

async function writeSignupRoleIntentToProfile(authUser: AuthUserLike, role: SignupRoleIntent) {
  const supabase = await getSupabase();
  if (!supabase) {
    return role;
  }

  const profile = await readProfile(authUser.id);
  if (profile?.primary_onboarding_role) {
    return isSignupRoleIntent(profile.primary_onboarding_role) ? profile.primary_onboarding_role : null;
  }

  const payload = getProfileSyncPayload(authUser, profile);
  const profileRole = getRuntimeRoleForSignupIntent(role);
  const updatePayload = {
    id: authUser.id,
    role: profileRole,
    full_name: profile?.full_name?.trim() || payload.fullName,
    email: profile?.email?.trim() || payload.email,
    phone: normalizePhoneNumber(profile?.phone ?? null) || payload.phone || null,
    phone_verified_at: profile?.phone_verified_at ?? (payload.phoneVerified ? new Date().toISOString() : null),
    primary_onboarding_role: role,
    onboarding_state: profile?.onboarding_state ?? payload.onboardingState
  };

  const result = await supabase
    .from("profiles")
    .upsert(updatePayload, { onConflict: "id" });

  if (result.error) {
    if (!isSchemaError(result.error)) {
      throw new Error(`Signup role intent persistence failed: ${describeSupabaseError(result.error)}`);
    }

    const fallback = await supabase
      .from("profiles")
      .upsert({
        id: authUser.id,
        role: profileRole,
        full_name: updatePayload.full_name,
        email: updatePayload.email,
        phone: updatePayload.phone
      }, { onConflict: "id" });

    if (fallback.error && !isSchemaError(fallback.error)) {
      throw new Error(`Signup role intent fallback failed: ${describeSupabaseError(fallback.error)}`);
    }
  }

  console.info("[auth] signup role intent persisted", {
    userId: authUser.id,
    role
  });
  return role;
}

function getShopNameIntent(authUser: AuthUserLike) {
  const metadata = authUser.user_metadata ?? {};
  const value = metadata.shopName ?? metadata.shop_name;
  return typeof value === "string" && value.trim().length >= 2 ? value.trim() : null;
}

export async function applySignupRoleIntentForAuthUser(
  authUser: AuthUserLike,
  requestedRole?: unknown
): Promise<{
  role: SignupRoleIntent | null;
  provisioned: boolean;
  deferredReason?: "contact_verification_required" | "shop_setup_required" | "lane_already_exists";
}> {
  await syncProfileFromAuth(authUser);

  let profile = await readProfile(authUser.id);
  const role = isSignupRoleIntent(requestedRole)
    ? requestedRole
    : getSignupRoleIntentFromMetadata(authUser.user_metadata)
      ?? (isSignupRoleIntent(profile?.primary_onboarding_role) ? profile.primary_onboarding_role : null);

  if (!role) {
    return {
      role: null,
      provisioned: false
    };
  }

  const persistedRole = await writeSignupRoleIntentToProfile(authUser, role);
  if (!persistedRole) {
    return {
      role: null,
      provisioned: false
    };
  }

  profile = await readProfile(authUser.id);
  const rows = await readLaneRecordSnapshot(authUser.id);
  const laneAlreadyExists = Boolean(
    (persistedRole === "client" && rows.client)
    || (persistedRole === "barber" && rows.barber)
    || (persistedRole === "shop_owner" && rows.shop)
  );

  if (laneAlreadyExists) {
    return {
      role: persistedRole,
      provisioned: false,
      deferredReason: "lane_already_exists"
    };
  }

  const contactState = await readContactState(authUser);
  if (!contactState.canContinue) {
    console.info("[auth] signup role intent deferred until contact verification", {
      userId: authUser.id,
      role: persistedRole,
      missingFields: contactState.missingFields
    });
    return {
      role: persistedRole,
      provisioned: false,
      deferredReason: "contact_verification_required"
    };
  }

  if (persistedRole === "shop_owner") {
    const shopName = getShopNameIntent(authUser);
    if (!shopName) {
      console.info("[auth] shop owner signup role intent deferred until shop setup", {
        userId: authUser.id,
        role: persistedRole,
        profile
      });
      return {
        role: persistedRole,
        provisioned: false,
        deferredReason: "shop_setup_required"
      };
    }

    await initializeProductionRoleSelection(authUser, { role: persistedRole, shopName });
    return {
      role: persistedRole,
      provisioned: true
    };
  }

  await initializeProductionRoleSelection(authUser, { role: persistedRole });
  return {
    role: persistedRole,
    provisioned: true
  };
}

async function readProfile(authUserId: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    return null;
  }

  const preferred = await supabase
    .from("profiles")
    .select("id, role, full_name, email, phone, primary_onboarding_role, onboarding_state, phone_verified_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (!preferred.error && preferred.data) {
    return preferred.data as ProfileRow;
  }

  if (preferred.error && !isSchemaError(preferred.error)) {
    console.error("[auth] canonical profile read failed", {
      userId: authUserId,
      error: describeSupabaseError(preferred.error)
    });
    throw preferred.error;
  }

  const fallback = await supabase
    .from("profiles")
    .select("id, role, full_name, email, phone")
    .eq("id", authUserId)
    .maybeSingle();

  if (fallback.error) {
    if (isSchemaError(fallback.error)) {
      return null;
    }
    throw fallback.error;
  }

  return fallback.data as ProfileRow | null;
}

async function persistResolvedProfileState(input: {
  profile: ProfileRow | null;
  profileId: string;
  runtimeRole: Role;
  primaryRole: IdentityLane | null;
  onboardingState: IdentityOnboardingState;
  fullName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
}) {
  const supabase = await getSupabase();
  if (!supabase || !input.profileId) {
    return;
  }

  const normalizedCurrentPhone = normalizePhoneNumber(input.profile?.phone ?? null);
  const normalizedNextPhone = normalizePhoneNumber(input.phone);
  const nextPhoneVerifiedAt = input.phoneVerified
    ? input.profile?.phone_verified_at ?? new Date().toISOString()
    : input.profile?.phone_verified_at ?? null;
  const nextFullName = input.fullName.trim();
  const nextEmail = input.email.trim();
  const currentRole = input.profile?.role === "shop_owner" ? "owner" : input.profile?.role ?? null;
  const currentPrimaryRole = input.profile?.primary_onboarding_role ?? null;
  const currentOnboardingState = input.profile?.onboarding_state ?? null;
  const needsSync = currentRole !== input.runtimeRole
    || currentPrimaryRole !== input.primaryRole
    || currentOnboardingState !== input.onboardingState
    || (input.profile?.full_name ?? "") !== nextFullName
    || (input.profile?.email ?? "") !== nextEmail
    || normalizedCurrentPhone !== normalizedNextPhone
    || Boolean(input.profile?.phone_verified_at) !== Boolean(nextPhoneVerifiedAt);

  if (!needsSync) {
    return;
  }

  const update = await supabase
    .from("profiles")
    .update({
      role: input.runtimeRole,
      full_name: nextFullName,
      email: nextEmail,
      phone: normalizedNextPhone || null,
      primary_onboarding_role: input.primaryRole,
      onboarding_state: input.onboardingState,
      phone_verified_at: nextPhoneVerifiedAt
    })
    .eq("id", input.profileId);

  if (update.error) {
    if (!isSchemaError(update.error)) {
      throw update.error;
    }

    const fallback = await supabase
      .from("profiles")
      .update({
        role: input.runtimeRole,
        full_name: nextFullName,
        email: nextEmail,
        phone: normalizedNextPhone || null
      })
      .eq("id", input.profileId);

    if (fallback.error && !isSchemaError(fallback.error)) {
      throw fallback.error;
    }
  }
}

async function readClientByProfile(profileId: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    return null;
  }

  const result = await supabase
    .from("clients")
    .select("id, reference_code")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isSchemaError(result.error)) {
      return null;
    }
    throw result.error;
  }

  return result.data as ClientRow | null;
}

async function readBarberByProfile(profileId: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    return null;
  }

  const preferred = await supabase
    .from("barbers")
    .select("id, reference_code, compensation_model, barber_subtype, app_approval_status, shop_approval_status")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data) {
    return preferred.data as BarberRow;
  }

  if (preferred.error && !isSchemaError(preferred.error)) {
    throw preferred.error;
  }

  const fallback = await supabase
    .from("barbers")
    .select("id, reference_code, compensation_model")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    if (isSchemaError(fallback.error)) {
      return null;
    }
    throw fallback.error;
  }

  return fallback.data as BarberRow | null;
}

async function readOwnedShopByProfile(profileId: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    return null;
  }

  const preferred = await supabase
    .from("shops")
    .select("id, name, app_approval_status")
    .eq("owner_profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data) {
    return preferred.data as ShopRow;
  }

  if (preferred.error && !isSchemaError(preferred.error)) {
    throw preferred.error;
  }

  return null;
}

async function safeHasLaneRecord(profileId: string, primaryRole: IdentityLane | null) {
  try {
    if (primaryRole === "client") {
      return Boolean(await readClientByProfile(profileId));
    }

    if (primaryRole === "barber") {
      return Boolean(await readBarberByProfile(profileId));
    }

    if (primaryRole === "shop_owner") {
      return Boolean(await readOwnedShopByProfile(profileId));
    }
  } catch (error) {
    console.warn("[auth] unable to resolve lane record during contact-state check", {
      profileId,
      primaryRole,
      error
    });
  }

  return false;
}

async function readLaneRecordSnapshot(profileId: string): Promise<LaneRecordSnapshot> {
  const [client, barber, shop] = await Promise.all([
    readClientByProfile(profileId),
    readBarberByProfile(profileId),
    readOwnedShopByProfile(profileId)
  ]);

  return { client, barber, shop };
}

async function readUserRolesByEmail(email?: string | null) {
  const supabase = await getSupabase();
  if (!supabase || !email) {
    return [] as UserRoleRow[];
  }

  const result = await supabase
    .from("user_roles")
    .select("user_email, role, client_reference, barber_reference, location_references")
    .eq("user_email", email);

  if (result.error) {
    if (isSchemaError(result.error)) {
      return [] as UserRoleRow[];
    }
    throw result.error;
  }

  return (result.data ?? []) as UserRoleRow[];
}

export async function getUserLaneState(profileId: string, email?: string | null) {
  const [profile, rows, userRoles] = await Promise.all([
    readProfile(profileId),
    readLaneRecordSnapshot(profileId),
    readUserRolesByEmail(email)
  ]);

  return {
    profile,
    primary_onboarding_role: profile?.primary_onboarding_role ?? null,
    clients_exists: Boolean(rows.client),
    barbers_exists: Boolean(rows.barber),
    shops_exists: Boolean(rows.shop),
    user_roles: userRoles,
    rows
  };
}

async function deleteWhereEq(table: string, field: string, value: string | null | undefined, action: string) {
  const supabase = await getSupabase();
  if (!supabase || !value) {
    return false;
  }

  const result = await supabase
    .from(table)
    .delete()
    .eq(field, value);

  if (result.error && !isSchemaError(result.error)) {
    throwSupabaseLaneError(action, result.error);
  }

  return !result.error;
}

async function resetStaleOnboardingState(input: {
  profileId: string;
  email: string;
  rows: LaneRecordSnapshot;
  reason: string;
  selectedLane: IdentityLane;
}) {
  const deleted: Record<string, boolean> = {};

  deleted.clientProfilesByReference = await deleteWhereEq(
    "client_profiles",
    "client_reference",
    input.rows.client?.reference_code,
    "Stale client profile cleanup by reference"
  );
  deleted.clientProfilesByEmail = await deleteWhereEq(
    "client_profiles",
    "profile_email",
    input.email,
    "Stale client profile cleanup by email"
  );
  deleted.clients = await deleteWhereEq("clients", "profile_id", input.profileId, "Stale client row cleanup");

  deleted.barberProfiles = await deleteWhereEq(
    "barber_profiles",
    "barber_reference",
    input.rows.barber?.reference_code,
    "Stale barber profile cleanup"
  );
  deleted.barberStatus = await deleteWhereEq(
    "barber_status",
    "barber_reference",
    input.rows.barber?.reference_code,
    "Stale barber status cleanup"
  );
  deleted.barbers = await deleteWhereEq("barbers", "profile_id", input.profileId, "Stale barber row cleanup");

  deleted.staffLocations = await deleteWhereEq(
    "staff_locations",
    "profile_id",
    input.profileId,
    "Stale owner staff location cleanup"
  );
  deleted.locations = await deleteWhereEq(
    "locations",
    "reference_code",
    input.rows.shop?.id,
    "Stale owner location cleanup"
  );
  deleted.shops = await deleteWhereEq("shops", "owner_profile_id", input.profileId, "Stale shop row cleanup");

  deleted.userRoles = await deleteWhereEq("user_roles", "user_email", input.email, "Stale user role cleanup");

  console.info("[auth] Recovered stale onboarding state", {
    profileId: input.profileId,
    email: input.email,
    selectedLane: input.selectedLane,
    reason: input.reason,
    rowsBeforeReset: {
      client: input.rows.client,
      barber: input.rows.barber,
      shop: input.rows.shop
    },
    deleted
  });
}

function isOfficialLaneLocked(profile: ProfileRow | null, rows: LaneRecordSnapshot) {
  const primaryRole = profile?.primary_onboarding_role ?? null;
  if (!primaryRole || profile?.onboarding_state !== "active") {
    return false;
  }

  if (primaryRole === "client") {
    return Boolean(rows.client);
  }

  if (primaryRole === "barber") {
    return Boolean(rows.barber);
  }

  return Boolean(rows.shop);
}

async function readCanonicalContactSnapshot(
  authUser: AuthUserLike,
  options?: { skipSync?: boolean }
): Promise<CanonicalContactSnapshot> {
  const beforeSyncProfile = await readProfile(authUser.id);
  console.info("[auth] contact snapshot pre-sync", {
    userId: authUser.id,
    rawProfile: beforeSyncProfile
  });

  if (!options?.skipSync) {
    await syncProfileFromAuth(authUser);
  }

  const profileAfterSync = await readProfile(authUser.id);
  const profile = profileAfterSync ?? beforeSyncProfile;
  const profileName = splitFullName(profile?.full_name);
  const metadataName = getMetadataNameParts(authUser);
  const fullName = `${profile?.full_name ?? ""}`.trim();
  const email = `${profile?.email ?? authUser.email ?? ""}`.trim();
  const phone = normalizePhoneNumber(profile?.phone ?? null);
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const phoneVerified = Boolean(profile?.phone_verified_at);
  const primaryRole = profile?.primary_onboarding_role ?? null;
  const hasLaneRecord = profile?.id ? await safeHasLaneRecord(profile.id, primaryRole) : false;
  const missingFields: string[] = [];

  if (!fullName) {
    missingFields.push("full_name");
  }

  if (!email) {
    missingFields.push("email");
  }

  if (!phone) {
    missingFields.push("phone");
  }

  if (email && !emailVerified) {
    missingFields.push("email_verification");
  }

  if (phone && !phoneVerified) {
    missingFields.push("phone_verification");
  }

  if (!profile?.id) {
    console.error("[auth] canonical profile missing after sync", {
      userId: authUser.id,
      skipSync: Boolean(options?.skipSync),
      beforeSyncProfile
    });
    throw new Error("canonical_profile_missing");
  }

  const onboardingState = inferOnboardingState({
    emailVerified,
    phoneVerified,
    hasRequiredContactFields: missingFields.length === 0,
    primaryRole,
    hasLaneRecord,
    persistedState: profile?.onboarding_state
  });

  let resolvedProfile: ProfileRow | null = profile;

  if (profile?.id && profile.onboarding_state !== onboardingState) {
    const supabase = await getSupabase();
    if (supabase) {
      const sync = await supabase
        .from("profiles")
        .update({ onboarding_state: onboardingState })
        .eq("id", profile.id);

      if (sync.error && !isSchemaError(sync.error)) {
        throw sync.error;
      }

      const refreshedProfile = await readProfile(profile.id);
      resolvedProfile = refreshedProfile
        ? refreshedProfile
        : {
            ...profile,
            onboarding_state: onboardingState
          };
    }
  }

  console.info("[auth] contact snapshot resolved", {
    userId: authUser.id,
    rawProfile: resolvedProfile,
    computed: {
      fullName,
      email,
      phone,
      emailVerified,
      phoneVerified,
      primaryRole,
      hasLaneRecord,
      onboardingState,
      missingFields,
      contactComplete: missingFields.length === 0 && emailVerified && phoneVerified
    }
  });

  return {
    profile: resolvedProfile,
    fullName,
    firstName: profileName.firstName || metadataName.firstName,
    lastName: profileName.lastName || metadataName.lastName,
    email,
    phone,
    emailVerified,
    phoneVerified,
    primaryRole,
    hasLaneRecord,
    onboardingState,
    missingFields
  };
}

async function readLocationReferencesForProfile(profileId: string, ownedShopId?: string | null) {
  const supabase = await getSupabase();
  const references: string[] = [];
  if (ownedShopId) {
    references.push(ownedShopId);
  }

  if (!supabase) {
    return references;
  }

  const locationMemberships = await supabase
    .from("staff_locations")
    .select("location_id")
    .eq("profile_id", profileId);

  if (locationMemberships.error) {
    if (isSchemaError(locationMemberships.error)) {
      return references;
    }
    throw locationMemberships.error;
  }

  const locationIds = ((locationMemberships.data ?? []) as LocationAssignmentRow[])
    .map((row) => row.location_id)
    .filter(Boolean);

  if (!locationIds.length) {
    return references;
  }

  const locations = await supabase
    .from("locations")
    .select("id, reference_code")
    .in("id", locationIds);

  if (locations.error) {
    if (isSchemaError(locations.error)) {
      return references;
    }
    throw locations.error;
  }

  for (const row of (locations.data ?? []) as LocationRow[]) {
    references.push(row.reference_code ?? row.id);
  }

  return Array.from(new Set(references));
}

export async function buildRuntimeUserFromProductionAuth(authUser: AuthUserLike): Promise<UserAccount> {
  try {
    await syncProfileFromAuth(authUser);
    const [profile, client, barber, shop] = await Promise.all([
      readProfile(authUser.id),
      readClientByProfile(authUser.id),
      readBarberByProfile(authUser.id),
      readOwnedShopByProfile(authUser.id)
    ]);

    const requiredContact = getRequiredContactFields(authUser, profile);
    const emailVerified = Boolean(authUser.email_confirmed_at);
    const phoneVerified = Boolean(profile?.phone_verified_at || authUser.phone_confirmed_at);
    const primaryRole = profile?.primary_onboarding_role ?? null;
    const runtimeRole = toRuntimeRole({
      primaryRole,
      profileRole: profile?.role,
      compensationModel: barber?.compensation_model ?? null
    });
    const locationIds = await readLocationReferencesForProfile(authUser.id, shop?.id ?? null);
    const hasLaneRecord = Boolean(
      (primaryRole === "client" && client)
      || (primaryRole === "barber" && barber)
      || (primaryRole === "shop_owner" && shop)
      || primaryRole === "platform_admin"
    );
    const onboardingState = primaryRole === "platform_admin"
      ? "active" as const
      : inferOnboardingState({
          emailVerified,
          phoneVerified,
          hasRequiredContactFields: requiredContact.missingFields.length === 0,
          primaryRole,
          hasLaneRecord,
          persistedState: profile?.onboarding_state
        });
    const displayName = getDisplayName(authUser, profile);
    const accountStatus = primaryRole === "platform_admin"
      ? "active"
      : hasLaneRecord
      && emailVerified
      && phoneVerified
      && requiredContact.missingFields.length === 0
        ? "active"
        : "profile_only";
    const canonicalFullName = requiredContact.fullName || displayName;

    await persistResolvedProfileState({
      profile,
      profileId: authUser.id,
      runtimeRole,
      primaryRole,
      onboardingState,
      fullName: canonicalFullName,
      email: requiredContact.email,
      phone: requiredContact.phone,
      phoneVerified
    });

    console.info("[auth] production identity resolved", {
      userId: authUser.id,
      primaryRole,
      runtimeRole,
      hasLaneRecord,
      onboardingState,
      accountStatus
    });

    return {
      id: authUser.id,
      role: runtimeRole,
      email: requiredContact.email,
      password: "",
      name: canonicalFullName,
      canonicalFullName,
      title: getTitle(runtimeRole, barber?.barber_subtype),
      phone: requiredContact.phone,
      firstName: requiredContact.firstName || undefined,
      lastName: requiredContact.lastName || undefined,
      locationIds,
      accountStatus,
      primaryOnboardingRole: primaryRole ?? undefined,
      onboardingState,
      emailVerified,
      phoneVerified,
      clientId: client?.reference_code ?? client?.id ?? undefined,
      barberId: barber?.reference_code ?? barber?.id ?? undefined,
      barberSubtype: barber?.barber_subtype ?? undefined,
      ownedShopId: shop?.id ?? undefined,
      ownedShopName: shop?.name ?? undefined,
      appApprovalStatus: runtimeRole === "owner"
        ? (shop?.app_approval_status ?? "pending")
        : barber?.app_approval_status ?? undefined,
      shopApprovalStatus: barber?.shop_approval_status ?? undefined
    };
  } catch (error) {
    console.error("[auth] production identity resolution failed", error);
    return buildMinimalRuntimeUser(authUser);
  }
}

async function readContactState(authUser: AuthUserLike): Promise<ContactVerificationState> {
  const snapshot = await readCanonicalContactSnapshot(authUser);
  return toContactVerificationState(snapshot);
}

export async function getContactVerificationState(authUser: AuthUserLike) {
  return readContactState(authUser);
}

export async function updateContactVerificationProfile(
  authUser: AuthUserLike,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  }
) {
  const supabase = await getSupabase();
  const profileId = await resolveProfileId(authUser);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = normalizePhoneNumber(input.phone);
  const email = `${input.email ?? authUser.email ?? ""}`.trim();

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  if (!phone) {
    throw new Error("A valid phone number is required.");
  }

  if (!email) {
    throw new Error("An email address is required.");
  }

  console.info("[auth] contact save requested", {
    userId: authUser.id,
    incomingPayload: {
      firstName,
      lastName,
      fullName,
      email,
      phone
    }
  });

  if (supabase) {
    const existingProfile = await readProfile(profileId);
    const nextRole = existingProfile?.role === "shop_owner"
      ? "owner"
      : existingProfile?.role ?? "client";
    const writePayload = {
      id: profileId,
      role: nextRole,
      full_name: fullName,
      email,
      phone,
      primary_onboarding_role: existingProfile?.primary_onboarding_role ?? null,
      onboarding_state: existingProfile?.onboarding_state ?? undefined,
      phone_verified_at: existingProfile?.phone_verified_at ?? null
    };

    console.info("[auth] contact save before write", {
      profileId,
      rawProfile: existingProfile,
      writePayload
    });

    const update = await supabase
      .from("profiles")
      .upsert(writePayload, { onConflict: "id" });

    console.info("[auth] contact save write result", {
      profileId,
      method: "profiles.upsert",
      error: update.error ? describeSupabaseError(update.error) : null
    });

    if (update.error) {
      if (!isSchemaError(update.error)) {
        throw new Error(`Profile save failed: ${describeSupabaseError(update.error)}`);
      }

      const fallback = await supabase
        .from("profiles")
        .upsert({
          id: profileId,
          role: nextRole,
          full_name: fullName,
          email,
          phone
        }, { onConflict: "id" });

      console.info("[auth] contact save fallback write result", {
        profileId,
        method: "profiles.upsert:fallback",
        error: fallback.error ? describeSupabaseError(fallback.error) : null
      });

      if (fallback.error && !isSchemaError(fallback.error)) {
        throw new Error(`Profile save fallback failed: ${describeSupabaseError(fallback.error)}`);
      }
    }

    const persistedProfile = await readProfile(profileId);
    console.info("[auth] contact details saved", {
      profileId,
      rawProfile: persistedProfile
    });

    if (!persistedProfile?.full_name?.trim() || !persistedProfile.email?.trim() || !normalizePhoneNumber(persistedProfile.phone)) {
      throw new Error("Canonical contact persistence failed. Please retry saving your contact details.");
    }
  }

  const snapshot = await readCanonicalContactSnapshot({
    ...authUser,
    email,
    phone,
    user_metadata: {
      ...(authUser.user_metadata ?? {}),
      full_name: fullName,
      given_name: firstName,
      family_name: lastName,
      phone
    }
  }, { skipSync: true });

  console.info("[auth] contact save recomputed", {
    userId: authUser.id,
    rawProfile: snapshot.profile,
    missingFields: snapshot.missingFields,
    onboardingState: snapshot.onboardingState,
    contactComplete: snapshot.missingFields.length === 0 && snapshot.emailVerified && snapshot.phoneVerified
  });

  return toContactVerificationState(snapshot);
}

function buildChallengeHash(profileId: string, phone: string, code: string) {
  return createHash("sha256").update(`${profileId}:${phone}:${code}`).digest("hex");
}

async function deliverPhoneCode(phone: string, code: string) {
  console.info("[auth] sms delivery readiness", {
    phone,
    hasTwilioConfig: hasTwilioDeliveryConfig(),
    usesMessagingService: Boolean(runtimeConfig.twilioMessagingServiceSid),
    usesFromNumber: Boolean(runtimeConfig.twilioFromNumber)
  });

  if (!hasTwilioDeliveryConfig()) {
    console.info(`[auth] SMS verification code for ${phone}: ${code}`);
    return { degraded: true };
  }

  const params = new URLSearchParams();
  params.set("To", phone);
  params.set("Body", `Your BVRB3R verification code is ${code}. It expires in 10 minutes.`);
  if (runtimeConfig.twilioMessagingServiceSid) {
    params.set("MessagingServiceSid", runtimeConfig.twilioMessagingServiceSid);
  } else {
    params.set("From", runtimeConfig.twilioFromNumber);
  }

  const auth = Buffer.from(`${runtimeConfig.twilioAccountSid}:${runtimeConfig.twilioAuthToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${runtimeConfig.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[auth] sms delivery failed", {
      phone,
      status: response.status,
      body
    });
    throw new Error(body || "Unable to send the SMS verification code.");
  }

  console.info("[auth] sms delivery succeeded", {
    phone,
    status: response.status
  });
  return { degraded: false };
}

async function writePhoneChallenge(profileId: string, phone: string, codeHash: string, expiresAt: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    const store = getChallengeStore();
    store.unshift({
      id: `phone-challenge-${randomUUID().slice(0, 8)}`,
      profileId,
      phone,
      codeHash,
      attemptCount: 0,
      expiresAt,
      createdAt: new Date().toISOString()
    });
    return true;
  }

  const result = await supabase
    .from("phone_verification_challenges")
    .insert({
      profile_id: profileId,
      phone,
      code_hash: codeHash,
      expires_at: expiresAt
    });

  if (result.error) {
    if (isSchemaError(result.error)) {
      const store = getChallengeStore();
      store.unshift({
        id: `phone-challenge-${randomUUID().slice(0, 8)}`,
        profileId,
        phone,
        codeHash,
        attemptCount: 0,
        expiresAt,
        createdAt: new Date().toISOString()
      });
      return false;
    }
    console.error("[auth] phone challenge insert failed", {
      profileId,
      phone,
      error: describeSupabaseError(result.error)
    });
    throw new Error(`SMS send failed: challenge insert failed: ${describeSupabaseError(result.error)}`);
  }

  return true;
}

async function readLatestPhoneChallenge(profileId: string) {
  const supabase = await getSupabase();
  if (!supabase) {
    return getChallengeStore()
      .filter((entry) => entry.profileId === profileId && !entry.consumedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  const result = await supabase
    .from("phone_verification_challenges")
    .select("id, profile_id, phone, code_hash, attempt_count, expires_at, consumed_at, created_at")
    .eq("profile_id", profileId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isSchemaError(result.error)) {
      return getChallengeStore()
        .filter((entry) => entry.profileId === profileId && !entry.consumedAt)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    }
    console.error("[auth] phone challenge lookup failed", {
      profileId,
      error: describeSupabaseError(result.error)
    });
    throw new Error(`Phone verify failed: challenge lookup failed: ${describeSupabaseError(result.error)}`);
  }

  return result.data as PhoneChallengeRow | null;
}

function getPhoneChallengePhone(challenge: AnyPhoneChallenge) {
  return "code_hash" in challenge ? challenge.phone : challenge.phone;
}

function getPhoneChallengeHash(challenge: AnyPhoneChallenge) {
  return "code_hash" in challenge ? challenge.code_hash : challenge.codeHash;
}

async function markPhoneChallengeVerified(challengeId: string, profileId: string, phone: string) {
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  if (!supabase) {
    const store = getChallengeStore();
    const challenge = store.find((entry) => entry.id === challengeId);
    if (challenge) {
      challenge.consumedAt = now;
    }
    return;
  }

  const [challengeUpdate, profileUpdate] = await Promise.all([
    supabase
      .from("phone_verification_challenges")
      .update({ consumed_at: now })
      .eq("id", challengeId),
    supabase
      .from("profiles")
      .update({
        phone,
        phone_verified_at: now
      })
      .eq("id", profileId)
  ]);

  if (challengeUpdate.error && !isSchemaError(challengeUpdate.error)) {
    console.error("[auth] phone verification challenge update failed", {
      profileId,
      challengeId,
      error: describeSupabaseError(challengeUpdate.error)
    });
    throw new Error(`Phone verify failed: challenge update failed: ${describeSupabaseError(challengeUpdate.error)}`);
  }

  if (profileUpdate.error && !isSchemaError(profileUpdate.error)) {
    console.error("[auth] phone verification profile update failed", {
      profileId,
      challengeId,
      error: describeSupabaseError(profileUpdate.error)
    });
    throw new Error(`Phone verify failed: phone_verified_at did not persist: ${describeSupabaseError(profileUpdate.error)}`);
  }

  const persistedProfile = await readProfile(profileId);
  console.info("[auth] phone verification persisted", {
    profileId,
    challengeUpdateError: challengeUpdate.error ? describeSupabaseError(challengeUpdate.error) : null,
    profileUpdateError: profileUpdate.error ? describeSupabaseError(profileUpdate.error) : null,
    phone: persistedProfile?.phone ?? phone,
    phoneVerifiedAt: persistedProfile?.phone_verified_at ?? now,
    onboardingState: persistedProfile?.onboarding_state ?? null
  });
}

async function resolveProfileId(authUser: AuthUserLike) {
  const profile = await readProfile(authUser.id);
  if (profile?.id) {
    return profile.id;
  }

  return authUser.id;
}

export async function sendPhoneVerificationChallenge(
  authUser: AuthUserLike,
  input: { phone?: string | null }
): Promise<SendPhoneChallengeResult> {
  const profileId = await resolveProfileId(authUser);
  const requestedPhone = normalizePhoneNumber(input.phone ?? null);
  let profileBeforeSend = await readProfile(profileId);
  if (!profileBeforeSend?.id) {
    await syncProfileFromAuth(authUser);
    profileBeforeSend = await readProfile(profileId);
  }

  const candidatePhone = requestedPhone
    || normalizePhoneNumber(profileBeforeSend?.phone ?? null)
    || normalizePhoneNumber(authUser.phone ?? null);
  if (!candidatePhone) {
    throw new Error("A valid phone number is required.");
  }

  console.info("[auth] phone send requested", {
    userId: authUser.id,
    profileId,
    requestedPhone,
    candidatePhone,
    rawProfileBeforeSend: profileBeforeSend,
    twilioReady: hasTwilioDeliveryConfig()
  });

  const supabase = await getSupabase();

  if (supabase) {
    const existingProfile = await readProfile(profileId);
    const update = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        role: existingProfile?.role === "shop_owner" ? "owner" : existingProfile?.role ?? "client",
        full_name: existingProfile?.full_name?.trim() || getDisplayName(authUser, existingProfile),
        email: existingProfile?.email?.trim() || authUser.email || `${profileId}@bvrb3r.local`,
        phone: candidatePhone,
        primary_onboarding_role: existingProfile?.primary_onboarding_role ?? null,
        onboarding_state: existingProfile?.onboarding_state ?? "awaiting_contact_verification",
        phone_verified_at: existingProfile?.phone_verified_at ?? null
      }, { onConflict: "id" });

    console.info("[auth] phone send canonical phone write result", {
      profileId,
      method: "profiles.upsert",
      error: update.error ? describeSupabaseError(update.error) : null
    });

    if (update.error) {
      if (!isSchemaError(update.error)) {
        throw new Error(`SMS send failed: canonical phone could not be persisted: ${describeSupabaseError(update.error)}`);
      }

      const fallback = await supabase
        .from("profiles")
        .upsert({
          id: profileId,
          role: existingProfile?.role === "shop_owner" ? "owner" : existingProfile?.role ?? "client",
          full_name: existingProfile?.full_name?.trim() || getDisplayName(authUser, existingProfile),
          email: existingProfile?.email?.trim() || authUser.email || `${profileId}@bvrb3r.local`,
          phone: candidatePhone
        }, { onConflict: "id" });

      console.info("[auth] phone send canonical phone fallback write result", {
        profileId,
        method: "profiles.upsert:fallback",
        error: fallback.error ? describeSupabaseError(fallback.error) : null
      });

      if (fallback.error && !isSchemaError(fallback.error)) {
        throw new Error(`SMS send failed: canonical phone fallback could not persist: ${describeSupabaseError(fallback.error)}`);
      }
    }
  }

  const canonicalProfileBeforeDelivery = await readProfile(profileId);
  const canonicalPhone = supabase
    ? normalizePhoneNumber(canonicalProfileBeforeDelivery?.phone ?? null)
    : candidatePhone;
  console.info("[auth] phone send canonical profile before delivery", {
    profileId,
    rawProfileBeforeDelivery: canonicalProfileBeforeDelivery,
    canonicalPhone
  });

  if (!canonicalPhone) {
    throw new Error("SMS send failed: canonical phone missing after profile persistence.");
  }

  const code = `${randomInt(0, 1_000_000)}`.padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const codeHash = buildChallengeHash(profileId, canonicalPhone, code);
  const persisted = await writePhoneChallenge(profileId, canonicalPhone, codeHash, expiresAt);
  const delivery = await deliverPhoneCode(canonicalPhone, code);
  console.info("[auth] phone send delivery result", {
    profileId,
    phone: canonicalPhone,
    challengePersisted: persisted,
    degraded: delivery.degraded
  });

  const snapshot = await readCanonicalContactSnapshot({
    ...authUser,
    phone: canonicalPhone,
    user_metadata: {
      ...(authUser.user_metadata ?? {}),
      phone: canonicalPhone
    }
  }, { skipSync: true });

  console.info("[auth] phone send recomputed", {
    userId: authUser.id,
    profileId,
    rawProfileAfterSend: snapshot.profile,
    missingFields: snapshot.missingFields,
    onboardingState: snapshot.onboardingState
  });

  if (!normalizePhoneNumber(snapshot.profile?.phone ?? null)) {
    throw new Error("Canonical phone persistence failed before SMS delivery could continue.");
  }

  return {
    ...toContactVerificationState(snapshot),
    degraded: delivery.degraded || !persisted
  };
}

export async function verifyPhoneVerificationChallenge(
  authUser: AuthUserLike,
  code: string,
  input?: { phone?: string | null }
): Promise<VerifyPhoneChallengeResult> {
  const profileId = await resolveProfileId(authUser);
  let profileBeforeVerify = await readProfile(profileId);
  if (!profileBeforeVerify?.id) {
    await syncProfileFromAuth(authUser);
    profileBeforeVerify = await readProfile(profileId);
  }

  if (!profileBeforeVerify?.id) {
    throw new Error("Phone verify failed: canonical profile row is missing.");
  }

  const challenge = await readLatestPhoneChallenge(profileId);
  console.info("[auth] phone verify challenge lookup result", {
    userId: authUser.id,
    profileId,
    foundChallenge: Boolean(challenge),
    canonicalProfileBeforeVerify: profileBeforeVerify
  });

  if (!challenge) {
    throw new Error("No active SMS verification code was found.");
  }

  const expiresAt = "expires_at" in challenge ? challenge.expires_at : challenge.expiresAt;
  if (new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("That verification code has expired. Request a new SMS code.");
  }

  const challengePhone = normalizePhoneNumber(getPhoneChallengePhone(challenge));
  const submittedPhone = normalizePhoneNumber(input?.phone ?? null);
  if (submittedPhone && challengePhone && submittedPhone !== challengePhone) {
    throw new Error("That verification code was requested for a different phone number.");
  }

  const phone = challengePhone || submittedPhone;
  if (!phone) {
    throw new Error("A valid phone number is required.");
  }

  console.info("[auth] phone verify requested", {
    userId: authUser.id,
    profileId,
    codeLength: code.trim().length,
    phone,
    submittedPhone,
    challengePhone,
    rawProfileBeforeVerify: profileBeforeVerify,
    updateValues: {
      phone,
      phone_verified_at: "now()"
    }
  });
  const expectedHash = buildChallengeHash(profileId, phone, code.trim());
  const currentHash = getPhoneChallengeHash(challenge);
  if (expectedHash !== currentHash) {
    throw new Error("That verification code is not valid.");
  }

  await markPhoneChallengeVerified(challenge.id, profileId, phone);
  const snapshot = await readCanonicalContactSnapshot({
    ...authUser,
    phone
  }, { skipSync: true });

  console.info("[auth] phone verify recomputed", {
    userId: authUser.id,
    profileId,
    rawProfileAfterVerify: snapshot.profile,
    missingFields: snapshot.missingFields,
    onboardingState: snapshot.onboardingState,
    contactComplete: snapshot.missingFields.length === 0 && snapshot.emailVerified && snapshot.phoneVerified
  });

  if (!normalizePhoneNumber(snapshot.profile?.phone ?? null) || !snapshot.profile?.phone_verified_at) {
    throw new Error("Phone verification did not persist to the canonical profile row. Please request a new code.");
  }

  return toContactVerificationState(snapshot);
}

export async function getContactVerificationDebugState(authUser: AuthUserLike) {
  const snapshot = await readCanonicalContactSnapshot(authUser);
  const contactComplete = snapshot.missingFields.length === 0 && snapshot.emailVerified && snapshot.phoneVerified;
  return {
    profile: snapshot.profile,
    computed: {
      fullName: snapshot.fullName,
      email: snapshot.email,
      phone: snapshot.phone,
      emailVerified: snapshot.emailVerified,
      phoneVerified: snapshot.phoneVerified,
      missingFields: snapshot.missingFields,
      contactComplete,
      onboardingState: snapshot.onboardingState,
      requiresRoleSelection: contactComplete && !snapshot.primaryRole
    }
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24) || "bvrb3r";
}

async function upsertProfileForLane(input: {
  profileId: string;
  role: Role;
  primaryOnboardingRole: Exclude<IdentityLane, "platform_admin">;
  onboardingState: IdentityOnboardingState;
  fullName: string;
  email: string;
  phone: string;
}) {
  const supabase = await getSupabase();
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    id: input.profileId,
    role: input.role,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone || null,
    primary_onboarding_role: input.primaryOnboardingRole,
    onboarding_state: input.onboardingState,
    last_onboarded_at: now
  };

  console.info("[auth] lane profile upsert requested", {
    profileId: input.profileId,
    selectedLane: input.primaryOnboardingRole,
    payload
  });

  const upsert = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  console.info("[auth] lane profile upsert result", {
    profileId: input.profileId,
    selectedLane: input.primaryOnboardingRole,
    error: upsert.error ? describeSupabaseError(upsert.error) : null
  });

  if (upsert.error) {
    if (!isSchemaError(upsert.error)) {
      throwSupabaseLaneError("Lane profile upsert", upsert.error);
    }

    const fallbackPayload = {
      id: input.profileId,
      role: input.role,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone || null
    };
    const fallback = await supabase
      .from("profiles")
      .upsert(fallbackPayload, { onConflict: "id" });

    console.info("[auth] lane profile fallback upsert result", {
      profileId: input.profileId,
      selectedLane: input.primaryOnboardingRole,
      payload: fallbackPayload,
      error: fallback.error ? describeSupabaseError(fallback.error) : null
    });

    if (fallback.error) {
      throwSupabaseLaneError("Lane profile fallback upsert", fallback.error);
    }
  }
}

async function ensureClientLane(profileId: string, identity: { email: string; name: string; phone: string; }) {
  const supabase = await getSupabase();
  const clientReference = `client-${profileId.slice(0, 8)}`;
  console.info("[auth] client lane bootstrap requested", {
    profileId,
    payload: {
      profile_id: profileId,
      reference_code: clientReference,
      identity
    }
  });

  if (!supabase) {
    return {
      clientId: clientReference,
      seedProfileData: {
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        clientId: clientReference
      }
    };
  }

  const existing = await supabase
    .from("clients")
    .select("id, reference_code")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && !isSchemaError(existing.error)) {
    throwSupabaseLaneError("Client lane existing-row lookup", existing.error);
  }

  let clientId = (existing.data as ClientRow | null)?.reference_code ?? clientReference;
  if (!existing.data) {
    const insert = await supabase.from("clients").insert({
      profile_id: profileId,
      reference_code: clientReference,
      loyalty_points: 0,
      retention_tag: "new"
    });
    if (insert.error) {
      throwSupabaseLaneError("Client lane row insert", insert.error);
    }
  } else if (!(existing.data as ClientRow).reference_code) {
    const update = await supabase
      .from("clients")
      .update({ reference_code: clientReference })
      .eq("id", (existing.data as ClientRow).id);
    if (update.error) {
      throwSupabaseLaneError("Client lane reference update", update.error);
    }
    clientId = clientReference;
  }

  const clientProfileUpsert = await supabase
    .from("client_profiles")
    .upsert({
      client_reference: clientId,
      profile_email: identity.email,
      full_name: identity.name,
      phone: identity.phone || "",
      loyalty_points: 0,
      retention_tag: "new",
      notes: []
    }, { onConflict: "profile_email" });

  if (clientProfileUpsert.error && !isSchemaError(clientProfileUpsert.error)) {
    throwSupabaseLaneError("Client profile bootstrap upsert", clientProfileUpsert.error);
  }

  const userRoleUpsert = await supabase
    .from("user_roles")
    .upsert({
      user_email: identity.email,
      role: "client",
      client_reference: clientId,
      barber_reference: null,
      location_references: []
    }, { onConflict: "user_email" });

  if (userRoleUpsert.error && !isSchemaError(userRoleUpsert.error)) {
    throwSupabaseLaneError("Client user role bootstrap upsert", userRoleUpsert.error);
  }

  console.info("[auth] client lane bootstrap completed", {
    profileId,
    clientId,
    existed: Boolean(existing.data)
  });

  return {
    clientId,
    seedProfileData: {
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone,
      clientId
    }
  };
}

function toBarberCompensation(subtype: BarberSubtype): CompensationModel {
  return subtype === "commission" ? "commission" : "booth_rent";
}

async function ensureBarberLaneBootstrap(
  profileId: string,
  identity: { email: string; name: string; phone: string; }
) {
  const supabase = await getSupabase();
  const barberReference = `barber-${profileId.slice(0, 8)}`;
  console.info("[auth] barber lane bootstrap requested", {
    profileId,
    payload: {
      profile_id: profileId,
      reference_code: barberReference,
      compensation_model: "booth_rent",
      barber_subtype: null,
      app_approval_status: "pending",
      shop_approval_status: "pending"
    }
  });

  if (!supabase) {
    return {
      barberId: barberReference,
      seedProfileData: {
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        barberId: barberReference
      }
    };
  }

  const existing = await supabase
    .from("barbers")
    .select("id, reference_code")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && !isSchemaError(existing.error)) {
    throwSupabaseLaneError("Barber lane existing-row lookup", existing.error);
  }

  if (!existing.data) {
    const insert = await supabase
      .from("barbers")
      .insert({
        profile_id: profileId,
        reference_code: barberReference,
        compensation_model: "booth_rent",
        barber_subtype: null,
        app_approval_status: "pending",
        shop_approval_status: "pending",
        bio: null,
        booking_slug: barberReference
      });

    if (insert.error) {
      throwSupabaseLaneError("Barber lane bootstrap row insert", insert.error);
    }
  } else if (!(existing.data as ClientRow).reference_code) {
    const update = await supabase
      .from("barbers")
      .update({ reference_code: barberReference, booking_slug: barberReference })
      .eq("id", (existing.data as ClientRow).id);

    if (update.error && !isSchemaError(update.error)) {
      throwSupabaseLaneError("Barber lane bootstrap reference update", update.error);
    }
  }

  const effectiveBarberReference = (existing.data as ClientRow | null)?.reference_code ?? barberReference;
  await ensureVerificationProfileQueued(profileId, "barber");
  console.info("[auth] barber lane bootstrap completed", {
    profileId,
    barberId: effectiveBarberReference,
    existed: Boolean(existing.data)
  });

  return {
    barberId: effectiveBarberReference,
    seedProfileData: {
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone,
      barberId: effectiveBarberReference
    }
  };
}

async function ensureBarberLane(
  profileId: string,
  identity: { email: string; name: string; phone: string; },
  subtype: BarberSubtype
) {
  const supabase = await getSupabase();
  const barberReference = `barber-${profileId.slice(0, 8)}`;
  const compensationModel = toBarberCompensation(subtype);
  const runtimeRole: Role = compensationModel === "commission" ? "commission_barber" : "booth_rent_barber";
  console.info("[auth] barber subtype lane bootstrap requested", {
    profileId,
    subtype,
    payload: {
      profile_id: profileId,
      reference_code: barberReference,
      compensation_model: compensationModel,
      barber_subtype: subtype,
      app_approval_status: "pending",
      shop_approval_status: subtype === "freelance" ? "not_required" : "pending"
    }
  });

  if (!supabase) {
    return {
      role: runtimeRole,
      barberId: barberReference,
      appApprovalStatus: "pending" as ApprovalStatus,
      shopApprovalStatus: (subtype === "freelance" ? "not_required" : "pending") as ApprovalStatus,
      seedProfileData: {
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        barberId: barberReference,
        barberSubtype: subtype,
        compensationModel
      }
    };
  }

  const existing = await supabase
    .from("barbers")
    .select("id, reference_code")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && !isSchemaError(existing.error)) {
    throwSupabaseLaneError("Barber lane existing-row lookup", existing.error);
  }

  if (!existing.data) {
    const insert = await supabase
      .from("barbers")
      .insert({
        profile_id: profileId,
        reference_code: barberReference,
        compensation_model: compensationModel,
        barber_subtype: subtype,
        app_approval_status: "pending",
        shop_approval_status: subtype === "freelance" ? "not_required" : "pending",
        bio: null,
        booking_slug: barberReference
      });
    if (insert.error) {
      throwSupabaseLaneError("Barber lane row insert", insert.error);
    }
  } else {
    const update = await supabase
      .from("barbers")
      .update({
        reference_code: (existing.data as ClientRow).reference_code ?? barberReference,
        compensation_model: compensationModel,
        barber_subtype: subtype,
        app_approval_status: "pending",
        shop_approval_status: subtype === "freelance" ? "not_required" : "pending"
      })
      .eq("id", (existing.data as ClientRow).id);
    if (update.error && !isSchemaError(update.error)) {
      throwSupabaseLaneError("Barber lane row update", update.error);
    }
  }

  const effectiveBarberReference = (existing.data as ClientRow | null)?.reference_code ?? barberReference;
  const barberProfileUpsert = await supabase
    .from("barber_profiles")
    .upsert({
      barber_reference: effectiveBarberReference,
      barber_email: identity.email,
      username: effectiveBarberReference,
      display_name: identity.name,
      bio: "",
      years_experience: 0,
      specialties: [],
      badges: [],
      service_area_label: "Getting started",
      next_available_at: new Date().toISOString(),
      visibility_state: "hidden"
    }, { onConflict: "barber_reference" });

  if (barberProfileUpsert.error && !isSchemaError(barberProfileUpsert.error)) {
    throwSupabaseLaneError("Barber profile bootstrap upsert", barberProfileUpsert.error);
  }

  const barberStatusUpsert = await supabase
    .from("barber_status")
    .upsert({
      barber_reference: effectiveBarberReference,
      shop_reference: null,
      status: "offline",
      accepting_bookings: false,
      availability_note: "Pending verification and approval."
    }, { onConflict: "barber_reference" });

  if (barberStatusUpsert.error && !isSchemaError(barberStatusUpsert.error)) {
    throwSupabaseLaneError("Barber status bootstrap upsert", barberStatusUpsert.error);
  }

  const userRoleUpsert = await supabase
    .from("user_roles")
    .upsert({
      user_email: identity.email,
      role: runtimeRole,
      client_reference: null,
      barber_reference: effectiveBarberReference,
      location_references: []
    }, { onConflict: "user_email" });

  if (userRoleUpsert.error && !isSchemaError(userRoleUpsert.error)) {
    throwSupabaseLaneError("Barber user role bootstrap upsert", userRoleUpsert.error);
  }

  await ensureVerificationProfileQueued(profileId, "barber");
  console.info("[auth] barber subtype lane bootstrap completed", {
    profileId,
    barberId: effectiveBarberReference,
    subtype,
    runtimeRole,
    existed: Boolean(existing.data)
  });

  return {
    role: runtimeRole,
    barberId: effectiveBarberReference,
    appApprovalStatus: "pending" as ApprovalStatus,
    shopApprovalStatus: (subtype === "freelance" ? "not_required" : "pending") as ApprovalStatus,
    seedProfileData: {
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone,
      barberId: effectiveBarberReference,
      barberSubtype: subtype,
      compensationModel
    }
  };
}

async function ensureOwnerLane(profileId: string, identity: { email: string; name: string; phone: string; }, shopName: string) {
  const { client: supabase, mode: supabaseMode } = await getSupabaseWithMode();
  const shopId = `shop-${slugify(shopName)}-${profileId.slice(0, 6)}`;
  console.info("[auth] owner lane bootstrap requested", {
    profileId,
    shopName,
    supabaseMode,
    payload: {
      id: shopId,
      name: shopName,
      owner_profile_id: profileId,
      app_approval_status: "pending",
      phonePresent: Boolean(identity.phone)
    }
  });

  if (!supabase) {
    return {
      ownedShopId: shopId,
      appApprovalStatus: "pending" as ApprovalStatus,
      locationIds: [shopId],
      seedProfileData: {
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        shopId,
        shopName
      }
    };
  }

  const existingShop = await supabase
    .from("shops")
    .select("id")
    .eq("owner_profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingShop.error && !isSchemaError(existingShop.error)) {
    throwSupabaseLaneError("Owner lane existing-shop lookup", existingShop.error);
  }

  const effectiveShopId = (existingShop.data as ShopRow | null)?.id ?? shopId;
  if (!existingShop.data) {
    console.info("[auth] owner lane shop insert step", {
      profileId,
      shopId: effectiveShopId,
      supabaseMode
    });
    const insertShop = await supabase
      .from("shops")
      .insert({
        id: effectiveShopId,
        name: shopName,
        brand_line: "",
        neighborhood: "Pending",
        city: "Pending",
        state: "Pending",
        phone: identity.phone || null,
        address: null,
        kind: "shop",
        owner_profile_id: profileId,
        app_approval_status: "pending"
      });
    if (insertShop.error) {
      console.error("[auth] owner lane shop insert failed", {
        profileId,
        shopId: effectiveShopId,
        supabaseMode,
        error: describeSupabaseError(insertShop.error)
      });
      throwSupabaseLaneError("Owner lane shop insert", insertShop.error);
    }
  } else {
    console.info("[auth] owner lane shop update step", {
      profileId,
      shopId: effectiveShopId,
      supabaseMode
    });
    const updateShop = await supabase
      .from("shops")
      .update({
        name: shopName,
        phone: identity.phone || null,
        owner_profile_id: profileId,
        app_approval_status: "pending"
      })
      .eq("id", effectiveShopId);
    if (updateShop.error && !isSchemaError(updateShop.error)) {
      console.error("[auth] owner lane shop update failed", {
        profileId,
        shopId: effectiveShopId,
        supabaseMode,
        error: describeSupabaseError(updateShop.error)
      });
      throwSupabaseLaneError("Owner lane shop update", updateShop.error);
    }
  }

  let locationId = "";
  const existingLocation = await supabase
    .from("locations")
    .select("id")
    .eq("reference_code", effectiveShopId)
    .maybeSingle();

  if (existingLocation.error && !isSchemaError(existingLocation.error)) {
    throwSupabaseLaneError("Owner lane existing-location lookup", existingLocation.error);
  }

  if (existingLocation.data?.id) {
    locationId = existingLocation.data.id as string;
    console.info("[auth] owner lane location update step", {
      profileId,
      shopId: effectiveShopId,
      locationId,
      supabaseMode
    });
    const updateLocation = await supabase
      .from("locations")
      .update({
        name: shopName,
        neighborhood: "Pending",
        city: "Pending",
        state: "Pending",
        phone: identity.phone || null
      })
      .eq("id", locationId);
    if (updateLocation.error && !isSchemaError(updateLocation.error)) {
      console.error("[auth] owner lane location update failed", {
        profileId,
        shopId: effectiveShopId,
        locationId,
        supabaseMode,
        error: describeSupabaseError(updateLocation.error)
      });
      throwSupabaseLaneError("Owner lane location update", updateLocation.error);
    }
  } else {
    const locationPayload = {
      reference_code: effectiveShopId,
      name: shopName,
      neighborhood: "Pending",
      city: "Pending",
      state: "Pending",
      phonePresent: Boolean(identity.phone)
    };
    console.info("[auth] owner lane location insert step", {
      profileId,
      shopId: effectiveShopId,
      supabaseMode,
      payload: locationPayload
    });
    const insertLocation = await supabase
      .from("locations")
      .insert({
        reference_code: locationPayload.reference_code,
        name: locationPayload.name,
        neighborhood: locationPayload.neighborhood,
        city: locationPayload.city,
        state: locationPayload.state,
        phone: identity.phone || null
      })
      .select("id")
      .single();
    if (insertLocation.error) {
      console.error("[auth] owner lane location insert failed", {
        profileId,
        shopId: effectiveShopId,
        supabaseMode,
        payload: locationPayload,
        error: describeSupabaseError(insertLocation.error)
      });
      throwSupabaseLaneError("Owner lane location insert", insertLocation.error);
    }
    locationId = insertLocation.data.id as string;
  }

  console.info("[auth] owner lane staff membership upsert step", {
    profileId,
    shopId: effectiveShopId,
    locationId,
    supabaseMode
  });
  const membership = await supabase
    .from("staff_locations")
    .upsert({
      profile_id: profileId,
      location_id: locationId
    }, { onConflict: "profile_id,location_id" });

  if (membership.error && !isSchemaError(membership.error)) {
    console.error("[auth] owner lane staff membership upsert failed", {
      profileId,
      shopId: effectiveShopId,
      locationId,
      supabaseMode,
      error: describeSupabaseError(membership.error)
    });
    throwSupabaseLaneError("Owner lane staff membership upsert", membership.error);
  }

  console.info("[auth] owner lane user role upsert step", {
    profileId,
    shopId: effectiveShopId,
    supabaseMode
  });
  const userRoleUpsert = await supabase
    .from("user_roles")
    .upsert({
      user_email: identity.email,
      role: "owner",
      client_reference: null,
      barber_reference: null,
      location_references: [effectiveShopId]
    }, { onConflict: "user_email" });

  if (userRoleUpsert.error && !isSchemaError(userRoleUpsert.error)) {
    console.error("[auth] owner lane user role upsert failed", {
      profileId,
      shopId: effectiveShopId,
      supabaseMode,
      error: describeSupabaseError(userRoleUpsert.error)
    });
    throwSupabaseLaneError("Owner user role bootstrap upsert", userRoleUpsert.error);
  }

  await ensureVerificationProfileQueued(profileId, "shop_owner");
  console.info("[auth] owner lane bootstrap completed", {
    profileId,
    shopId: effectiveShopId,
    locationId,
    supabaseMode,
    existed: Boolean(existingShop.data)
  });

  return {
    ownedShopId: effectiveShopId,
    appApprovalStatus: "pending" as ApprovalStatus,
    locationIds: [effectiveShopId],
    seedProfileData: {
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone,
      shopId: effectiveShopId,
      shopName
    }
  };
}

export async function initializeProductionRoleSelection(
  authUser: AuthUserLike,
  input: RoleSelectionInput
): Promise<RoleSelectionResult> {
  console.info("[auth] lane launch requested", {
    userId: authUser.id,
    selectedLane: input.role,
    hasBarberSubtype: Boolean(input.barberSubtype),
    hasShopName: Boolean(input.shopName?.trim())
  });

  const contactState = await readContactState(authUser);
  console.info("[auth] lane launch contact gate", {
    userId: authUser.id,
    selectedLane: input.role,
    contactComplete: contactState.canContinue,
    missingFields: contactState.missingFields,
    onboardingState: contactState.onboardingState,
    requiresRoleSelection: contactState.requiresRoleSelection
  });

  if (!contactState.canContinue) {
    throw new Error("contact_verification_required");
  }

  const identity = {
    email: contactState.email || authUser.email || `${authUser.id}@bvrb3r.local`,
    name: contactState.fullName.trim() || getDisplayName(authUser),
    phone: normalizePhoneNumber(contactState.phone)
  };
  const profileId = await resolveProfileId(authUser);
  let profileBeforeLaunch = await readProfile(profileId);
  let rowsBeforeLaunch = await readLaneRecordSnapshot(profileId);
  const userRolesBeforeLaunch = await readUserRolesByEmail(identity.email);
  console.info("[auth] lane launch canonical state before write", {
    userId: authUser.id,
    profileId,
    selectedLane: input.role,
    profile: profileBeforeLaunch,
    laneRows: {
      clientExists: Boolean(rowsBeforeLaunch.client),
      barberExists: Boolean(rowsBeforeLaunch.barber),
      ownerShopExists: Boolean(rowsBeforeLaunch.shop),
      barberSubtype: rowsBeforeLaunch.barber?.barber_subtype ?? null
    },
    userRoles: userRolesBeforeLaunch
  });

  const primaryRoleBeforeLaunch = profileBeforeLaunch?.primary_onboarding_role ?? null;
  if (!primaryRoleBeforeLaunch) {
    await resetStaleOnboardingState({
      profileId,
      email: identity.email,
      rows: rowsBeforeLaunch,
      selectedLane: input.role,
      reason: "primary_onboarding_role_null"
    });
    rowsBeforeLaunch = await readLaneRecordSnapshot(profileId);
    profileBeforeLaunch = await readProfile(profileId);
  } else if (primaryRoleBeforeLaunch !== input.role) {
    if (isOfficialLaneLocked(profileBeforeLaunch, rowsBeforeLaunch)) {
      console.warn("[auth] lane launch blocked by active official lane", {
        userId: authUser.id,
        profileId,
        selectedLane: input.role,
        primaryRoleBeforeLaunch,
        profileBeforeLaunch,
        rowsBeforeLaunch
      });
      throw new Error("ACTIVE_LANE_LOCKED");
    }

    await resetStaleOnboardingState({
      profileId,
      email: identity.email,
      rows: rowsBeforeLaunch,
      selectedLane: input.role,
      reason: "incomplete_official_lane_switch"
    });
    rowsBeforeLaunch = await readLaneRecordSnapshot(profileId);
    profileBeforeLaunch = await readProfile(profileId);
  }

  console.info("[auth] lane launch canonical state after stale reset", {
    userId: authUser.id,
    profileId,
    selectedLane: input.role,
    profile: profileBeforeLaunch,
    laneRows: {
      clientExists: Boolean(rowsBeforeLaunch.client),
      barberExists: Boolean(rowsBeforeLaunch.barber),
      ownerShopExists: Boolean(rowsBeforeLaunch.shop)
    },
    userRoles: await readUserRolesByEmail(identity.email)
  });

  if (input.role === "client") {
    await upsertProfileForLane({
      profileId,
      role: "client",
      primaryOnboardingRole: "client",
      onboardingState: "active",
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone
    });

    const client = await ensureClientLane(profileId, identity);
    const user = await buildRuntimeUserFromProductionAuth(authUser);
    const profileAfterLaunch = await readProfile(profileId);
    console.info("[auth] lane launch completed", {
      userId: authUser.id,
      selectedLane: input.role,
      profileAfterLaunch,
      seedProfileData: client.seedProfileData
    });
    return {
      user,
      seedProfileData: client.seedProfileData
    };
  }

  if (input.role === "barber") {
    if (!input.barberSubtype) {
      await upsertProfileForLane({
        profileId,
        role: "booth_rent_barber",
        primaryOnboardingRole: "barber",
        onboardingState: "active",
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone
      });

      const lane = await ensureBarberLaneBootstrap(profileId, identity);
      const user = await buildRuntimeUserFromProductionAuth(authUser);
      const profileAfterLaunch = await readProfile(profileId);
      console.info("[auth] lane launch completed", {
        userId: authUser.id,
        selectedLane: input.role,
        profileAfterLaunch,
        seedProfileData: lane.seedProfileData,
        nextExpectedStep: "/dashboard/barber"
      });
      return {
        user,
        seedProfileData: lane.seedProfileData
      };
    }

    const subtype = input.barberSubtype;
    const lane = await ensureBarberLane(profileId, identity, subtype);
    await upsertProfileForLane({
      profileId,
      role: lane.role,
      primaryOnboardingRole: "barber",
      onboardingState: "active",
      fullName: identity.name,
      email: identity.email,
      phone: identity.phone
    });

    const user = await buildRuntimeUserFromProductionAuth(authUser);
    const profileAfterLaunch = await readProfile(profileId);
    console.info("[auth] lane launch completed", {
      userId: authUser.id,
      selectedLane: input.role,
      profileAfterLaunch,
      seedProfileData: lane.seedProfileData
    });
    return {
      user: {
        ...user,
        role: lane.role,
        barberSubtype: subtype,
        appApprovalStatus: lane.appApprovalStatus,
        shopApprovalStatus: lane.shopApprovalStatus
      },
      seedProfileData: lane.seedProfileData
    };
  }

  const shopName = input.shopName?.trim();
  if (!shopName) {
    throw new Error("shop_name_required");
  }

  await upsertProfileForLane({
    profileId,
    role: "owner",
    primaryOnboardingRole: "shop_owner",
    onboardingState: "active",
    fullName: identity.name,
    email: identity.email,
    phone: identity.phone
  });
  const lane = await ensureOwnerLane(profileId, identity, shopName);

  const user = await buildRuntimeUserFromProductionAuth(authUser);
  const profileAfterLaunch = await readProfile(profileId);
  console.info("[auth] lane launch completed", {
    userId: authUser.id,
    selectedLane: input.role,
    profileAfterLaunch,
    seedProfileData: lane.seedProfileData
  });
  return {
    user: {
      ...user,
      role: "owner",
      ownedShopId: lane.ownedShopId,
      appApprovalStatus: lane.appApprovalStatus
    },
    seedProfileData: lane.seedProfileData
  };
}
