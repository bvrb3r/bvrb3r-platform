"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { KioskExitDialog } from "@/components/kiosk/kiosk-exit-dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import {
  useKioskBookingMutation,
  useKioskClientSearchQuery,
  useKioskDeviceState,
  useKioskPayloadQuery,
  useVerifyKioskPinMutation
} from "@/lib/kiosk/client";
import {
  DEFAULT_KIOSK_LOCALE,
  KIOSK_COPY,
  KIOSK_LOCALES,
  KIOSK_LOCALE_NAME,
  KIOSK_LOCALE_SWITCH_LABEL,
  kioskAttractSlides,
  kioskBarberWaitChip,
  kioskCashDesc,
  kioskChairLabel,
  kioskChairPausedChip,
  kioskConfirmLabel,
  kioskDoneLine,
  kioskDoneWhenWalkIn,
  kioskFriendLabel,
  kioskFromPriceChip,
  kioskHowPayTitle,
  kioskNoTipLabel,
  kioskPayChip,
  kioskPickATime,
  kioskQueueChip,
  kioskServiceRailLabel,
  kioskShortestWaitLine,
  kioskSmsBody,
  kioskStepLabel,
  kioskTimeEyebrow,
  kioskTipAmountLabel,
  kioskTipSubLine,
  kioskTipTitle,
  kioskTotalLabel,
  kioskWaitLabel,
  kioskWaitLabelCapitalized,
  kioskWellText,
  kioskWhenLabel,
  kioskYoureInTitle,
  type KioskCopy,
  type KioskLocale
} from "@/lib/kiosk/locale";
import { encodeKioskQr, kioskBookingUrl } from "@/lib/kiosk/qr";
import { KioskSoundPlayer } from "@/lib/kiosk/sound";
import {
  buildKioskTipOptions,
  calculateKioskTipCents,
  calculateKioskTotalCents,
  formatKioskMoney,
  minimumServicePriceCents
} from "@/lib/kiosk/tip";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { KioskBarberOption, KioskBookingResult, KioskServiceOption } from "@/types/kiosk";

/**
 * Screens, in the order the approved prototypes walk them. `paths` only exists
 * on the shop kiosk — a barber kiosk lands straight on its two path cards.
 */
type Screen = "attract" | "welcome" | "paths" | "time" | "details" | "pay" | "tip" | "card_unavailable" | "done";
type Mode = "next" | "schedule";
type PayMethod = "card" | "cash";

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  publicUsername: string;
  selectedProfileId: string;
  serviceId: string;
  scheduledAt: string;
  policyAccepted: boolean;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  phone: "",
  email: "",
  publicUsername: "",
  selectedProfileId: "",
  serviceId: "",
  scheduledAt: "",
  policyAccepted: false
};

/** The attract deck advances on this cadence in both prototypes. */
const ATTRACT_SLIDE_MS = 4200;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhone(value: string) {
  return value.replace(/\D/g, "").length >= 7;
}

function firstNameOf(value: string, fallback: string) {
  return value.trim().replace(/^@+/, "").split(/\s+/)[0] || fallback;
}

function initialsOf(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";
}

/** A barber who is not taking any booking today. */
function isChairPaused(barber: KioskBarberOption) {
  return ["not available today", "schedule ahead only"].includes(barber.liveStatusLabel?.toLowerCase() ?? "")
    || ["not available today"].includes(barber.waitDisplayLabel?.toLowerCase() ?? "");
}

/**
 * The only label a pre-booking kiosk screen may show for a barber: their public
 * handle, or nothing. It deliberately does NOT fall back to `name` — a chair
 * with no handle is labelled "Chair N" by the caller instead. The real name
 * belongs to the confirmation reveal card and nowhere else.
 */
function publicHandleOf(barber: Pick<KioskBarberOption, "publicUsername"> | null | undefined) {
  return barber?.publicUsername?.replace(/^@+/, "") || "";
}

function waitMinutesOf(barber: KioskBarberOption | null | undefined, fallback: number | null) {
  if (!barber) {
    return fallback;
  }
  return typeof barber.estimatedWaitMinutes === "number" ? barber.estimatedWaitMinutes : fallback;
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

/**
 * The language picker is deliberately its own component: a client who cannot
 * read English has to be able to switch from the very first screen they see,
 * which includes the fallback screens where no shop payload exists yet.
 */
function LocaleSwitch({ copy, locale, onSelect }: { copy: KioskCopy; locale: KioskLocale; onSelect: (next: KioskLocale) => void }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-white/12" role="group" aria-label={copy.languageGroup}>
      {KIOSK_LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          lang={item}
          aria-label={KIOSK_LOCALE_NAME[item]}
          aria-pressed={locale === item}
          onClick={() => onSelect(item)}
          className={`min-h-12 min-w-12 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] transition motion-reduce:transition-none ${
            locale === item ? "bg-[#c4f24e]/14 text-[#e4f9b8]" : "text-white/55 hover:text-white/80"
          }`}
        >
          {KIOSK_LOCALE_SWITCH_LABEL[item]}
        </button>
      ))}
    </div>
  );
}

/**
 * Ghost "3" watermark from the approved prototypes — a hairline serif numeral
 * behind the content. Decorative only, so it is hidden from assistive tech and
 * cannot swallow a tap.
 */
function GhostThree() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 select-none font-serif text-[42vh] leading-none text-transparent"
      style={{ WebkitTextStroke: "1px rgba(201,168,124,0.08)" }}
    >
      3
    </span>
  );
}

function KioskChrome({
  copy,
  locale,
  scope,
  bigText,
  onSelectLocale,
  onToggleBigText,
  onExit
}: {
  copy: KioskCopy;
  locale: KioskLocale;
  scope: "shop" | "barber";
  bigText: boolean;
  onSelectLocale: (next: KioskLocale) => void;
  onToggleBigText: () => void;
  onExit: () => void;
}) {
  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:px-10">
      <div className="flex items-center gap-4">
        <strong className="text-[13px] tracking-[0.32em] text-[#f5f1e8]">BVRB3R</strong>
        <span className="rounded-full border border-[#c9a87c]/35 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#c9a87c]">
          {scope === "barber" ? copy.badgeBarber : copy.badgeShop}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/55 sm:flex">
          <span className="kiosk-pulse h-1.5 w-1.5 rounded-full bg-[#c4f24e] shadow-[0_0_12px_#c4f24e]" />
          {scope === "barber" ? copy.liveBarber : copy.liveShop}
        </span>
        <LocaleSwitch copy={copy} locale={locale} onSelect={onSelectLocale} />
        <button
          type="button"
          aria-label={copy.largeText}
          aria-pressed={bigText}
          onClick={onToggleBigText}
          className={`min-h-12 min-w-12 rounded-full border px-4 py-3 font-serif text-lg transition motion-reduce:transition-none ${
            bigText ? "border-[#c4f24e]/40 bg-[#c4f24e]/14 text-[#e4f9b8]" : "border-white/14 text-white/70"
          }`}
        >
          Aa
        </button>
        <button
          type="button"
          aria-label={copy.exit}
          onClick={onExit}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/12 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.18em] text-white/60"
        >
          <LockKeyhole className="h-3.5 w-3.5 text-[#c9a87c]" />
          <span className="hidden sm:inline">{copy.exit}</span>
        </button>
      </div>
    </header>
  );
}

/**
 * Shared chrome for every screen that renders before (or instead of) the
 * booking flow: loading, recovery, offline, denied, and empty. Each one keeps
 * the language picker and the staff exit reachable so the kiosk is never a
 * dead end in any language.
 */
function KioskStateShell({
  copy,
  locale,
  scope,
  bigText,
  onSelectLocale,
  onToggleBigText,
  title,
  description,
  actionLabel,
  onAction,
  onExit,
  children
}: {
  copy: KioskCopy;
  locale: KioskLocale;
  scope: "shop" | "barber";
  bigText: boolean;
  onSelectLocale: (next: KioskLocale) => void;
  onToggleBigText: () => void;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onExit: () => void;
  children?: ReactNode;
}) {
  return (
    <main
      lang={locale}
      data-kiosk-surface="state"
      className={`relative flex min-h-[100svh] flex-col overflow-x-hidden bg-[#060708] text-[#f5f1e8] ${bigText ? "text-[122%]" : ""}`}
    >
      <KioskChrome
        copy={copy}
        locale={locale}
        scope={scope}
        bigText={bigText}
        onSelectLocale={onSelectLocale}
        onToggleBigText={onToggleBigText}
        onExit={onExit}
      />
      <div className="grid flex-1 place-items-center p-6">
        <div
          className="kiosk-rise mx-auto w-full max-w-xl rounded-[30px] border border-white/10 bg-white/[0.03] p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <h2 className="font-serif text-[clamp(30px,4.5vw,40px)] leading-tight">{title}</h2>
          <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>
          {actionLabel && onAction ? (
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onAction}
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#c4f24e] px-7 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-[#060708]"
              >
                {actionLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Celebration pieces
// ---------------------------------------------------------------------------

/**
 * 36 pieces in the prototype's five colours. The geometry is derived from the
 * index rather than `Math.random()` so a confirmation screen renders the same
 * way on every device and in every test run — a kiosk that reshuffles its
 * confetti between renders is impossible to snapshot.
 */
const CONFETTI_COLORS = ["#C4F24E", "#F5F1E8", "#C9A87C", "#E23B3B", "#2E62D9"];
const CONFETTI = Array.from({ length: 36 }, (_, index) => ({
  left: `${((index * 37) % 100).toFixed(1)}%`,
  width: `${5 + (index % 7)}px`,
  height: `${10 + (index % 8)}px`,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  duration: `${(2.4 + ((index % 11) * 0.2)).toFixed(2)}s`,
  delay: `${((index % 7) * 0.2).toFixed(2)}s`
}));

function Confetti() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className="kiosk-confetti absolute top-0 rounded-[2px]"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            background: piece.color,
            animationDuration: piece.duration,
            animationDelay: piece.delay
          }}
        />
      ))}
    </span>
  );
}

/**
 * The QR is rendered as inline SVG rather than a canvas or an image so it is
 * crisp at kiosk and TV sizes, needs no runtime, and survives server render.
 */
function QrTile({ url, label }: { url: string; label: string }) {
  const symbol = useMemo(() => encodeKioskQr(url), [url]);
  if (!symbol) {
    return null;
  }

  const quiet = 4;
  const span = symbol.size + quiet * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={label}
      className="h-40 w-40 rounded-2xl bg-white p-2"
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      {symbol.modules.map((row, rowIndex) =>
        row.map((dark, columnIndex) =>
          dark ? (
            <rect
              key={`${rowIndex}-${columnIndex}`}
              x={columnIndex + quiet}
              y={rowIndex + quiet}
              width={1}
              height={1}
              fill="#060708"
            />
          ) : null
        )
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function KioskParityScreen({
  shopId,
  scope = "shop",
  initialLocale = DEFAULT_KIOSK_LOCALE,
  soundEnabled = true,
  cardSimulationEnabled = false
}: {
  shopId: string;
  scope?: "shop" | "barber";
  initialLocale?: KioskLocale;
  /** Kiosk setting; a shop can run a silent floor. */
  soundEnabled?: boolean;
  /**
   * Enables the card → tip → reader flow. BVRB3R has no card-terminal
   * plumbing yet (PR 22 owns it), so this is false in production and the card
   * tile leads to an honest "not set up yet" state instead of pretending to
   * take money. The seeded local fixture turns it on for visual QA, and the
   * server decides — the client can never switch it on for itself.
   */
  cardSimulationEnabled?: boolean;
}) {
  const router = useRouter();
  const kioskQuery = useKioskPayloadQuery(shopId, scope);
  const bookingMutation = useKioskBookingMutation(shopId, scope);
  const verifyPinMutation = useVerifyKioskPinMutation();
  const kioskDevice = useKioskDeviceState();

  const [locale, setLocale] = useState<KioskLocale>(initialLocale);
  const [bigText, setBigText] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const [screen, setScreen] = useState<Screen>("welcome");
  const [mode, setMode] = useState<Mode>("next");
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [tipPercent, setTipPercent] = useState<number | null>(null);
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState<KioskBookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attractSlide, setAttractSlide] = useState(0);

  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const idleAt = useRef(Date.now());
  const soundRef = useRef<KioskSoundPlayer | null>(null);
  const payload = kioskQuery.data;
  const t = KIOSK_COPY[locale];

  const clientSearch = useKioskClientSearchQuery(form.publicUsername);
  const searchResults = clientSearch.data?.results ?? [];

  if (!soundRef.current) {
    soundRef.current = new KioskSoundPlayer(() => soundEnabled && !prefersReducedMotion);
  }

  // -- derived -------------------------------------------------------------

  const barbers = useMemo(() => payload?.barbers ?? [], [payload?.barbers]);
  const bookableBarbers = useMemo(() => barbers.filter((barber) => !isChairPaused(barber)), [barbers]);
  const walkInBarbers = useMemo(
    () => bookableBarbers.filter((barber) => barber.acceptsWalkIns),
    [bookableBarbers]
  );

  const selectedBarber = useMemo(
    () => barbers.find((barber) => barber.id === selectedBarberId) ?? (scope === "barber" ? barbers[0] ?? null : null),
    [barbers, scope, selectedBarberId]
  );

  /**
   * Each barber sees their own menu. A service with no `barberId` is a
   * shop-wide service every chair offers, so it stays in every list.
   */
  const servicesFor = useCallback(
    (barberId: string | undefined): KioskServiceOption[] => {
      const all = payload?.services ?? [];
      if (!barberId) {
        return all;
      }
      const owned = all.filter((service) => service.barberId === barberId || !service.barberId);
      return owned.length ? owned : all;
    },
    [payload?.services]
  );

  const services = useMemo(() => servicesFor(selectedBarber?.id), [selectedBarber?.id, servicesFor]);
  const selectedService = services.find((service) => service.id === form.serviceId) ?? null;

  const fastestBarber = useMemo(() => {
    if (!walkInBarbers.length) {
      return null;
    }
    return walkInBarbers.reduce((best, barber) =>
      (waitMinutesOf(barber, 999) ?? 999) < (waitMinutesOf(best, 999) ?? 999) ? barber : best
    );
  }, [walkInBarbers]);

  const queueAhead = selectedBarber?.queueAhead ?? payload?.queue.activeCount ?? 0;
  const waitMinutes = waitMinutesOf(selectedBarber, payload?.queue.averageWaitMinutes ?? null);
  const subtotalCents = selectedService?.priceCents ?? 0;
  const tipOptions = useMemo(() => buildKioskTipOptions(subtotalCents), [subtotalCents]);
  const tipCents = calculateKioskTipCents(subtotalCents, tipPercent ?? 0);
  const totalCents = calculateKioskTotalCents(subtotalCents, tipPercent ?? 0);

  const firstName = firstNameOf(form.fullName, kioskFriendLabel(locale));
  /** Index-based, so two handleless chairs never collapse into one label. */
  const chairPositionOf = useCallback(
    (barberId: string | undefined) => Math.max(1, barbers.findIndex((barber) => barber.id === barberId) + 1),
    [barbers]
  );
  const labelFor = useCallback(
    (barber: KioskBarberOption | null | undefined) =>
      publicHandleOf(barber) || (barber ? kioskChairLabel(locale, chairPositionOf(barber.id)) : t.thisChair),
    [chairPositionOf, locale, t.thisChair]
  );

  const barberHandle = labelFor(selectedBarber);
  const shopDisplayName = payload?.shop.shopName?.trim()
    || (scope === "barber" ? t.thisChair : "");

  // Name, phone and email are the booking minimum. The public username stays
  // optional: a walk-in must be able to book without being handed an account
  // identity they did not ask for (guest-to-account conversion is PR 23).
  const detailsReady = Boolean(
    form.selectedProfileId
      || (form.fullName.trim() && isPhone(form.phone) && isEmail(form.email))
  );
  const canConfirm = Boolean(
    detailsReady
      && form.policyAccepted
      && form.serviceId
      && (mode === "next" || form.scheduledAt)
  );

  const inactivitySeconds = Math.min(180, Math.max(payload?.defaults.inactivityResetSeconds ?? 45, 20));
  // The celebration holds a QR the client has to physically scan, so it never
  // resets on the 5–8s dwell the old success screen used.
  const celebrationSeconds = Math.min(180, Math.max(payload?.defaults.autoResetSeconds ?? 45, 25));

  // -- privacy reset -------------------------------------------------------

  /**
   * The single privacy wipe. Every path that ends a client's session — the
   * inactivity timer, "Done — next client", "Cancel & reset", and the staff
   * PIN exit — goes through here, so there is exactly one definition of what
   * "no client data on screen" means.
   *
   * Cleared: identity (name, phone, email, username, matched profile),
   * appointment (service, schedule, chosen barber, booking result), payment
   * (method, tip), and the accessibility preferences the last client set.
   * Retained: the device's shop/scope binding and the language the kiosk was
   * launched in — those are the owner's configuration, not the client's data.
   */
  const wipe = useCallback((next: Screen = "welcome") => {
    setForm(EMPTY_FORM);
    setSelectedBarberId("");
    setMode("next");
    setPayMethod(null);
    setTipPercent(null);
    setCharging(false);
    setResult(null);
    setError(null);
    setLocale(initialLocale);
    setBigText(false);
    setPin("");
    setPinError(null);
    setAttractSlide(0);
    setScreen(next);
    idleAt.current = Date.now();
  }, [initialLocale]);

  // -- effects -------------------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery?.matches ?? false);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    updateMotionPreference();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    mediaQuery?.addEventListener?.("change", updateMotionPreference);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      mediaQuery?.removeEventListener?.("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    const player = soundRef.current;
    return () => player?.dispose();
  }, []);

  // Default the service to the first one this barber offers.
  useEffect(() => {
    if (!form.serviceId && services[0]?.id) {
      setForm((current) => (current.serviceId ? current : { ...current, serviceId: services[0].id }));
    }
  }, [form.serviceId, services]);

  /**
   * Idle watch. A single 1s tick, matching the prototypes, rather than a
   * rescheduled timeout per event — a kiosk fires pointer events constantly
   * and re-arming a timer on each one is how the reset silently stops firing.
   *
   * `charging` is the hard guard: a wipe mid-booking would drop a client's
   * details while the request is still in flight.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const markActive = () => {
      idleAt.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, true));

    const tick = window.setInterval(() => {
      if (!charging && screen !== "attract" && Date.now() - idleAt.current > inactivitySeconds * 1000) {
        wipe("attract");
        return;
      }
      if (screen === "attract") {
        setAttractSlide((value) => value + 1);
      }
    }, screen === "attract" ? ATTRACT_SLIDE_MS : 1000);

    return () => {
      window.clearInterval(tick);
      events.forEach((event) => window.removeEventListener(event, markActive, true));
    };
  }, [charging, inactivitySeconds, screen, wipe]);

  // Celebration dwell, then back to the attract loop with everything wiped.
  useEffect(() => {
    if (screen !== "done") return;
    const timer = window.setTimeout(() => wipe("attract"), celebrationSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [celebrationSeconds, screen, wipe]);

  // -- actions -------------------------------------------------------------

  const openExit = useCallback(() => {
    setPin("");
    setPinError(null);
    setExitOpen(true);
  }, []);

  const closeExit = useCallback(() => {
    setExitOpen(false);
    setPin("");
    setPinError(null);
  }, []);

  const retryPayload = useCallback(() => {
    setIsRecovering(true);
    void Promise.resolve(kioskQuery.refetch?.()).finally(() => setIsRecovering(false));
  }, [kioskQuery]);

  /**
   * The one place a booking is created. Card and cash both land here; the only
   * difference is what the client is told happens after the cut.
   */
  const submitBooking = useCallback(async (method: PayMethod, percent: number | null) => {
    if (!canConfirm) {
      setError(getReadableActionError({ message: "Complete your details, service, and consent before continuing." }));
      return;
    }

    setPayMethod(method);
    setTipPercent(percent);
    setError(null);
    setCharging(true);

    try {
      const booking = await bookingMutation.mutateAsync({
        ...(form.selectedProfileId
          ? {}
          : {
              fullName: form.fullName.trim(),
              phone: form.phone.trim(),
              email: form.email.trim()
            }),
        publicUsername: form.publicUsername.trim() || undefined,
        selectedProfileId: form.selectedProfileId || undefined,
        serviceId: form.serviceId,
        preferredBarberId: selectedBarber?.id || undefined,
        kioskAction: mode === "schedule" ? "schedule_ahead" : "book_next_opening",
        scheduledAt: mode === "schedule" ? form.scheduledAt : undefined
      });

      soundRef.current?.play("ok");
      setResult(booking);
      setCharging(false);
      setScreen("done");
    } catch (cause) {
      soundRef.current?.play("error");
      setCharging(false);
      setError(getReadableActionError(cause as { message?: string; status?: number; code?: string }));
    }
  }, [bookingMutation, canConfirm, form, mode, selectedBarber?.id]);

  async function exitKiosk() {
    setPinError(null);
    try {
      await verifyPinMutation.mutateAsync({ scope, targetReference: shopId, pin });
      // Wipe before navigating: staff must never land on the login screen with
      // the last client's identity, payment choice, or appointment still held
      // behind the transition.
      setExitOpen(false);
      wipe("welcome");
      kioskDevice.deactivate();
      const redirect = scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/shop/${shopId}`;
      router.push(`/login?redirect=${encodeURIComponent(redirect)}&unlock=true` as Route);
    } catch (cause) {
      setPinError(getReadableActionError(cause as { message?: string; status?: number; code?: string }));
    }
  }

  const exitDialog = exitOpen ? (
    <KioskExitDialog
      copy={t}
      title={scope === "barber" ? t.pinTitleBarber : t.pinTitleShop}
      pin={pin}
      onPinChange={setPin}
      pinError={pinError}
      isPending={verifyPinMutation.isPending}
      onCancel={closeExit}
      onSubmit={() => void exitKiosk()}
    />
  ) : null;

  const shellProps = {
    copy: t,
    locale,
    scope,
    bigText,
    onSelectLocale: setLocale,
    onToggleBigText: () => setBigText((value) => !value),
    onExit: openExit
  };

  // -- fallback shells -----------------------------------------------------

  if (kioskQuery.isLoading && !payload) {
    return <KioskStateShell {...shellProps} title={t.loading} description={t.loadingMessage}>{exitDialog}</KioskStateShell>;
  }

  if (isRecovering) {
    return <KioskStateShell {...shellProps} title={t.recovery} description={t.recoveryMessage}>{exitDialog}</KioskStateShell>;
  }

  if (isOffline) {
    return <KioskStateShell {...shellProps} title={t.offline} description={t.offlineMessage} actionLabel={t.retry} onAction={retryPayload}>{exitDialog}</KioskStateShell>;
  }

  if (kioskQuery.error && !payload) {
    const denialDescription = getReadableActionError(kioskQuery.error);
    const description = denialDescription && !/access denied/i.test(denialDescription) ? denialDescription : t.deniedMessage;
    return <KioskStateShell {...shellProps} title={t.denied} description={description} actionLabel={t.retry} onAction={retryPayload}>{exitDialog}</KioskStateShell>;
  }

  if (!payload || (payload.services.length === 0 && payload.barbers.length === 0)) {
    return <KioskStateShell {...shellProps} title={t.empty} description={t.emptyMessage} actionLabel={t.retry} onAction={retryPayload}>{exitDialog}</KioskStateShell>;
  }

  // -- attract -------------------------------------------------------------

  if (screen === "attract") {
    const slides = kioskAttractSlides(locale, scope, {
      displayName: shopDisplayName,
      barberCount: bookableBarbers.length,
      fastestHandle: labelFor(fastestBarber),
      fastestWaitMinutes: waitMinutesOf(fastestBarber, payload.queue.averageWaitMinutes)
    });
    const active = attractSlide % slides.length;

    return (
      <main lang={locale} data-kiosk-surface="attract" className="relative min-h-[100svh] overflow-hidden bg-[#060708] text-[#f5f1e8]">
        <button
          type="button"
          aria-label={t.tapBegin}
          onClick={() => {
            idleAt.current = Date.now();
            setScreen("welcome");
          }}
          className="relative grid min-h-[100svh] w-full place-items-center p-6"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_900px_520px_at_50%_-8%,rgba(196,242,78,0.07),transparent_60%)]"
          />
          <GhostThree />
          <span className="relative z-10 block text-center">
            <span className="block font-mono text-[10px] uppercase tracking-[0.34em] text-[#c9a87c]">BVRB3R</span>
            <span className="relative mt-8 block min-h-[38vh]">
              {slides.map((slide, index) => (
                <span
                  key={slide.big}
                  aria-hidden={index === active ? undefined : "true"}
                  className="kiosk-fade absolute inset-x-0 top-0 block"
                  style={{ opacity: index === active ? 1 : 0 }}
                >
                  <span className="block font-mono text-[11px] uppercase tracking-[0.3em] text-[#c9a87c]">{slide.eyebrow}</span>
                  <span className="mt-5 block font-serif text-[clamp(44px,6vw,80px)] leading-[1.02]">
                    {slide.big}
                    <span className="text-[#c4f24e]">.</span>
                  </span>
                  <span className="mt-5 block text-base text-white/60">{slide.sub}</span>
                </span>
              ))}
            </span>
            <span className="kiosk-pulse mt-6 inline-flex rounded-full bg-[#c4f24e] px-8 py-4 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#060708]">
              {t.tapBegin}
            </span>
            <span className="mt-6 block text-sm text-white/60">{t.resets}</span>
          </span>
        </button>
        {exitDialog}
      </main>
    );
  }

  // -- shared per-screen bits ---------------------------------------------

  const backTo = (target: Screen) => () => {
    setError(null);
    setScreen(target);
  };

  const goToDetails = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setScreen(nextMode === "schedule" ? "time" : "details");
  };

  const eyebrow = (text: string) => (
    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">{text}</p>
  );

  const heading = (text: string) => (
    <h2 className="mt-3 font-serif text-[clamp(34px,4.4vw,52px)] leading-[1.08]">
      {text}
      <span className="text-[#c4f24e]">.</span>
    </h2>
  );

  const backButton = (target: Screen) => (
    <button
      type="button"
      onClick={backTo(target)}
      className="mb-8 inline-flex min-h-12 items-center gap-2 rounded-full px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60"
    >
      {t.backArrow}
    </button>
  );

  const primaryPill = (label: string, onClick: () => void, enabled = true) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#c4f24e] px-8 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[#060708] transition disabled:opacity-40 motion-reduce:transition-none"
    >
      {label}
    </button>
  );

  return (
    <main
      lang={locale}
      data-kiosk-surface="flow"
      className={`relative min-h-[100svh] overflow-x-hidden bg-[#060708] text-[#f5f1e8] ${bigText ? "text-[122%]" : ""}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_900px_520px_at_50%_-8%,rgba(196,242,78,0.06),transparent_60%)]"
      />
      <KioskChrome
        copy={t}
        locale={locale}
        scope={scope}
        bigText={bigText}
        onSelectLocale={setLocale}
        onToggleBigText={() => setBigText((value) => !value)}
        onExit={openExit}
      />

      {error ? (
        <div className="relative z-20 mx-auto max-w-4xl px-6 pt-2">
          <FeedbackBanner tone="error" message={error} />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setScreen("pay");
              }}
              className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/75"
            >
              {t.retryCard}
            </button>
            <button
              type="button"
              onClick={() => void submitBooking("cash", null)}
              className="inline-flex min-h-12 items-center rounded-full border border-[#c9a87c]/45 bg-[#c9a87c]/12 px-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#e9d3ab]"
            >
              {t.chooseCash}
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------- welcome / front door ---------------- */}
      {screen === "welcome" ? (
        <section className="relative z-10 mx-auto flex min-h-[calc(100svh-150px)] max-w-[1160px] flex-col items-center justify-center px-6 pb-16 text-center">
          <GhostThree />
          <div className="kiosk-rise relative z-10 flex w-full flex-col items-center">
            {eyebrow(scope === "barber" ? t.atChair : t.welcomeTo)}
            <h1 className="mt-4 max-w-5xl font-serif text-[clamp(48px,7vw,104px)] leading-[0.96] tracking-[-0.03em]">
              {shopDisplayName}
              <span className="text-[#c4f24e]">.</span>
            </h1>
            <p className="mt-5 font-mono text-[12px] text-white/60">{scope === "barber" ? t.bookWith : t.pickSub}</p>

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <span className="rounded-full border border-white/12 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">
                {payload.shop.locationLabel}
              </span>
              <span className="rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/[0.05] px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#e4f9b8]">
                {kioskQueueChip(locale, payload.queue.activeCount, payload.queue.averageWaitMinutes)}
              </span>
            </div>

            {scope === "barber" ? (
              <div className="mt-12 grid w-full max-w-[900px] gap-5 md:grid-cols-2">
                <button
                  type="button"
                  disabled={!walkInBarbers.length || !services.length}
                  onClick={() => goToDetails("next")}
                  className="min-h-[250px] rounded-[28px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-9 text-left transition hover:bg-[#c4f24e]/[0.08] disabled:opacity-35 motion-reduce:transition-none"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-[0.26em] text-[#c4f24e]">{t.walkEye}</span>
                  <span className="mt-5 block font-serif text-[clamp(30px,3.4vw,44px)]">{t.walkTitle}</span>
                  <span className="mt-4 block text-sm leading-6 text-white/60">
                    {t.walkDesc} <strong className="text-[#e4f9b8]">{kioskWaitLabel(locale, waitMinutes)}</strong>.
                  </span>
                  <span className="mt-7 inline-flex rounded-full bg-[#c4f24e] px-6 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#060708]">
                    {t.start}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!bookableBarbers.length || !services.length}
                  onClick={() => goToDetails("schedule")}
                  className="min-h-[250px] rounded-[28px] border border-white/12 bg-white/[0.025] p-9 text-left transition hover:border-white/25 disabled:opacity-35 motion-reduce:transition-none"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-[0.26em] text-[#c9a87c]">{t.schedEye}</span>
                  <span className="mt-5 block font-serif text-[clamp(30px,3.4vw,44px)]">{t.schedTitle}</span>
                  <span className="mt-4 block text-sm leading-6 text-white/60">{t.schedDesc}</span>
                  <span className="mt-7 inline-flex rounded-full border border-white/18 px-6 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                    {t.browse}
                  </span>
                </button>
              </div>
            ) : (
              <div className="mt-12 grid w-full max-w-[1100px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  disabled={!fastestBarber || !services.length}
                  onClick={() => {
                    setSelectedBarberId(fastestBarber?.id ?? "");
                    setForm((current) => ({ ...current, serviceId: "" }));
                    goToDetails("next");
                  }}
                  className="min-h-[230px] rounded-[26px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-7 text-left disabled:opacity-35"
                >
                  <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#c4f24e]">{t.fastest}</span>
                  <span className="mt-4 block font-serif text-[clamp(26px,2.6vw,34px)]">{t.nextChair}</span>
                  <span className="mt-4 block text-sm text-white/60">
                    {t.shortestNow}{" "}
                    <strong className="text-[#e4f9b8]">
                      {fastestBarber
                        ? kioskShortestWaitLine(locale, labelFor(fastestBarber), waitMinutesOf(fastestBarber, null))
                        : kioskWaitLabel(locale, payload.queue.averageWaitMinutes)}
                    </strong>
                  </span>
                  <span className="mt-6 inline-flex rounded-full bg-[#c4f24e] px-6 py-3 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#060708]">
                    {t.go}
                  </span>
                </button>

                {barbers.map((barber, index) => {
                  const paused = isChairPaused(barber);
                  const handle = publicHandleOf(barber) || kioskChairLabel(locale, index + 1);
                  const minPrice = minimumServicePriceCents(servicesFor(barber.id));
                  return (
                    <button
                      key={barber.id}
                      type="button"
                      disabled={paused}
                      aria-label={handle}
                      onClick={() => {
                        setSelectedBarberId(barber.id);
                        setForm((current) => ({ ...current, serviceId: "" }));
                        setError(null);
                        setScreen("paths");
                      }}
                      className="min-h-[230px] rounded-[26px] border border-white/12 bg-white/[0.025] p-7 text-left transition hover:border-white/25 disabled:opacity-45 motion-reduce:transition-none"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#c4f24e]/12 font-bold text-[#c4f24e]">
                        {initialsOf(barber.name)}
                      </span>
                      <span className="mt-5 block font-serif text-[clamp(24px,2.4vw,32px)]">{handle}</span>
                      <span className="mt-4 flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] ${
                            paused
                              ? "border-[#d9b461]/45 text-[#d9b461]"
                              : (waitMinutesOf(barber, 0) ?? 0) <= 0
                                ? "border-[#c4f24e]/30 text-[#e4f9b8]"
                                : "border-white/14 text-white/60"
                          }`}
                        >
                          {paused
                            ? kioskChairPausedChip(locale)
                            : kioskBarberWaitChip(locale, barber.queueAhead ?? 0, waitMinutesOf(barber, 0))}
                        </span>
                        {minPrice !== null && !paused ? (
                          <span className="inline-flex rounded-full border border-[#c9a87c]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c9a87c]">
                            {kioskFromPriceChip(locale, formatKioskMoney(minPrice))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="mt-10 font-mono text-[9px] uppercase tracking-[0.32em] text-white/55">{t.powered}</p>
        </section>
      ) : null}

      {/* ---------------- shop: chosen barber, two paths ---------------- */}
      {screen === "paths" ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-4 sm:px-8">
          <button
            type="button"
            onClick={() => {
              setSelectedBarberId("");
              setScreen("welcome");
            }}
            className="mb-8 inline-flex min-h-12 items-center gap-2 rounded-full px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60"
          >
            {t.diffBarber}
          </button>
          {eyebrow(t.youPicked)}
          {heading(barberHandle)}
          <p className="mt-4 inline-flex rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/[0.05] px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#e4f9b8]">
            {kioskQueueChip(locale, queueAhead, waitMinutes)}
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <button
              type="button"
              disabled={!selectedBarber?.acceptsWalkIns}
              onClick={() => goToDetails("next")}
              className="min-h-[240px] rounded-[28px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-8 text-left disabled:opacity-35"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.26em] text-[#c4f24e]">{t.walkEye}</span>
              <span className="mt-5 block font-serif text-[clamp(28px,3.2vw,42px)]">{t.walkTitle}</span>
              <span className="mt-4 block text-sm leading-6 text-white/60">
                {t.walkDesc} <strong className="text-[#e4f9b8]">{kioskWaitLabel(locale, waitMinutes)}</strong>.
              </span>
              <span className="mt-7 inline-flex rounded-full bg-[#c4f24e] px-6 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#060708]">
                {t.start}
              </span>
            </button>
            <button
              type="button"
              onClick={() => goToDetails("schedule")}
              className="min-h-[240px] rounded-[28px] border border-white/12 bg-white/[0.025] p-8 text-left"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.26em] text-[#c9a87c]">{t.schedEye}</span>
              <span className="mt-5 block font-serif text-[clamp(28px,3.2vw,42px)]">{t.schedTitle}</span>
              <span className="mt-4 block text-sm leading-6 text-white/60">{t.schedDesc}</span>
              <span className="mt-7 inline-flex rounded-full border border-white/18 px-6 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                {t.browse}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* ---------------- schedule ahead ---------------- */}
      {screen === "time" ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-4 sm:px-8">
          {backButton(scope === "barber" ? "welcome" : "paths")}
          {eyebrow(kioskTimeEyebrow(locale, barberHandle))}
          {heading(t.whenYours)}
          <div className="mt-8 max-w-xl rounded-[26px] border border-white/12 bg-white/[0.025] p-6">
            <Input
              aria-label={t.whenYours}
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
            />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">{t.liveNote}</p>
          </div>
          <div className="mt-8 flex justify-end">{primaryPill(t.cont, () => setScreen("details"), Boolean(form.scheduledAt))}</div>
        </section>
      ) : null}

      {/* ---------------- details ---------------- */}
      {screen === "details" ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-4 sm:px-8">
          {backButton(mode === "schedule" ? "time" : scope === "barber" ? "welcome" : "paths")}
          {eyebrow(kioskStepLabel(locale, mode, barberHandle))}
          {heading(t.almost)}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.9fr]">
            <div className="space-y-4 rounded-[26px] border border-white/12 bg-white/[0.02] p-6">
              <Input
                aria-label={t.yourName}
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder={t.namePh}
              />
              <Input
                aria-label={t.phoneLbl}
                value={form.phone}
                inputMode="tel"
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder={t.phoneLbl}
              />
              <Input
                aria-label={t.emailLbl}
                value={form.email}
                inputMode="email"
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t.emailLbl}
              />
              <Input
                aria-label={t.userLbl}
                value={form.publicUsername}
                onChange={(event) => setForm((current) => ({ ...current, publicUsername: event.target.value, selectedProfileId: "" }))}
                placeholder="@username"
              />
              <p className="-mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60">{t.userHint}</p>

              {searchResults.length ? (
                <div className="space-y-2">
                  {searchResults.slice(0, 3).map((client) => (
                    <button
                      key={client.profileId}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          selectedProfileId: client.profileId,
                          publicUsername: client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : current.publicUsername
                        }))
                      }
                      className="flex min-h-14 w-full flex-col justify-center rounded-xl border border-white/12 px-4 py-3 text-left"
                    >
                      <strong>{client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : client.displayName}</strong>
                      <small className="mt-1 block text-white/60">{t.wbAuto}</small>
                    </button>
                  ))}
                </div>
              ) : null}

              {form.selectedProfileId ? (
                <div className="rounded-xl border border-[#c4f24e]/25 bg-[#c4f24e]/[0.06] p-4 text-sm">
                  <strong className="text-[#e4f9b8]">{t.wbBack}</strong>
                  <p className="mt-1 text-white/60">{t.wbAuto}</p>
                </div>
              ) : null}

              <button
                type="button"
                role="checkbox"
                aria-checked={form.policyAccepted}
                aria-label={t.consent}
                onClick={() => setForm((current) => ({ ...current, policyAccepted: !current.policyAccepted }))}
                className="flex min-h-14 w-full items-start gap-3 rounded-xl border border-white/12 p-4 text-left"
              >
                <span
                  className="mt-0.5 grid h-[26px] w-[26px] flex-none place-items-center rounded-lg border"
                  style={{
                    background: form.policyAccepted ? "#C4F24E" : "transparent",
                    borderColor: form.policyAccepted ? "#C4F24E" : "rgba(245,241,232,0.3)"
                  }}
                >
                  {form.policyAccepted ? <Check className="h-4 w-4 text-[#060708]" /> : null}
                </span>
                <span className="text-sm leading-6 text-white/65">{t.consent}</span>
              </button>
            </div>

            <div className="space-y-6">
              <div className="rounded-[26px] border border-white/12 bg-white/[0.02] p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c9a87c]">
                  {kioskServiceRailLabel(locale, barberHandle)}
                </p>
                <div className="svc-scroll mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1">
                  {services.map((service) => {
                    const active = form.serviceId === service.id;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setForm((current) => ({ ...current, serviceId: service.id }))}
                        className={`flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition motion-reduce:transition-none ${
                          active ? "border-[#c4f24e]/45 bg-[#c4f24e]/[0.07]" : "border-white/12 bg-white/[0.03] hover:border-white/25"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px]">{service.name}</span>
                          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/55">
                            {service.durationMinutes ? `${service.durationMinutes} min` : service.category}
                          </span>
                        </span>
                        {service.priceCents ? (
                          <span className={`flex-none font-mono text-[13px] ${active ? "text-[#c4f24e]" : "text-[#c9a87c]"}`}>
                            {formatKioskMoney(service.priceCents)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[26px] border border-[#c4f24e]/20 bg-[#c4f24e]/[0.045] p-6">
                <ShieldCheck className="h-7 w-7 text-[#c9a87c]" />
                <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">{kioskWhenLabel(locale, mode)}</p>
                <p className="mt-2 font-serif text-[clamp(22px,2.4vw,30px)] text-[#e4f9b8]">
                  {mode === "next"
                    ? kioskWaitLabelCapitalized(locale, waitMinutes)
                    : form.scheduledAt || kioskPickATime(locale)}
                </p>
                <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55">{t.liveNote}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => wipe("welcome")}
              className="inline-flex min-h-12 items-center rounded-full border border-white/16 px-5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/65"
            >
              {t.cancel}
            </button>
            {primaryPill(kioskConfirmLabel(locale, mode), () => setScreen("pay"), canConfirm)}
          </div>
        </section>
      ) : null}

      {/* ---------------- payment choice ---------------- */}
      {screen === "pay" && !charging ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-4 sm:px-8">
          {backButton("details")}
          {eyebrow(t.lastStep)}
          {heading(kioskHowPayTitle(locale, firstName))}

          <div className="mt-9 grid gap-5 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                if (!cardSimulationEnabled) {
                  // No charge, no booking, no tip step — just the truth.
                  setScreen("card_unavailable");
                  return;
                }
                setPayMethod("card");
                setScreen("tip");
              }}
              className="min-h-[250px] rounded-[28px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-8 text-left"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.24em] text-[#c4f24e]">{t.cardEye}</span>
              <span className="mt-5 block font-serif text-[clamp(28px,3vw,40px)]">{t.tapIns}</span>
              <span className="mt-4 block text-sm leading-6 text-white/60">{t.cardDesc}</span>
              <span className="mt-7 inline-flex rounded-full bg-[#c4f24e] px-6 py-4 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-[#060708]">
                {subtotalCents ? `${t.pay} ${formatKioskMoney(subtotalCents)} →` : `${t.pay} →`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void submitBooking("cash", null)}
              className="min-h-[250px] rounded-[28px] border border-white/12 bg-white/[0.025] p-8 text-left"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a87c]">{t.cashEye}</span>
              <span className="mt-5 block font-serif text-[clamp(28px,3vw,40px)]">{t.payChair}</span>
              <span className="mt-4 block text-sm leading-6 text-white/60">{kioskCashDesc(locale, barberHandle)}</span>
              <span className="mt-7 inline-flex rounded-full border border-white/18 px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                {t.chooseCash}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* ---------------- tip ---------------- */}
      {screen === "card_unavailable" ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-4 sm:px-8" role="status" aria-live="polite">
          {backButton("pay")}
          {eyebrow(t.lastStep)}
          {heading(t.cardUnavailable)}
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/65">{t.cardUnavailableBody}</p>
          {/* One way forward and the back link already at the top of the step
              — a second Back here would just be the same control twice. */}
          <div className="mt-9 flex flex-wrap gap-4">
            {primaryPill(t.chooseCash, () => void submitBooking("cash", null))}
          </div>
        </section>
      ) : null}

      {screen === "tip" && cardSimulationEnabled && !charging ? (
        <section className="kiosk-rise relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-4 sm:px-8">
          {backButton("pay")}
          {eyebrow(t.beforeReader)}
          {heading(kioskTipTitle(locale, barberHandle))}
          <p className="mt-4 text-base text-white/65">
            {selectedService ? kioskTipSubLine(locale, selectedService.name, formatKioskMoney(subtotalCents)) : null}{" "}
            <strong className="text-[#e4f9b8]">{t.tipNote}</strong>
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tipOptions.map((option) => (
              <button
                key={option.percent}
                type="button"
                aria-label={`${option.percent === 0 ? kioskNoTipLabel(locale) : option.percentLabel} · ${kioskTotalLabel(locale, formatKioskMoney(option.totalCents))}`}
                onClick={() => void submitBooking("card", option.percent)}
                className={`min-h-[170px] rounded-[24px] border p-6 text-left transition motion-reduce:transition-none ${
                  option.recommended ? "border-[#c4f24e]/40 bg-[#c4f24e]/[0.07]" : "border-white/12 bg-white/[0.04]"
                }`}
              >
                <span
                  className={`block font-serif text-[clamp(30px,3.6vw,44px)] ${
                    option.percent === 0 ? "text-white/55" : option.recommended ? "text-[#c4f24e]" : "text-[#c9a87c]"
                  }`}
                >
                  {option.percentLabel}
                </span>
                <span className="mt-3 block text-sm text-white/65">
                  {option.percent === 0 ? kioskNoTipLabel(locale) : kioskTipAmountLabel(locale, formatKioskMoney(option.tipCents))}
                </span>
                <span className={`mt-2 block font-mono text-[11px] ${option.recommended ? "text-[#e4f9b8]" : "text-white/60"}`}>
                  {kioskTotalLabel(locale, formatKioskMoney(option.totalCents))}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- reserving (in-flight) ---------------- */}
      {charging ? (
        <section
          className="relative z-10 mx-auto grid min-h-[calc(100svh-150px)] max-w-3xl place-items-center px-6 text-center"
          role="status"
          aria-live="assertive"
        >
          <div>
            <span aria-hidden="true" className="relative mx-auto grid h-28 w-28 place-items-center">
              <span className="kiosk-ring absolute inset-0 rounded-full border border-[#c4f24e]/50" />
              <span className="kiosk-ring absolute inset-0 rounded-full border border-[#c4f24e]/30" style={{ animationDelay: "0.6s" }} />
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#c4f24e]/12 text-[#c4f24e]">
                <ShieldCheck className="h-7 w-7" />
              </span>
            </span>
            <h2 className="mt-8 font-serif text-[clamp(32px,4vw,48px)]">{t.follow}</h2>
            <p className="mt-4 text-base text-white/65">{t.followSub}</p>
            <p className="kiosk-pulse mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[#e4f9b8]">{t.waiting}</p>
            {totalCents ? <p className="mt-4 font-serif text-3xl text-[#c4f24e]">{formatKioskMoney(totalCents)}</p> : null}
          </div>
        </section>
      ) : null}

      {/* ---------------- celebration ---------------- */}
      {screen === "done" && result ? (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-2 sm:px-8">
          <Confetti />
          <div className="kiosk-rise relative rounded-[30px] border border-[#c4f24e]/30 bg-[#c4f24e]/[0.06] px-6 py-12 text-center sm:px-12">
            <span aria-hidden="true" className="kiosk-pop mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#c4f24e] bg-[#c4f24e]/12 shadow-[0_0_44px_rgba(196,242,78,0.25)]">
              <Check className="h-9 w-9 text-[#c4f24e]" />
            </span>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-[#c9a87c]">{t.apptSet}</p>
            <h2 className="mt-4 font-serif text-[clamp(36px,4.6vw,56px)]">{kioskYoureInTitle(locale, firstName)}</h2>
            <p className="mt-5 text-base text-white/65">{kioskDoneLine(locale, mode, barberHandle, shopDisplayName)}</p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="rounded-full border border-white/14 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">
                {result.serviceName || selectedService?.name}
                {subtotalCents ? ` · ${formatKioskMoney(subtotalCents)}` : ""}
              </span>
              <span className="rounded-full border border-white/14 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">
                {mode === "next"
                  ? kioskDoneWhenWalkIn(locale, queueAhead, result.estimatedWaitMinutes ?? waitMinutes)
                  : form.scheduledAt}
              </span>
              <span
                className={`rounded-full border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  payMethod === "card" ? "border-[#c4f24e]/30 text-[#e4f9b8]" : "border-[#c9a87c]/35 text-[#c9a87c]"
                }`}
              >
                {kioskPayChip(
                  locale,
                  payMethod ?? "cash",
                  formatKioskMoney(totalCents),
                  tipCents > 0 ? formatKioskMoney(tipCents) : null
                )}
              </span>
            </div>

            {/* The one place a real name appears on this public screen. */}
            <div className="mx-auto mt-10 flex max-w-md items-center gap-4 rounded-[22px] border border-white/12 bg-white/[0.03] p-5 text-left">
              <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-[#c4f24e]/12 font-bold text-[#c4f24e]">
                {initialsOf(result.barberName || selectedBarber?.name || "")}
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-white/60">{t.yourBarber}</span>
                <span className="mt-1 block truncate font-serif text-2xl">{result.barberName || selectedBarber?.name}</span>
                {publicHandleOf(selectedBarber) ? (
                  <span className="block truncate font-mono text-[11px] text-[#c9a87c]">@{publicHandleOf(selectedBarber)}</span>
                ) : null}
              </span>
            </div>

            <p className="mt-6 text-sm text-white/60">{kioskWellText(locale, form.phone)}</p>

            {result.confirmationCode ? (
              <div className="mx-auto mt-9 grid max-w-3xl gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="rounded-[22px] border border-white/12 bg-white/[0.03] p-5 text-left">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/60">
                    {t.smsPreview} · {t.smsFrom}
                  </p>
                  <p className="mt-3 rounded-2xl bg-white/[0.05] p-4 text-sm leading-6 text-white/80">
                    {kioskSmsBody(locale, {
                      firstName,
                      serviceName: result.serviceName || selectedService?.name || "",
                      handle: barberHandle,
                      whenLabel:
                        mode === "next"
                          ? kioskDoneWhenWalkIn(locale, queueAhead, result.estimatedWaitMinutes ?? waitMinutes)
                          : form.scheduledAt,
                      reference: result.confirmationCode
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <QrTile url={kioskBookingUrl(result.confirmationCode)} label={t.scanSave} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/65">{result.confirmationCode}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-10">
              <button
                type="button"
                onClick={() => wipe("welcome")}
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/18 px-8 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#f5f1e8]"
              >
                {t.doneNext}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {exitDialog}
    </main>
  );
}
