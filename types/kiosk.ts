export type KioskScope = "shop" | "barber";

export type AppointmentSource =
  | "bvrb3r_marketplace"
  | "barber_booking_link"
  | "shop_booking_link"
  | "shop_kiosk"
  | "barber_kiosk"
  | "walk_in_queue"
  | "qr_code"
  | "rebook"
  | "favorite_barber"
  | "referral"
  | "waitlist"
  | "chairfill"
  | "message"
  | "culture_post"
  | "shop_owner"
  | "barber_created"
  | "booksy"
  | "square"
  | "thecut"
  | "external_calendar"
  | "manual_unpaid";

export type PaymentOwner = "bvrb3r" | "booksy" | "square" | "thecut" | "external_provider" | "none";

export type KioskIdentityState = "external_guest" | "bvrb3r_guest" | "verified_bvrb3r_client";

export type ClientBridgeStage =
  | "external_appointment"
  | "arrived"
  | "guest_checked_in"
  | "invitation_offered"
  | "invitation_opened"
  | "identity_verified"
  | "account_activated"
  | "barber_favorited"
  | "first_native_booking"
  | "first_native_payment"
  | "converted"
  | "retained";

export type QueueLifecycleState =
  | "created"
  | "waiting"
  | "almost_ready"
  | "ready"
  | "checked_in"
  | "in_chair"
  | "awaiting_checkout"
  | "completed"
  | "canceled"
  | "no_show"
  | "removed";

export type NotificationDeliveryState = "queued" | "sent" | "delivered" | "failed" | "opened" | "clicked" | "opted_out";

export interface KioskShopBranding {
  shopId: string;
  shopName: string;
  subtitle: string;
  locationLabel: string;
  profilePhotoUrl?: string;
  mode?: KioskScope;
  shopStatus?: "open" | "closed" | "maintenance" | "walk_ins_paused";
  supportPhone?: string | null;
}

export interface KioskServiceOption {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  durationMinutes?: number | null;
  priceCents?: number | null;
  currency?: string;
  cashAllowed?: boolean;
  cardAllowed?: boolean;
  fullPrepayRequired?: boolean;
}

export interface KioskBarberOption {
  id: string;
  name: string;
  publicUsername?: string | null;
  profilePhotoUrl?: string | null;
  liveStatusLabel: string;
  nextAvailableAt: string | null;
  acceptsWalkIns: boolean;
  waitDisplayLabel?: string;
  estimatedWaitMinutes?: number | null;
  estimatedStartTime?: string | null;
  serviceIds?: string[];
  sourceCoverage?: AppointmentSource[];
}

export interface KioskPayload {
  shop: KioskShopBranding;
  services: KioskServiceOption[];
  barbers: KioskBarberOption[];
  queue: {
    activeCount: number;
    averageWaitMinutes: number;
    kioskEntriesToday: number;
    waitEstimateUpdatedAt?: string;
    capacityState?: "available" | "near_capacity" | "full";
  };
  chairSync?: {
    enabled: boolean;
    connectedSources: AppointmentSource[];
    lastSyncedAt?: string | null;
    conflictCount?: number;
    completeDoubleBookingProtection?: boolean;
  };
  defaults: {
    autoResetSeconds: number;
    bookingMode: "next_available";
    appointmentSource?: "shop_kiosk" | "barber_kiosk";
    allowChooseBarber?: boolean;
    allowGuestCheckIn?: boolean;
    supportedActions?: Array<"book_next_opening" | "choose_barber" | "check_in" | "schedule_ahead" | "scan_qr" | "enter_confirmation_code">;
  };
}

export interface KioskBookingInput {
  fullName?: string;
  phone?: string;
  email?: string;
  publicUsername?: string;
  selectedProfileId?: string;
  serviceId: string;
  preferredBarberId?: string;
  kioskAction?: "book_next_opening" | "schedule_ahead";
  scheduledAt?: string;
  paymentIntention?: "card_after_service" | "cash_after_service" | "saved_card" | "prepay";
  transactionalSmsConsent?: boolean;
  transactionalEmailConsent?: boolean;
  marketingConsent?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  shopPolicyVersion?: string;
  idempotencyKey?: string;
}

export interface KioskAppointmentSearchInput {
  phone?: string;
  email?: string;
  fullName?: string;
  startsAt?: string;
  confirmationCode?: string;
}

export interface KioskAppointmentSearchResult {
  appointmentId: string;
  appointmentKind: "native" | "external";
  source: AppointmentSource;
  sourceLabel: string;
  paymentOwner: PaymentOwner;
  paymentOwnerLabel: string;
  clientDisplayName: string;
  barberId: string;
  barberName: string;
  serviceId?: string | null;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  maskedPhone?: string | null;
  maskedEmail?: string | null;
  providerOpenUrl?: string | null;
  alreadyCheckedIn: boolean;
  canContinueAsGuest: boolean;
  clientBridgeStage?: ClientBridgeStage | null;
}

export interface KioskAppointmentSearchResponse {
  results: KioskAppointmentSearchResult[];
  queryFingerprint: string;
  sourceCoverage: AppointmentSource[];
}

export interface KioskCheckInInput {
  appointmentId: string;
  appointmentKind: "native" | "external";
  continueAs: "guest" | "verified_client" | "join_bvrb3r";
  selectedProfileId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  transactionalSmsConsent?: boolean;
  transactionalEmailConsent?: boolean;
  marketingConsent?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  shopPolicyVersion?: string;
  idempotencyKey: string;
}

export interface KioskCheckInResult {
  guestVisitId: string;
  queueEntryId?: string | null;
  queueReference: string;
  queueStatus: QueueLifecycleState;
  identityState: KioskIdentityState;
  appointment: KioskAppointmentSearchResult;
  estimatedWaitMinutes?: number | null;
  waitDisplayLabel?: string | null;
  notificationStates: Array<{
    channel: "sms" | "email" | "push" | "in_app";
    state: NotificationDeliveryState;
  }>;
  clientBridgeInvitation?: {
    invitationId: string;
    stage: ClientBridgeStage;
    expiresAt: string;
  } | null;
}

export interface ClientBridgeInvitationInput {
  guestVisitId: string;
  channel: "onscreen" | "sms" | "email" | "qr" | "nfc" | "barber_assisted";
  phone?: string;
  email?: string;
  consentGranted: boolean;
  conversionTouchpoint: string;
}

export interface ClientBridgeInvitationResult {
  invitationId: string;
  status: "offered" | "sent" | "delivered" | "failed";
  maskedDestination?: string | null;
  activationPath: string;
  expiresAt: string;
}

export interface ClientBridgeActivationInput {
  token: string;
  verificationMethod: "sms" | "email";
  verificationCode?: string;
  username?: string;
  favoriteBarber?: boolean;
  followShop?: boolean;
  transactionalSmsConsent?: boolean;
  transactionalEmailConsent?: boolean;
  marketingConsent?: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface ClientBridgeActivationResult {
  status: "verification_required" | "activated" | "expired" | "already_used";
  invitationId: string;
  profileId?: string;
  clientId?: string;
  publicUsername?: string;
  nextPath?: string;
}

export interface KioskQueueStatusResult {
  queueReference: string;
  status: QueueLifecycleState;
  position?: number | null;
  estimatedWaitMinutes?: number | null;
  waitDisplayLabel?: string | null;
  barber: {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
  };
  service: {
    id?: string | null;
    name: string;
  };
  source: AppointmentSource;
  sourceLabel: string;
  paymentOwner: PaymentOwner;
  paymentOwnerLabel: string;
  updatedAt: string;
  readyGraceEndsAt?: string | null;
  activationReminderAvailable: boolean;
}

export interface KioskWaitlistInput {
  fullName: string;
  phone: string;
  email?: string;
  serviceId?: string;
}

export interface KioskBookingResult {
  appointmentId: string;
  confirmationCode?: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  shopLabel: string;
  clientPublicUsername?: string;
  activationInviteQueued?: boolean;
  estimatedWaitMinutes?: number | null;
  estimatedStartTime?: string | null;
  waitDisplayLabel?: string;
  source?: AppointmentSource;
  paymentOwner?: PaymentOwner;
  queueReference?: string;
  guestVisitId?: string;
}

export interface KioskClientSearchResult {
  profileId: string;
  displayName: string;
  publicUsername: string | null;
  avatarUrl?: string;
  locationLabel?: string;
  roleLabel: "CLIENT";
  maskedPhone?: string | null;
  maskedEmail?: string | null;
  verificationRequired?: boolean;
}

export interface KioskWaitlistResult {
  entryId: string;
  queuePosition: number;
  statusLabel: string;
  estimatedWaitMinutes: number;
  bestBarberName?: string;
  bestBarberStatusLabel?: string;
  shopLabel: string;
}
