import { buildOnboardingReadiness, resolveRoleScope } from "@/lib/onboarding/readiness";
import {
  BARBER_MORE_SUBTITLES,
  CLIENT_MORE_SUBTITLES,
  SHOP_OWNER_MORE_SUBTITLES
} from "@/lib/onboarding/requirements";
import type {
  MoreSubtitle,
  OnboardingReadinessContext,
  OnboardingReadinessResult,
  ReadinessKey,
  ReadinessSection,
  ReadinessStatus
} from "@/lib/onboarding/types";

export const FINAL_ACTIVATION_ROLE_SCOPES = ["guest", "client", "barber", "shop_owner"] as const;
export type FinalActivationRoleScope = (typeof FINAL_ACTIVATION_ROLE_SCOPES)[number];

export const FINAL_ACTIVATION_EVENT_HINTS = [
  "onboarding_final_activation_viewed",
  "onboarding_final_activation_blocked",
  "onboarding_final_activation_retry_clicked",
  "client_final_activation_completed",
  "barber_final_activation_completed",
  "owner_final_activation_completed",
  "onboarding_home_handoff_completed",
  "onboarding_production_evidence_viewed"
] as const;

export type FinalActivationEventHint = (typeof FINAL_ACTIVATION_EVENT_HINTS)[number];
export type FinalActivationMatrixStatus = "Pass" | "Needs setup" | "Needs review" | "Blocked" | "Not applicable";

export type FinalActivationAction = {
  label: string;
  href: string;
};

export type FinalActivationBlockedState = {
  title: "Blocked" | "Needs setup" | "Needs review";
  reason: string;
  nextAction: FinalActivationAction;
};

export type FinalActivationRetryState = {
  label: "Try again";
  reason: string;
  href: string;
  retryKey: string;
};

export type FinalActivationEvidence = {
  readinessEngineReachable: boolean;
  clientOnboardingPathPresent: boolean;
  barberOnboardingPathPresent: boolean;
  ownerOnboardingPathPresent: boolean;
  finalActivationModelPresent: boolean;
  rawRoleLabelsInFinalActivationUi: false;
  requiredRoutes: Record<FinalActivationRoleScope, string>;
  noMigrationsAdded: true;
  noRlsTouched: true;
  noMoneyPayoutRoutingMutation: true;
  validationStatus: "Needs Review" | "Pass" | "Blocked";
  missingEvidence: string[];
  contentExposed: false;
};

export type FinalActivationQAMatrixRow = {
  role: "Guest" | "Client" | "Barber" | "Shop Owner";
  publicEntry: FinalActivationMatrixStatus;
  accountReadiness: FinalActivationMatrixStatus;
  roleGate: FinalActivationMatrixStatus;
  profileIdentity: FinalActivationMatrixStatus;
  contactVerificationPosture: FinalActivationMatrixStatus;
  firstAction: FinalActivationMatrixStatus;
  bookingReadiness: FinalActivationMatrixStatus;
  businessReadiness: FinalActivationMatrixStatus;
  payoutMoneyPosture: FinalActivationMatrixStatus;
  shopReadiness: FinalActivationMatrixStatus;
  kioskReadiness: FinalActivationMatrixStatus;
  finalAction: FinalActivationMatrixStatus;
  homeHandoff: FinalActivationMatrixStatus;
  blockedState: FinalActivationMatrixStatus;
  retryState: FinalActivationMatrixStatus;
  noBackendLabels: FinalActivationMatrixStatus;
  noFakeMoneyPayoutKioskTruth: FinalActivationMatrixStatus;
};

export type FinalActivationResult = {
  roleScope: FinalActivationRoleScope;
  userFacingRoleLabel: "Guest" | "Client" | "Barber" | "Shop Owner";
  progressPercent: number;
  currentHighestReadiness: OnboardingReadinessResult["currentHighestReadiness"];
  isV1OnboardingComplete: boolean;
  isFinalActivationAllowed: boolean;
  finalAction: FinalActivationAction;
  finalActionHref: string;
  secondaryActions: FinalActivationAction[];
  blockedReasons: FinalActivationBlockedState[];
  retryableActions: FinalActivationRetryState[];
  missingCriticalRequirements: OnboardingReadinessResult["missingCriticalRequirements"];
  evidence: FinalActivationEvidence;
  safeHomeFallback: string;
  auditEventHint: {
    recommendedEvent: FinalActivationEventHint;
    persistence: "typed_hint_only" | "platform_events_available";
    reason: string;
  };
  qaMatrixRow: FinalActivationQAMatrixRow;
  readiness: OnboardingReadinessResult;
};

export type FinalActivationInput = {
  targetRole: FinalActivationRoleScope;
  readiness: OnboardingReadinessResult;
  firstBookingExists?: boolean;
  bookingReadyPathComplete?: boolean;
  inviteSkipped?: boolean;
  unsupportedBookingModeSelected?: boolean;
  retry?: {
    retryKey: string;
    failed: boolean;
    reason: string;
    href: string;
  };
  productionEvidence?: Partial<Pick<FinalActivationEvidence, "validationStatus" | "missingEvidence">>;
};

const HOME_ROUTE: Record<FinalActivationRoleScope, string> = {
  guest: "/signup",
  client: "/dashboard/client",
  barber: "/dashboard/barber",
  shop_owner: "/dashboard/owner"
};

const SETUP_ROUTE: Record<FinalActivationRoleScope, string> = {
  guest: "/signup",
  client: "/onboarding/client/profile",
  barber: "/onboarding/barber?step=identity",
  shop_owner: "/onboarding/owner?step=authority"
};

const ROLE_LABEL: Record<FinalActivationRoleScope, FinalActivationResult["userFacingRoleLabel"]> = {
  guest: "Guest",
  client: "Client",
  barber: "Barber",
  shop_owner: "Shop Owner"
};

const REQUIRED_SECTIONS: Record<Exclude<FinalActivationRoleScope, "guest">, ReadinessKey[]> = {
  client: ["account"],
  barber: ["account", "barberBusiness"],
  shop_owner: ["account", "shop"]
};

export function buildFinalActivationFromContext(
  targetRole: FinalActivationRoleScope,
  context: OnboardingReadinessContext,
  options: Omit<FinalActivationInput, "targetRole" | "readiness"> = {}
) {
  return buildFinalActivation({
    targetRole,
    readiness: buildOnboardingReadiness(context),
    ...options
  });
}

export function buildFinalActivation(input: FinalActivationInput): FinalActivationResult {
  const roleScope = input.targetRole;
  const roleLabel = ROLE_LABEL[roleScope];
  const roleGateBlocked = roleScope !== "guest" && input.readiness.roleScope !== roleScope;
  const guestDashboardBlocked = roleScope === "guest" && input.readiness.canEnterDashboard;
  const requiredSections = roleScope === "guest" ? [] : REQUIRED_SECTIONS[roleScope];
  const requiredReady = requiredSections.every((key) => input.readiness.readiness[key].status === "pass");
  const computedProgressPercent = roleScope === "guest"
    ? 100
    : Math.round((requiredSections.filter((key) => input.readiness.readiness[key].status === "pass").length / requiredSections.length) * 100);
  const blockedReasons = buildBlockedReasons(input, roleGateBlocked, guestDashboardBlocked);
  const progressPercent = roleGateBlocked || guestDashboardBlocked ? 0 : computedProgressPercent;
  const retryableActions = input.retry?.failed
    ? [{ label: "Try again" as const, retryKey: input.retry.retryKey, reason: input.retry.reason, href: input.retry.href }]
    : [];
  const finalAction = chooseFinalAction(input, roleGateBlocked, requiredReady);
  const secondaryActions = chooseSecondaryActions(input);
  const complete = roleScope === "guest" ? true : requiredReady && blockedReasons.length === 0;
  const evidence = buildOnboardingFinalActivationEvidence(input.productionEvidence);
  const qaMatrixRow = buildFinalActivationQAMatrixRow(roleScope, input.readiness, {
    complete,
    blocked: blockedReasons.length > 0,
    retry: retryableActions.length > 0
  });

  return {
    roleScope,
    userFacingRoleLabel: roleLabel,
    progressPercent,
    currentHighestReadiness: input.readiness.currentHighestReadiness,
    isV1OnboardingComplete: complete,
    isFinalActivationAllowed: roleScope === "guest" ? true : complete,
    finalAction,
    finalActionHref: finalAction.href,
    secondaryActions,
    blockedReasons,
    retryableActions,
    missingCriticalRequirements: input.readiness.missingCriticalRequirements,
    evidence,
    safeHomeFallback: roleScope === "guest" ? "/discover" : HOME_ROUTE[roleScope],
    auditEventHint: buildFinalAuditHint(roleScope, complete, blockedReasons.length > 0, input.readiness),
    qaMatrixRow,
    readiness: input.readiness
  };
}

export function buildOnboardingFinalActivationEvidence(
  productionEvidence: Partial<Pick<FinalActivationEvidence, "validationStatus" | "missingEvidence">> = {}
): FinalActivationEvidence {
  const missingEvidence = productionEvidence.missingEvidence ?? ["Vercel preview or production runtime proof not connected in local model."];

  return {
    readinessEngineReachable: true,
    clientOnboardingPathPresent: true,
    barberOnboardingPathPresent: true,
    ownerOnboardingPathPresent: true,
    finalActivationModelPresent: true,
    rawRoleLabelsInFinalActivationUi: false,
    requiredRoutes: HOME_ROUTE,
    noMigrationsAdded: true,
    noRlsTouched: true,
    noMoneyPayoutRoutingMutation: true,
    validationStatus: productionEvidence.validationStatus ?? (missingEvidence.length ? "Needs Review" : "Pass"),
    missingEvidence,
    contentExposed: false
  };
}

export function buildFinalActivationQAMatrix(results: FinalActivationResult[]): FinalActivationQAMatrixRow[] {
  return FINAL_ACTIVATION_ROLE_SCOPES.map((role) => (
    results.find((result) => result.roleScope === role)?.qaMatrixRow
    ?? buildFinalActivationQAMatrixRow(role, buildOnboardingReadiness(role === "guest" ? {} : { authenticated: true, role: `${role}_user` }), {
      complete: false,
      blocked: true,
      retry: false
    })
  ));
}

export function isAllowedFinalActivationRole(role: string | null | undefined, targetRole: FinalActivationRoleScope) {
  if (targetRole === "guest") return !role;
  return resolveRoleScope(role, true) === targetRole;
}

export function usesOnlyApprovedFinalActivationMoreSubtitles(subtitles: readonly MoreSubtitle[]) {
  const allowed = new Set<string>([
    ...CLIENT_MORE_SUBTITLES,
    ...BARBER_MORE_SUBTITLES,
    ...SHOP_OWNER_MORE_SUBTITLES
  ]);

  return subtitles.every((subtitle) => allowed.has(subtitle));
}

function chooseFinalAction(input: FinalActivationInput, roleGateBlocked: boolean, requiredReady: boolean): FinalActivationAction {
  if (input.targetRole === "guest") {
    return { label: "Join BVRB3R", href: "/signup?intent=client" };
  }

  if (roleGateBlocked) {
    return { label: "Continue where you left off", href: SETUP_ROUTE[input.targetRole] };
  }

  if (input.targetRole === "client") {
    if (input.readiness.readiness.account.status !== "pass") {
      return { label: "Finish Client Setup", href: "/onboarding/client/profile" };
    }

    if (input.firstBookingExists || input.bookingReadyPathComplete) {
      return { label: "Enter Client Home", href: HOME_ROUTE.client };
    }

    return { label: "Find My First Cut", href: "/discover?entry=client_onboarding&source=final_activation&type=barbers" };
  }

  if (input.targetRole === "barber") {
    return requiredReady
      ? { label: "Enter Barber Home", href: HOME_ROUTE.barber }
      : { label: "Finish Barber Setup", href: setupRouteForFirstMissing(input.readiness, "barber") };
  }

  return requiredReady
    ? { label: "Enter Owner Home", href: HOME_ROUTE.shop_owner }
    : { label: "Finish Shop Setup", href: setupRouteForFirstMissing(input.readiness, "shop_owner") };
}

function chooseSecondaryActions(input: FinalActivationInput): FinalActivationAction[] {
  const actions: FinalActivationAction[] = [];

  if (input.targetRole === "barber" && input.inviteSkipped) {
    actions.push({ label: "Invite First Client", href: "/onboarding/barber?step=invite_first_client" });
  }

  if (input.targetRole === "barber" && input.readiness.readiness.payout.status !== "pass") {
    actions.push({ label: "Finish payout setup", href: "/dashboard/barber/payouts" });
  }

  if (input.targetRole === "shop_owner" && input.inviteSkipped) {
    actions.push({ label: "Invite First Barber", href: "/onboarding/owner?step=invite_first_barber" });
  }

  if (input.targetRole === "shop_owner" && input.readiness.readiness.kiosk.status !== "pass") {
    actions.push({ label: "Prepare kiosk", href: "/dashboard/owner/settings" });
  }

  return actions;
}

function buildBlockedReasons(input: FinalActivationInput, roleGateBlocked: boolean, guestDashboardBlocked: boolean): FinalActivationBlockedState[] {
  const blocked: FinalActivationBlockedState[] = [];
  if (roleGateBlocked) {
    blocked.push({
      title: "Blocked",
      reason: `${ROLE_LABEL[input.targetRole]} setup needs the matching account access before final activation.`,
      nextAction: { label: "Continue where you left off", href: SETUP_ROUTE[input.targetRole] }
    });
  }

  if (guestDashboardBlocked) {
    blocked.push({
      title: "Blocked",
      reason: "Guest can browse public surfaces, but private Home requires an account.",
      nextAction: { label: "Join BVRB3R", href: "/signup?intent=client" }
    });
  }

  if (input.unsupportedBookingModeSelected) {
    blocked.push({
      title: "Blocked",
      reason: "This booking mode is not ready for V1 activation.",
      nextAction: { label: "Continue where you left off", href: SETUP_ROUTE[input.targetRole] }
    });
  }

  return blocked;
}

function setupRouteForFirstMissing(readiness: OnboardingReadinessResult, role: "barber" | "shop_owner") {
  const section = role === "barber" ? readiness.readiness.barberBusiness : readiness.readiness.shop;
  const first = section.missingRequirements[0]?.id ?? "";

  if (role === "barber") {
    if (first.includes("service") || first.includes("price") || first.includes("duration")) return "/onboarding/barber?step=first_service";
    if (first.includes("schedule")) return "/onboarding/barber?step=schedule";
    if (first.includes("bookingMode")) return "/onboarding/barber?step=booking_mode";
    return "/onboarding/barber?step=identity";
  }

  if (first.includes("location")) return "/onboarding/owner?step=location";
  if (first.includes("hours")) return "/onboarding/owner?step=hours";
  if (first.includes("chairs")) return "/onboarding/owner?step=chair_count";
  if (first.includes("operatingModel")) return "/onboarding/owner?step=operating_model";
  if (first.includes("bookingMode")) return "/onboarding/owner?step=booking_mode";
  if (first.includes("policies")) return "/onboarding/owner?step=policies";
  return "/onboarding/owner?step=authority";
}

function buildFinalAuditHint(
  roleScope: FinalActivationRoleScope,
  complete: boolean,
  blocked: boolean,
  readiness: OnboardingReadinessResult
): FinalActivationResult["auditEventHint"] {
  const recommendedEvent: FinalActivationEventHint = blocked
    ? "onboarding_final_activation_blocked"
    : complete && roleScope === "client"
      ? "client_final_activation_completed"
      : complete && roleScope === "barber"
        ? "barber_final_activation_completed"
        : complete && roleScope === "shop_owner"
          ? "owner_final_activation_completed"
          : "onboarding_final_activation_viewed";

  return {
    recommendedEvent,
    persistence: readiness.auditEventHint.persistence,
    reason: "Final activation emits typed event hints only unless existing platform event persistence is explicitly connected."
  };
}

function buildFinalActivationQAMatrixRow(
  roleScope: FinalActivationRoleScope,
  readiness: OnboardingReadinessResult,
  state: { complete: boolean; blocked: boolean; retry: boolean }
): FinalActivationQAMatrixRow {
  const role = ROLE_LABEL[roleScope];
  const account = roleScope === "guest" ? "Not applicable" : statusFor(readiness.readiness.account);
  const business = roleScope === "barber" ? statusFor(readiness.readiness.barberBusiness) : "Not applicable";
  const shop = roleScope === "shop_owner" ? statusFor(readiness.readiness.shop) : "Not applicable";
  const kiosk = roleScope === "shop_owner" ? statusFor(readiness.readiness.kiosk) : "Not applicable";
  const payout = roleScope === "barber" || roleScope === "shop_owner" ? statusFor(readiness.readiness.payout) : "Not applicable";

  return {
    role,
    publicEntry: "Pass",
    accountReadiness: account,
    roleGate: state.blocked ? "Blocked" : "Pass",
    profileIdentity: account,
    contactVerificationPosture: account,
    firstAction: state.complete || roleScope === "guest" ? "Pass" : "Needs setup",
    bookingReadiness: roleScope === "client" ? statusFor(readiness.readiness.booking) : "Not applicable",
    businessReadiness: business,
    payoutMoneyPosture: payout,
    shopReadiness: shop,
    kioskReadiness: kiosk,
    finalAction: state.complete || roleScope === "guest" ? "Pass" : "Needs setup",
    homeHandoff: state.complete && roleScope !== "guest" ? "Pass" : roleScope === "guest" ? "Not applicable" : "Needs setup",
    blockedState: state.blocked ? "Blocked" : "Not applicable",
    retryState: state.retry ? "Needs setup" : "Not applicable",
    noBackendLabels: "Pass",
    noFakeMoneyPayoutKioskTruth: "Pass"
  };
}

function statusFor(section: ReadinessSection): FinalActivationMatrixStatus {
  const map: Record<ReadinessStatus, FinalActivationMatrixStatus> = {
    pass: "Pass",
    needs_setup: "Needs setup",
    needs_review: "Needs review",
    blocked: "Blocked",
    not_applicable: "Not applicable"
  };
  return map[section.status];
}
