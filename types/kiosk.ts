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
}

export interface KioskPayload {
  shop: KioskShopBranding;
  services: KioskServiceOption[];
  barbers: KioskBarberOption[];
  queue: {
    activeCount: number;
    averageWaitMinutes: number;
    kioskEntriesToday: number;
  };
  defaults: {
    autoResetSeconds: number;
    bookingMode: "next_available";
    appointmentSource?: "shop_kiosk" | "barber_kiosk";
    allowChooseBarber?: boolean;
  };
}

export interface KioskBookingInput {
  fullName: string;
  phone: string;
  email?: string;
  serviceId: string;
  preferredBarberId?: string;
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
