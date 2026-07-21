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
}

export interface KioskBarberOption {
  id: string;
  name: string;
  liveStatusLabel: string;
  nextAvailableAt: string | null;
  acceptsWalkIns: boolean;
  waitDisplayLabel?: string;
  estimatedWaitMinutes?: number | null;
  estimatedStartTime?: string | null;
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
