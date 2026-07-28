import type { Route } from "next";
import { isCanonicalContactComplete } from "@/lib/auth/contact-policy";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { initializeProductionRoleSelection } from "@/lib/auth/production-identity";
import { isBarberAccountRole, isClientRole, isShopOwnerRole, normalizeBarberSubtype } from "@/lib/auth/roles";
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
import type { VerificationProfileRecord, VerificationStatus } from "@/types/trust";

const ONBOARDING_WARNING = "Onboarding data is partially unavailable. Core access is still active.";
const CONTACT_NOT_COMPLETE = "CONTACT_NOT_COMPLETE";
const ACTIVE_LANE_LOCKED = "ACTIVE_LANE_LOCKED";
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

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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

function describeOnboardingError(error: unknown) {
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
  ].filter(Boolean).join(" | ") || "unknown onboarding error";
}

function hasVerifiedContactData(user: UserAccount) {
  return isCanonicalContactComplete({
    hasRequiredContactFields: hasRequiredContactData(user),
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true
  });
}

function logLaneLaunch(event: string, details: Record<string, unknown>) {
  console.info(`[onboarding] ${event}`, details);
}

function getStepDefinitions(role: OnboardingRole) {
  return ONBOARDING_STEPS[role];
}

function getFirstStep(role: OnboardingRole) {
  return getStepDefinitions(role)[0].key;
}

function getLastStep(role: OnboardingRole) {
  const steps = getStepDefinitions(role);
  const lastStep = steps[steps.length - 1];
  if (lastStep) {
    return lastStep.key;
  }
  return steps[0].key;
}

function getStepRoute(role: OnboardingRole, step: OnboardingStepKey): Route {
  const steps = getStepDefinitions(role);
  const matchingStep = steps.find((entry) => entry.key === step);
  if (matchingStep) {
    return matchingStep.route;
  }
  return steps[0].route;
}

function getNextStep(role: OnboardingRole, completedSteps: OnboardingStepKey[]) {
  const matchingStep = getStepDefinitions(role).find((entry) => !completedSteps.includes(entry.key));
  if (matchingStep) {
    return matchingStep.key;
  }
  return null;
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
  const row = {
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

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.id)) {
    return {
      id: state.id,
      ...row
    };
  }

  return row;
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
            ...(user.barberSubtype
              ? {
                  barberSubtype: normalizeBarberSubtype(user.barberSubtype),
                  compensationModel: normalizeBarberSubtype(user.barberSubtype)
                }
              : {})
          }
        : {};

  return {
    id: createUuid(),
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
      isBarberAccountRole(user.role)
      && verificationProfile?.canAcceptBookings
      && verificationProfile?.publicVerified
    );
  }

  return Boolean(isShopOwnerRole(user.role) && verificationProfile?.canCreateShopListing && verificationProfile?.canReceivePayouts);
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

function inferSelectedRoleFromUser(user: UserAccount): OnboardingRole | null {
  if (
    user.primaryOnboardingRole === "client"
    || user.primaryOnboardingRole === "barber"
    || user.primaryOnboardingRole === "shop_owner"
  ) {
    return user.primaryOnboardingRole;
  }

  return null;
}

function getCanonicalRoleDestination(user: UserAccount): OnboardingRole | null {
  if (user.primaryOnboardingRole === "client" && user.clientId) {
    return "client";
  }

  if (user.primaryOnboardingRole === "barber" && user.barberId) {
    return "barber";
  }

  if (user.primaryOnboardingRole === "shop_owner" && user.ownedShopId) {
    return "shop_owner";
  }

  if (!user.primaryOnboardingRole && user.role === "client" && user.clientId) {
    return "client";
  }

  if (
    !user.primaryOnboardingRole
    && isBarberAccountRole(user.role)
    && user.barberId
  ) {
    return "barber";
  }

  if (!user.primaryOnboardingRole && isShopOwnerRole(user.role) && user.ownedShopId) {
    return "shop_owner";
  }

  return null;
}

function hasCanonicalLaneForRole(user: UserAccount, role: OnboardingRole) {
  if (role === "client") {
    return Boolean(user.clientId);
  }

  if (role === "barber") {
    return Boolean(user.barberId);
  }

  return Boolean(user.ownedShopId);
}

function hasRequiredContactData(user: UserAccount) {
  const fullName = user.canonicalFullName?.trim()
    || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  return Boolean(
    fullName
    && user.email?.trim()
    && user.phone?.trim()
  );
}

function getLaneSetupPath(role: OnboardingRole, summary?: { current?: OnboardingStateRecord | null; lanes?: OnboardingStateRecord[] }) {
  const matchingLane = summary?.lanes?.find((lane) => lane.role === role);
  if (matchingLane?.status !== "completed") {
    return getStepRoute(role, matchingLane?.currentStep ?? getFirstStep(role));
  }

  if (summary?.current?.role === role && summary.current.status !== "completed") {
    return getStepRoute(role, summary.current.currentStep);
  }

  if (role === "client") {
    return "/onboarding/client/profile" as Route;
  }

  if (role === "barber") {
    return "/onboarding/barber/profile" as Route;
  }

  return "/onboarding/owner/shop" as Route;
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

function logPostAuthDecision(
  user: UserAccount,
  destination: Route,
  reason: string,
  details: Record<string, unknown> = {}
) {
  console.info("[auth] post-auth destination resolved", {
    userId: user.id,
    runtimeRole: user.role,
    primaryOnboardingRole: user.primaryOnboardingRole ?? null,
    accountStatus: user.accountStatus ?? null,
    clientId: user.clientId ?? null,
    barberId: user.barberId ?? null,
    ownedShopId: user.ownedShopId ?? null,
    destination,
    reason,
    ...details
  });
}

async function readPostAuthOnboardingSummary(
  user: UserAccount,
  preloaded?: { lanes: OnboardingLaneView[]; selectedRole: OnboardingRole | null; warnings: string[] }
) {
  if (preloaded) {
    return {
      selectedRole: preloaded.selectedRole,
      lanes: preloaded.lanes.map((lane) => ({
        id: `lane-${lane.role}`,
        userId: user.id,
        role: lane.role,
        status: lane.status,
        currentStep: lane.currentStep,
        completedSteps: lane.completedSteps,
        profileData: lane.profileData,
        createdAt: "",
        updatedAt: ""
      })),
      current: preloaded.lanes[0]
        ? {
            id: `lane-${preloaded.lanes[0].role}`,
            userId: user.id,
            role: preloaded.lanes[0].role,
            status: preloaded.lanes[0].status,
            currentStep: preloaded.lanes[0].currentStep,
            completedSteps: preloaded.lanes[0].completedSteps,
            profileData: preloaded.lanes[0].profileData,
            createdAt: "",
            updatedAt: ""
          }
        : null
    };
  }

  try {
    return await getOnboardingSummaryForRuntimeUser(user.id);
  } catch (error) {
    console.error("[auth] post-auth onboarding summary read failed", {
      userId: user.id,
      error: describeOnboardingError(error)
    });
    return null;
  }
}

export function resolvePostAuthRecoveryDestination(user: UserAccount): Route {
  if (user.accountStatus === "deactivated" || user.accountStatus === "suspended" || user.accountStatus === "banned") {
    return "/login?account=disabled";
  }

  if (user.accountStatus === "active" && isPlatformAdminUser(user)) {
    return "/architect";
  }

  if (!hasRequiredContactData(user) || user.emailVerified === false || user.phoneVerified === false) {
    return "/verify-contact";
  }

  const canonicalRole = getCanonicalRoleDestination(user);
  if (canonicalRole) {
    return getDashboardPath(canonicalRole);
  }

  const selectedRole = inferSelectedRoleFromUser(user);
  if (!selectedRole) {
    return "/role-select";
  }

  return getLaneSetupPath(selectedRole);
}

function getVerificationQueueRequirements(role: Exclude<OnboardingRole, "client">) {
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

function canResubmitVerificationStatus(status?: VerificationStatus | null) {
  return !status || ["unverified", "not_started", "pending", "in_progress", "submitted"].includes(status);
}

async function ensureCanonicalVerificationProfile(user: UserAccount, role: Exclude<OnboardingRole, "client">) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const profile: VerificationProfileRecord = {
    id: `vprof-${role}-${user.id.slice(0, 8)}`,
    userId: user.id,
    role,
    overallStatus: "submitted",
    identityStatus: "not_started",
    licenseStatus: "not_started",
    businessStatus: "not_started",
    payoutStatus: "not_started",
    complianceStatus: "not_started",
    publicVerified: false,
    canAcceptBookings: false,
    canReceivePayouts: false,
    canCreateShopListing: false,
    currentRequirements: getVerificationQueueRequirements(role),
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

  const existing = await supabase
    .from("verification_profiles")
    .select("id, overall_status")
    .eq("user_id", profile.userId)
    .eq("role", profile.role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && !isMissingTableError(existing.error)) {
    throw existing.error;
  }

  if (existing.data && !canResubmitVerificationStatus(existing.data.overall_status as VerificationStatus | null)) {
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
  if (user.role === "platform_admin" || user.role === "manager" || user.role === "front_desk") {
    return false;
  }

  if (!user.primaryOnboardingRole) {
    return true;
  }

  if (user.accountStatus !== "active") {
    return true;
  }

  if (role === "client") {
    return isClientRole(user.role);
  }

  if (role === "barber") {
    return isBarberAccountRole(user.role);
  }

  return isShopOwnerRole(user.role);
}

function getOfficialLaneConflict(
  user: UserAccount,
  requestedRole: OnboardingRole,
  rows: OnboardingStateRecord[]
) {
  const officialRole = user.primaryOnboardingRole;
  if (!officialRole || officialRole === requestedRole) {
    return null;
  }

  const officialLaneRow = rows.find((entry) => entry.role === officialRole);
  const officialLaneIsFinal = Boolean(
    (user.accountStatus === "active" && user.onboardingState === "active" && officialLaneRow)
    || officialLaneRow?.status === "completed"
  );

  return {
    officialRole,
    officialLaneRow,
    officialLaneIsFinal
  };
}

function assertOnboardingRoleAccess(
  user: UserAccount,
  role: OnboardingRole,
  rows: OnboardingStateRecord[]
) {
  logLaneLaunch("lane access check", {
    userId: user.id,
    requestedRole: role,
    runtimeRole: user.role,
    primaryOnboardingRole: user.primaryOnboardingRole ?? null,
    onboardingState: user.onboardingState ?? null,
    accountStatus: user.accountStatus ?? null,
    contactComplete: hasVerifiedContactData(user),
    existingRows: rows.map((entry) => ({
      role: entry.role,
      status: entry.status,
      currentStep: entry.currentStep
    }))
  });

  if (!hasVerifiedContactData(user)) {
    logLaneLaunch("lane access blocked", {
      userId: user.id,
      requestedRole: role,
      reason: CONTACT_NOT_COMPLETE
    });
    throw new Error(CONTACT_NOT_COMPLETE);
  }

  if (!isRuntimeRoleAllowedForOnboarding(user, role)) {
    logLaneLaunch("lane access blocked", {
      userId: user.id,
      requestedRole: role,
      reason: ACTIVE_LANE_LOCKED,
      runtimeRole: user.role,
      primaryOnboardingRole: user.primaryOnboardingRole ?? null,
      onboardingState: user.onboardingState ?? null,
      accountStatus: user.accountStatus ?? null
    });
    throw new Error(ACTIVE_LANE_LOCKED);
  }

  if (!user.primaryOnboardingRole) {
    logLaneLaunch("lane access allowed", {
      userId: user.id,
      requestedRole: role,
      selectedRole: null,
      reason: "no_official_lane_selected_clean_start",
      ignoredStaleRuntimeRole: user.role,
      ignoredStaleOnboardingState: user.onboardingState ?? null,
      ignoredStaleAccountStatus: user.accountStatus ?? null
    });
    return;
  }

  const selectedRole = chooseSelectedRole(rows);
  const officialConflict = getOfficialLaneConflict(user, role, rows);
  if (officialConflict?.officialLaneIsFinal) {
    logLaneLaunch("lane access blocked", {
      userId: user.id,
      requestedRole: role,
      selectedRole,
      reason: ACTIVE_LANE_LOCKED,
      primaryOnboardingRole: officialConflict.officialRole,
      officialLaneStatus: officialConflict.officialLaneRow?.status ?? null,
      officialLaneCurrentStep: officialConflict.officialLaneRow?.currentStep ?? null
    });
    throw new Error(ACTIVE_LANE_LOCKED);
  }

  if (officialConflict && !officialConflict.officialLaneIsFinal) {
    logLaneLaunch("lane access recovered stale official lane", {
      userId: user.id,
      requestedRole: role,
      selectedRole,
      previousPrimaryOnboardingRole: officialConflict.officialRole,
      previousOfficialLaneStatus: officialConflict.officialLaneRow?.status ?? null,
      previousOfficialLaneCurrentStep: officialConflict.officialLaneRow?.currentStep ?? null,
      reason: "official_lane_not_final"
    });
  }

  logLaneLaunch("lane access allowed", {
    userId: user.id,
    requestedRole: role,
    selectedRole,
    reason: officialConflict
      ? "recovered_stale_official_lane"
      : user.primaryOnboardingRole
        ? "official_lane_matches"
        : "no_official_lane_selected"
  });
}

export async function initializeUserRole(
  user: UserAccount,
  role: OnboardingRole,
  seedProfileData: Record<string, unknown> = {}
) {
  const { rows, degraded } = await readPersistedStates(user.id);
  logLaneLaunch("legacy initialize user role requested", {
    userId: user.id,
    requestedRole: role,
    seedProfileData,
    persistedRowsBefore: rows.map((entry) => ({ role: entry.role, status: entry.status, currentStep: entry.currentStep }))
  });
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

  logLaneLaunch("legacy initialize user role completed", {
    userId: user.id,
    requestedRole: role,
    degraded: degraded || persistResult.degraded,
    state: existing ?? state
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
  logLaneLaunch("selected lane launch requested", {
    userId: user.id,
    selectedLane: input.role,
    barberSubtype: input.barberSubtype ?? null,
    hasShopName: Boolean(input.shopName?.trim()),
    runtimeUserBeforeLaunch: {
      role: user.role,
      accountStatus: user.accountStatus ?? null,
      primaryOnboardingRole: user.primaryOnboardingRole ?? null,
      onboardingState: user.onboardingState ?? null,
      emailVerified: user.emailVerified ?? null,
      phoneVerified: user.phoneVerified ?? null,
      clientId: user.clientId ?? null,
      barberId: user.barberId ?? null,
      ownedShopId: user.ownedShopId ?? null
    },
    persistedRowsBefore: rows.map((entry) => ({ role: entry.role, status: entry.status, currentStep: entry.currentStep }))
  });

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

  const nextState = createCompletedLaneState(selection.user, input.role, selection.seedProfileData);

  if (input.role !== "client") {
    await ensureCanonicalVerificationProfile(selection.user, input.role);
  }
  const persistResult = await persistState(nextState);

  logLaneLaunch("selected lane launch completed", {
    userId: user.id,
    selectedLane: input.role,
    persistedState: nextState,
    degraded: persistResult.degraded,
    runtimeUserAfterLaunch: {
      role: selection.user.role,
      accountStatus: selection.user.accountStatus ?? null,
      primaryOnboardingRole: selection.user.primaryOnboardingRole ?? null,
      onboardingState: selection.user.onboardingState ?? null,
      clientId: selection.user.clientId ?? null,
      barberId: selection.user.barberId ?? null,
      barberSubtype: selection.user.barberSubtype ?? null,
      ownedShopId: selection.user.ownedShopId ?? null
    }
  });

  return {
    user: selection.user,
    state: nextState,
    degraded: persistResult.degraded
  };
}

export async function ensureCanonicalOnboardingStateForUser(user: UserAccount) {
  const role = inferSelectedRoleFromUser(user);
  if (!role || !hasVerifiedContactData(user)) {
    return {
      ensured: false,
      role,
      reason: !role ? "missing_role" as const : "contact_incomplete" as const
    };
  }

  const { rows, degraded } = await readPersistedStates(user.id);
  const existing = rows.find((entry) => entry.role === role);
  if (existing) {
    return {
      ensured: false,
      role,
      state: existing,
      degraded,
      reason: "already_exists" as const
    };
  }

  const hasLaneRecord = hasCanonicalLaneForRole(user, role);
  const state = hasLaneRecord
    ? createCompletedLaneState(user, role)
    : createEmptyState(user, role);

  if (role !== "client" && hasLaneRecord) {
    await ensureCanonicalVerificationProfile(user, role);
  }

  const persistResult = await persistState(state);
  logLaneLaunch("canonical onboarding state ensured", {
    userId: user.id,
    role,
    stateStatus: state.status,
    currentStep: state.currentStep,
    hasLaneRecord,
    degraded: degraded || persistResult.degraded
  });

  return {
    ensured: true,
    role,
    state,
    degraded: degraded || persistResult.degraded,
    reason: "created" as const
  };
}

export async function getOnboardingStates(user: UserAccount) {
  return readPersistedStates(user.id);
}

async function readDebugRow(table: string, select: string, field: string, value: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: null, error: "supabase_unavailable" };
  }

  const result = await supabase
    .from(table)
    .select(select)
    .eq(field, value)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error && !isMissingTableError(result.error)) {
    return { data: null, error: describeOnboardingError(result.error) };
  }

  return { data: result.data ?? null, error: result.error ? describeOnboardingError(result.error) : null };
}

async function readDebugRows(table: string, select: string, field: string, value?: string | null) {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: [], error: "supabase_unavailable" };
  }

  if (!value) {
    return { data: [], error: null };
  }

  const result = await supabase
    .from(table)
    .select(select)
    .eq(field, value);

  if (result.error && !isMissingTableError(result.error)) {
    return { data: [], error: describeOnboardingError(result.error) };
  }

  return { data: result.data ?? [], error: result.error ? describeOnboardingError(result.error) : null };
}

export async function getUserLaneState(userId: string, email?: string | null) {
  const [profile, client, barber, shop, userRoles] = await Promise.all([
    readDebugRow("profiles", "id, role, full_name, email, phone, primary_onboarding_role, onboarding_state, phone_verified_at", "id", userId),
    readDebugRow("clients", "id, profile_id, reference_code", "profile_id", userId),
    readDebugRow("barbers", "id, profile_id, reference_code, compensation_model, barber_subtype, app_approval_status, shop_approval_status", "profile_id", userId),
    readDebugRow("shops", "id, owner_profile_id, name, app_approval_status", "owner_profile_id", userId),
    readDebugRows("user_roles", "user_email, role, client_reference, barber_reference, location_references", "user_email", email)
  ]);

  const canonicalProfile = profile.data as { primary_onboarding_role?: OnboardingRole | null } | null;

  return {
    primary_onboarding_role: canonicalProfile?.primary_onboarding_role ?? null,
    clients_exists: Boolean(client.data),
    barbers_exists: Boolean(barber.data),
    shops_exists: Boolean(shop.data),
    user_roles: userRoles.data,
    raw: {
      profile,
      client,
      barber,
      shop,
      userRoles
    }
  };
}

export async function getLaneLaunchDebugState(user: UserAccount) {
  const { rows, degraded } = await readPersistedStates(user.id);
  const userLaneState = await getUserLaneState(user.id, user.email);
  const profile = userLaneState.raw.profile;
  const client = userLaneState.raw.client;
  const barber = userLaneState.raw.barber;
  const shop = userLaneState.raw.shop;
  const userRoles = userLaneState.raw.userRoles;
  const roles: OnboardingRole[] = ["client", "barber", "shop_owner"];
  const allowedLanes = roles.map((role) => {
    try {
      assertOnboardingRoleAccess(user, role, rows);
      return { role, allowed: true, reason: "allowed" };
    } catch (error) {
      return {
        role,
        allowed: false,
        reason: error instanceof Error ? error.message : "unknown"
      };
    }
  });

  return {
    userId: user.id,
    primary_onboarding_role: userLaneState.primary_onboarding_role,
    clients_exists: userLaneState.clients_exists,
    barbers_exists: userLaneState.barbers_exists,
    shops_exists: userLaneState.shops_exists,
    user_roles: userLaneState.user_roles,
    allowed_roles: allowedLanes.filter((lane) => lane.allowed).map((lane) => lane.role),
    runtimeUser: {
      role: user.role,
      accountStatus: user.accountStatus ?? null,
      primaryOnboardingRole: user.primaryOnboardingRole ?? null,
      onboardingState: user.onboardingState ?? null,
      emailVerified: user.emailVerified ?? null,
      phoneVerified: user.phoneVerified ?? null,
      clientId: user.clientId ?? null,
      barberId: user.barberId ?? null,
      barberSubtype: user.barberSubtype ?? null,
      ownedShopId: user.ownedShopId ?? null
    },
    canonicalProfile: profile.data,
    canonicalProfileError: profile.error,
    contactComplete: hasVerifiedContactData(user),
    persistedOnboardingRows: rows,
    degraded,
    laneRows: {
      client: client.data,
      clientError: client.error,
      barber: barber.data,
      barberError: barber.error,
      shopOwner: shop.data,
      shopOwnerError: shop.error,
      userRoles: userRoles.data,
      userRolesError: userRoles.error
    },
    allowedLanes,
    predictedNextPathByLane: {
      client: "/dashboard/client",
      barber: "/dashboard/barber",
      shop_owner: "/dashboard/owner"
    }
  };
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

  const selectedRole = inferSelectedRoleFromUser(user);
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
  if (user.accountStatus === "deactivated" || user.accountStatus === "suspended" || user.accountStatus === "banned") {
    const destination = "/login?account=disabled" as Route;
    logPostAuthDecision(user, destination, "account_disabled");
    return destination;
  }

  if (user.accountStatus === "active" && isPlatformAdminUser(user)) {
    const destination = "/architect" as Route;
    logPostAuthDecision(user, destination, "platform_admin");
    return destination;
  }

  if (!hasRequiredContactData(user) || user.emailVerified === false || user.phoneVerified === false) {
    const destination = "/verify-contact" as Route;
    logPostAuthDecision(user, destination, "contact_verification_required", {
      hasRequiredContactData: hasRequiredContactData(user),
      emailVerified: user.emailVerified ?? null,
      phoneVerified: user.phoneVerified ?? null
    });
    return destination;
  }

  const canonicalRole = getCanonicalRoleDestination(user);
  if (canonicalRole) {
    const destination = getDashboardPath(canonicalRole);
    logPostAuthDecision(user, destination, "canonical_role_resolved", {
      canonicalRole
    });
    return destination;
  }

  const selectedRole = inferSelectedRoleFromUser(user);
  if (!selectedRole) {
    const destination = "/role-select" as Route;
    logPostAuthDecision(user, destination, "missing_canonical_role_truth");
    return destination;
  }

  const onboardingSummary = await readPostAuthOnboardingSummary(user, preloaded);
  const destination = getLaneSetupPath(selectedRole, onboardingSummary ?? undefined);
  logPostAuthDecision(user, destination, "lane_setup_required", {
    selectedRole,
    hasOnboardingSummary: Boolean(onboardingSummary),
    hasLaneRow: onboardingSummary?.lanes?.some((lane) => lane.role === selectedRole) ?? false
  });
  return destination;
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
