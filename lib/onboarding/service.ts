import type { Route } from "next";
import { initializeProductionRoleSelection } from "@/lib/auth/production-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getTrustState, setTrustState } from "@/lib/trust/state";
import { getVerificationMePayload } from "@/lib/trust/verification-service";
import { getOnboardingStateStore, setOnboardingStateStore } from "@/lib/onboarding/state";
import type { BarberSubtype, UserAccount } from "@/types/domain";
import type {
  ActivationState,
  ActivationStatusLaneView,
  ActivationStatusPayload,
  OnboardingLaneView,
  OnboardingMePayload,
  OnboardingRole,
  OnboardingStateRecord,
  OnboardingStepDefinition,
  OnboardingStepKey,
  OnboardingStepStatus
} from "@/types/onboarding";
import type { VerificationProfileRecord } from "@/types/trust";

const ONBOARDING_WARNING = "Onboarding data is partially unavailable. Core access is still active.";
const ONBOARDING_STEPS: Record<OnboardingRole, OnboardingStepDefinition[]> = {
  client: [
    { key: "client_profile", role: "client", title: "Build your client profile", subtitle: "Set the basics so booking and rewards feel personal from your first visit.", route: "/onboarding/client/profile" },
    { key: "client_preferences", role: "client", title: "Dial in preferences", subtitle: "Save service preferences and booking habits so BVRB3R can pull you back in fast.", route: "/onboarding/client/preferences" }
  ],
  barber: [
    { key: "barber_profile", role: "barber", title: "Create your professional profile", subtitle: "Set up the public and operational identity for your chair.", route: "/onboarding/barber/profile" },
    { key: "barber_services", role: "barber", title: "Define your services", subtitle: "Capture your core cuts, pricing, and timing so your lane is ready to activate.", route: "/onboarding/barber/services" },
    { key: "barber_availability", role: "barber", title: "Set your availability", subtitle: "Tell the platform when you cut, take walk-ins, and how you want the day to flow.", route: "/onboarding/barber/availability" },
    { key: "barber_verification", role: "barber", title: "Complete verification", subtitle: "Use identity, payouts, and compliance to unlock public trust and bookings.", route: "/onboarding/barber/verification" }
  ],
  shop_owner: [
    { key: "owner_shop", role: "shop_owner", title: "Set up the shop", subtitle: "Establish the business identity the client will see first.", route: "/onboarding/owner/shop" },
    { key: "owner_structure", role: "shop_owner", title: "Set the operating structure", subtitle: "Define how the shop runs so the owner lane can activate correctly.", route: "/onboarding/owner/structure" },
    { key: "owner_team", role: "shop_owner", title: "Add your first team context", subtitle: "Invite the early roster or skip and come back after activation.", route: "/onboarding/owner/team" },
    { key: "owner_verification", role: "shop_owner", title: "Verify the business lane", subtitle: "Connect payout and compliance truth before the shop can go live.", route: "/onboarding/owner/verification" }
  ]
};

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
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

function getStepDefinitions(role: OnboardingRole) {
  return ONBOARDING_STEPS[role];
}

function getFirstStep(role: OnboardingRole) {
  return getStepDefinitions(role)[0].key;
}

function getLastStep(role: OnboardingRole) {
  const steps = getStepDefinitions(role);
  return steps[steps.length - 1]?.key ?? steps[0].key;
}

function getStepRoute(role: OnboardingRole, step: OnboardingStepKey): Route {
  return getStepDefinitions(role).find((entry) => entry.key === step)?.route ?? getStepDefinitions(role)[0].route;
}

function getNextStep(role: OnboardingRole, completedSteps: OnboardingStepKey[]) {
  return getStepDefinitions(role).find((entry) => !completedSteps.includes(entry.key))?.key ?? null;
}

function normalizeCompletedSteps(role: OnboardingRole, steps: unknown): OnboardingStepKey[] {
  const allowed = new Set(getStepDefinitions(role).map((entry) => entry.key));
  return Array.isArray(steps)
    ? steps.filter((step): step is OnboardingStepKey => typeof step === "string" && allowed.has(step as OnboardingStepKey))
    : [];
}

function mapRow(row: Record<string, unknown>): OnboardingStateRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    role: String(row.role) as OnboardingRole,
    status: String(row.status) as OnboardingStepStatus,
    currentStep: String(row.current_step) as OnboardingStepKey,
    completedSteps: normalizeCompletedSteps(String(row.role) as OnboardingRole, row.completed_steps),
    profileData: (row.profile_data && typeof row.profile_data === "object" ? row.profile_data : {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined
  };
}

function toRow(state: OnboardingStateRecord) {
  return {
    id: state.id,
    user_id: state.userId,
    role: state.role,
    status: state.status,
    current_step: state.currentStep,
    completed_steps: state.completedSteps,
    profile_data: state.profileData,
    completed_at: state.completedAt ?? null,
    created_at: state.createdAt,
    updated_at: state.updatedAt
  };
}

async function readPersistedStates(userId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return { rows: getOnboardingStateStore().filter((entry) => entry.userId === userId), degraded: false };
  }

  const result = await supabase
    .from("user_onboarding_states")
    .select("id, user_id, role, status, current_step, completed_steps, profile_data, completed_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return { rows: getOnboardingStateStore().filter((entry) => entry.userId === userId), degraded: true };
    }

    throw result.error;
  }

  return {
    rows: (result.data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    degraded: false
  };
}

async function persistState(record: OnboardingStateRecord) {
  const supabase = getSupabase();
  if (!supabase) {
    const next = [
      record,
      ...getOnboardingStateStore().filter((entry) => !(entry.userId === record.userId && entry.role === record.role))
    ];
    setOnboardingStateStore(clone(next));
    return { degraded: false };
  }

  const result = await supabase
    .from("user_onboarding_states")
    .upsert(toRow(record), { onConflict: "user_id,role" });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      const next = [
        record,
        ...getOnboardingStateStore().filter((entry) => !(entry.userId === record.userId && entry.role === record.role))
      ];
      setOnboardingStateStore(clone(next));
      return { degraded: true };
    }

    throw result.error;
  }

  const next = [
    record,
    ...getOnboardingStateStore().filter((entry) => !(entry.userId === record.userId && entry.role === record.role))
  ];
  setOnboardingStateStore(clone(next));
  return { degraded: false };
}

function createEmptyState(
  user: UserAccount,
  role: OnboardingRole,
  seedProfileData: Record<string, unknown> = {}
): OnboardingStateRecord {
  const now = new Date().toISOString();
  const seededProfileData: Record<string, unknown> =
    role === "client"
      ? { clientId: user.clientId ?? `client-${user.id.slice(0, 8)}` }
      : role === "barber"
        ? {
            barberId: user.barberId ?? `barber-${user.id.slice(0, 8)}`,
            barberSubtype: user.barberSubtype ?? "freelance",
            compensationModel: user.role === "commission_barber" ? "commission" : "booth_rent"
          }
        : {};

  return {
    id: `onboard-${role}-${randomId("state")}`,
    userId: user.id,
    role,
    status: "in_progress",
    currentStep: getFirstStep(role),
    completedSteps: [],
    profileData: {
      ...seededProfileData,
      ...seedProfileData
    },
    createdAt: now,
    updatedAt: now
  };
}

function createCompletedLaneState(
  user: UserAccount,
  role: OnboardingRole,
  seedProfileData: Record<string, unknown> = {}
): OnboardingStateRecord {
  const base = createEmptyState(user, role, seedProfileData);
  const now = new Date().toISOString();
  return {
    ...base,
    status: "completed",
    currentStep: getLastStep(role),
    completedSteps: getStepDefinitions(role).map((entry) => entry.key),
    updatedAt: now,
    completedAt: now
  };
}

function isRoleActive(user: UserAccount, role: OnboardingRole, verificationProfile?: { publicVerified: boolean; canAcceptBookings: boolean; canReceivePayouts: boolean; canCreateShopListing: boolean }) {
  if (role === "client") {
    return user.accountStatus === "active" && user.role === "client";
  }

  if (role === "barber") {
    return Boolean(
      (user.role === "commission_barber" || user.role === "booth_rent_barber")
      && verificationProfile?.canAcceptBookings
      && verificationProfile?.canReceivePayouts
      && verificationProfile?.publicVerified
    );
  }

  return Boolean(user.role === "owner" && verificationProfile?.canCreateShopListing && verificationProfile?.canReceivePayouts);
}

function resolveLaneActivationState(
  user: UserAccount,
  role: OnboardingRole,
  state: OnboardingStateRecord,
  verificationProfile?: { currentRequirements: string[]; publicVerified: boolean; canAcceptBookings: boolean; canReceivePayouts: boolean; canCreateShopListing: boolean }
): ActivationState {
  if (!state) {
    return "needs_role";
  }

  if (state.status !== "completed") {
    return "onboarding";
  }

  if (role === "client") {
    return "active";
  }

  return isRoleActive(user, role, verificationProfile) ? "active" : "verification";
}

function chooseSelectedRole(lanes: OnboardingStateRecord[]) {
  return lanes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.role ?? null;
}

function getDashboardPath(role: OnboardingRole): Route {
  if (role === "client") {
    return "/dashboard/client";
  }

  if (role === "barber") {
    return "/dashboard/barber";
  }

  return "/dashboard/owner";
}

async function ensureCanonicalVerificationProfile(user: UserAccount, role: Exclude<OnboardingRole, "client">) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const profile: VerificationProfileRecord = {
    id: `vprof-${role}-${user.id.slice(0, 8)}`,
    userId: user.id,
    role,
    overallStatus: "not_started",
    identityStatus: "not_started",
    licenseStatus: "not_started",
    businessStatus: "not_started",
    payoutStatus: "not_started",
    complianceStatus: "not_started",
    publicVerified: false,
    canAcceptBookings: false,
    canReceivePayouts: false,
    canCreateShopListing: false,
    currentRequirements: [],
    createdAt: now,
    updatedAt: now
  };

  const trustState = getTrustState();
  if (!(trustState.verificationProfiles ?? []).some((entry) => entry.userId === user.id && entry.role === role)) {
    trustState.verificationProfiles = [profile, ...(trustState.verificationProfiles ?? [])];
    setTrustState(clone(trustState));
  }

  if (!supabase) {
    return;
  }

  const result = await supabase
    .from("verification_profiles")
    .upsert({
      user_id: profile.userId,
      role: profile.role,
      overall_status: profile.overallStatus,
      identity_status: profile.identityStatus,
      license_status: profile.licenseStatus,
      business_status: profile.businessStatus,
      payout_status: profile.payoutStatus,
      compliance_status: profile.complianceStatus,
      public_verified: profile.publicVerified,
      can_accept_bookings: profile.canAcceptBookings,
      can_receive_payouts: profile.canReceivePayouts,
      can_create_shop_listing: profile.canCreateShopListing,
      current_requirements: profile.currentRequirements
    }, { onConflict: "user_id,role" });

  if (result.error && !isMissingTableError(result.error)) {
    throw result.error;
  }
}

function isRuntimeRoleAllowedForOnboarding(user: UserAccount, role: OnboardingRole) {
  if (user.accountStatus !== "active") {
    return true;
  }

  if (user.role === "platform_admin" || user.role === "manager" || user.role === "front_desk") {
    return false;
  }

  if (role === "client") {
    return user.role === "client";
  }

  if (role === "barber") {
    return user.role === "commission_barber" || user.role === "booth_rent_barber";
  }

  return user.role === "owner";
}

function assertOnboardingRoleAccess(
  user: UserAccount,
  role: OnboardingRole,
  rows: OnboardingStateRecord[]
) {
  if (!isRuntimeRoleAllowedForOnboarding(user, role)) {
    throw new Error("onboarding_role_forbidden");
  }

  const selectedRole = chooseSelectedRole(rows);
  if (user.accountStatus === "profile_only" && selectedRole && selectedRole !== role) {
    throw new Error("onboarding_role_mismatch");
  }
}

export async function initializeUserRole(
  user: UserAccount,
  role: OnboardingRole,
  seedProfileData: Record<string, unknown> = {}
) {
  const { rows, degraded } = await readPersistedStates(user.id);
  assertOnboardingRoleAccess(user, role, rows);
  const existing = rows.find((entry) => entry.role === role);
  const state = existing ?? createEmptyState(user, role, seedProfileData);
  if (role !== "client") {
    await ensureCanonicalVerificationProfile(user, role);
  }

  const persistResult = await persistState({
    ...state,
    profileData: {
      ...state.profileData,
      ...seedProfileData
    },
    updatedAt: new Date().toISOString()
  });

  return {
    state: existing ?? state,
    degraded: degraded || persistResult.degraded
  };
}

export async function initializeSelectedUserLane(
  user: UserAccount,
  input: { role: OnboardingRole; barberSubtype?: BarberSubtype; shopName?: string }
) {
  const { rows } = await readPersistedStates(user.id);
  assertOnboardingRoleAccess(user, input.role, rows);

  const selection = await initializeProductionRoleSelection({
    id: user.id,
    email: user.email,
    phone: user.phone,
    email_confirmed_at: user.emailVerified ? new Date().toISOString() : null,
    phone_confirmed_at: user.phoneVerified ? new Date().toISOString() : null,
    user_metadata: {
      full_name: user.name,
      phone: user.phone ?? ""
    }
  }, {
    role: input.role,
    barberSubtype: input.barberSubtype,
      shopName: input.shopName
  });

  const completedState = createCompletedLaneState(selection.user, input.role, selection.seedProfileData);
  if (input.role !== "client") {
    await ensureCanonicalVerificationProfile(selection.user, input.role);
  }
  const persistResult = await persistState(completedState);

  return {
    user: selection.user,
    state: completedState,
    degraded: persistResult.degraded
  };
}

export async function getOnboardingStates(user: UserAccount) {
  return readPersistedStates(user.id);
}

export async function markOnboardingStepComplete(
  user: UserAccount,
  role: OnboardingRole,
  step: OnboardingStepKey,
  payload: Record<string, unknown>
) {
  const { rows, degraded } = await readPersistedStates(user.id);
  assertOnboardingRoleAccess(user, role, rows);
  const existing = rows.find((entry) => entry.role === role) ?? createEmptyState(user, role);
  const completedSteps = Array.from(new Set([...existing.completedSteps, step]));
  const nextStep = getNextStep(role, completedSteps);
  const now = new Date().toISOString();
  const nextRecord: OnboardingStateRecord = {
    ...existing,
    role,
    status: nextStep ? "in_progress" : "completed",
    currentStep: nextStep ?? step,
    completedSteps,
    profileData: {
      ...existing.profileData,
      ...payload
    },
    updatedAt: now,
    completedAt: nextStep ? existing.completedAt : now
  };

  if (role !== "client") {
    await ensureCanonicalVerificationProfile(user, role);
  }

  const persistResult = await persistState(nextRecord);
  return {
    state: nextRecord,
    degraded: degraded || persistResult.degraded
  };
}

export async function getOnboardingState(user: UserAccount): Promise<OnboardingMePayload> {
  const warnings: string[] = [];
  const { rows, degraded } = await readPersistedStates(user.id);
  if (degraded) {
    warnings.push(ONBOARDING_WARNING);
  }

  const verificationPayload = await getVerificationMePayload(user).catch(() => ({ profiles: [], warnings: [ONBOARDING_WARNING] }));
  for (const warning of verificationPayload.warnings) {
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  const lanes: OnboardingLaneView[] = rows
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => {
      const verificationProfile = verificationPayload.profiles.find((profile) => profile.role === entry.role);
      const activationState = resolveLaneActivationState(user, entry.role, entry, verificationProfile);
      return {
        role: entry.role,
        status: entry.status,
        currentStep: entry.currentStep,
        completedSteps: entry.completedSteps,
        resumePath: entry.status === "completed" && activationState === "verification"
          ? "/activation-status"
          : getStepRoute(entry.role, entry.currentStep),
        activationState,
        isActive: activationState === "active",
        profileData: entry.profileData,
        verificationProfile
      };
    });

  const selectedRole = chooseSelectedRole(rows);
  const nextPath = await resolvePostAuthDestination(user, { lanes, selectedRole, warnings });

  return {
    lanes,
    selectedRole,
    nextPath,
    warnings
  };
}

export async function resolvePostAuthDestination(
  user: UserAccount,
  preloaded?: { lanes: OnboardingLaneView[]; selectedRole: OnboardingRole | null; warnings: string[] }
): Promise<Route> {
  if (user.accountStatus === "deactivated" || user.accountStatus === "suspended") {
    return "/login?account=disabled";
  }

  if (user.emailVerified === false || user.phoneVerified === false || user.onboardingState === "awaiting_contact_verification") {
    return "/verify-contact";
  }

  if (user.accountStatus === "active" && user.role === "platform_admin") {
    return "/architect";
  }

  if (user.accountStatus === "active" && user.role === "client") {
    return "/dashboard/client";
  }

  if (user.accountStatus === "active" && (user.role === "commission_barber" || user.role === "booth_rent_barber")) {
    return "/dashboard/barber";
  }

  if (user.accountStatus === "active" && user.role === "owner") {
    return "/dashboard/owner";
  }

  const onboarding = preloaded ?? await getOnboardingState(user);
  if (!onboarding.selectedRole || onboarding.lanes.length === 0) {
    return "/role-select";
  }

  const incompleteLane = onboarding.lanes.find((lane) => lane.activationState === "onboarding");
  if (incompleteLane) {
    return incompleteLane.resumePath;
  }

  const verificationLane = onboarding.lanes.find((lane) => lane.activationState === "verification");
  if (verificationLane) {
    return "/activation-status";
  }

  const activeLane = onboarding.lanes.find((lane) => lane.isActive) ?? onboarding.lanes[0];
  return getDashboardPath(activeLane.role);
}

export async function getActivationStatusForUser(user: UserAccount): Promise<ActivationStatusPayload> {
  const onboarding = await getOnboardingState(user);
  const lanes: ActivationStatusLaneView[] = onboarding.lanes.map((lane) => ({
    role: lane.role,
    activationState: lane.activationState,
    isActive: lane.isActive,
    requirements: lane.verificationProfile?.currentRequirements ?? [],
    verificationProfile: lane.verificationProfile,
    resumePath: lane.resumePath,
    dashboardPath: getDashboardPath(lane.role),
    appApprovalStatus: lane.role === "client" ? "not_required" : user.appApprovalStatus,
    shopApprovalStatus: lane.role === "barber" ? user.shopApprovalStatus : undefined
  }));

  return {
    selectedRole: onboarding.selectedRole,
    nextPath: onboarding.nextPath,
    lanes,
    warnings: onboarding.warnings
  };
}

export async function getOnboardingSummaryForRuntimeUser(userId: string) {
  const { rows } = await readPersistedStates(userId);
  const selectedRole = chooseSelectedRole(rows);
  const current = rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return {
    selectedRole,
    current,
    lanes: rows
  };
}
