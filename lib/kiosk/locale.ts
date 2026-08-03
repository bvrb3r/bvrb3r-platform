/**
 * Kiosk language surface.
 *
 * The kiosk is a public, shared device: a client walks up and must be able to
 * switch to their language from *any* screen, including the fallback screens
 * (loading, recovery, offline, denied, empty) where no shop payload has been
 * fetched yet. Keeping the dictionary here — instead of inside the parity
 * screen — lets every one of those shells read the same copy and lets the
 * language resolver be exercised directly by tests.
 *
 * Copy is transcribed from the approved PR 18 prototypes
 * (`BVRB3R Shop Kiosk.dc.html` / `BVRB3R Barber Kiosk.dc.html`). Where the two
 * prototypes disagree — the chrome badge, the live chip, the PIN title — both
 * variants are kept and the scope picks one. Composed sentences (queue chips,
 * tip tiles, the SMS body, day names) are functions rather than strings so no
 * caller has to concatenate translated fragments by hand.
 *
 * ⚠ The Haitian Creole strings still need a native-speaker pass before launch;
 * they are transcribed verbatim from the approved prototypes, not re-authored.
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
  // Chrome
  badgeShop: string;
  badgeBarber: string;
  liveShop: string;
  liveBarber: string;
  exit: string;
  languageGroup: string;
  largeText: string;

  // Shop front door
  welcomeTo: string;
  pickSub: string;
  fastest: string;
  nextChair: string;
  shortestNow: string;
  go: string;

  // Barber front door
  atChair: string;
  bookWith: string;

  // Paths
  youPicked: string;
  diffBarber: string;
  walkEye: string;
  walkTitle: string;
  walkDesc: string;
  start: string;
  schedEye: string;
  schedTitle: string;
  schedDesc: string;
  browse: string;

  // Schedule
  whenYours: string;
  cont: string;
  back: string;
  backArrow: string;

  // Details
  almost: string;
  yourName: string;
  namePh: string;
  phoneLbl: string;
  emailLbl: string;
  userLbl: string;
  userHint: string;
  wbBack: string;
  wbAuto: string;
  consent: string;
  liveNote: string;
  cancel: string;

  // Tip
  beforeReader: string;
  tipNote: string;

  // Payment choice
  lastStep: string;
  cardUnavailable: string;
  cardUnavailableBody: string;
  cardEye: string;
  tapIns: string;
  cardDesc: string;
  pay: string;
  cashEye: string;
  payChair: string;
  chooseCash: string;

  // Reader / decline
  follow: string;
  followSub: string;
  waiting: string;
  dismiss: string;
  retryCard: string;

  // Celebration
  apptSet: string;
  yourBarber: string;
  doneNext: string;
  smsPreview: string;
  smsFrom: string;
  scanSave: string;

  // Staff exit
  pinTitleShop: string;
  pinTitleBarber: string;
  wrongPin: string;
  stay: string;
  staffExitHint: string;
  pinLabel: string;
  pinPlaceholder: string;
  checking: string;

  /** Non-identifying stand-in for a barber with no public handle. */
  thisChair: string;

  // Attract
  powered: string;
  tapBegin: string;
  resets: string;

  // Fallback shells (no prototype equivalent — these states do not exist in a
  // static prototype but a real kiosk has to survive them)
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
}

export const KIOSK_COPY: Record<KioskLocale, KioskCopy> = {
  en: {
    badgeShop: "Shop kiosk",
    badgeBarber: "Barber kiosk",
    liveShop: "Live floor",
    liveBarber: "Live",
    exit: "Exit",
    languageGroup: "Language",
    largeText: "Toggle large text",

    welcomeTo: "Welcome to",
    pickSub: "Pick your barber — or take the next chair",
    fastest: "Fastest",
    nextChair: "Next available chair",
    shortestNow: "Shortest wait right now:",
    go: "Go →",

    atChair: "You’re at the chair of",
    bookWith: "Book your cut with this barber",

    youPicked: "You picked",
    diffBarber: "← Different barber",
    walkEye: "Walk-in — next opening",
    walkTitle: "Take the next chair",
    walkDesc: "Join the line right now. Estimated wait:",
    start: "Start →",
    schedEye: "Schedule ahead",
    schedTitle: "Pick a future time",
    schedDesc: "Choose a service and lock a slot for later — nothing is booked until you confirm.",
    browse: "Browse times →",

    whenYours: "When should the chair be yours?",
    cont: "Continue →",
    back: "Back",
    backArrow: "← Back",

    almost: "Almost in the chair",
    yourName: "Your name",
    namePh: "First name is fine",
    phoneLbl: "Phone — for your “you’re up” text",
    emailLbl: "Email — for your receipt",
    userLbl: "BVRB3R username — optional",
    userHint: "Optional — add one and you’ll be recognised next time.",
    wbBack: "Welcome back,",
    wbAuto: "— your saved contact info fills in automatically.",
    consent: "This kiosk may use my contact info for this booking only. It doesn’t sign me into a public account or expose my private details.",
    liveNote: "Live · refreshed just now · you confirm before anything is booked",
    cancel: "Cancel & reset",

    beforeReader: "Before the card reader",
    tipNote: "100% of the tip goes to your barber.",

    lastStep: "Last step — payment",
    cardUnavailable: "Card isn’t set up at this kiosk yet",
    cardUnavailableBody: "Nothing was charged and nothing is booked yet. Reserve your spot now and settle up at the chair after the cut.",
    cardEye: "Card — after the cut",
    tapIns: "Tap, insert, or swipe",
    cardDesc: "Your barber charges the card from Checkout when the service is done. Receipt goes to your email.",
    pay: "Pay",
    cashEye: "Cash — after the cut",
    payChair: "Pay at the chair",
    chooseCash: "Choose cash →",

    follow: "Reserving your chair",
    followSub: "Hold tight — we’re locking your spot in the queue.",
    waiting: "Working…",
    dismiss: "Dismiss",
    retryCard: "Try again",

    apptSet: "Appointment set",
    yourBarber: "Your barber",
    doneNext: "Done — next client",
    smsPreview: "Your confirmation text",
    smsFrom: "BVRB3R · just now",
    scanSave: "Scan to save your booking",

    pinTitleShop: "Owner PIN to exit",
    pinTitleBarber: "Barber PIN to exit",
    wrongPin: "Wrong PIN — try again.",
    stay: "Stay in kiosk",
    staffExitHint: "Enter the kiosk PIN to leave public mode.",
    pinLabel: "Kiosk PIN",
    pinPlaceholder: "PIN",
    checking: "Checking…",

    thisChair: "This chair",
    powered: "Powered quietly by BVRB3R",
    tapBegin: "Tap anywhere to begin",
    resets: "Resets between clients — your info never stays on screen",

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
    recoveryMessage: "Your last booking is finished. You can start again in a moment."
  },
  es: {
    badgeShop: "Kiosko de la barbería",
    badgeBarber: "Kiosko del barbero",
    liveShop: "Piso en vivo",
    liveBarber: "En vivo",
    exit: "Salir",
    languageGroup: "Idioma",
    largeText: "Alternar texto grande",

    welcomeTo: "Bienvenido a",
    pickSub: "Elige a tu barbero — o toma la próxima silla",
    fastest: "El más rápido",
    nextChair: "Próxima silla disponible",
    shortestNow: "La espera más corta ahora:",
    go: "Ir →",

    atChair: "Estás en la silla de",
    bookWith: "Reserva tu corte con este barbero",

    youPicked: "Elegiste",
    diffBarber: "← Otro barbero",
    walkEye: "Sin cita — próximo turno",
    walkTitle: "Toma la próxima silla",
    walkDesc: "Únete a la fila ahora. Espera estimada:",
    start: "Empezar →",
    schedEye: "Agenda con tiempo",
    schedTitle: "Elige una hora futura",
    schedDesc: "Elige un servicio y aparta tu lugar — nada se reserva hasta que confirmes.",
    browse: "Ver horarios →",

    whenYours: "¿Cuándo será tuya la silla?",
    cont: "Continuar →",
    back: "Atrás",
    backArrow: "← Atrás",

    almost: "Casi en la silla",
    yourName: "Tu nombre",
    namePh: "Con tu nombre basta",
    phoneLbl: "Teléfono — para avisarte cuando toque",
    emailLbl: "Correo — para tu recibo",
    userLbl: "Usuario BVRB3R — opcional",
    userHint: "Opcional — agrégalo y te reconoceremos la próxima vez.",
    wbBack: "Bienvenido de nuevo,",
    wbAuto: "— tus datos guardados se completan solos.",
    consent: "Este kiosko usará mis datos solo para esta reserva. No inicia sesión en una cuenta pública ni expone mis datos privados.",
    liveNote: "En vivo · actualizado ahora · confirmas antes de reservar",
    cancel: "Cancelar y reiniciar",

    beforeReader: "Antes del lector de tarjetas",
    tipNote: "El 100% de la propina es para tu barbero.",

    lastStep: "Último paso — el pago",
    cardUnavailable: "La tarjeta aún no está activa en este kiosco",
    cardUnavailableBody: "No se cobró nada y todavía no hay reserva. Aparta tu lugar ahora y paga en la silla al terminar el corte.",
    cardEye: "Tarjeta — después del corte",
    tapIns: "Acerca, inserta o desliza",
    cardDesc: "Tu barbero cobra la tarjeta desde Checkout al terminar el servicio. El recibo llega a tu correo.",
    pay: "Paga",
    cashEye: "Efectivo — después del corte",
    payChair: "Paga en la silla",
    chooseCash: "Elegir efectivo →",

    follow: "Reservando tu silla",
    followSub: "Un momento — estamos apartando tu lugar en la fila.",
    waiting: "Procesando…",
    dismiss: "Cerrar",
    retryCard: "Intentar de nuevo",

    apptSet: "Cita confirmada",
    yourBarber: "Tu barbero",
    doneNext: "Listo — siguiente cliente",
    smsPreview: "Tu mensaje de confirmación",
    smsFrom: "BVRB3R · ahora mismo",
    scanSave: "Escanea para guardar tu reserva",

    pinTitleShop: "PIN del dueño para salir",
    pinTitleBarber: "PIN del barbero para salir",
    wrongPin: "PIN incorrecto — inténtalo de nuevo.",
    stay: "Seguir en el kiosko",
    staffExitHint: "Ingresa el PIN del kiosco para salir del modo público.",
    pinLabel: "PIN del kiosco",
    pinPlaceholder: "PIN",
    checking: "Verificando…",

    thisChair: "Esta silla",
    powered: "Impulsado en silencio por BVRB3R",
    tapBegin: "Toca la pantalla para empezar",
    resets: "Se reinicia entre clientes — tu información no se queda en pantalla",

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
    recoveryMessage: "Tu última reserva ya terminó. Puedes empezar de nuevo en un momento."
  },
  ht: {
    badgeShop: "Kyòs boutik la",
    badgeBarber: "Kyòs kwafè a",
    liveShop: "An dirèk",
    liveBarber: "An dirèk",
    exit: "Sòti",
    languageGroup: "Lang",
    largeText: "Chanje gwo tèks",

    welcomeTo: "Byenveni nan",
    pickSub: "Chwazi kwafè ou — oswa pran pwochen chèz la",
    fastest: "Pi rapid",
    nextChair: "Pwochen chèz disponib",
    shortestNow: "Pi kout tan datant kounye a:",
    go: "Ale →",

    atChair: "Ou nan chèz",
    bookWith: "Rezève koup ou ak kwafè sa a",

    youPicked: "Ou chwazi",
    diffBarber: "← Yon lòt kwafè",
    walkEye: "San randevou — pwochen plas",
    walkTitle: "Pran pwochen chèz la",
    walkDesc: "Antre nan liy lan kounye a. Tan datant:",
    start: "Kòmanse →",
    schedEye: "Pran randevou davans",
    schedTitle: "Chwazi yon lè pita",
    schedDesc: "Chwazi yon sèvis epi rezève plas ou — anyen pa rezève jiskaske ou konfime.",
    browse: "Gade lè yo →",

    whenYours: "Ki lè chèz la ap pou ou?",
    cont: "Kontinye →",
    back: "Retounen",
    backArrow: "← Retounen",

    almost: "Ou prèske nan chèz la",
    yourName: "Non ou",
    namePh: "Premye non sifi",
    phoneLbl: "Telefòn — pou mesaj “se tou pa ou” a",
    emailLbl: "Imèl — pou resi ou",
    userLbl: "Non itilizatè BVRB3R — si ou vle",
    userHint: "Si ou vle — mete youn epi n ap rekonèt ou pwochen fwa a.",
    wbBack: "Byenveni ankò,",
    wbAuto: "— enfòmasyon ou anrejistre yo ranpli poukont yo.",
    consent: "Kyòs sa a ka itilize enfòmasyon ou sèlman pou rezèvasyon sa a. Li pa konekte ou nan yon kont piblik ni li pa montre detay prive ou.",
    liveNote: "An dirèk · fèk mete ajou · ou konfime anvan anyen rezève",
    cancel: "Anile epi rekòmanse",

    beforeReader: "Anvan lektè kat la",
    tipNote: "100% poubwa a ale jwenn kwafè ou.",

    lastStep: "Dènye etap — peman",
    cardUnavailable: "Kat la poko aktive nan kyòs sa a",
    cardUnavailableBody: "Nou pa chaje anyen e pa gen rezèvasyon ankò. Rezève plas ou kounye a epi peye nan chèz la apre koup la.",
    cardEye: "Kat — apre koup la",
    tapIns: "Tape, antre, oswa pase l",
    cardDesc: "Kwafè ou a chaje kat la nan Checkout lè sèvis la fini. Resi a ale nan imèl ou.",
    pay: "Peye",
    cashEye: "Kach — apre koup la",
    payChair: "Peye nan chèz la",
    chooseCash: "Chwazi kach →",

    follow: "N ap rezève chèz ou",
    followSub: "Tann yon ti kras — n ap fikse plas ou nan liy lan.",
    waiting: "N ap travay…",
    dismiss: "Fèmen",
    retryCard: "Eseye ankò",

    apptSet: "Randevou pran",
    yourBarber: "Kwafè ou",
    doneNext: "Fini — pwochen kliyan",
    smsPreview: "Mesaj konfimasyon ou",
    smsFrom: "BVRB3R · kounye a",
    scanSave: "Eskane pou sove rezèvasyon ou",

    pinTitleShop: "PIN mèt la pou sòti",
    pinTitleBarber: "PIN kwafè a pou sòti",
    wrongPin: "PIN pa bon — eseye ankò.",
    stay: "Rete nan kyòs la",
    staffExitHint: "Antre PIN kiosk la pou kite mòd piblik la.",
    pinLabel: "PIN kiosk la",
    pinPlaceholder: "PIN",
    checking: "N ap verifye…",

    thisChair: "Chèz sa a",
    powered: "BVRB3R k ap travay an silans",
    tapBegin: "Touche ekran an pou kòmanse",
    resets: "Li reyinisyalize ant kliyan — enfòmasyon ou pa rete sou ekran an",

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
    recoveryMessage: "Dènye rezèvasyon ou fini. Ou ka kòmanse ankò nan yon ti moman."
  }
};

/** Picks one of three translations — the prototypes' `tr(en, es, ht)` helper. */
function tr<T>(locale: KioskLocale, en: T, es: T, ht: T): T {
  return locale === "en" ? en : locale === "es" ? es : ht;
}

export function kioskLoyaltyGateCopy(locale: KioskLocale) {
  return {
    label: tr(locale, "Loyalty check-in", "Registro de lealtad", "Anrejistreman fidelite"),
    reason: tr(locale, "Opening soon", "Próximamente", "Ap ouvri byento"),
    detail: tr(
      locale,
      "Recognize returning clients only after they choose to identify themselves.",
      "Reconoce a clientes frecuentes solo después de que elijan identificarse.",
      "Rekonèt kliyan ki retounen sèlman apre yo chwazi idantifye tèt yo."
    )
  };
}

/** Stand-in for a client who has not typed a name yet. */
export function kioskFriendLabel(locale: KioskLocale) {
  return tr(locale, "friend", "amigo", "zanmi");
}

/**
 * The wait phrase used in chips and the when-card. Zero minutes is "no wait",
 * not "~0 min" — a kiosk that says "~0 min" reads as broken.
 */
export function kioskWaitLabel(locale: KioskLocale, minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return tr(locale, "Live estimate", "Estimación en vivo", "Estimasyon an dirèk");
  }
  if (minutes <= 0) {
    return tr(locale, "no wait", "sin espera", "san tann");
  }
  if (minutes >= 60) {
    return tr(locale, "over 1 hour", "más de 1 hora", "plis pase 1 èdtan");
  }
  return `~${minutes} min`;
}

/** Title-case variant used where the phrase opens a line rather than closing one. */
export function kioskWaitLabelCapitalized(locale: KioskLocale, minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return tr(locale, "Live estimate", "Estimación en vivo", "Estimasyon an dirèk");
  }
  if (minutes <= 0) {
    return tr(locale, "No wait", "Sin espera", "San tann");
  }
  if (minutes >= 60) {
    return tr(locale, "Over 1 hour", "Más de 1 hora", "Plis pase 1 èdtan");
  }
  return tr(locale, `About ${minutes} min`, `Unos ${minutes} min`, `Anviwon ${minutes} min`);
}

/** "2 ahead · ~35 min" / "No wait right now" — the front-door queue chip. */
export function kioskQueueChip(locale: KioskLocale, ahead: number, minutes: number | null | undefined) {
  if (ahead <= 0 && (minutes ?? 0) <= 0) {
    return tr(locale, "No wait right now", "Sin espera ahora", "Pa gen tann kounye a");
  }
  const joiner = tr(locale, " ahead · ", " delante · ", " devan · ");
  return `${ahead}${joiner}${kioskWaitLabel(locale, minutes)}`;
}

/** The per-barber wait chip on the shop front door. */
export function kioskBarberWaitChip(locale: KioskLocale, ahead: number, minutes: number | null | undefined) {
  if ((minutes ?? 0) <= 0) {
    return tr(locale, "No wait", "Sin espera", "San tann");
  }
  const joiner = tr(locale, " ahead · ~", " delante · ~", " devan · ~");
  return `${ahead}${joiner}${minutes} min`;
}

/** "From $20" — the minimum price across a barber's own service list. */
export function kioskFromPriceChip(locale: KioskLocale, amount: string) {
  return `${tr(locale, "From ", "Desde ", "Apati ")}${amount}`;
}

/**
 * "Chair 2" — the non-identifying label for a barber with no public handle.
 * A kiosk must be able to name a chair without naming the person in it.
 */
export function kioskChairLabel(locale: KioskLocale, position: number) {
  return `${tr(locale, "Chair ", "Silla ", "Chèz ")}${position}`;
}

/** "Chair paused" — a barber who is not taking bookings at all. */
export function kioskChairPausedChip(locale: KioskLocale) {
  return tr(locale, "Chair paused", "Silla en pausa", "Chèz an poz");
}

export function kioskShortestWaitLine(locale: KioskLocale, handle: string, minutes: number | null | undefined) {
  return `${handle} · ${kioskWaitLabel(locale, minutes)}`;
}

/** "Pick your service — @handle's prices" */
export function kioskServiceRailLabel(locale: KioskLocale, handle: string) {
  return tr(
    locale,
    `Pick your service — ${handle}’s prices`,
    `Elige tu servicio — precios de ${handle}`,
    `Chwazi sèvis ou — pri ${handle} yo`
  );
}

export function kioskStepLabel(locale: KioskLocale, mode: "next" | "schedule", handle: string) {
  return mode === "next"
    ? `${tr(locale, "Walk-in — next opening with ", "Sin cita — próximo turno con ", "San randevou — pwochen plas ak ")}${handle}`
    : tr(locale, "Step 2 of 2 — your details", "Paso 2 de 2 — tus datos", "Etap 2 sou 2 — enfòmasyon ou");
}

export function kioskTimeEyebrow(locale: KioskLocale, handle: string) {
  return `${tr(locale, "Step 1 of 2 — pick a time with ", "Paso 1 de 2 — elige hora con ", "Etap 1 sou 2 — chwazi lè ak ")}${handle}`;
}

export function kioskConfirmLabel(locale: KioskLocale, mode: "next" | "schedule") {
  return mode === "next"
    ? tr(locale, "Join the line →", "Únete a la fila →", "Antre nan liy lan →")
    : tr(locale, "Confirm this slot →", "Confirmar horario →", "Konfime lè sa a →");
}

export function kioskWhenLabel(locale: KioskLocale, mode: "next" | "schedule") {
  return mode === "next"
    ? tr(locale, "Estimated wait", "Espera estimada", "Tan datant")
    : tr(locale, "Your slot", "Tu horario", "Lè pa ou");
}

export function kioskPickATime(locale: KioskLocale) {
  return tr(locale, "Pick a time", "Elige una hora", "Chwazi yon lè");
}

export function kioskHowPayTitle(locale: KioskLocale, firstName: string) {
  return `${tr(locale, "How would you like to pay, ", "¿Cómo quieres pagar, ", "Kijan ou vle peye, ")}${firstName}?`;
}

export function kioskCashDesc(locale: KioskLocale, handle: string) {
  return tr(
    locale,
    `Your spot locks in now — settle up with ${handle} when the cape comes off.`,
    `Tu lugar queda apartado — paga con ${handle} al quitarte la capa.`,
    `Plas ou rezève kounye a — peye ${handle} lè koup la fini.`
  );
}

export function kioskTipTitle(locale: KioskLocale, handle: string) {
  return tr(locale, `Add a tip for ${handle}?`, `¿Propina para ${handle}?`, `Yon poubwa pou ${handle}?`);
}

export function kioskTipSubLine(locale: KioskLocale, serviceName: string, amount: string) {
  return tr(
    locale,
    `Your ${serviceName} is ${amount}.`,
    `Tu ${serviceName} cuesta ${amount}.`,
    `${serviceName} ou a koute ${amount}.`
  );
}

export function kioskNoTipLabel(locale: KioskLocale) {
  return tr(locale, "No tip", "Sin propina", "San poubwa");
}

export function kioskTipAmountLabel(locale: KioskLocale, amount: string) {
  return `+${amount}${tr(locale, " tip", " propina", " poubwa")}`;
}

export function kioskTotalLabel(locale: KioskLocale, amount: string) {
  return `${tr(locale, "Total ", "Total ", "Total ")}${amount}`;
}

export function kioskYoureInTitle(locale: KioskLocale, firstName: string) {
  return `${tr(locale, "You’re in, ", "Listo, ", "Ou pare, ")}${firstName}`;
}

export function kioskDoneLine(locale: KioskLocale, mode: "next" | "schedule", handle: string, shopName: string) {
  return mode === "next"
    ? tr(
        locale,
        `You’re on ${handle}’s line at ${shopName}. Grab a seat or step out — your spot is safe.`,
        `Estás en la fila de ${handle} en ${shopName}. Toma asiento o sal un momento — tu lugar está seguro.`,
        `Ou nan liy ${handle} nan ${shopName}. Chita oswa fè yon ti soti — plas ou an sekirite.`
      )
    : tr(
        locale,
        `Your chair with ${handle} is locked in. We’ll remind you before it’s time.`,
        `Tu silla con ${handle} está apartada. Te recordaremos antes de la hora.`,
        `Chèz ou ak ${handle} rezève. N ap fè ou sonje anvan lè a.`
      );
}

/** "2 ahead of you · ~35 min" — the celebration "when" chip for a walk-in. */
export function kioskDoneWhenWalkIn(locale: KioskLocale, ahead: number, minutes: number | null | undefined) {
  return `${ahead}${tr(locale, " ahead of you · ", " delante de ti · ", " devan ou · ")}${kioskWaitLabel(locale, minutes)}`;
}

export function kioskWellText(locale: KioskLocale, phone: string) {
  const target = phone.trim() || tr(locale, "your phone", "tu teléfono", "telefòn ou");
  return `${tr(locale, "We’ll text ", "Te escribiremos al ", "N ap voye yon mesaj nan ")}${target}${tr(
    locale,
    " when the chair is almost yours.",
    " cuando la silla esté casi lista.",
    " lè chèz la prèske pare."
  )}`;
}

/**
 * The card chip on the celebration screen. BVRB3R does not charge at the
 * kiosk — the barber charges from Checkout after the service — so this never
 * claims money moved. It states the plan the client chose, plus the tip they
 * pre-authorised, which is the truthful version of the prototype's
 * "Paid $48 · inc. $8 tip ✓".
 */
export function kioskPayChip(
  locale: KioskLocale,
  method: "card" | "cash",
  totalLabel: string,
  tipLabel: string | null
) {
  if (method === "cash") {
    return tr(locale, "Cash after the service", "Efectivo después del servicio", "Kach apre sèvis la");
  }
  const head = `${tr(locale, "Card after the service · ", "Tarjeta después del servicio · ", "Kat apre sèvis la · ")}${totalLabel}`;
  if (!tipLabel) {
    return head;
  }
  return `${head}${tr(locale, ` · inc. ${tipLabel} tip`, ` · incl. ${tipLabel} propina`, ` · ak ${tipLabel} poubwa`)}`;
}

/**
 * The SMS body previewed on the celebration screen. It mirrors what the
 * confirmation text will say, so the copy has to compose in the client's
 * language rather than being stitched from English fragments.
 */
export function kioskSmsBody(locale: KioskLocale, input: {
  firstName: string;
  serviceName: string;
  handle: string;
  whenLabel: string;
  reference: string;
}) {
  const { firstName, serviceName, handle, whenLabel, reference } = input;
  return tr(
    locale,
    `BVRB3R: You’re in, ${firstName}! ${serviceName} with ${handle} — ${whenLabel}. Ref ${reference}. We’ll text when it’s almost your turn.`,
    `BVRB3R: ¡Listo, ${firstName}! ${serviceName} con ${handle} — ${whenLabel}. Ref ${reference}. Te avisaremos cuando falte poco.`,
    `BVRB3R: Ou pare, ${firstName}! ${serviceName} ak ${handle} — ${whenLabel}. Ref ${reference}. N ap voye mesaj lè li prèske tou pa ou.`
  );
}

export interface KioskAttractSlide {
  eyebrow: string;
  big: string;
  sub: string;
}

/**
 * Four rotating attract slides per scope, straight from the prototypes. The
 * shop deck names the floor and the fastest chair; the barber deck speaks for
 * one chair only.
 */
export function kioskAttractSlides(
  locale: KioskLocale,
  scope: "shop" | "barber",
  input: { displayName: string; barberCount: number; fastestHandle: string; fastestWaitMinutes: number | null }
): KioskAttractSlide[] {
  const { displayName, barberCount, fastestHandle, fastestWaitMinutes } = input;
  const shortest = kioskWaitLabel(locale, fastestWaitMinutes);

  if (scope === "barber") {
    return tr<KioskAttractSlide[]>(
      locale,
      [
        { eyebrow: "You’re at the chair of", big: displayName, sub: "Book your cut with this barber" },
        { eyebrow: "Walk in", big: "Take the next chair", sub: `Shortest wait: ${shortest}` },
        { eyebrow: "Or plan ahead", big: "Pick a future time", sub: "Nothing is booked until you confirm" },
        { eyebrow: "Ready when you are", big: "Walk in. Book it. Sit down", sub: "Tap anywhere to begin" }
      ],
      [
        { eyebrow: "Estás en la silla de", big: displayName, sub: "Reserva tu corte con este barbero" },
        { eyebrow: "Sin cita", big: "Toma la próxima silla", sub: `Espera más corta: ${shortest}` },
        { eyebrow: "O agenda", big: "Elige una hora futura", sub: "Nada se reserva hasta que confirmes" },
        { eyebrow: "Cuando quieras", big: "Llega. Reserva. Siéntate", sub: "Toca la pantalla para empezar" }
      ],
      [
        { eyebrow: "Ou nan chèz", big: displayName, sub: "Rezève koup ou ak kwafè sa a" },
        { eyebrow: "San randevou", big: "Pran pwochen chèz la", sub: `Pi kout tan: ${shortest}` },
        { eyebrow: "Oswa pran davans", big: "Chwazi yon lè pita", sub: "Anyen pa rezève jiskaske ou konfime" },
        { eyebrow: "Lè ou pare", big: "Antre. Rezève. Chita", sub: "Touche ekran an pou kòmanse" }
      ]
    );
  }

  return tr<KioskAttractSlide[]>(
    locale,
    [
      { eyebrow: "Welcome to", big: displayName, sub: `${barberCount} barbers on the floor — pick yours` },
      { eyebrow: "Your call", big: "Pick your barber, or take the next chair", sub: `Shortest wait: ${fastestHandle} · ${shortest}` },
      { eyebrow: "Fair and square", big: "Every barber, their own prices", sub: "You see the price before you confirm" },
      { eyebrow: "Ready when you are", big: "Walk in. Book it. Sit down", sub: "Tap anywhere to begin" }
    ],
    [
      { eyebrow: "Bienvenido a", big: displayName, sub: `${barberCount} barberos en el piso — elige el tuyo` },
      { eyebrow: "Tú decides", big: "Elige a tu barbero, o toma la próxima silla", sub: `Espera más corta: ${fastestHandle} · ${shortest}` },
      { eyebrow: "Justo y claro", big: "Cada barbero, sus propios precios", sub: "Ves el precio antes de confirmar" },
      { eyebrow: "Cuando quieras", big: "Llega. Reserva. Siéntate", sub: "Toca la pantalla para empezar" }
    ],
    [
      { eyebrow: "Byenveni nan", big: displayName, sub: `${barberCount} kwafè sou plas — chwazi pa ou a` },
      { eyebrow: "Ou deside", big: "Chwazi kwafè ou, oswa pran pwochen chèz la", sub: `Pi kout tan: ${fastestHandle} · ${shortest}` },
      { eyebrow: "Klè e jis", big: "Chak kwafè, pri pa yo", sub: "Ou wè pri a anvan ou konfime" },
      { eyebrow: "Lè ou pare", big: "Antre. Rezève. Chita", sub: "Touche ekran an pou kòmanse" }
    ]
  );
}
