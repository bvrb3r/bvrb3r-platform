"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  WalletCards
} from "lucide-react";
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
  type KioskCopy,
  type KioskLocale
} from "@/lib/kiosk/locale";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { KioskBookingResult } from "@/types/kiosk";

type Flow = "next" | "pick" | "schedule";
type Step = "welcome" | "barber" | "details" | "service" | "schedule" | "payment" | "confirmation" | "attract";
type PaymentIntention = "card_after_service" | "cash_after_service";

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  publicUsername: string;
  selectedProfileId: string;
  serviceId: string;
  preferredBarberId: string;
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
  preferredBarberId: "",
  scheduledAt: "",
  policyAccepted: false
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhone(value: string) {
  return value.replace(/\D/g, "").length >= 7;
}

function firstName(value: string) {
  return value.trim().replace(/^@+/, "").split(/\s+/)[0] || "friend";
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";
}

function isUnavailable(label?: string) {
  return ["not available today", "schedule ahead only"].includes(label?.toLowerCase() ?? "");
}

function PillButton({ children, onClick, disabled = false, secondary = false }: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={secondary
        ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#f5f1e8] transition hover:border-white/30 disabled:opacity-40 motion-reduce:transition-none"
        : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c4f24e] px-6 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[#050505] transition hover:brightness-105 disabled:opacity-40 motion-reduce:transition-none"}
    >
      {children}
    </button>
  );
}

function Choice({ title, body, icon, onClick, active = false, disabled = false }: {
  title: string;
  body: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group rounded-[26px] border p-6 text-left transition motion-reduce:transition-none ${active ? "border-[#c4f24e]/45 bg-[#c4f24e]/[0.07]" : "border-white/10 bg-white/[0.025] hover:border-white/20"} disabled:opacity-35`}
    >
      <span className="inline-flex rounded-2xl bg-white/5 p-3 text-[#c9a87c]">{icon}</span>
      <h3 className="mt-5 font-serif text-3xl text-[#f5f1e8]">{title}</h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-white/55">{body}</p>
    </button>
  );
}

/**
 * The language picker is deliberately its own component: a client who cannot
 * read English has to be able to switch from the very first screen they see,
 * which includes the fallback screens where no shop payload exists yet.
 */
function LocaleSwitch({ copy, locale, onSelect }: { copy: KioskCopy; locale: KioskLocale; onSelect: (next: KioskLocale) => void }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-white/10" role="group" aria-label={copy.languageGroup}>
      {KIOSK_LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          lang={item}
          aria-label={KIOSK_LOCALE_NAME[item]}
          aria-pressed={locale === item}
          onClick={() => onSelect(item)}
          className={`min-h-12 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] transition motion-reduce:transition-none ${locale === item ? "bg-[#c4f24e]/10 text-[#d8f98a]" : "text-white/40 hover:text-white/70"}`}
        >
          {KIOSK_LOCALE_SWITCH_LABEL[item]}
        </button>
      ))}
    </div>
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
  onSelectLocale,
  title,
  description,
  actionLabel,
  onAction,
  onExit,
  children
}: {
  copy: KioskCopy;
  locale: KioskLocale;
  onSelectLocale: (next: KioskLocale) => void;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onExit: () => void;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-[100svh] flex-col bg-[#050606] text-[#f5f1e8]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
        <strong className="text-[13px] tracking-[0.32em]">BVRB3R</strong>
        <div className="flex items-center gap-3">
          <LocaleSwitch copy={copy} locale={locale} onSelect={onSelectLocale} />
          <button
            type="button"
            onClick={onExit}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.18em] text-white/55 transition hover:border-white/25 motion-reduce:transition-none"
          >
            <LockKeyhole className="h-3.5 w-3.5 text-[#c9a87c]" />
            {copy.exit}
          </button>
        </div>
      </header>
      <div className="grid flex-1 place-items-center p-6">
        <div className="mx-auto w-full max-w-xl rounded-[30px] border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_16px_60px_rgba(0,0,0,0.25)]" role="status" aria-live="polite">
          <h2 className="font-serif text-3xl">{title}</h2>
          <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>
          {actionLabel && onAction ? (
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onAction}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#c4f24e] px-6 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-[#050505] transition hover:brightness-105 motion-reduce:transition-none"
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

export function KioskParityScreen({
  shopId,
  scope = "shop",
  initialLocale = DEFAULT_KIOSK_LOCALE
}: {
  shopId: string;
  scope?: "shop" | "barber";
  initialLocale?: KioskLocale;
}) {
  const router = useRouter();
  const kioskQuery = useKioskPayloadQuery(shopId, scope);
  const bookingMutation = useKioskBookingMutation(shopId, scope);
  const verifyPinMutation = useVerifyKioskPinMutation();
  const kioskDevice = useKioskDeviceState();
  const [locale, setLocale] = useState<KioskLocale>(initialLocale);
  const [largeText, setLargeText] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [step, setStep] = useState<Step>("welcome");
  const [flow, setFlow] = useState<Flow>("next");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [paymentIntention, setPaymentIntention] = useState<PaymentIntention>("card_after_service");
  const [result, setResult] = useState<KioskBookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const idleTimer = useRef<number | null>(null);
  const confirmationTimer = useRef<number | null>(null);
  const payload = kioskQuery.data;
  const t = KIOSK_COPY[locale];
  const clientSearch = useKioskClientSearchQuery(form.publicUsername);
  const searchResults = clientSearch.data?.results ?? [];

  const eligibleBarbers = useMemo(
    () => (payload?.barbers ?? []).filter((barber) => barber.acceptsWalkIns && !isUnavailable(barber.waitDisplayLabel)),
    [payload?.barbers]
  );
  const publicBarbers = useMemo(
    () => (payload?.barbers ?? []).filter((barber) => !isUnavailable(barber.waitDisplayLabel)),
    [payload?.barbers]
  );
  const selectedBarber = publicBarbers.find((barber) => barber.id === form.preferredBarberId);
  const selectedService = payload?.services.find((service) => service.id === form.serviceId);
  const requiredDetailsReady = Boolean(
    form.selectedProfileId || (form.fullName.trim() && isPhone(form.phone) && isEmail(form.email) && form.policyAccepted)
  );
  const canSubmit = requiredDetailsReady && Boolean(form.serviceId) && (flow !== "schedule" || Boolean(form.scheduledAt));
  const inactivityResetSeconds = Math.min(90, Math.max(payload?.defaults.inactivityResetSeconds ?? 75, 60));
  const confirmationResetSeconds = Math.min(8, Math.max(payload?.defaults.autoResetSeconds ?? 7, 5));

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

  /**
   * Retry surfaces a real recovery screen instead of silently re-firing the
   * query, so a client tapping the button always gets visible feedback.
   */
  const retry = useCallback(() => {
    setIsRecovering(true);
    void Promise.resolve(kioskQuery.refetch?.()).finally(() => setIsRecovering(false));
  }, [kioskQuery]);

  const wipe = useCallback((nextStep: Step = "welcome") => {
    setForm({ ...EMPTY_FORM, serviceId: payload?.services[0]?.id ?? "" });
    setPaymentIntention("card_after_service");
    setResult(null);
    setError(null);
    setLocale(initialLocale);
    setLargeText(false);
    setFlow("next");
    setStep(nextStep);
  }, [initialLocale, payload?.services]);

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
    if (payload?.services[0]?.id && !form.serviceId) {
      setForm((current) => ({ ...current, serviceId: payload.services[0]?.id ?? "" }));
    }
  }, [form.serviceId, payload?.services]);

  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      if (bookingMutation.isPending || step === "confirmation") return;
      idleTimer.current = window.setTimeout(() => wipe("attract"), inactivityResetSeconds * 1000);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      events.forEach((event) => window.removeEventListener(event, resetIdle));
    };
  }, [bookingMutation.isPending, inactivityResetSeconds, step, wipe]);

  useEffect(() => {
    if (step !== "confirmation") return;
    confirmationTimer.current = window.setTimeout(() => wipe("welcome"), confirmationResetSeconds * 1000);
    return () => {
      if (confirmationTimer.current !== null) window.clearTimeout(confirmationTimer.current);
    };
  }, [confirmationResetSeconds, step, wipe]);

  async function submitBooking() {
    if (!canSubmit) {
      setError("Complete the required details, service, consent, and time before continuing.");
      return;
    }
    setError(null);
    try {
      const booking = await bookingMutation.mutateAsync({
        ...(form.selectedProfileId ? {} : {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim()
        }),
        publicUsername: form.publicUsername.trim() || undefined,
        selectedProfileId: form.selectedProfileId || undefined,
        serviceId: form.serviceId,
        preferredBarberId: form.preferredBarberId || undefined,
        kioskAction: flow === "schedule" ? "schedule_ahead" : "book_next_opening",
        scheduledAt: flow === "schedule" ? form.scheduledAt : undefined
      });
      setResult(booking);
      setStep("confirmation");
    } catch (cause) {
      setError(getReadableActionError(cause as { message?: string; status?: number; code?: string }));
    }
  }

  async function exitKiosk() {
    setPinError(null);
    try {
      await verifyPinMutation.mutateAsync({ scope, targetReference: shopId, pin });
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
    onSelectLocale: setLocale,
    onExit: openExit
  };

  if (kioskQuery.isLoading && !payload) {
    return <KioskStateShell {...shellProps} title={t.loading} description={t.loadingMessage}>{exitDialog}</KioskStateShell>;
  }

  if (isRecovering) {
    return <KioskStateShell {...shellProps} title={t.recovery} description={t.recoveryMessage}>{exitDialog}</KioskStateShell>;
  }

  if (isOffline) {
    return <KioskStateShell {...shellProps} title={t.offline} description={t.offlineMessage} actionLabel={t.retry} onAction={retry}>{exitDialog}</KioskStateShell>;
  }

  if (kioskQuery.error && !payload) {
    const denialDescription = getReadableActionError(kioskQuery.error);
    const description = denialDescription && !/access denied/i.test(denialDescription) ? denialDescription : t.deniedMessage;
    return <KioskStateShell {...shellProps} title={t.denied} description={description} actionLabel={t.retry} onAction={retry}>{exitDialog}</KioskStateShell>;
  }

  if (!payload || (payload.services.length === 0 && payload.barbers.length === 0)) {
    return <KioskStateShell {...shellProps} title={t.empty} description={t.emptyMessage} actionLabel={t.retry} onAction={retry}>{exitDialog}</KioskStateShell>;
  }

  if (step === "attract") {
    return (
      <button type="button" onClick={() => wipe("welcome")} className="relative grid min-h-[100svh] w-full place-items-center overflow-hidden bg-[#050606] p-6 text-[#f5f1e8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(196,242,78,0.06),transparent_28%),radial-gradient(circle_at_100%_100%,rgba(201,168,124,0.04),transparent_32%)]" />
        <div className="relative text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#c9a87c]">BVRB3R · {scope === "barber" ? t.barberKiosk : t.shopKiosk}</p>
          <h1 className="mt-6 font-serif text-6xl sm:text-8xl">Come for the cut<span className="text-[#c4f24e]">.</span></h1>
          <span className="mt-9 inline-flex rounded-full bg-[#c4f24e] px-8 py-4 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#050505]">{t.tap}</span>
          <p className="mt-6 text-sm text-white/45">{t.privacy}</p>
        </div>
      </button>
    );
  }

  const barberName = publicBarbers[0]?.name ?? "Your Barber";
  const heroName = scope === "barber" ? barberName.toLowerCase().replace(/^@/, "") : payload.shop.shopName;
  const address = payload.shop.locationLabel;
  const queueWait = payload.queue.averageWaitMinutes ? `~${payload.queue.averageWaitMinutes} min` : "Live estimate";
  const nextAhead = payload.queue.activeCount ?? 0;
  const waitLabel = selectedBarber?.waitDisplayLabel ?? (payload.queue.averageWaitMinutes ? `About ${payload.queue.averageWaitMinutes} min` : "Wait estimate updates live");

  function goBack() {
    if (step === "barber" || step === "details") setStep("welcome");
    else if (step === "service") setStep("details");
    else if (step === "schedule") setStep("service");
    else if (step === "payment") setStep(flow === "schedule" ? "schedule" : "service");
  }

  // Rendered as a value rather than a nested component so React keeps the DOM
  // node identity across re-renders — otherwise every locale change would
  // remount the header and drop keyboard focus off the button just pressed.
  const header = (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:px-10">
      <div className="flex items-center gap-4">
        <strong className="text-[13px] tracking-[0.32em] text-[#f5f1e8]">BVRB3R</strong>
        <span className="rounded-full border border-[#c9a87c]/35 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#c9a87c]">{scope === "barber" ? t.barberKiosk : t.shopKiosk}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/50 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#c4f24e] shadow-[0_0_12px_#c4f24e]" />{scope === "barber" ? t.live : t.liveFloor}</span>
        <LocaleSwitch copy={t} locale={locale} onSelect={setLocale} />
        <button type="button" aria-label={t.largeText} aria-pressed={largeText} onClick={() => setLargeText((value) => !value)} className="min-h-12 rounded-full border border-white/10 px-4 py-3 font-serif text-lg text-white/70">Aa</button>
        <button type="button" aria-label={t.exit} onClick={openExit} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.18em] text-white/55"><LockKeyhole className="h-3.5 w-3.5 text-[#c9a87c]" /><span className="hidden sm:inline">Exit</span></button>
      </div>
    </header>
  );

  return (
    <main className={`relative min-h-[100svh] overflow-x-hidden bg-[#050606] text-[#f5f1e8] ${largeText ? "text-[114%]" : ""} ${prefersReducedMotion ? "motion-reduce:transition-none" : ""}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(196,242,78,0.055),transparent_24%),radial-gradient(circle_at_100%_100%,rgba(201,168,124,0.035),transparent_30%)]" />
      {header}

      {error ? <div className="relative z-20 mx-auto max-w-4xl px-6 pt-4"><FeedbackBanner tone="error" message={error} /></div> : null}

      {step === "welcome" ? (
        <section className="relative z-10 mx-auto flex min-h-[calc(100svh-150px)] max-w-[1160px] flex-col items-center justify-center px-6 pb-20 text-center">
          <div className="pointer-events-none absolute top-[5%] h-[430px] w-[240px] rounded-[50%] border border-white/[0.035]" />
          <p className="font-mono text-[10px] uppercase tracking-[0.36em] text-[#c9a87c]">{scope === "barber" ? "You’re at the chair of" : "Welcome to"}</p>
          <h1 className="mt-4 max-w-5xl font-serif text-[clamp(4rem,8vw,7.6rem)] leading-[0.92] tracking-[-0.045em]">{heroName}<span className="text-[#c4f24e]">.</span></h1>
          <p className="mt-6 font-mono text-[11px] text-white/38">{scope === "barber" ? "Book your cut with this barber" : "Pick your barber — or take the next chair"}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="rounded-full border border-white/10 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/50">{address}</span>
            <span className="rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/[0.04] px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d8f98a]">{nextAhead} ahead · {queueWait}</span>
          </div>

          {scope === "barber" ? (
            <div className="mt-12 grid w-full max-w-[860px] gap-5 md:grid-cols-2">
              <button type="button" disabled={!eligibleBarbers.length || !payload.services.length} onClick={() => { setFlow("next"); setForm((current) => ({ ...current, preferredBarberId: publicBarbers[0]?.id ?? "" })); setStep("details"); }} className="min-h-[250px] rounded-[28px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-9 text-left transition hover:bg-[#c4f24e]/[0.075] disabled:opacity-35 motion-reduce:transition-none">
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#c4f24e]">Walk-in — next opening</p>
                <h2 className="mt-5 font-serif text-4xl">{t.next}</h2>
                <p className="mt-4 text-sm leading-6 text-white/55">Join the line right now. Estimated wait: <strong className="text-[#d8f98a]">{queueWait}</strong>.</p>
                <span className="mt-7 inline-flex rounded-full bg-[#c4f24e] px-6 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#050505]">Start →</span>
              </button>
              <button type="button" disabled={!publicBarbers.length || !payload.services.length} onClick={() => { setFlow("schedule"); setForm((current) => ({ ...current, preferredBarberId: publicBarbers[0]?.id ?? "" })); setStep("details"); }} className="min-h-[250px] rounded-[28px] border border-white/10 bg-white/[0.025] p-9 text-left transition hover:border-white/20 disabled:opacity-35 motion-reduce:transition-none">
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#c9a87c]">Schedule ahead</p>
                <h2 className="mt-5 font-serif text-4xl">{t.future}</h2>
                <p className="mt-4 text-sm leading-6 text-white/55">Choose a service and lock a slot for later — nothing is booked until you confirm.</p>
                <span className="mt-7 inline-flex rounded-full border border-white/15 px-6 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">Browse times →</span>
              </button>
            </div>
          ) : (
            <div className="mt-12 grid w-full max-w-[1100px] gap-4 sm:grid-cols-2 md:grid-cols-4">
              <button type="button" disabled={!eligibleBarbers.length || !payload.services.length} onClick={() => { setFlow("next"); setForm((current) => ({ ...current, preferredBarberId: "" })); setStep("details"); }} className="min-h-[230px] rounded-[26px] border border-[#c4f24e]/40 bg-[#c4f24e]/[0.055] p-7 text-left disabled:opacity-35">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#c4f24e]">Fastest</p>
                <h2 className="mt-4 font-serif text-3xl">Next available chair</h2>
                <p className="mt-4 text-sm text-white/55">Shortest wait right now: <strong className="text-[#d8f98a]">{eligibleBarbers[0]?.name ?? "Live assignment"}</strong></p>
                <span className="mt-6 inline-flex rounded-full bg-[#c4f24e] px-5 py-3 font-mono text-[10px] font-black uppercase text-[#050505]">Go →</span>
              </button>
              {publicBarbers.slice(0, 3).map((barber) => <button key={barber.id} type="button" aria-label={`Pick ${barber.name}`} onClick={() => { setFlow("pick"); setForm((current) => ({ ...current, preferredBarberId: barber.id })); setStep("details"); }} className="min-h-[230px] rounded-[26px] border border-white/10 bg-white/[0.025] p-7 text-left hover:border-white/20"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#c4f24e]/10 font-bold text-[#c4f24e]">{initials(barber.name)}</span><h3 className="mt-5 font-serif text-2xl">{barber.name}</h3><p className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">{barber.waitDisplayLabel}</p></button>)}
            </div>
          )}
          <p className="absolute bottom-4 font-mono text-[8px] uppercase tracking-[0.32em] text-white/22">Powered quietly by BVRB3R</p>
        </section>
      ) : null}

      {step !== "welcome" ? (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-8 sm:px-8">
          {step !== "confirmation" ? <button type="button" onClick={goBack} className="mb-8 inline-flex min-h-12 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45"><ArrowLeft className="h-4 w-4" />{t.back}</button> : null}

          {step === "barber" ? <div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">Shop team</p><h2 className="mt-3 font-serif text-5xl">{t.choose}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{publicBarbers.map((barber) => <button key={barber.id} type="button" onClick={() => { setForm((current) => ({ ...current, preferredBarberId: barber.id })); setStep("details"); }} className="rounded-[24px] border border-white/10 bg-white/[0.025] p-6 text-left hover:border-white/20"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#c4f24e]/10 text-[#c4f24e]">{initials(barber.name)}</span><h3 className="mt-4 font-serif text-3xl">{barber.name}</h3><p className="mt-2 text-sm text-white/45">{barber.liveStatusLabel}</p></button>)}</div></div> : null}

          {step === "details" ? <div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">Client details</p><h2 className="mt-3 font-serif text-5xl">{t.details}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]"><div className="space-y-4 rounded-[26px] border border-white/10 bg-white/[0.02] p-6"><Input aria-label="BVRB3R Username" value={form.publicUsername} onChange={(event) => setForm((current) => ({ ...current, publicUsername: event.target.value, selectedProfileId: "" }))} placeholder="@username" />{searchResults.length ? <div className="space-y-2">{searchResults.slice(0, 3).map((client) => <button key={client.profileId} type="button" onClick={() => setForm((current) => ({ ...current, selectedProfileId: client.profileId, publicUsername: client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : current.publicUsername }))} className="w-full rounded-xl border border-white/10 p-3 text-left"><strong>{client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : client.displayName}</strong><small className="block text-white/45">Saved contact details stay private</small></button>)}</div> : null}{form.selectedProfileId ? <div className="rounded-xl border border-[#c4f24e]/25 bg-[#c4f24e]/[0.06] p-4 text-sm"><strong className="text-[#d8f98a]">Welcome back.</strong><p className="mt-1 text-white/55">Your saved phone and email will be used privately for updates.</p></div> : <><Input aria-label="Full name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" /><Input aria-label="Phone number" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" /><Input aria-label="Email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email address" /><button type="button" role="checkbox" aria-checked={form.policyAccepted} aria-label="Accept kiosk booking policy" onClick={() => setForm((current) => ({ ...current, policyAccepted: !current.policyAccepted }))} className="flex w-full items-start gap-3 rounded-xl border border-white/10 p-4 text-left"><span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full border border-white/15">{form.policyAccepted ? <Check className="h-4 w-4 text-[#c4f24e]" /> : null}</span><span className="text-sm text-white/60">{t.consent}</span></button></>}</div><div className="rounded-[26px] border border-[#c4f24e]/20 bg-[#c4f24e]/[0.045] p-6"><ShieldCheck className="h-8 w-8 text-[#c9a87c]" /><h3 className="mt-4 font-serif text-3xl">Private by design.</h3><p className="mt-3 text-sm leading-6 text-white/55">The kiosk clears your details after confirmation or inactivity. Staff controls remain PIN protected.</p><div className="mt-7 border-t border-white/10 pt-5"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">Booking with</p><p className="mt-2 font-serif text-2xl">{selectedBarber?.name ?? "Next eligible Barber"}</p><p className="mt-2 text-sm text-[#d8f98a]">{waitLabel}</p></div></div></div><div className="mt-7 flex justify-end"><PillButton disabled={!requiredDetailsReady} onClick={() => setStep("service")}>Continue <ChevronRight className="h-4 w-4" /></PillButton></div></div> : null}

          {step === "service" ? <div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">Service</p><h2 className="mt-3 font-serif text-5xl">{t.service}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-4 sm:grid-cols-2">{payload.services.map((service) => <Choice key={service.id} title={service.name} body={service.category} icon={<Scissors className="h-5 w-5" />} active={form.serviceId === service.id} onClick={() => setForm((current) => ({ ...current, serviceId: service.id }))} />)}</div><div className="mt-7 flex justify-end"><PillButton disabled={!form.serviceId} onClick={() => setStep(flow === "schedule" ? "schedule" : "payment")}>Continue <ChevronRight className="h-4 w-4" /></PillButton></div></div> : null}

          {step === "schedule" ? <div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">Schedule</p><h2 className="mt-3 font-serif text-5xl">{t.schedule}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 max-w-xl rounded-[26px] border border-white/10 bg-white/[0.02] p-6"><Input aria-label="Date and time" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></div><div className="mt-7 flex justify-end"><PillButton disabled={!form.scheduledAt} onClick={() => setStep("payment")}>Continue <ChevronRight className="h-4 w-4" /></PillButton></div></div> : null}

          {step === "payment" ? <div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a87c]">Payment plan</p><h2 className="mt-3 font-serif text-5xl">{t.payment}<span className="text-[#c4f24e]">.</span></h2><p className="mt-4 max-w-2xl text-white/50">The kiosk reserves the appointment. Payment is completed from Barber Checkout after the service so the barber can charge by available card method or record cash safely.</p><div className="mt-8 grid gap-5 md:grid-cols-2"><Choice title={t.card} body="Your Barber charges you from Checkout using an available card method." icon={<CreditCard className="h-6 w-6" />} active={paymentIntention === "card_after_service"} onClick={() => setPaymentIntention("card_after_service")} /><Choice title={t.cash} body="Your spot locks in now. Pay your Barber when the cape comes off." icon={<WalletCards className="h-6 w-6" />} active={paymentIntention === "cash_after_service"} onClick={() => setPaymentIntention("cash_after_service")} /></div><div className="mt-7 flex justify-end"><PillButton disabled={!canSubmit || bookingMutation.isPending} onClick={() => void submitBooking()}>{bookingMutation.isPending ? "Reserving…" : t.confirm} <ChevronRight className="h-4 w-4" /></PillButton></div></div> : null}

          {step === "confirmation" && result ? <div className="mx-auto max-w-4xl rounded-[30px] border border-[#c4f24e]/30 bg-[#c4f24e]/[0.06] px-7 py-14 text-center sm:px-12"><p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#c9a87c]">{t.reserved}</p><h2 className="mt-4 font-serif text-5xl sm:text-6xl">{t.success}</h2><p className="mt-5 text-white/60">{result.serviceName || selectedService?.name} with {selectedBarber?.name ?? barberName}</p><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Booking as {form.publicUsername || result.clientPublicUsername || firstName(form.fullName)} · {paymentIntention === "cash_after_service" ? "Cash after service" : "Card after service"}</p><div className="mt-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45"><Check className="h-4 w-4 text-[#c4f24e]" />Returning to welcome screen</div><div className="mt-8"><PillButton secondary onClick={() => wipe("welcome")}>Done</PillButton></div></div> : null}
        </section>
      ) : null}

      {exitDialog}
    </main>
  );
}
