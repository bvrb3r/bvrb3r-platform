export const READINESS_LEVELS = [
  "public_guest_ready",
  "browse_ready",
  "account_ready",
  "booking_ready",
  "culture_ready",
  "barber_business_ready",
  "payout_ready",
  "shop_ready",
  "kiosk_ready"
] as const;

export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

export type ReadinessKey =
  | "publicGuest"
  | "browse"
  | "account"
  | "booking"
  | "culture"
  | "barberBusiness"
  | "payout"
  | "shop"
  | "kiosk";

export const READINESS_STATUS_VALUES = ["pass", "needs_setup", "blocked", "needs_review", "not_applicable"] as const;
export type ReadinessStatus = (typeof READINESS_STATUS_VALUES)[number];

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  pass: "Ready",
  needs_setup: "Needs setup",
  blocked: "Blocked",
  needs_review: "Needs review",
  not_applicable: "Not applicable"
};

export type RoleScope = "guest" | "client" | "barber" | "shop_owner" | "platform_internal" | "unknown";
export type PublicAccountRole = "client_user" | "barber_user" | "shop_owner_user";

export type MoreSubtitle =
  | "BVRB3R App Settings"
  | "Client Content Creator Settings"
  | "Barber Business Settings"
  | "SHOP BUSINESS SETTINGS"
  | "Payments & Banking"
  | "Compliance & Security"
  | "Support"
  | "Account session";

export type RequirementSeverity = "critical" | "setup" | "review";

export type OnboardingRequirement = {
  id: string;
  label: string;
  description: string;
  severity: RequirementSeverity;
  critical: boolean;
  moreSubtitle?: MoreSubtitle;
};

export type OnboardingAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  moreSubtitle?: MoreSubtitle;
};

export type OnboardingAuditEventName =
  | "onboarding_started"
  | "intent_selected"
  | "source_channel_selected"
  | "role_selected"
  | "auth_completed"
  | "name_added"
  | "username_created"
  | "phone_verified"
  | "email_verified"
  | "location_selected"
  | "notification_permission_granted"
  | "rules_accepted"
  | "client_setup_started"
  | "barber_setup_started"
  | "shop_setup_started"
  | "onboarding_completed"
  | "dashboard_opened"
  | "first_action_completed";

export type OnboardingAuditEventHint = {
  recommendedEvent: OnboardingAuditEventName;
  persistence: "typed_hint_only" | "platform_events_available";
  reason: string;
};

export type BookingReadinessContext = {
  selectedProviderId?: string | null;
  selectedShopId?: string | null;
  selectedServiceId?: string | null;
  selectedTime?: string | null;
  paymentRequired?: boolean;
  paymentMethodReference?: string | null;
  policyAccepted?: boolean;
  verifiedPhoneRequired?: boolean;
  appointmentCreated?: boolean;
  clientCanReadAppointment?: boolean;
  barberCanReadAppointment?: boolean;
  serverProofConnected?: boolean;
};

export type CultureReadinessContext = {
  supported?: boolean;
  postingSupported?: boolean;
  profileVisible?: boolean;
  rulesAccepted?: boolean;
  accountStanding?: "active" | "limited" | "blocked" | "unknown" | null;
};

export type BarberBusinessReadinessContext = {
  barberRecordId?: string | null;
  displayName?: string | null;
  username?: string | null;
  profilePhotoUrl?: string | null;
  safeProfilePlaceholderAllowed?: boolean;
  specialties?: string[];
  activeServiceCount?: number;
  hasPrice?: boolean;
  hasDuration?: boolean;
  hasSchedule?: boolean;
  bookingMode?: string | null;
  businessGoal?: string | null;
};

export type PayoutReadinessContext = {
  paymentLaneSelected?: boolean;
  provider?: "stripe" | "square" | string | null;
  providerTruthConnected?: boolean;
  identityVerified?: boolean;
  providerPayoutStatus?: "ready" | "enabled" | "verified" | "incomplete" | "blocked" | "unknown" | null;
  termsAccepted?: boolean;
  frontendOnly?: boolean;
};

export type ShopReadinessContext = {
  ownerAuthority?: boolean;
  shopRecordId?: string | null;
  shopName?: string | null;
  shopUsername?: string | null;
  location?: string | null;
  hours?: string | null;
  chairCount?: number;
  operatingModel?: string | null;
  bookingMode?: string | null;
  policiesAccepted?: boolean;
  paymentModel?: string | null;
  verificationPosture?: "verified" | "approved" | "active" | "pending" | "blocked" | "unknown" | null;
};

export type KioskReadinessContext = {
  shopActive?: boolean;
  chairsActive?: boolean;
  teamEligible?: boolean;
  bookingModeSet?: boolean;
  walkInModeSet?: boolean;
  sessionRules?: boolean;
  rotationMode?: boolean;
  notificationSetup?: boolean;
};

export type OnboardingReadinessContext = {
  role?: string | null;
  authenticated?: boolean;
  authMethodConnected?: boolean;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  termsAccepted?: boolean;
  trustRulesAccepted?: boolean;
  sessionRepresented?: boolean;
  sourceChannel?: string | null;
  intent?: string | null;
  city?: string | null;
  location?: string | null;
  notificationPermissionGranted?: boolean;
  booking?: BookingReadinessContext;
  culture?: CultureReadinessContext;
  barberBusiness?: BarberBusinessReadinessContext;
  payout?: PayoutReadinessContext;
  shop?: ShopReadinessContext;
  kiosk?: KioskReadinessContext;
  proof?: {
    serverTruthConnected?: boolean;
    eventPersistenceConnected?: boolean;
    evidenceSource?: string;
  };
};

export type ReadinessSection = {
  key: ReadinessKey;
  level: ReadinessLevel;
  label: string;
  status: ReadinessStatus;
  statusLabel: string;
  missingRequirements: OnboardingRequirement[];
  allowedActions: OnboardingAction[];
  blockedActions: OnboardingAction[];
  nextBestAction: OnboardingAction;
  evidenceSource: "computed_read_model" | "server_truth" | "not_connected";
  proofConnected: boolean;
};

export type OnboardingReadinessResult = {
  roleScope: RoleScope;
  currentHighestReadiness: ReadinessLevel;
  currentHighestReadinessLabel: string;
  readiness: Record<ReadinessKey, ReadinessSection>;
  progressPercent: number;
  missingCriticalRequirements: OnboardingRequirement[];
  nextBestAction: OnboardingAction;
  safeHomeFallback: string;
  canEnterDashboard: boolean;
  canPerformSeriousActions: boolean;
  auditEventHint: OnboardingAuditEventHint;
};
