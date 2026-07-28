export interface KioskShopBranding {
  shopId: string;
  shopName: string;
  subtitle: string;
  locationLabel: string;
  profilePhotoUrl?: string;
  mode?: "shop" | "barber";
}

export interface KioskServiceOption {
  id: string;
  name: string;
  category: string;
  /**
   * The barber's own price, in cents. Optional because a shop can have a
   * service row with no price set — the kiosk then shows the service without a
   * price chip rather than inventing one.
   */
  priceCents?: number | null;
  durationMinutes?: number | null;
  /**
   * Which barber owns this price. The shop kiosk shows each barber their own
   * service list, so a service with no owner is a shop-wide service every
   * chair offers.
   */
  barberId?: string | null;
}

export interface KioskBarberOption {
  id: string;
  /**
   * The barber's real name. The kiosk is a public screen, so this is only ever
   * rendered on the confirmation reveal card, after the client has booked.
   */
  name: string;
  /**
   * The public handle. Everything a walk-up client sees before booking uses
   * this instead of `name`.
   */
  publicUsername?: string | null;
  liveStatusLabel: string;
  nextAvailableAt: string | null;
  acceptsWalkIns: boolean;
  waitDisplayLabel?: string;
  estimatedWaitMinutes?: number | null;
  estimatedStartTime?: string | null;
  /** How many clients are ahead of this chair right now. */
  queueAhead?: number | null;
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
  };
  defaults: {
    /** Success-screen dwell before client data is cleared. */
    autoResetSeconds: number;
    /** No-touch reset window for an in-progress kiosk session. */
    inactivityResetSeconds?: number;
    bookingMode: "next_available";
    appointmentSource?: "shop_kiosk" | "barber_kiosk";
    allowChooseBarber?: boolean;
    supportedActions?: Array<"book_next_opening" | "choose_barber" | "check_in" | "schedule_ahead">;
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
}

export interface KioskClientSearchResult {
  profileId: string;
  displayName: string;
  publicUsername: string | null;
  avatarUrl?: string;
  locationLabel?: string;
  roleLabel: "CLIENT";
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
