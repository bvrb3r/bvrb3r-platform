"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  UserRound,
  WalletCards
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import {
  useKioskBookingMutation,
  useKioskClientSearchQuery,
  useKioskDeviceState,
  useKioskPayloadQuery,
  useVerifyKioskPinMutation
} from "@/lib/kiosk/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { KioskBookingResult } from "@/types/kiosk";

type Locale = "en" | "es" | "ht";
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

const COPY = {
  en: {
    live: "Live",
    exit: "Exit",
    next: "Book next available",
    pick: "Pick a Barber",
    future: "Schedule ahead",
    choose: "Choose your Barber",
    nextHelp: "The server assigns the earliest eligible chair using live shop rules.",
    pickHelp: "Choose a specific public chair without changing walk-in rotation.",
    futureHelp: "Choose a Barber, service, date, and time that works for you.",
    details: "Tell us where to send your updates.",
    service: "Pick your service.",
    schedule: "Choose your time.",
    payment: "How will you pay after the service?",
    card: "Card after the cut",
    cardHelp: "Your Barber charges you from Checkout using an available card method.",
    cash: "Cash after the cut",
    cashHelp: "Your spot locks in now. Pay your Barber when the cape comes off.",
    confirm: "Reserve my spot",
    consent: "I accept the kiosk booking policy and current Terms and Privacy Policy.",
    success: "You’re in",
    reserved: "Appointment reserved",
    sms: "A confirmation and wait update will be sent to your phone.",
    done: "Done — next client",
    tap: "Tap anywhere to begin",
    privacy: "Resets between clients — your information never stays on screen.",
    back: "Back"
  },
  es: {
    live: "En vivo",
    exit: "Salir",
    next: "Reservar próximo disponible",
    pick: "Elegir un barbero",
    future: "Programar para después",
    choose: "Elige tu barbero",
    nextHelp: "El servidor asigna la primera silla elegible según las reglas del salón.",
    pickHelp: "Elige una silla específica sin cambiar la rotación de clientes sin cita.",
    futureHelp: "Elige barbero, servicio, fecha y hora.",
    details: "Dinos dónde enviar tus actualizaciones.",
    service: "Elige tu servicio.",
    schedule: "Elige tu hora.",
    payment: "¿Cómo pagarás después del servicio?",
    card: "Tarjeta después del corte",
    cardHelp: "Tu barbero te cobrará desde Checkout con un método disponible.",
    cash: "Efectivo después del corte",
    cashHelp: "Tu lugar queda reservado. Paga cuando termine el servicio.",
    confirm: "Reservar mi lugar",
    consent: "Acepto la política de reserva, los Términos y la Política de Privacidad.",
    success: "Estás dentro",
    reserved: "Cita reservada",
    sms: "La confirmación y el tiempo de espera llegarán a tu teléfono.",
    done: "Listo — próximo cliente",
    tap: "Toca para comenzar",
    privacy: "Se reinicia entre clientes — tu información no queda en pantalla.",
    back: "Atrás"
  },
  ht: {
    live: "An dirèk",
    exit: "Sòti",
    next: "Rezève pwochen ki disponib",
    pick: "Chwazi yon babè",
    future: "Pwograme pou pita",
    choose: "Chwazi babè ou",
    nextHelp: "Sèvè a chwazi premye chèz ki kalifye selon règ boutik la.",
    pickHelp: "Chwazi yon chèz espesifik san chanje wotasyon kliyan san randevou.",
    futureHelp: "Chwazi babè, sèvis, dat ak lè ki bon pou ou.",
    details: "Di nou kote pou nou voye mizajou yo.",
    service: "Chwazi sèvis ou.",
    schedule: "Chwazi lè ou.",
    payment: "Kijan w ap peye apre sèvis la?",
    card: "Kat apre koupe a",
    cardHelp: "Babè a ap chaje w nan Checkout ak yon metòd ki disponib.",
    cash: "Lajan kach apre koupe a",
    cashHelp: "Plas ou rezève kounye a. Peye babè a lè sèvis la fini.",
    confirm: "Rezève plas mwen",
    consent: "Mwen aksepte règleman rezèvasyon, Kondisyon yo ak Règleman Konfidansyalite a.",
    success: "Ou ladan",
    reserved: "Randevou rezève",
    sms: "Konfimasyon ak tan tann lan ap rive sou telefòn ou.",
    done: "Fini — pwochen kliyan",
    tap: "Tape nenpòt kote pou kòmanse",
    privacy: "Li efase ant kliyan — enfòmasyon ou pa rete sou ekran an.",
    back: "Retounen"
  }
} as const;

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

function ShellButton({ children, onClick, secondary = false, disabled = false, ariaLabel }: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={secondary
        ? "inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-[#f5f1e8]/18 bg-white/[0.025] px-6 text-sm font-bold text-[#f5f1e8] transition hover:border-[#c9a87c]/55 disabled:cursor-not-allowed disabled:opacity-40"
        : "bvr-on-green inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#c4f24e] px-6 text-sm font-black text-[#050505] shadow-[0_18px_48px_rgba(196,242,78,0.16)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"}
    >
      {children}
    </button>
  );
}

function ChoiceCard({ title, body, icon, onClick, active = false, disabled = false }: {
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
      className={`group min-h-40 rounded-[28px] border p-6 text-left transition ${active
        ? "border-[#c4f24e]/55 bg-[#c4f24e]/12 shadow-[0_20px_60px_rgba(196,242,78,0.10)]"
        : "border-white/10 bg-white/[0.025] hover:-translate-y-0.5 hover:border-[#c9a87c]/45"} disabled:cursor-not-allowed disabled:opacity-35`}
    >
      <span className={`inline-flex rounded-2xl p-3 ${active ? "bg-[#c4f24e] text-[#050505]" : "bg-white/5 text-[#c9a87c]"}`}>{icon}</span>
      <h3 className="mt-5 font-serif text-2xl text-[#f5f1e8]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/56">{body}</p>
    </button>
  );
}

export function KioskParityScreen({ shopId, scope = "shop" }: { shopId: string; scope?: "shop" | "barber" }) {
  const router = useRouter();
  const kioskQuery = useKioskPayloadQuery(shopId, scope);
  const bookingMutation = useKioskBookingMutation(shopId, scope);
  const verifyPinMutation = useVerifyKioskPinMutation();
  const kioskDevice = useKioskDeviceState();
  const [locale, setLocale] = useState<Locale>("en");
  const [largeText, setLargeText] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [flow, setFlow] = useState<Flow>("next");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [paymentIntention, setPaymentIntention] = useState<PaymentIntention>("card_after_service");
  const [result, setResult] = useState<KioskBookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const payload = kioskQuery.data;
  const t = COPY[locale];
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
  const selectedBarber = useMemo(
    () => publicBarbers.find((barber) => barber.id === form.preferredBarberId),
    [form.preferredBarberId, publicBarbers]
  );
  const selectedService = payload?.services.find((service) => service.id === form.serviceId);
  const requiredDetailsReady = Boolean(
    form.selectedProfileId || (form.fullName.trim() && isPhone(form.phone) && isEmail(form.email) && form.policyAccepted)
  );
  const canSubmit = requiredDetailsReady && Boolean(form.serviceId) && (flow !== "schedule" || Boolean(form.scheduledAt));
  const resetSeconds = Math.max(payload?.defaults.autoResetSeconds ?? 45, 20);

  function wipe(nextStep: Step = "welcome") {
    setForm({ ...EMPTY_FORM, serviceId: payload?.services[0]?.id ?? "" });
    setPaymentIntention("card_after_service");
    setResult(null);
    setError(null);
    setLocale("en");
    setLargeText(false);
    setFlow("next");
    setStep(nextStep);
  }

  useEffect(() => {
    if (payload?.services[0]?.id && !form.serviceId) {
      setForm((current) => ({ ...current, serviceId: payload.services[0]?.id ?? "" }));
    }
  }, [form.serviceId, payload?.services]);

  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (bookingMutation.isPending || step === "confirmation") return;
      idleTimer.current = window.setTimeout(() => wipe("attract"), resetSeconds * 1000);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      events.forEach((event) => window.removeEventListener(event, resetIdle));
    };
  }, [bookingMutation.isPending, resetSeconds, step]);

  useEffect(() => {
    if (step !== "confirmation") return;
    confirmationTimer.current = window.setTimeout(() => wipe("welcome"), resetSeconds * 1000);
    return () => {
      if (confirmationTimer.current) window.clearTimeout(confirmationTimer.current);
    };
  }, [resetSeconds, step]);

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

  if (kioskQuery.isLoading && !payload) {
    return <main className="grid min-h-[100svh] place-items-center bg-[#060708] text-[#f5f1e8]">Loading kiosk…</main>;
  }

  if (!payload) {
    return <main className="grid min-h-[100svh] place-items-center bg-[#060708] p-6"><div className="max-w-lg"><FeedbackBanner tone="error" message={getReadableActionError(kioskQuery.error ?? new Error("Unable to load kiosk."))} /></div></main>;
  }

  if (step === "attract") {
    return (
      <button type="button" onClick={() => wipe("welcome")} className="relative grid min-h-[100svh] w-full place-items-center overflow-hidden bg-[#060708] px-6 text-[#f5f1e8]">
        <span aria-hidden className="absolute font-serif text-[70vw] leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,124,0.09)]">3</span>
        <div className="relative z-10 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[#c9a87c]">BVRB3R · {scope === "barber" ? "Barber kiosk" : "Shop kiosk"}</p>
          <h1 className="mt-6 font-serif text-5xl sm:text-7xl">Come for the cut<span className="text-[#c4f24e]">.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/58">Book the chair. Get your update. Keep your place in the culture.</p>
          <span className="bvr-on-green mt-10 inline-flex min-h-16 items-center rounded-full bg-[#c4f24e] px-8 font-black uppercase tracking-[0.14em] text-[#050505] shadow-[0_0_70px_rgba(196,242,78,0.18)]">{t.tap}</span>
          <p className="mt-6 text-sm text-white/42">{t.privacy}</p>
        </div>
      </button>
    );
  }

  const waitLabel = selectedBarber?.waitDisplayLabel
    ?? (payload.queue.averageWaitMinutes ? `About ${payload.queue.averageWaitMinutes} min` : "Wait estimate updates live");
  const kioskLabel = scope === "barber" ? "Barber kiosk" : "Shop kiosk";

  function goBack() {
    if (step === "barber" || step === "details") setStep("welcome");
    else if (step === "service") setStep("details");
    else if (step === "schedule") setStep("service");
    else if (step === "payment") setStep(flow === "schedule" ? "schedule" : "service");
  }

  return (
    <main className={`relative min-h-[100svh] overflow-hidden bg-[#060708] text-[#f5f1e8] ${largeText ? "text-[114%]" : ""}`}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(196,242,78,0.15),transparent_58%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-10 top-24 font-serif text-[32rem] leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,124,0.075)]">3</div>

      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="font-black tracking-[0.22em]">BVRB3R</span>
          <span className="rounded-full border border-[#c9a87c]/28 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a87c]">{kioskLabel}</span>
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/48"><span className="h-2 w-2 animate-pulse rounded-full bg-[#c4f24e]" />{t.live}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-black/30 p-1" aria-label="Language">
            {(["en", "es", "ht"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setLocale(item)} className={`rounded-full px-3 py-2 font-mono text-[10px] font-bold uppercase ${locale === item ? "bg-[#c4f24e] text-[#050505]" : "text-white/48"}`}>{item === "ht" ? "KRE" : item.toUpperCase()}</button>
            ))}
          </div>
          <button type="button" aria-label="Toggle large text" onClick={() => setLargeText((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-full border text-sm font-bold ${largeText ? "border-[#c4f24e]/45 bg-[#c4f24e]/12 text-[#c4f24e]" : "border-white/10 text-white/56"}`}>Aa</button>
          <button type="button" aria-label="Exit kiosk" onClick={() => { setPin(""); setPinError(null); setExitOpen(true); }} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-white/56"><LockKeyhole className="h-4 w-4" /></button>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {step !== "welcome" && step !== "confirmation" ? (
          <button type="button" onClick={goBack} className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-white/52"><ArrowLeft className="h-4 w-4" />{t.back}</button>
        ) : null}

        {error ? <div className="mb-6"><FeedbackBanner tone="error" message={error} /></div> : null}

        {step === "welcome" ? (
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">{payload.shop.locationLabel}</p>
            <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.98] sm:text-7xl">{scope === "shop" ? <>Welcome to <span className="text-[#c4f24e]">{payload.shop.shopName}</span>.</> : <>You’re at the chair<span className="text-[#c4f24e]">.</span></>}</h1>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/54"><span className="rounded-full border border-white/10 px-4 py-2">{payload.queue.activeCount} waiting</span><span className="rounded-full border border-white/10 px-4 py-2">{waitLabel}</span><span className="rounded-full border border-white/10 px-4 py-2">Private reset enabled</span></div>
            <div className={`mt-10 grid gap-5 ${scope === "shop" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              <ChoiceCard title={t.next} body={t.nextHelp} icon={<Scissors className="h-6 w-6" />} disabled={!eligibleBarbers.length || !payload.services.length} onClick={() => { setFlow("next"); setForm((current) => ({ ...current, preferredBarberId: scope === "barber" ? publicBarbers[0]?.id ?? "" : "" })); setStep("details"); }} active />
              {scope === "shop" && payload.defaults.allowChooseBarber !== false ? <ChoiceCard title={t.pick} body={t.pickHelp} icon={<UserRound className="h-6 w-6" />} disabled={!publicBarbers.length || !payload.services.length} onClick={() => { setFlow("pick"); setStep("barber"); }} /> : null}
              <ChoiceCard title={t.future} body={t.futureHelp} icon={<CalendarDays className="h-6 w-6" />} disabled={!publicBarbers.length || !payload.services.length} onClick={() => { setFlow("schedule"); setStep(scope === "shop" ? "barber" : "details"); setForm((current) => ({ ...current, preferredBarberId: scope === "barber" ? publicBarbers[0]?.id ?? "" : current.preferredBarberId })); }} />
            </div>
            {!eligibleBarbers.length ? <p className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">No eligible walk-in Barber is available right now. Schedule ahead remains available when inventory exists.</p> : null}
          </div>
        ) : null}

        {step === "barber" ? (
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">Public chairs</p>
            <h2 className="mt-4 font-serif text-5xl">{t.choose}<span className="text-[#c4f24e]">.</span></h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicBarbers.map((barber) => (
                <button key={barber.id} type="button" onClick={() => { setForm((current) => ({ ...current, preferredBarberId: barber.id })); setStep("details"); }} className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-[#c4f24e]/45">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[#c4f24e]/12 font-serif text-xl text-[#c4f24e]">{initials(barber.name)}</span>
                  <h3 className="mt-5 text-xl font-bold">{barber.name}</h3>
                  <p className="mt-1 text-sm text-white/48">{barber.liveStatusLabel}</p>
                  <div className="mt-4 flex items-center justify-between text-xs"><span className="rounded-full border border-white/10 px-3 py-2">{barber.waitDisplayLabel ?? "Wait updating"}</span><ChevronRight className="h-4 w-4 text-[#c4f24e]" /></div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "details" ? (
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">Client details</p>
            <h2 className="mt-4 max-w-3xl font-serif text-5xl">{t.details}<span className="text-[#c4f24e]">.</span></h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.82fr]">
              <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.025] p-6">
                <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/48">BVRB3R username · optional</span><Input aria-label="BVRB3R Username" value={form.publicUsername} onChange={(event) => setForm((current) => ({ ...current, publicUsername: event.target.value, selectedProfileId: "" }))} placeholder="@username" /></label>
                {searchResults.length ? <div className="space-y-2 rounded-2xl border border-[#c4f24e]/20 bg-[#c4f24e]/7 p-3">{searchResults.slice(0, 3).map((client) => <button key={client.profileId} type="button" onClick={() => setForm((current) => ({ ...current, selectedProfileId: client.profileId, publicUsername: client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : current.publicUsername }))} className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/20 p-3 text-left"><span><strong>{client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : client.displayName}</strong><small className="mt-1 block text-white/44">Saved contact details stay private</small></span><span className="text-xs font-bold text-[#c4f24e]">This is me</span></button>)}</div> : null}
                {form.selectedProfileId ? <div className="rounded-2xl border border-[#c4f24e]/25 bg-[#c4f24e]/8 p-4 text-sm text-[#e8f8bc]">Welcome back. Your saved phone and email will be used privately for updates.</div> : <>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/48">Your name</span><Input aria-label="Full name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Jordan Ellis" /></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/48">Phone · for your “you’re up” text</span><Input aria-label="Phone number" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="(813) 555-0101" inputMode="tel" /></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/48">Email · for your receipt</span><Input aria-label="Email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" inputMode="email" /></label>
                  <button type="button" role="checkbox" aria-checked={form.policyAccepted} aria-label="Accept kiosk booking policy" onClick={() => setForm((current) => ({ ...current, policyAccepted: !current.policyAccepted }))} className="flex w-full items-start gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm text-white/58"><span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${form.policyAccepted ? "border-[#c4f24e] bg-[#c4f24e] text-[#050505]" : "border-white/22"}`}>{form.policyAccepted ? <Check className="h-4 w-4" /> : null}</span>{t.consent}</button>
                </>}
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-6"><ShieldCheck className="h-8 w-8 text-[#c9a87c]" /><h3 className="mt-5 font-serif text-3xl">Privacy first<span className="text-[#c4f24e]">.</span></h3><p className="mt-4 leading-7 text-white/52">The kiosk clears your details after confirmation or inactivity. Staff controls remain PIN protected.</p><div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.18em] text-white/36">Current chair</p><p className="mt-2 font-bold">{selectedBarber?.name ?? "Next eligible Barber"}</p><p className="mt-1 text-sm text-white/48">{waitLabel}</p></div></div>
            </div>
            <div className="mt-7 flex justify-end"><ShellButton disabled={!requiredDetailsReady} onClick={() => setStep("service")}>Continue <ChevronRight className="h-4 w-4" /></ShellButton></div>
          </div>
        ) : null}

        {step === "service" ? <div><p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">Services</p><h2 className="mt-4 font-serif text-5xl">{t.service}<span className="text-[#c4f24e]">.</span></h2><p className="mt-3 text-white/48">Live service inventory for this kiosk.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{payload.services.map((service) => <ChoiceCard key={service.id} title={service.name} body={service.category} icon={<Scissors className="h-5 w-5" />} active={form.serviceId === service.id} onClick={() => setForm((current) => ({ ...current, serviceId: service.id }))} />)}</div><div className="mt-7 flex justify-end"><ShellButton disabled={!form.serviceId} onClick={() => setStep(flow === "schedule" ? "schedule" : "payment")}>Continue <ChevronRight className="h-4 w-4" /></ShellButton></div></div> : null}

        {step === "schedule" ? <div><p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">Schedule ahead</p><h2 className="mt-4 font-serif text-5xl">{t.schedule}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 max-w-xl rounded-[28px] border border-white/10 bg-white/[0.025] p-6"><label className="block"><span className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-white/48">Date and time</span><Input aria-label="Date and time" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label><p className="mt-4 text-sm leading-6 text-white/44">The server confirms the nearest valid opening. This screen does not invent availability.</p></div><div className="mt-7 flex justify-end"><ShellButton disabled={!form.scheduledAt} onClick={() => setStep("payment")}>Continue <ChevronRight className="h-4 w-4" /></ShellButton></div></div> : null}

        {step === "payment" ? <div><p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">Payment intention</p><h2 className="mt-4 max-w-3xl font-serif text-5xl">{t.payment}<span className="text-[#c4f24e]">.</span></h2><p className="mt-4 max-w-2xl leading-7 text-white/48">The kiosk reserves the appointment. No payment is marked successful here. Your Barber completes the sale from Barber Checkout after service.</p><div className="mt-8 grid gap-5 md:grid-cols-2"><ChoiceCard title={t.card} body={t.cardHelp} icon={<CreditCard className="h-6 w-6" />} active={paymentIntention === "card_after_service"} onClick={() => setPaymentIntention("card_after_service")} /><ChoiceCard title={t.cash} body={t.cashHelp} icon={<WalletCards className="h-6 w-6" />} active={paymentIntention === "cash_after_service"} onClick={() => setPaymentIntention("cash_after_service")} /></div><div className="mt-7 flex justify-end"><ShellButton disabled={!canSubmit || bookingMutation.isPending} onClick={() => void submitBooking()}>{bookingMutation.isPending ? "Reserving…" : t.confirm} <ChevronRight className="h-4 w-4" /></ShellButton></div></div> : null}

        {step === "confirmation" && result ? <div className="mx-auto max-w-3xl text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#c4f24e] text-[#050505] shadow-[0_0_80px_rgba(196,242,78,0.24)]"><Check className="h-12 w-12" /></span><p className="mt-8 font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">{t.reserved}</p><h2 className="mt-4 font-serif text-6xl">{t.success}, {firstName(form.fullName || result.clientPublicUsername || "friend")}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-4 text-left sm:grid-cols-2"><div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5"><p className="text-xs uppercase tracking-[0.18em] text-white/36">Service</p><p className="mt-2 text-xl font-bold">{result.serviceName || selectedService?.name}</p><p className="mt-2 text-sm text-white/48">{flow === "schedule" ? new Date(result.startsAt).toLocaleString() : result.waitDisplayLabel ?? waitLabel}</p></div><div className="rounded-[24px] border border-[#c9a87c]/24 bg-[#c9a87c]/7 p-5"><p className="text-xs uppercase tracking-[0.18em] text-[#c9a87c]">Payment</p><p className="mt-2 text-xl font-bold">{paymentIntention === "cash_after_service" ? "Cash after service" : "Card after service"}</p><p className="mt-2 text-sm text-white/48">Payment remains due until Barber Checkout confirms it.</p></div></div><div className="mt-4 rounded-[26px] border border-[#c4f24e]/22 bg-[#c4f24e]/7 p-6 text-left"><p className="text-xs uppercase tracking-[0.18em] text-[#c4f24e]">Your Barber</p><div className="mt-4 flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#c4f24e] font-serif text-xl text-[#050505]">{initials(result.barberName)}</span><div><p className="font-serif text-2xl">{result.barberName}</p><p className="text-sm text-white/48">Identity revealed after confirmation</p></div></div></div><div className="mt-4 rounded-[26px] border border-white/10 bg-white/[0.025] p-6 text-left"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a87c]">Your confirmation text · BVRB3R</p><p className="mt-4 leading-7 text-white/64">{t.sms} {result.confirmationCode ? `Ref ${result.confirmationCode}.` : ""}</p>{result.confirmationCode ? <a className="mt-4 inline-flex text-sm font-bold text-[#c4f24e] underline underline-offset-4" href={`/r/${result.confirmationCode}`}>Open confirmation</a> : null}</div><div className="mt-8"><ShellButton onClick={() => wipe("welcome")}>{t.done}</ShellButton></div></div> : null}
      </section>

      {exitOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur"><div role="dialog" aria-modal="true" aria-label="Exit kiosk mode" className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0b0c0d] p-6"><LockKeyhole className="h-7 w-7 text-[#c9a87c]" /><h2 className="mt-4 font-serif text-3xl">Staff exit<span className="text-[#c4f24e]">.</span></h2><p className="mt-2 text-sm text-white/48">Enter the four-digit kiosk PIN.</p><Input className="mt-5 text-center text-2xl tracking-[0.5em]" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" aria-label="Exit kiosk PIN" />{pinError ? <div className="mt-4"><FeedbackBanner tone="error" message={pinError} /></div> : null}<div className="mt-5 grid grid-cols-2 gap-3"><ShellButton secondary onClick={() => setExitOpen(false)}>Cancel</ShellButton><ShellButton disabled={pin.length !== 4 || verifyPinMutation.isPending} onClick={() => void exitKiosk()}>{verifyPinMutation.isPending ? "Checking…" : t.exit}</ShellButton></div></div></div> : null}
    </main>
  );
}
