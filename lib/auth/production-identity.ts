import { createHash, randomInt, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasTwilioDeliveryConfig, isSupabaseEnabled, runtimeConfig } from "@/lib/config/runtime";
import type {
  ApprovalStatus,
  BarberSubtype,
  CompensationModel,
  IdentityLane,
  IdentityOnboardingState,
  Role,
  UserAccount
} from "@/types/domain";

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
  first_name?: string | null;
  last_name?: string | null;
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
  app_approval_status?: ApprovalStatus | null;
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

type RoleSelectionInput = {
  role: IdentityLane;
  barberSubtype?: BarberSubtype;
  shopName?: string;
};

type RoleSelectionResult = {
  user: UserAccount;
  seedProfileData: Record<string, unknown>;
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

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
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
  const explicitProfileFirstName = `${profile?.first_name ?? ""}`.trim();
  const explicitProfileLastName = `${profile?.last_name ?? ""}`.trim();
  if (explicitProfileFirstName && explicitProfileLastName) {
    return {
      firstName: explicitProfileFirstName,
      lastName: explicitProfileLastName,
      fullName: `${explicitProfileFirstName} ${explicitProfileLastName}`.trim()
    };
  }

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

  if (!name.firstName) {
    missingFields.push("first_name");
  }

  if (!name.lastName) {
    missingFields.push("last_name");
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
    firstName: requiredContact.firstName,
    lastName: requiredContact.lastName,
    email: requiredContact.email,
    phone: requiredContact.phone,
    emailVerified,
    phoneVerified,
    onboardingState
  };
}

async function syncProfileFromAuth(authUser: AuthUserLike) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const profile = await readProfile(authUser.id);
  const payload = getProfileSyncPayload(authUser, profile);
  const nextPhoneVerifiedAt = profile?.phone_verified_at ?? (payload.phoneVerified ? new Date().toISOString() : null);
  const nextFirstName = `${profile?.first_name ?? ""}`.trim() || payload.firstName;
  const nextLastName = `${profile?.last_name ?? ""}`.trim() || payload.lastName;
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
        full_name: nextFullName,
        first_name: nextFirstName || null,
        last_name: nextLastName || null,
        email: nextEmail,
        phone: nextPhone,
        phone_verified_at: nextPhoneVerifiedAt,
        onboarding_state: profile.onboarding_state ?? payload.onboardingState
      })
      .eq("id", authUser.id);

    if (update.error) {
      if (!isSchemaError(update.error)) {
        throw update.error;
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
        throw fallback.error;
      }
    }

    return;
  }

  const insert = await supabase
    .from("profiles")
    .insert({
      id: authUser.id,
      role: "client",
      full_name: payload.fullName,
      first_name: payload.firstName || null,
      last_name: payload.lastName || null,
      email: payload.email,
      phone: payload.phone || null,
      phone_verified_at: nextPhoneVerifiedAt,
      onboarding_state: payload.onboardingState
    });

  if (insert.error) {
    if (!isSchemaError(insert.error)) {
      throw insert.error;
    }

    const fallback = await supabase
      .from("profiles")
      .insert({
        id: authUser.id,
        role: "client",
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone || null
      });

    if (fallback.error && !isSchemaError(fallback.error)) {
      throw fallback.error;
    }
  }
}

async function readProfile(authUserId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const preferred = await supabase
    .from("profiles")
    .select("id, role, full_name, first_name, last_name, email, phone, primary_onboarding_role, onboarding_state, phone_verified_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (!preferred.error && preferred.data) {
    return preferred.data as ProfileRow;
  }

  if (preferred.error && !isSchemaError(preferred.error)) {
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
  const supabase = getSupabase();
  if (!supabase || !input.profileId) {
    return;
  }

  const normalizedCurrentPhone = normalizePhoneNumber(input.profile?.phone ?? null);
  const normalizedNextPhone = normalizePhoneNumber(input.phone);
  const nextPhoneVerifiedAt = input.phoneVerified
    ? input.profile?.phone_verified_at ?? new Date().toISOString()
    : input.profile?.phone_verified_at ?? null;
  const nextNameParts = splitFullName(input.fullName);
  const nextFullName = input.fullName.trim();
  const nextEmail = input.email.trim();
  const currentRole = input.profile?.role === "shop_owner" ? "owner" : input.profile?.role ?? null;
  const currentPrimaryRole = input.profile?.primary_onboarding_role ?? null;
  const currentOnboardingState = input.profile?.onboarding_state ?? null;
  const needsSync = currentRole !== input.runtimeRole
    || currentPrimaryRole !== input.primaryRole
    || currentOnboardingState !== input.onboardingState
    || (input.profile?.full_name ?? "") !== nextFullName
    || `${input.profile?.first_name ?? ""}`.trim() !== nextNameParts.firstName
    || `${input.profile?.last_name ?? ""}`.trim() !== nextNameParts.lastName
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
      first_name: nextNameParts.firstName || null,
      last_name: nextNameParts.lastName || null,
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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const preferred = await supabase
    .from("shops")
    .select("id, app_approval_status")
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

async function readLocationReferencesForProfile(profileId: string, ownedShopId?: string | null) {
  const supabase = getSupabase();
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
    const primaryRole = profile?.primary_onboarding_role
      ?? (barber ? "barber" : shop ? "shop_owner" : client ? "client" : null);
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
    );
    const onboardingState = inferOnboardingState({
      emailVerified,
      phoneVerified,
      hasRequiredContactFields: requiredContact.missingFields.length === 0,
      primaryRole,
      hasLaneRecord,
      persistedState: profile?.onboarding_state
    });
    const displayName = getDisplayName(authUser, profile);
    const accountStatus = hasLaneRecord
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
  const runtimeUser = await buildRuntimeUserFromProductionAuth(authUser);
  const emailVerified = Boolean(runtimeUser.emailVerified);
  const phoneVerified = Boolean(runtimeUser.phoneVerified);
  const missingFields: string[] = [];
  if (!runtimeUser.firstName) {
    missingFields.push("first_name");
  }
  if (!runtimeUser.lastName) {
    missingFields.push("last_name");
  }
  if (!runtimeUser.email?.trim()) {
    missingFields.push("email");
  }
  if (!runtimeUser.phone?.trim()) {
    missingFields.push("phone");
  }
  const onboardingState = inferOnboardingState({
    emailVerified,
    phoneVerified,
    hasRequiredContactFields: missingFields.length === 0,
    primaryRole: runtimeUser.primaryOnboardingRole,
    hasLaneRecord: Boolean(
      runtimeUser.clientId
      || runtimeUser.barberId
      || runtimeUser.ownedShopId
    ),
    persistedState: runtimeUser.onboardingState
  });

  return {
    firstName: runtimeUser.firstName ?? "",
    lastName: runtimeUser.lastName ?? "",
    email: runtimeUser.email,
    phone: runtimeUser.phone ?? "",
    emailVerified,
    phoneVerified,
    canContinue: missingFields.length === 0 && emailVerified && phoneVerified,
    requiresRoleSelection: emailVerified && phoneVerified && !runtimeUser.primaryOnboardingRole,
    onboardingState,
    missingFields
  };
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
  const supabase = getSupabase();
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

  if (supabase) {
    const existingProfile = await readProfile(profileId);
    const nextRole = existingProfile?.role === "shop_owner"
      ? "owner"
      : existingProfile?.role ?? "client";
    const update = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        role: nextRole,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        primary_onboarding_role: existingProfile?.primary_onboarding_role ?? null,
        onboarding_state: existingProfile?.onboarding_state ?? undefined,
        phone_verified_at: existingProfile?.phone_verified_at ?? null
      }, { onConflict: "id" });

    if (update.error) {
      if (!isSchemaError(update.error)) {
        throw update.error;
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

      if (fallback.error && !isSchemaError(fallback.error)) {
        throw fallback.error;
      }
    }
  }

  return readContactState({
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
  });
}

function buildChallengeHash(profileId: string, phone: string, code: string) {
  return createHash("sha256").update(`${profileId}:${phone}:${code}`).digest("hex");
}

async function deliverPhoneCode(phone: string, code: string) {
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
    throw new Error(body || "Unable to send the SMS verification code.");
  }

  return { degraded: false };
}

async function writePhoneChallenge(profileId: string, phone: string, codeHash: string, expiresAt: string) {
  const supabase = getSupabase();
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
    throw result.error;
  }

  return true;
}

async function readLatestPhoneChallenge(profileId: string) {
  const supabase = getSupabase();
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
    throw result.error;
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
  const supabase = getSupabase();
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
    throw challengeUpdate.error;
  }

  if (profileUpdate.error && !isSchemaError(profileUpdate.error)) {
    throw profileUpdate.error;
  }
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
  const normalizedPhone = normalizePhoneNumber(input.phone ?? authUser.phone ?? null);
  if (!normalizedPhone) {
    throw new Error("A valid phone number is required.");
  }

  const code = `${randomInt(0, 1_000_000)}`.padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const codeHash = buildChallengeHash(profileId, normalizedPhone, code);
  const persisted = await writePhoneChallenge(profileId, normalizedPhone, codeHash, expiresAt);
  const delivery = await deliverPhoneCode(normalizedPhone, code);
  const supabase = getSupabase();

  if (supabase) {
    const existingProfile = await readProfile(profileId);
    const update = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        role: existingProfile?.role === "shop_owner" ? "owner" : existingProfile?.role ?? "client",
        full_name: existingProfile?.full_name?.trim() || getDisplayName(authUser, existingProfile),
        email: existingProfile?.email?.trim() || authUser.email || `${profileId}@bvrb3r.local`,
        phone: normalizedPhone
      }, { onConflict: "id" });

    if (update.error && !isSchemaError(update.error)) {
      throw update.error;
    }
  }

  const nextState = await readContactState({
    ...authUser,
    phone: normalizedPhone,
    user_metadata: {
      ...(authUser.user_metadata ?? {}),
      phone: normalizedPhone
    }
  });

  return {
    ...nextState,
    degraded: delivery.degraded || !persisted
  };
}

export async function verifyPhoneVerificationChallenge(
  authUser: AuthUserLike,
  code: string
): Promise<VerifyPhoneChallengeResult> {
  const profileId = await resolveProfileId(authUser);
  const challenge = await readLatestPhoneChallenge(profileId);
  if (!challenge) {
    throw new Error("No active SMS verification code was found.");
  }

  const expiresAt = "expires_at" in challenge ? challenge.expires_at : challenge.expiresAt;
  if (new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("That verification code has expired. Request a new SMS code.");
  }

  const phone = getPhoneChallengePhone(challenge);
  const expectedHash = buildChallengeHash(profileId, phone, code.trim());
  const currentHash = getPhoneChallengeHash(challenge);
  if (expectedHash !== currentHash) {
    throw new Error("That verification code is not valid.");
  }

  await markPhoneChallengeVerified(challenge.id, profileId, phone);
  return readContactState({
    ...authUser,
    phone
  });
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
  primaryOnboardingRole: IdentityLane;
  onboardingState: IdentityOnboardingState;
  fullName: string;
  email: string;
  phone: string;
}) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const upsert = await supabase
    .from("profiles")
    .upsert({
      id: input.profileId,
      role: input.role,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone || null,
      primary_onboarding_role: input.primaryOnboardingRole,
      onboarding_state: input.onboardingState,
      last_onboarded_at: now
    }, { onConflict: "id" });

  if (upsert.error) {
    if (!isSchemaError(upsert.error)) {
      throw upsert.error;
    }

    const fallback = await supabase
      .from("profiles")
      .upsert({
        id: input.profileId,
        role: input.role,
        full_name: input.fullName,
        email: input.email,
        phone: input.phone || null
      }, { onConflict: "id" });

    if (fallback.error) {
      throw fallback.error;
    }
  }
}

async function ensureClientLane(profileId: string, identity: { email: string; name: string; phone: string; }) {
  const supabase = getSupabase();
  const clientReference = `client-${profileId.slice(0, 8)}`;
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
    throw existing.error;
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
      throw insert.error;
    }
  } else if (!(existing.data as ClientRow).reference_code) {
    const update = await supabase
      .from("clients")
      .update({ reference_code: clientReference })
      .eq("id", (existing.data as ClientRow).id);
    if (update.error) {
      throw update.error;
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
    throw clientProfileUpsert.error;
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
    throw userRoleUpsert.error;
  }

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

async function ensureBarberLane(
  profileId: string,
  identity: { email: string; name: string; phone: string; },
  subtype: BarberSubtype
) {
  const supabase = getSupabase();
  const barberReference = `barber-${profileId.slice(0, 8)}`;
  const compensationModel = toBarberCompensation(subtype);
  const runtimeRole: Role = compensationModel === "commission" ? "commission_barber" : "booth_rent_barber";
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
    throw existing.error;
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
      throw insert.error;
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
      throw update.error;
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
    throw barberProfileUpsert.error;
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
    throw barberStatusUpsert.error;
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
    throw userRoleUpsert.error;
  }

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
  const supabase = getSupabase();
  const shopId = `shop-${slugify(shopName)}-${profileId.slice(0, 6)}`;
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
    throw existingShop.error;
  }

  const effectiveShopId = (existingShop.data as ShopRow | null)?.id ?? shopId;
  if (!existingShop.data) {
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
      throw insertShop.error;
    }
  } else {
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
      throw updateShop.error;
    }
  }

  let locationId = "";
  const existingLocation = await supabase
    .from("locations")
    .select("id")
    .eq("reference_code", effectiveShopId)
    .maybeSingle();

  if (existingLocation.error && !isSchemaError(existingLocation.error)) {
    throw existingLocation.error;
  }

  if (existingLocation.data?.id) {
    locationId = existingLocation.data.id as string;
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
      throw updateLocation.error;
    }
  } else {
    const insertLocation = await supabase
      .from("locations")
      .insert({
        reference_code: effectiveShopId,
        name: shopName,
        neighborhood: "Pending",
        city: "Pending",
        state: "Pending",
        phone: identity.phone || null
      })
      .select("id")
      .single();
    if (insertLocation.error) {
      throw insertLocation.error;
    }
    locationId = insertLocation.data.id as string;
  }

  const membership = await supabase
    .from("staff_locations")
    .upsert({
      profile_id: profileId,
      location_id: locationId
    }, { onConflict: "profile_id,location_id" });

  if (membership.error && !isSchemaError(membership.error)) {
    throw membership.error;
  }

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
    throw userRoleUpsert.error;
  }

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
  const contactState = await readContactState(authUser);
  if (!contactState.canContinue) {
    throw new Error("contact_verification_required");
  }

  const identity = {
    email: contactState.email || authUser.email || `${authUser.id}@bvrb3r.local`,
    name: `${contactState.firstName} ${contactState.lastName}`.trim() || getDisplayName(authUser),
    phone: normalizePhoneNumber(contactState.phone)
  };
  const profileId = await resolveProfileId(authUser);

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
    return {
      user,
      seedProfileData: client.seedProfileData
    };
  }

  if (input.role === "barber") {
    if (!input.barberSubtype) {
      const existingProfile = await readProfile(profileId);
      await upsertProfileForLane({
        profileId,
        role: (existingProfile?.role && existingProfile.role !== "shop_owner" ? existingProfile.role : "client") as Role,
        primaryOnboardingRole: "barber",
        onboardingState: "role_selected",
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone
      });

      const user = await buildRuntimeUserFromProductionAuth(authUser);
      return {
        user,
        seedProfileData: {
          fullName: identity.name,
          email: identity.email,
          phone: identity.phone
        }
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

  const lane = await ensureOwnerLane(profileId, identity, shopName);
  await upsertProfileForLane({
    profileId,
    role: "owner",
    primaryOnboardingRole: "shop_owner",
    onboardingState: "active",
    fullName: identity.name,
    email: identity.email,
    phone: identity.phone
  });

  const user = await buildRuntimeUserFromProductionAuth(authUser);
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
