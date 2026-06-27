import { READINESS_ACTIONS } from "@/lib/onboarding/actions";
import {
  ACCOUNT_REQUIREMENTS,
  BARBER_BUSINESS_REQUIREMENTS,
  BOOKING_REQUIREMENTS,
  CULTURE_REQUIREMENTS,
  KIOSK_REQUIREMENTS,
  PAYOUT_REQUIREMENTS,
  READINESS_SECTION_META,
  SHOP_REQUIREMENTS
} from "@/lib/onboarding/requirements";
import {
  READINESS_STATUS_LABELS,
  type OnboardingAction,
  type OnboardingAuditEventHint,
  type OnboardingAuditEventName,
  type OnboardingReadinessContext,
  type OnboardingReadinessResult,
  type OnboardingRequirement,
  type PublicAccountRole,
  type ReadinessKey,
  type ReadinessSection,
  type ReadinessStatus,
  type RoleScope
} from "@/lib/onboarding/types";

const CANONICAL_PUBLIC_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const satisfies readonly PublicAccountRole[];
const SECTION_ORDER: ReadinessKey[] = ["publicGuest", "browse", "account", "booking", "culture", "barberBusiness", "payout", "shop", "kiosk"];
const PAYOUT_READY_STATUSES = new Set(["ready", "enabled", "verified"]);
const SHOP_READY_POSTURES = new Set(["verified", "approved", "active"]);

export function buildOnboardingReadiness(context: OnboardingReadinessContext = {}): OnboardingReadinessResult {
  const roleScope = resolveRoleScope(context.role, context.authenticated);
  const publicGuest = buildPublicGuestSection(context);
  const browse = buildBrowseSection(context);
  const account = buildAccountSection(context, roleScope);
  const booking = buildBookingSection(context);
  const culture = buildCultureSection(context, account.status);
  const barberBusiness = buildBarberBusinessSection(context, roleScope);
  const payout = buildPayoutSection(context, roleScope);
  const shop = buildShopSection(context, roleScope);
  const kiosk = buildKioskSection(context, roleScope, shop.status);

  const readiness = {
    publicGuest,
    browse,
    account,
    booking,
    culture,
    barberBusiness,
    payout,
    shop,
    kiosk
  } satisfies Record<ReadinessKey, ReadinessSection>;

  const applicableSections = SECTION_ORDER.map((key) => readiness[key]).filter((section) => section.status !== "not_applicable");
  const passedSections = applicableSections.filter((section) => section.status === "pass");
  const progressPercent = applicableSections.length ? Math.round((passedSections.length / applicableSections.length) * 100) : 0;
  const currentHighestSection = [...SECTION_ORDER].reverse().map((key) => readiness[key]).find((section) => section.status === "pass") ?? publicGuest;
  const missingCriticalRequirements = applicableSections.flatMap((section) => section.missingRequirements.filter((requirement) => requirement.critical));
  const nextSection = SECTION_ORDER.map((key) => readiness[key]).find((section) => section.status !== "pass" && section.status !== "not_applicable");
  const nextBestAction = nextSection?.nextBestAction ?? READINESS_ACTIONS.openHome;

  return {
    roleScope,
    currentHighestReadiness: currentHighestSection.level,
    currentHighestReadinessLabel: currentHighestSection.label,
    readiness,
    progressPercent,
    missingCriticalRequirements,
    nextBestAction,
    safeHomeFallback: getSafeHomeFallback(roleScope),
    canEnterDashboard: account.status === "pass" || roleScope === "platform_internal",
    canPerformSeriousActions: canPerformSeriousActions(roleScope, readiness),
    auditEventHint: buildAuditEventHint(context, nextBestAction)
  };
}

export function isCanonicalPublicAccountRole(role: string | null | undefined): role is PublicAccountRole {
  return CANONICAL_PUBLIC_ROLES.includes(role as PublicAccountRole);
}

export function resolveRoleScope(role: string | null | undefined, authenticated?: boolean): RoleScope {
  if (!role && !authenticated) {
    return "guest";
  }

  if (role === "platform_admin" || role === "architect") {
    return "platform_internal";
  }

  if (role === "client_user") {
    return "client";
  }

  if (role === "barber_user") {
    return "barber";
  }

  if (role === "shop_owner_user") {
    return "shop_owner";
  }

  return role ? "unknown" : "guest";
}

function buildPublicGuestSection(context: OnboardingReadinessContext): ReadinessSection {
  return buildSection({
    key: "publicGuest",
    status: "pass",
    allowedActions: [READINESS_ACTIONS.browse],
    blockedActions: [READINESS_ACTIONS.finishBookingIdentity, READINESS_ACTIONS.finishCultureRules],
    nextBestAction: context.intent || context.city || context.location ? READINESS_ACTIONS.browse : READINESS_ACTIONS.browse,
    proofConnected: true,
    evidenceSource: "computed_read_model"
  });
}

function buildBrowseSection(_context: OnboardingReadinessContext): ReadinessSection {
  return buildSection({
    key: "browse",
    status: "pass",
    allowedActions: [READINESS_ACTIONS.browse, READINESS_ACTIONS.chooseProvider],
    blockedActions: [READINESS_ACTIONS.finishBookingIdentity, READINESS_ACTIONS.addPaymentMethod],
    nextBestAction: READINESS_ACTIONS.browse,
    proofConnected: true,
    evidenceSource: "computed_read_model"
  });
}

function buildAccountSection(context: OnboardingReadinessContext, roleScope: RoleScope): ReadinessSection {
  if (roleScope === "platform_internal") {
    return buildSection({
      key: "account",
      status: "not_applicable",
      allowedActions: [READINESS_ACTIONS.openHome],
      blockedActions: [READINESS_ACTIONS.chooseRole],
      nextBestAction: READINESS_ACTIONS.openHome,
      proofConnected: true,
      evidenceSource: "server_truth"
    });
  }

  const missing: OnboardingRequirement[] = [];
  const hasAuth = context.authenticated === true || context.authMethodConnected === true;

  if (!hasAuth) missing.push(ACCOUNT_REQUIREMENTS.auth);
  if (!isCanonicalPublicAccountRole(context.role)) missing.push(ACCOUNT_REQUIREMENTS.role);
  if (!hasText(context.name)) missing.push(ACCOUNT_REQUIREMENTS.name);
  if (!hasText(context.username)) missing.push(ACCOUNT_REQUIREMENTS.username);
  if (!hasText(context.email) && !hasText(context.phone)) missing.push(ACCOUNT_REQUIREMENTS.contact);
  if (context.termsAccepted !== true || context.trustRulesAccepted !== true) missing.push(ACCOUNT_REQUIREMENTS.rules);

  return buildSection({
    key: "account",
    status: roleScope === "unknown" ? "blocked" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [READINESS_ACTIONS.authenticate, READINESS_ACTIONS.chooseRole] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.addPaymentMethod, READINESS_ACTIONS.finishPayoutSetup, READINESS_ACTIONS.prepareKioskSettings],
    nextBestAction: actionForMissing(missing, "account"),
    proofConnected: hasAuth,
    evidenceSource: hasAuth ? "server_truth" : "computed_read_model"
  });
}

function buildBookingSection(context: OnboardingReadinessContext): ReadinessSection {
  const booking = context.booking ?? {};
  const missing: OnboardingRequirement[] = [];
  const needsPayment = booking.paymentRequired === true;

  if (!hasText(context.name) || (!hasText(context.email) && !hasText(context.phone))) missing.push(BOOKING_REQUIREMENTS.identity);
  if (booking.verifiedPhoneRequired === true && context.phoneVerified !== true) missing.push(BOOKING_REQUIREMENTS.verifiedPhone);
  if (!hasText(booking.selectedProviderId) && !hasText(booking.selectedShopId)) missing.push(BOOKING_REQUIREMENTS.provider);
  if (!hasText(booking.selectedServiceId)) missing.push(BOOKING_REQUIREMENTS.service);
  if (!hasText(booking.selectedTime)) missing.push(BOOKING_REQUIREMENTS.time);
  if (needsPayment && !hasText(booking.paymentMethodReference)) missing.push(BOOKING_REQUIREMENTS.payment);
  if (booking.policyAccepted !== true) missing.push(BOOKING_REQUIREMENTS.policy);
  if (booking.serverProofConnected === false) missing.push(BOOKING_REQUIREMENTS.serverProof);

  const hasReviewGap = missing.some((requirement) => requirement.severity === "review");

  return buildSection({
    key: "booking",
    status: hasReviewGap && missing.length === 1 ? "needs_review" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [READINESS_ACTIONS.chooseProvider, READINESS_ACTIONS.chooseService] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.addPaymentMethod],
    nextBestAction: actionForMissing(missing, "booking"),
    proofConnected: booking.serverProofConnected !== false,
    evidenceSource: booking.serverProofConnected === true ? "server_truth" : "computed_read_model"
  });
}

function buildCultureSection(context: OnboardingReadinessContext, accountStatus: ReadinessStatus): ReadinessSection {
  const culture = context.culture;
  if (!culture || culture.supported !== true) {
    return buildSection({
      key: "culture",
      status: "not_applicable",
      missingRequirements: culture?.supported === false ? [CULTURE_REQUIREMENTS.supported] : [],
      allowedActions: [],
      blockedActions: [READINESS_ACTIONS.finishCultureRules],
      nextBestAction: READINESS_ACTIONS.finishCultureRules,
      proofConnected: culture?.supported === false,
      evidenceSource: "computed_read_model"
    });
  }

  const missing: OnboardingRequirement[] = [];
  if (accountStatus !== "pass") missing.push(ACCOUNT_REQUIREMENTS.auth);
  if (!hasText(context.username)) missing.push(CULTURE_REQUIREMENTS.username);
  if (culture.profileVisible !== true) missing.push(CULTURE_REQUIREMENTS.visibility);
  if (culture.rulesAccepted !== true) missing.push(CULTURE_REQUIREMENTS.rules);
  if (culture.accountStanding !== "active") missing.push(CULTURE_REQUIREMENTS.standing);
  if (culture.postingSupported === false) missing.push(CULTURE_REQUIREMENTS.supported);

  return buildSection({
    key: "culture",
    status: culture.accountStanding === "blocked" ? "blocked" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.finishCultureRules],
    nextBestAction: actionForMissing(missing, "culture"),
    proofConnected: culture.postingSupported !== false,
    evidenceSource: "computed_read_model"
  });
}

function buildBarberBusinessSection(context: OnboardingReadinessContext, roleScope: RoleScope): ReadinessSection {
  if (roleScope !== "barber") {
    return notApplicableSection("barberBusiness", READINESS_ACTIONS.createBarberRecord);
  }

  const barber = context.barberBusiness ?? {};
  const missing: OnboardingRequirement[] = [];
  if (!hasText(barber.barberRecordId)) missing.push(BARBER_BUSINESS_REQUIREMENTS.barberRecord);
  if (!hasText(barber.displayName)) missing.push(BARBER_BUSINESS_REQUIREMENTS.displayName);
  if (!hasText(barber.username ?? context.username)) missing.push(BARBER_BUSINESS_REQUIREMENTS.username);
  if (!hasText(barber.profilePhotoUrl) && barber.safeProfilePlaceholderAllowed !== true) missing.push(BARBER_BUSINESS_REQUIREMENTS.profile);
  if (!barber.activeServiceCount || barber.activeServiceCount < 1) missing.push(BARBER_BUSINESS_REQUIREMENTS.service);
  if (barber.hasPrice !== true) missing.push(BARBER_BUSINESS_REQUIREMENTS.price);
  if (barber.hasDuration !== true) missing.push(BARBER_BUSINESS_REQUIREMENTS.duration);
  if (barber.hasSchedule !== true) missing.push(BARBER_BUSINESS_REQUIREMENTS.schedule);
  if (!hasText(barber.bookingMode)) missing.push(BARBER_BUSINESS_REQUIREMENTS.bookingMode);

  return buildSection({
    key: "barberBusiness",
    status: statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [READINESS_ACTIONS.createBarberRecord] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.finishPayoutSetup],
    nextBestAction: actionForMissing(missing, "barberBusiness"),
    proofConnected: true,
    evidenceSource: "computed_read_model"
  });
}

function buildPayoutSection(context: OnboardingReadinessContext, roleScope: RoleScope): ReadinessSection {
  if (roleScope !== "barber" && roleScope !== "shop_owner") {
    return notApplicableSection("payout", READINESS_ACTIONS.finishPayoutSetup);
  }

  const payout = context.payout ?? {};
  const missing: OnboardingRequirement[] = [];
  if (payout.paymentLaneSelected !== true) missing.push(PAYOUT_REQUIREMENTS.lane);
  if (payout.providerTruthConnected !== true || payout.frontendOnly === true) missing.push(PAYOUT_REQUIREMENTS.providerTruth);
  if (!hasText(payout.provider)) missing.push(PAYOUT_REQUIREMENTS.provider);
  if (payout.identityVerified !== true) missing.push(PAYOUT_REQUIREMENTS.identity);
  if (!PAYOUT_READY_STATUSES.has(payout.providerPayoutStatus ?? "")) missing.push(PAYOUT_REQUIREMENTS.status);
  if (payout.termsAccepted !== true) missing.push(PAYOUT_REQUIREMENTS.terms);

  const blocked = payout.providerPayoutStatus === "blocked";
  const missingProviderTruth = missing.some((requirement) => requirement.id === PAYOUT_REQUIREMENTS.providerTruth.id);
  return buildSection({
    key: "payout",
    status: blocked ? "blocked" : missingProviderTruth ? "needs_review" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.finishPayoutSetup],
    nextBestAction: actionForMissing(missing, "payout"),
    proofConnected: payout.providerTruthConnected === true && payout.frontendOnly !== true,
    evidenceSource: payout.providerTruthConnected === true && payout.frontendOnly !== true ? "server_truth" : "not_connected"
  });
}

function buildShopSection(context: OnboardingReadinessContext, roleScope: RoleScope): ReadinessSection {
  if (roleScope !== "shop_owner") {
    return notApplicableSection("shop", READINESS_ACTIONS.createShopRecord);
  }

  const shop = context.shop ?? {};
  const missing: OnboardingRequirement[] = [];
  if (shop.ownerAuthority !== true) missing.push(SHOP_REQUIREMENTS.authority);
  if (!hasText(shop.shopRecordId)) missing.push(SHOP_REQUIREMENTS.record);
  if (!hasText(shop.shopName)) missing.push(SHOP_REQUIREMENTS.name);
  if (!hasText(shop.shopUsername)) missing.push(SHOP_REQUIREMENTS.username);
  if (!hasText(shop.location)) missing.push(SHOP_REQUIREMENTS.location);
  if (!hasText(shop.hours)) missing.push(SHOP_REQUIREMENTS.hours);
  if (!shop.chairCount || shop.chairCount < 1) missing.push(SHOP_REQUIREMENTS.chairs);
  if (!hasText(shop.operatingModel)) missing.push(SHOP_REQUIREMENTS.operatingModel);
  if (!hasText(shop.bookingMode)) missing.push(SHOP_REQUIREMENTS.bookingMode);
  if (shop.policiesAccepted !== true) missing.push(SHOP_REQUIREMENTS.policies);
  if (!hasText(shop.paymentModel)) missing.push(SHOP_REQUIREMENTS.paymentModel);
  if (!SHOP_READY_POSTURES.has(shop.verificationPosture ?? "")) missing.push(SHOP_REQUIREMENTS.verification);

  return buildSection({
    key: "shop",
    status: shop.verificationPosture === "blocked" ? "blocked" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [READINESS_ACTIONS.createShopRecord] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.prepareKioskSettings],
    nextBestAction: actionForMissing(missing, "shop"),
    proofConnected: true,
    evidenceSource: "computed_read_model"
  });
}

function buildKioskSection(context: OnboardingReadinessContext, roleScope: RoleScope, shopStatus: ReadinessStatus): ReadinessSection {
  if (roleScope !== "shop_owner") {
    return notApplicableSection("kiosk", READINESS_ACTIONS.prepareKioskSettings);
  }

  const kiosk = context.kiosk ?? {};
  const missing: OnboardingRequirement[] = [];
  if (shopStatus !== "pass") missing.push(KIOSK_REQUIREMENTS.shopReady);
  if (kiosk.shopActive !== true) missing.push(KIOSK_REQUIREMENTS.shopActive);
  if (kiosk.chairsActive !== true) missing.push(KIOSK_REQUIREMENTS.chairs);
  if (kiosk.teamEligible !== true) missing.push(KIOSK_REQUIREMENTS.team);
  if (kiosk.bookingModeSet !== true) missing.push(KIOSK_REQUIREMENTS.bookingMode);
  if (kiosk.walkInModeSet !== true) missing.push(KIOSK_REQUIREMENTS.walkInMode);
  if (kiosk.sessionRules !== true) missing.push(KIOSK_REQUIREMENTS.sessionRules);
  if (kiosk.rotationMode !== true) missing.push(KIOSK_REQUIREMENTS.rotationMode);
  if (kiosk.notificationSetup !== true) missing.push(KIOSK_REQUIREMENTS.notifications);

  return buildSection({
    key: "kiosk",
    status: shopStatus !== "pass" ? "blocked" : statusFromMissing(missing),
    missingRequirements: missing,
    allowedActions: missing.length ? [] : [READINESS_ACTIONS.openHome],
    blockedActions: [READINESS_ACTIONS.prepareKioskSettings],
    nextBestAction: actionForMissing(missing, "kiosk"),
    proofConnected: shopStatus === "pass",
    evidenceSource: "computed_read_model"
  });
}

function buildSection(input: {
  key: ReadinessKey;
  status: ReadinessStatus;
  missingRequirements?: OnboardingRequirement[];
  allowedActions: OnboardingAction[];
  blockedActions: OnboardingAction[];
  nextBestAction: OnboardingAction;
  evidenceSource: ReadinessSection["evidenceSource"];
  proofConnected: boolean;
}): ReadinessSection {
  const meta = READINESS_SECTION_META[input.key];
  return {
    key: input.key,
    level: meta.level,
    label: meta.label,
    status: input.status,
    statusLabel: READINESS_STATUS_LABELS[input.status],
    missingRequirements: input.missingRequirements ?? [],
    allowedActions: input.allowedActions,
    blockedActions: input.blockedActions,
    nextBestAction: input.nextBestAction,
    evidenceSource: input.evidenceSource,
    proofConnected: input.proofConnected
  };
}

function notApplicableSection(key: ReadinessKey, nextBestAction: OnboardingAction): ReadinessSection {
  return buildSection({
    key,
    status: "not_applicable",
    allowedActions: [],
    blockedActions: [],
    nextBestAction,
    evidenceSource: "computed_read_model",
    proofConnected: true
  });
}

function statusFromMissing(missing: OnboardingRequirement[]): ReadinessStatus {
  return missing.length ? "needs_setup" : "pass";
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function actionForMissing(missing: OnboardingRequirement[], key: ReadinessKey): OnboardingAction {
  const first = missing[0];
  if (!first) {
    return READINESS_ACTIONS.openHome;
  }

  if (first.id === ACCOUNT_REQUIREMENTS.auth.id) return READINESS_ACTIONS.authenticate;
  if (first.id === ACCOUNT_REQUIREMENTS.role.id) return READINESS_ACTIONS.chooseRole;
  if (first.id === ACCOUNT_REQUIREMENTS.name.id) return READINESS_ACTIONS.addName;
  if (first.id === ACCOUNT_REQUIREMENTS.username.id || first.id === CULTURE_REQUIREMENTS.username.id) return READINESS_ACTIONS.claimUsername;
  if (first.id === ACCOUNT_REQUIREMENTS.contact.id) return READINESS_ACTIONS.addContact;
  if (first.id === ACCOUNT_REQUIREMENTS.rules.id) return READINESS_ACTIONS.acceptRules;
  if (first.id === BOOKING_REQUIREMENTS.identity.id) return READINESS_ACTIONS.finishBookingIdentity;
  if (first.id === BOOKING_REQUIREMENTS.verifiedPhone.id) return READINESS_ACTIONS.verifyPhone;
  if (first.id === BOOKING_REQUIREMENTS.provider.id) return READINESS_ACTIONS.chooseProvider;
  if (first.id === BOOKING_REQUIREMENTS.service.id) return READINESS_ACTIONS.chooseService;
  if (first.id === BOOKING_REQUIREMENTS.time.id) return READINESS_ACTIONS.chooseTime;
  if (first.id === BOOKING_REQUIREMENTS.payment.id) return READINESS_ACTIONS.addPaymentMethod;
  if (first.id === BOOKING_REQUIREMENTS.policy.id) return READINESS_ACTIONS.acceptBookingPolicy;
  if (first.id.startsWith("culture.")) return READINESS_ACTIONS.finishCultureRules;
  if (first.id === BARBER_BUSINESS_REQUIREMENTS.barberRecord.id || first.id === BARBER_BUSINESS_REQUIREMENTS.displayName.id) return READINESS_ACTIONS.createBarberRecord;
  if (first.id === BARBER_BUSINESS_REQUIREMENTS.service.id || first.id === BARBER_BUSINESS_REQUIREMENTS.price.id || first.id === BARBER_BUSINESS_REQUIREMENTS.duration.id) return READINESS_ACTIONS.addBarberService;
  if (first.id === BARBER_BUSINESS_REQUIREMENTS.schedule.id) return READINESS_ACTIONS.setBarberSchedule;
  if (first.id === BARBER_BUSINESS_REQUIREMENTS.bookingMode.id) return READINESS_ACTIONS.chooseBookingMode;
  if (first.id.startsWith("payout.")) return READINESS_ACTIONS.finishPayoutSetup;
  if (first.id === SHOP_REQUIREMENTS.record.id || first.id === SHOP_REQUIREMENTS.authority.id) return READINESS_ACTIONS.createShopRecord;
  if (first.id === SHOP_REQUIREMENTS.location.id || first.id === SHOP_REQUIREMENTS.hours.id) return READINESS_ACTIONS.addShopLocation;
  if (first.id === SHOP_REQUIREMENTS.policies.id) return READINESS_ACTIONS.finishShopPolicies;
  if (first.id === KIOSK_REQUIREMENTS.team.id) return READINESS_ACTIONS.inviteFirstBarber;
  if (first.id.startsWith("kiosk.")) return READINESS_ACTIONS.prepareKioskSettings;
  if (first.severity === "review") return READINESS_ACTIONS.connectProof;

  if (key === "shop") return READINESS_ACTIONS.createShopRecord;
  if (key === "barberBusiness") return READINESS_ACTIONS.createBarberRecord;
  if (key === "payout") return READINESS_ACTIONS.finishPayoutSetup;
  return READINESS_ACTIONS.connectProof;
}

function getSafeHomeFallback(roleScope: RoleScope): string {
  if (roleScope === "client") return "/client";
  if (roleScope === "barber") return "/barber";
  if (roleScope === "shop_owner") return "/owner";
  if (roleScope === "platform_internal") return "/architect";
  return "/";
}

function canPerformSeriousActions(roleScope: RoleScope, readiness: Record<ReadinessKey, ReadinessSection>): boolean {
  if (roleScope === "client") return readiness.booking.status === "pass";
  if (roleScope === "barber") return readiness.barberBusiness.status === "pass";
  if (roleScope === "shop_owner") return readiness.shop.status === "pass";
  return false;
}

function buildAuditEventHint(context: OnboardingReadinessContext, nextBestAction: OnboardingAction): OnboardingAuditEventHint {
  const eventByActionId: Record<string, OnboardingAuditEventName> = {
    chooseRole: "role_selected",
    authenticate: "auth_completed",
    addName: "name_added",
    claimUsername: "username_created",
    addContact: hasText(context.email) ? "phone_verified" : "email_verified",
    acceptRules: "rules_accepted",
    verifyPhone: "phone_verified",
    finishBookingIdentity: "client_setup_started",
    createBarberRecord: "barber_setup_started",
    createShopRecord: "shop_setup_started",
    openHome: "dashboard_opened"
  };

  return {
    recommendedEvent: eventByActionId[nextBestAction.id] ?? "onboarding_started",
    persistence: context.proof?.eventPersistenceConnected === true ? "platform_events_available" : "typed_hint_only",
    reason: "Readiness engine returns event names only; this PR does not write analytics or audit records."
  };
}
