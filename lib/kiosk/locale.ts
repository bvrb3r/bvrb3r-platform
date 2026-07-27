/**
 * Kiosk language surface.
 *
 * The kiosk is a public, shared device: a client walks up and must be able to
 * switch to their language from *any* screen, including the fallback screens
 * (loading, recovery, offline, denied, empty) where no shop payload has been
 * fetched yet. Keeping the dictionary here — instead of inside the parity
 * screen — lets every one of those shells read the same copy and lets the
 * language resolver be exercised directly by tests.
 */

export type KioskLocale = "en" | "es" | "ht";

export const KIOSK_LOCALES: readonly KioskLocale[] = ["en", "es", "ht"] as const;

export const DEFAULT_KIOSK_LOCALE: KioskLocale = "en";

/** Short switch labels. `ht` is shown as KRE so Kreyòl speakers recognise it. */
export const KIOSK_LOCALE_SWITCH_LABEL: Record<KioskLocale, string> = {
  en: "EN",
  es: "ES",
  ht: "KRE"
};

/** Endonyms — a language picker should always name languages in themselves. */
export const KIOSK_LOCALE_NAME: Record<KioskLocale, string> = {
  en: "English",
  es: "Español",
  ht: "Kreyòl"
};

/**
 * Accepts anything a `?lang=` query string might realistically carry — a bare
 * tag, a region-qualified tag, or the language's own name — and falls back to
 * English rather than throwing, because a bad query string must never take the
 * kiosk down.
 */
export function resolveKioskLocale(value: string | string[] | undefined | null): KioskLocale {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  if (!raw) {
    return DEFAULT_KIOSK_LOCALE;
  }

  const base = raw.split(/[-_]/)[0];
  if (base === "es" || base === "espanol" || base === "español") {
    return "es";
  }
  if (base === "ht" || base === "kre" || base === "kreyol" || base === "kreyòl" || base === "haitian") {
    return "ht";
  }
  if (base === "en" || base === "english") {
    return "en";
  }

  return DEFAULT_KIOSK_LOCALE;
}

export interface KioskCopy {
  live: string;
  liveFloor: string;
  shopKiosk: string;
  barberKiosk: string;
  next: string;
  pick: string;
  future: string;
  choose: string;
  details: string;
  service: string;
  schedule: string;
  payment: string;
  card: string;
  cash: string;
  confirm: string;
  consent: string;
  reserved: string;
  success: string;
  tap: string;
  privacy: string;
  back: string;
  loading: string;
  loadingMessage: string;
  offline: string;
  offlineMessage: string;
  retry: string;
  empty: string;
  emptyMessage: string;
  denied: string;
  deniedMessage: string;
  recovery: string;
  recoveryMessage: string;
  languageGroup: string;
  largeText: string;
  exit: string;
  staffExit: string;
  staffExitHint: string;
  pinLabel: string;
  pinPlaceholder: string;
  cancel: string;
  checking: string;
}

export const KIOSK_COPY: Record<KioskLocale, KioskCopy> = {
  en: {
    live: "Live",
    liveFloor: "Live floor",
    shopKiosk: "Shop kiosk",
    barberKiosk: "Barber kiosk",
    next: "Take the next chair",
    pick: "Pick a Barber",
    future: "Pick a future time",
    choose: "Choose your Barber",
    details: "Tell us where to send your updates",
    service: "Pick your service",
    schedule: "Choose your time",
    payment: "How will you pay after the service?",
    card: "Card after the cut",
    cash: "Cash after the cut",
    confirm: "Reserve my spot",
    consent: "I accept the kiosk booking policy and current Terms and Privacy Policy.",
    reserved: "Booking confirmed",
    success: "Appointment booked",
    tap: "Tap anywhere to begin",
    privacy: "Resets between clients — your information never stays on screen.",
    back: "Back",
    loading: "Loading kiosk…",
    loadingMessage: "Getting today’s chairs, services, and wait times.",
    offline: "You’re offline",
    offlineMessage: "Reconnect to continue, or retry once your connection is back.",
    retry: "Retry",
    empty: "No kiosk options available",
    emptyMessage: "This kiosk is temporarily empty. Please check with staff or try again soon.",
    denied: "Access denied",
    deniedMessage: "This kiosk isn’t currently authorized for booking.",
    recovery: "We’re resetting the kiosk",
    recoveryMessage: "Your last booking is finished. You can start again in a moment.",
    languageGroup: "Language",
    largeText: "Toggle large text",
    exit: "Exit kiosk",
    staffExit: "Staff exit",
    staffExitHint: "Enter the kiosk PIN to leave public mode.",
    pinLabel: "Kiosk PIN",
    pinPlaceholder: "PIN",
    cancel: "Cancel",
    checking: "Checking…"
  },
  es: {
    live: "En vivo",
    liveFloor: "Piso en vivo",
    shopKiosk: "Kiosco de la barbería",
    barberKiosk: "Kiosco del barbero",
    next: "Tomar la próxima silla",
    pick: "Elegir un barbero",
    future: "Elegir una hora futura",
    choose: "Elige tu barbero",
    details: "Dinos dónde enviar tus actualizaciones",
    service: "Elige tu servicio",
    schedule: "Elige tu hora",
    payment: "¿Cómo pagarás después del servicio?",
    card: "Tarjeta después del corte",
    cash: "Efectivo después del corte",
    confirm: "Reservar mi lugar",
    consent: "Acepto la política de reserva, los Términos y la Política de Privacidad.",
    reserved: "Reserva confirmada",
    success: "Cita reservada",
    tap: "Toca para comenzar",
    privacy: "Se reinicia entre clientes — tu información no queda en pantalla.",
    back: "Atrás",
    loading: "Cargando kiosco…",
    loadingMessage: "Buscando las sillas, los servicios y los tiempos de espera de hoy.",
    offline: "Estás sin conexión",
    offlineMessage: "Vuelve a conectar para continuar o intenta de nuevo cuando tu conexión vuelva.",
    retry: "Reintentar",
    empty: "No hay opciones de kiosco disponibles",
    emptyMessage: "Este kiosco está vacío por el momento. Consulta con el personal o inténtalo más tarde.",
    denied: "Acceso denegado",
    deniedMessage: "Este kiosco no está autorizado para reservar en este momento.",
    recovery: "Estamos reiniciando el kiosco",
    recoveryMessage: "Tu última reserva ya terminó. Puedes empezar de nuevo en un momento.",
    languageGroup: "Idioma",
    largeText: "Alternar texto grande",
    exit: "Salir del kiosco",
    staffExit: "Salida del personal",
    staffExitHint: "Ingresa el PIN del kiosco para salir del modo público.",
    pinLabel: "PIN del kiosco",
    pinPlaceholder: "PIN",
    cancel: "Cancelar",
    checking: "Verificando…"
  },
  ht: {
    live: "An dirèk",
    liveFloor: "Etaj an dirèk",
    shopKiosk: "Kiosk boutik la",
    barberKiosk: "Kiosk babè a",
    next: "Pran pwochen chèz la",
    pick: "Chwazi yon babè",
    future: "Chwazi yon lè pita",
    choose: "Chwazi babè ou",
    details: "Di nou kote pou nou voye mizajou yo",
    service: "Chwazi sèvis ou",
    schedule: "Chwazi lè ou",
    payment: "Kijan w ap peye apre sèvis la?",
    card: "Kat apre koupe a",
    cash: "Lajan kach apre koupe a",
    confirm: "Rezève plas mwen",
    consent: "Mwen aksepte règleman rezèvasyon, Kondisyon yo ak Règleman Konfidansyalite a.",
    reserved: "Rezèvasyon konfime",
    success: "Randevou rezève",
    tap: "Tape nenpòt kote pou kòmanse",
    privacy: "Li efase ant kliyan — enfòmasyon ou pa rete sou ekran an.",
    back: "Retounen",
    loading: "Kiosk la chaje…",
    loadingMessage: "N ap chèche chèz, sèvis ak tan datant jodi a.",
    offline: "Ou pa konekte",
    offlineMessage: "Rekonekte pou kontinye, oswa eseye ankò lè koneksyon ou retounen.",
    retry: "Eseye ankò",
    empty: "Pa gen opsyon kiosk ki disponib",
    emptyMessage: "Kiosk sa a vid pou kounye a. Tcheke ak ekip la oswa eseye ankò pita.",
    denied: "Aksè refize",
    deniedMessage: "Kiosk sa a pa otorize pou rezève kounye a.",
    recovery: "Nou retabli kiosk la",
    recoveryMessage: "Dènye rezèvasyon ou fini. Ou ka kòmanse ankò nan yon ti moman.",
    languageGroup: "Lang",
    largeText: "Chanje gwo tèks",
    exit: "Soti nan kiosk la",
    staffExit: "Sòti pou ekip la",
    staffExitHint: "Antre PIN kiosk la pou kite mòd piblik la.",
    pinLabel: "PIN kiosk la",
    pinPlaceholder: "PIN",
    cancel: "Anile",
    checking: "N ap verifye…"
  }
};
