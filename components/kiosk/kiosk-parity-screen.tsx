"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
    next: "Book next available",
    pick: "Pick a Barber",
    future: "Schedule ahead",
    choose: "Choose your Barber",
    details: "Tell us where to send your updates.",
    service: "Pick your service.",
    schedule: "Choose your time.",
    payment: "How will you pay after the service?",
    card: "Card after the cut",
    cash: "Cash after the cut",
    confirm: "Reserve my spot",
    consent: "I accept the kiosk booking policy and current Terms and Privacy Policy.",
    reserved: "Appointment reserved",
    success: "You’re in",
    tap: "Tap anywhere to begin",
    privacy: "Resets between clients — your information never stays on screen.",
    back: "Back"
  },
  es: {
    live: "En vivo",
    next: "Reservar próximo disponible",
    pick: "Elegir un barbero",
    future: "Programar para después",
    choose: "Elige tu barbero",
    details: "Dinos dónde enviar tus actualizaciones.",
    service: "Elige tu servicio.",
    schedule: "Elige tu hora.",
    payment: "¿Cómo pagarás después del servicio?",
    card: "Tarjeta después del corte",
    cash: "Efectivo después del corte",
    confirm: "Reservar mi lugar",
    consent: "Acepto la política de reserva, los Términos y la Política de Privacidad.",
    reserved: "Cita reservada",
    success: "Estás dentro",
    tap: "Toca para comenzar",
    privacy: "Se reinicia entre clientes — tu información no queda en pantalla.",
    back: "Atrás"
  },
  ht: {
    live: "An dirèk",
    next: "Rezève pwochen ki disponib",
    pick: "Chwazi yon babè",
    future: "Pwograme pou pita",
    choose: "Chwazi babè ou",
    details: "Di nou kote pou nou voye mizajou yo.",
    service: "Chwazi sèvis ou.",
    schedule: "Chwazi lè ou.",
    payment: "Kijan w ap peye apre sèvis la?",
    card: "Kat apre koupe a",
    cash: "Lajan kach apre koupe a",
    confirm: "Rezève plas mwen",
    consent: "Mwen aksepte règleman rezèvasyon, Kondisyon yo ak Règleman Konfidansyalite a.",
    reserved: "Randevou rezève",
    success: "Ou ladan",
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

function Button({ children, onClick, disabled = false, secondary = false }: {
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
        ? "inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/15 px-6 font-bold text-[#f5f1e8] disabled:opacity-40"
        : "bvr-on-green inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#c4f24e] px-6 font-black text-[#050505] disabled:opacity-40"}
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
      className={`rounded-[26px] border p-5 text-left ${active ? "border-[#c4f24e]/55 bg-[#c4f24e]/10" : "border-white/10 bg-white/[0.025]"} disabled:opacity-35`}
    >
      <span className="inline-flex rounded-2xl bg-white/5 p-3 text-[#c9a87c]">{icon}</span>
      <h3 className="mt-4 font-serif text-2xl">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
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
  const idleTimer = useRef<number | null>(null);
  const confirmationTimer = useRef<number | null>(null);
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
  const selectedBarber = publicBarbers.find((barber) => barber.id === form.preferredBarberId);
  const selectedService = payload?.services.find((service) => service.id === form.serviceId);
  const requiredDetailsReady = Boolean(
    form.selectedProfileId || (form.fullName.trim() && isPhone(form.phone) && isEmail(form.email) && form.policyAccepted)
  );
  const canSubmit = requiredDetailsReady && Boolean(form.serviceId) && (flow !== "schedule" || Boolean(form.scheduledAt));
  const resetSeconds = Math.max(payload?.defaults.autoResetSeconds ?? 45, 20);

  const wipe = useCallback((nextStep: Step = "welcome") => {
    setForm({ ...EMPTY_FORM, serviceId: payload?.services[0]?.id ?? "" });
    setPaymentIntention("card_after_service");
    setResult(null);
    setError(null);
    setLocale("en");
    setLargeText(false);
    setFlow("next");
    setStep(nextStep);
  }, [payload?.services]);

  useEffect(() => {
    if (payload?.services[0]?.id && !form.serviceId) {
      setForm((current) => ({ ...current, serviceId: payload.services[0]?.id ?? "" }));
    }
  }, [form.serviceId, payload?.services]);

  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      if (bookingMutation.isPending || step === "confirmation") return;
      idleTimer.current = window.setTimeout(() => wipe("attract"), resetSeconds * 1000);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      events.forEach((event) => window.removeEventListener(event, resetIdle));
    };
  }, [bookingMutation.isPending, resetSeconds, step, wipe]);

  useEffect(() => {
    if (step !== "confirmation") return;
    confirmationTimer.current = window.setTimeout(() => wipe("welcome"), resetSeconds * 1000);
    return () => {
      if (confirmationTimer.current !== null) window.clearTimeout(confirmationTimer.current);
    };
  }, [resetSeconds, step, wipe]);

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
    return <main className="grid min-h-[100svh] place-items-center bg-[#060708] p-6"><FeedbackBanner tone="error" message={getReadableActionError(kioskQuery.error ?? new Error("Unable to load kiosk."))} /></main>;
  }

  if (step === "attract") {
    return (
      <button type="button" onClick={() => wipe("welcome")} className="grid min-h-[100svh] w-full place-items-center bg-[#060708] p-6 text-[#f5f1e8]">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">BVRB3R · {scope === "barber" ? "Barber kiosk" : "Shop kiosk"}</p>
          <h1 className="mt-5 font-serif text-6xl">Come for the cut<span className="text-[#c4f24e]">.</span></h1>
          <span className="bvr-on-green mt-8 inline-flex rounded-full bg-[#c4f24e] px-8 py-4 font-black text-[#050505]">{t.tap}</span>
          <p className="mt-5 text-sm text-white/45">{t.privacy}</p>
        </div>
      </button>
    );
  }

  const waitLabel = selectedBarber?.waitDisplayLabel
    ?? (payload.queue.averageWaitMinutes ? `About ${payload.queue.averageWaitMinutes} min` : "Wait estimate updates live");

  function goBack() {
    if (step === "barber" || step === "details") setStep("welcome");
    else if (step === "service") setStep("details");
    else if (step === "schedule") setStep("service");
    else if (step === "payment") setStep(flow === "schedule" ? "schedule" : "service");
  }

  return (
    <main className={`min-h-[100svh] bg-[#060708] text-[#f5f1e8] ${largeText ? "text-[114%]" : ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <strong className="tracking-[0.22em]">BVRB3R</strong>
          <span className="rounded-full border border-[#c9a87c]/25 px-3 py-1 text-xs text-[#c9a87c]">{scope === "barber" ? "Barber kiosk" : "Shop kiosk"}</span>
          <span className="text-xs text-white/50">{t.live}</span>
        </div>
        <div className="flex items-center gap-2">
          {(["en", "es", "ht"] as const).map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className="rounded-full border border-white/10 px-3 py-2 text-xs">{item === "ht" ? "KRE" : item.toUpperCase()}</button>)}
          <button type="button" aria-label="Toggle large text" onClick={() => setLargeText((value) => !value)} className="rounded-full border border-white/10 px-3 py-2">Aa</button>
          <button type="button" aria-label="Exit kiosk" onClick={() => { setPin(""); setPinError(null); setExitOpen(true); }} className="rounded-full border border-white/10 p-3"><LockKeyhole className="h-4 w-4" /></button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {step !== "welcome" && step !== "confirmation" ? <button type="button" onClick={goBack} className="mb-7 inline-flex items-center gap-2 text-sm text-white/55"><ArrowLeft className="h-4 w-4" />{t.back}</button> : null}
        {error ? <div className="mb-6"><FeedbackBanner tone="error" message={error} /></div> : null}

        {step === "welcome" ? (
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#c9a87c]">{payload.shop.locationLabel}</p>
            <h1 className="mt-5 font-serif text-5xl sm:text-7xl">{scope === "shop" ? <>Welcome to <span className="text-[#c4f24e]">{payload.shop.shopName}</span>.</> : <>You’re at the chair<span className="text-[#c4f24e]">.</span></>}</h1>
            <div className={`mt-10 grid gap-5 ${scope === "shop" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              <Choice title={t.next} body="The server assigns the earliest eligible chair using live shop rules." icon={<Scissors className="h-6 w-6" />} disabled={!eligibleBarbers.length || !payload.services.length} active onClick={() => { setFlow("next"); setForm((current) => ({ ...current, preferredBarberId: scope === "barber" ? publicBarbers[0]?.id ?? "" : "" })); setStep("details"); }} />
              {scope === "shop" && payload.defaults.allowChooseBarber !== false ? <Choice title={t.pick} body="Choose a specific public chair without changing walk-in rotation." icon={<UserRound className="h-6 w-6" />} disabled={!publicBarbers.length || !payload.services.length} onClick={() => { setFlow("pick"); setStep("barber"); }} /> : null}
              <Choice title={t.future} body="Choose a Barber, service, date, and time that works for you." icon={<CalendarDays className="h-6 w-6" />} disabled={!publicBarbers.length || !payload.services.length} onClick={() => { setFlow("schedule"); setStep(scope === "shop" ? "barber" : "details"); setForm((current) => ({ ...current, preferredBarberId: scope === "barber" ? publicBarbers[0]?.id ?? "" : current.preferredBarberId })); }} />
            </div>
          </div>
        ) : null}

        {step === "barber" ? <div><h2 className="font-serif text-5xl">{t.choose}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{publicBarbers.map((barber) => <button key={barber.id} type="button" onClick={() => { setForm((current) => ({ ...current, preferredBarberId: barber.id })); setStep("details"); }} className="rounded-[24px] border border-white/10 p-5 text-left"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#c4f24e]/10 text-[#c4f24e]">{initials(barber.name)}</span><h3 className="mt-4 text-xl font-bold">{barber.name}</h3><p className="mt-1 text-sm text-white/50">{barber.liveStatusLabel}</p></button>)}</div></div> : null}

        {step === "details" ? <div><h2 className="font-serif text-5xl">{t.details}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]"><div className="space-y-4 rounded-[26px] border border-white/10 p-6"><Input aria-label="BVRB3R Username" value={form.publicUsername} onChange={(event) => setForm((current) => ({ ...current, publicUsername: event.target.value, selectedProfileId: "" }))} placeholder="@username" />{searchResults.length ? <div className="space-y-2">{searchResults.slice(0, 3).map((client) => <button key={client.profileId} type="button" onClick={() => setForm((current) => ({ ...current, selectedProfileId: client.profileId, publicUsername: client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : current.publicUsername }))} className="w-full rounded-xl border border-white/10 p-3 text-left"><strong>{client.publicUsername ? `@${client.publicUsername.replace(/^@+/, "")}` : client.displayName}</strong><small className="block text-white/45">Saved contact details stay private</small></button>)}</div> : null}{form.selectedProfileId ? <p className="rounded-xl border border-[#c4f24e]/20 p-4 text-sm">Welcome back. Your saved phone and email will be used privately for updates.</p> : <><Input aria-label="Full name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Your name" /><Input aria-label="Phone number" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" /><Input aria-label="Email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" /><button type="button" role="checkbox" aria-checked={form.policyAccepted} aria-label="Accept kiosk booking policy" onClick={() => setForm((current) => ({ ...current, policyAccepted: !current.policyAccepted }))} className="flex w-full items-start gap-3 rounded-xl border border-white/10 p-4 text-left"><span className="mt-0.5">{form.policyAccepted ? <Check className="h-5 w-5 text-[#c4f24e]" /> : null}</span>{t.consent}</button></>}</div><div className="rounded-[26px] border border-white/10 p-6"><ShieldCheck className="h-8 w-8 text-[#c9a87c]" /><h3 className="mt-4 font-serif text-3xl">Privacy first.</h3><p className="mt-3 text-white/55">The kiosk clears your details after confirmation or inactivity. Staff controls remain PIN protected.</p><p className="mt-5 font-bold">{selectedBarber?.name ?? "Next eligible Barber"}</p><p className="text-sm text-white/45">{waitLabel}</p></div></div><div className="mt-7 flex justify-end"><Button disabled={!requiredDetailsReady} onClick={() => setStep("service")}>Continue <ChevronRight className="h-4 w-4" /></Button></div></div> : null}

        {step === "service" ? <div><h2 className="font-serif text-5xl">{t.service}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 grid gap-4 sm:grid-cols-2">{payload.services.map((service) => <Choice key={service.id} title={service.name} body={service.category} icon={<Scissors className="h-5 w-5" />} active={form.serviceId === service.id} onClick={() => setForm((current) => ({ ...current, serviceId: service.id }))} />)}</div><div className="mt-7 flex justify-end"><Button disabled={!form.serviceId} onClick={() => setStep(flow === "schedule" ? "schedule" : "payment")}>Continue <ChevronRight className="h-4 w-4" /></Button></div></div> : null}

        {step === "schedule" ? <div><h2 className="font-serif text-5xl">{t.schedule}<span className="text-[#c4f24e]">.</span></h2><div className="mt-8 max-w-xl rounded-[26px] border border-white/10 p-6"><Input aria-label="Date and time" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></div><div className="mt-7 flex justify-end"><Button disabled={!form.scheduledAt} onClick={() => setStep("payment")}>Continue <ChevronRight className="h-4 w-4" /></Button></div></div> : null}

        {step === "payment" ? <div><h2 className="font-serif text-5xl">{t.payment}<span className="text-[#c4f24e]">.</span></h2><p className="mt-4 text-white/50">The kiosk reserves the appointment. No payment is marked successful here. Your Barber completes the sale from Barber Checkout after service.</p><div className="mt-8 grid gap-5 md:grid-cols-2"><Choice title={t.card} body="Your Barber charges you from Checkout using an available card method." icon={<CreditCard className="h-6 w-6" />} active={paymentIntention === "card_after_service"} onClick={() => setPaymentIntention("card_after_service")} /><Choice title={t.cash} body="Your spot locks in now. Pay your Barber when the cape comes off." icon={<WalletCards className="h-6 w-6" />} active={paymentIntention === "cash_after_service"} onClick={() => setPaymentIntention("cash_after_service")} /></div><div className="mt-7 flex justify-end"><Button disabled={!canSubmit || bookingMutation.isPending} onClick={() => void submitBooking()}>{bookingMutation.isPending ? "Reserving…" : t.confirm} <ChevronRight className="h-4 w-4" /></Button></div></div> : null}

        {step === "confirmation" && result ? <div className="mx-auto max-w-3xl text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#c4f24e] text-[#050505]"><Check className="h-12 w-12" /></span><p className="mt-8 text-xs uppercase tracking-[0.3em] text-[#c9a87c]">{t.reserved}</p><h2 className="mt-4 font-serif text-6xl">{t.success}, {firstName(form.fullName || result.clientPublicUsername || "friend")}.</h2><div className="mt-8 grid gap-4 text-left sm:grid-cols-2"><div className="rounded-[24px] border border-white/10 p-5"><p className="text-xs uppercase text-white/40">Service</p><p className="mt-2 text-xl font-bold">{result.serviceName || selectedService?.name}</p></div><div className="rounded-[24px] border border-[#c9a87c]/25 p-5"><p className="text-xs uppercase text-[#c9a87c]">Payment</p><p className="mt-2 text-xl font-bold">{paymentIntention === "cash_after_service" ? "Cash after service" : "Card after service"}</p><p className="mt-2 text-sm text-white/50">Payment remains due until Barber Checkout confirms it.</p></div></div><div className="mt-7"><Button onClick={() => wipe("welcome")}>Done — next client</Button></div></div> : null}
      </section>

      {exitOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6"><div className="w-full max-w-md rounded-[26px] border border-white/10 bg-[#0b0c0d] p-6"><h2 className="font-serif text-3xl">Staff exit</h2><Input aria-label="Kiosk PIN" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="PIN" inputMode="numeric" />{pinError ? <div className="mt-4"><FeedbackBanner tone="error" message={pinError} /></div> : null}<div className="mt-6 flex justify-end gap-3"><Button secondary onClick={() => setExitOpen(false)}>Cancel</Button><Button disabled={!pin || verifyPinMutation.isPending} onClick={() => void exitKiosk()}>{verifyPinMutation.isPending ? "Checking…" : "Exit kiosk"}</Button></div></div></div> : null}
    </main>
  );
}
