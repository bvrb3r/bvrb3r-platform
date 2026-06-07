"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, Phone, TimerReset, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useKioskBookingMutation,
  useKioskClientSearchQuery,
  useKioskDeviceState,
  useKioskPayloadQuery,
  useVerifyKioskPinMutation,
  useKioskWaitlistMutation
} from "@/lib/kiosk/client";
import { getReadableActionError } from "@/lib/utils/feedback";

type KioskStep = "welcome" | "booking" | "walk_in";

type BookingFormState = {
  fullName: string;
  phone: string;
  email: string;
  publicUsername: string;
  selectedProfileId: string;
  serviceId: string;
  preferredBarberId: string;
  kioskAction: "book_next_opening" | "schedule_ahead";
  scheduledAt: string;
};

type WalkInFormState = {
  fullName: string;
  phone: string;
  email: string;
  serviceId: string;
};

type SuccessState =
  | {
      kind: "booking";
      title: string;
      detail: string;
      helper: string;
    }
  | {
      kind: "walk_in";
      title: string;
      detail: string;
      helper: string;
    }
  | null;

function LoadingCard() {
  return (
    <Card className="rounded-[36px] p-8">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="mt-4 h-5 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-[28px]" />
        <Skeleton className="h-28 rounded-[28px]" />
      </div>
    </Card>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getStepFromMode(mode: string | null): KioskStep {
  if (mode === "booking") {
    return "booking";
  }

  if (mode === "walk-in" || mode === "walk_in") {
    return "walk_in";
  }

  return "welcome";
}

export function KioskModeScreen({ shopId, scope = "shop" }: { shopId: string; scope?: "shop" | "barber" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kioskQuery = useKioskPayloadQuery(shopId, scope);
  const bookingMutation = useKioskBookingMutation(shopId, scope);
  const waitlistMutation = useKioskWaitlistMutation(shopId);
  const verifyPinMutation = useVerifyKioskPinMutation();
  const kioskDevice = useKioskDeviceState();
  const mode = searchParams.get("mode");
  const [step, setStep] = useState<KioskStep>("welcome");
  const [success, setSuccess] = useState<SuccessState>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [exitPin, setExitPin] = useState("");
  const [exitError, setExitError] = useState<string | null>(null);
  const bookingFormRef = useRef<BookingFormState>({
    fullName: "",
    phone: "",
    email: "",
    publicUsername: "",
    selectedProfileId: "",
    serviceId: "",
    preferredBarberId: "",
    kioskAction: "book_next_opening",
    scheduledAt: ""
  });
  const walkInFormRef = useRef<WalkInFormState>({
    fullName: "",
    phone: "",
    email: "",
    serviceId: ""
  });
  const [bookingForm, setBookingForm] = useState<BookingFormState>(bookingFormRef.current);
  const [walkInForm, setWalkInForm] = useState<WalkInFormState>(walkInFormRef.current);
  const clientSearchQuery = useKioskClientSearchQuery(bookingForm.publicUsername);

  const payload = kioskQuery.data;
  const formError = bookingMutation.error || waitlistMutation.error;
  const autoResetSeconds = payload?.defaults.autoResetSeconds ?? 10;
  const isSubmitting = bookingMutation.isPending || waitlistMutation.isPending;
  const hasBookableKioskOptions = Boolean(payload?.services.length && payload.barbers.length);
  const selectedBarber = payload?.barbers.find((barber) => barber.id === bookingForm.preferredBarberId) ?? payload?.barbers[0];
  const waitLabel = selectedBarber?.waitDisplayLabel ?? (payload?.queue.averageWaitMinutes ? `${payload.queue.averageWaitMinutes} min average wait` : "Ready now");
  const clientSearchResults = clientSearchQuery.data?.results ?? [];

  useEffect(() => {
    setStep(getStepFromMode(mode));
    setInteractionError(null);
  }, [mode]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    if (!bookingFormRef.current.serviceId && payload.services[0]?.id) {
      const next = {
        ...bookingFormRef.current,
        serviceId: payload.services[0].id
      };
      bookingFormRef.current = next;
      setBookingForm(next);
    }

    if (!walkInFormRef.current.serviceId && payload.services[0]?.id) {
      const next = {
        ...walkInFormRef.current,
        serviceId: payload.services[0].id
      };
      walkInFormRef.current = next;
      setWalkInForm(next);
    }
  }, [payload]);

  useEffect(() => {
    if (!success) {
      setCountdown(null);
      return;
    }

    setCountdown(autoResetSeconds);
    const intervalId = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null || current <= 1) {
          window.clearInterval(intervalId);
          setSuccess(null);
          setStep("welcome");
          router.replace((scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/${shopId}`) as Route);
          return null;
        }

        return current - 1;
      });
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoResetSeconds, router, scope, shopId, success]);

  const queueLabel = useMemo(() => {
    if (!payload) {
      return "";
    }

    if (payload.queue.activeCount) {
      return `${payload.queue.activeCount} guests waiting - ${payload.queue.averageWaitMinutes} min average wait`;
    }

    return "Fastest chair routing is ready right now";
  }, [payload]);

  function resetToWelcome() {
    setInteractionError(null);
    setSuccess(null);
    setStep("welcome");
    router.replace((scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/${shopId}`) as Route);
  }

  function openStep(nextStep: Exclude<KioskStep, "welcome">) {
    setInteractionError(null);
    setSuccess(null);
    setStep(nextStep);
    const basePath = scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/${shopId}`;
    router.push(`${basePath}?mode=${nextStep === "walk_in" ? "walk-in" : "booking"}` as Route);
  }

  function handleUnlock() {
    setExitError(null);
    setExitPin("");
    setExitPromptOpen(true);
  }

  async function handleExitKiosk() {
    setExitError(null);
    try {
      await verifyPinMutation.mutateAsync({ scope, targetReference: shopId, pin: exitPin });
      kioskDevice.deactivate();
      const basePath = scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/${shopId}`;
      router.push(`/login?redirect=${encodeURIComponent(basePath)}&unlock=true` as Route);
    } catch (error) {
      setExitError(getReadableActionError(error as { message?: string; status?: number; code?: string }));
    }
  }

  async function handleBookingSubmit() {
    if (!bookingForm.selectedProfileId && !bookingForm.publicUsername.trim()) {
      setInteractionError("Choose your BVRB3R username before confirming.");
      return;
    }

    if (!bookingForm.fullName.trim() || !bookingForm.phone.trim() || !bookingForm.serviceId) {
      setInteractionError("Add your full name, phone number, and service before booking.");
      return;
    }

    setInteractionError(null);
    const result = await bookingMutation.mutateAsync({
      fullName: bookingForm.fullName.trim(),
      phone: bookingForm.phone.trim(),
      email: bookingForm.email.trim() || undefined,
      publicUsername: bookingForm.publicUsername.trim() || undefined,
      selectedProfileId: bookingForm.selectedProfileId || undefined,
      serviceId: bookingForm.serviceId,
      preferredBarberId: bookingForm.preferredBarberId || undefined,
      kioskAction: bookingForm.kioskAction,
      scheduledAt: bookingForm.scheduledAt || undefined
    });

    bookingFormRef.current = {
      ...bookingFormRef.current,
      fullName: "",
      phone: "",
      email: "",
      publicUsername: "",
      selectedProfileId: "",
      preferredBarberId: "",
      kioskAction: "book_next_opening",
      scheduledAt: ""
    };
    setBookingForm(bookingFormRef.current);
    setSuccess({
      kind: "booking",
      title: "Appointment booked",
      detail: `${result.serviceName} with ${result.barberName} at ${formatTime(result.startsAt)}`,
      helper: [result.confirmationCode ? `Confirmation ${result.confirmationCode}` : "Your appointment is confirmed.", result.waitDisplayLabel ? `Estimated wait ${result.waitDisplayLabel}` : null, result.activationInviteQueued ? "Your BVRB3R activation link is queued." : null].filter(Boolean).join(" ")
    });
  }

  async function handleWalkInSubmit() {
    if (!walkInForm.fullName.trim() || !walkInForm.phone.trim()) {
      setInteractionError("Add your full name and phone number before joining the walk-in queue.");
      return;
    }

    setInteractionError(null);
    const result = await waitlistMutation.mutateAsync({
      fullName: walkInForm.fullName.trim(),
      phone: walkInForm.phone.trim(),
      email: walkInForm.email.trim() || undefined,
      serviceId: walkInForm.serviceId || undefined
    });

    walkInFormRef.current = {
      ...walkInFormRef.current,
      fullName: "",
      phone: "",
      email: ""
    };
    setWalkInForm(walkInFormRef.current);
    setSuccess({
      kind: "walk_in",
      title: `You are #${result.queuePosition} in line`,
      detail: result.bestBarberName
        ? `${result.bestBarberName} is the fastest available chair right now.`
        : "The shop will route you to the fastest available chair.",
      helper: `Estimated wait ${result.estimatedWaitMinutes} minutes`
    });
  }

  if (kioskQuery.isLoading && !payload) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <LoadingCard />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Card className="rounded-[36px] p-8">
          <FeedbackBanner tone="error" message={getReadableActionError(kioskQuery.error ?? new Error("Unable to load kiosk mode."))} />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,rgba(124,255,0,0.14),transparent_42%),linear-gradient(180deg,#050505_0%,#0a0a0a_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Card className="overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,15,15,0.98),rgba(7,7,7,0.98))] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#cfff93]">{scope === "barber" ? "Barber kiosk" : "Shop kiosk"}</p>
              <h1 className="mt-3 wrap-safe text-4xl font-semibold sm:text-6xl" data-display="true">{payload.shop.shopName}</h1>
              <p className="mt-4 max-w-2xl wrap-safe text-base leading-8 text-white/66">{payload.shop.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em]">
                <span className="status-pill text-[#d7ffab]">{payload.shop.locationLabel}</span>
                <span className="status-pill text-white/58">{queueLabel}</span>
                {kioskDevice.state.activeShopId === payload.shop.shopId ? (
                  <span className="status-pill text-[#d7ffab]">Locked on this device</span>
                ) : (
                  <span className="status-pill text-white/52">Preview mode</span>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Staff unlock"
              onClick={handleUnlock}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/8 bg-black/25 text-white/48 transition hover:border-white/12 hover:text-white/72"
              style={{ pointerEvents: "auto" }}
            >
              <LockKeyhole className="h-4 w-4" />
            </button>
          </div>

          {exitPromptOpen ? (
            <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/76 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Exit kiosk mode">
              <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
                <div className="flex items-start gap-3">
                  <span className="rounded-[12px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 p-2 text-[#A3FF12]">
                    <LockKeyhole className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Staff unlock</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Enter kiosk PIN</h2>
                    <p className="mt-2 text-sm leading-6 text-white/58">Exit requires the 4-digit kiosk PIN.</p>
                  </div>
                </div>
                <Input
                  className="mt-5 text-center text-2xl tracking-[0.45em]"
                  inputMode="numeric"
                  maxLength={4}
                  value={exitPin}
                  onChange={(event) => setExitPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  aria-label="Exit kiosk PIN"
                />
                {exitError ? <div className="mt-4"><FeedbackBanner tone="error" message={exitError} /></div> : null}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={() => setExitPromptOpen(false)}>Cancel</Button>
                  <Button type="button" disabled={verifyPinMutation.isPending || exitPin.length !== 4} onClick={() => void handleExitKiosk()}>
                    {verifyPinMutation.isPending ? "Checking..." : "Exit"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {success ? (
            <div className="mt-8 rounded-[30px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-6 text-center">
              <p className="surface-label text-[#d7ffab]">{success.kind === "booking" ? "Booking confirmed" : "Walk-in saved"}</p>
              <h2 className="mt-3 wrap-safe text-3xl font-semibold text-white">{success.title}</h2>
              <p className="mt-4 wrap-safe text-base leading-8 text-white/70">{success.detail}</p>
              <p className="mt-2 wrap-safe text-sm text-white/54">{success.helper}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
                <TimerReset className="h-4 w-4 text-[#d7ffab]" />
                Returning to welcome screen {countdown ? `in ${countdown}s` : "now"}
              </div>
              <div className="mt-6">
                <Button variant="secondary" onClick={resetToWelcome}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              {formError ? (
                <div className="mt-6">
                  <FeedbackBanner tone="error" message={getReadableActionError(formError)} />
                </div>
              ) : null}
              {interactionError ? (
                <div className="mt-6">
                  <FeedbackBanner tone="error" message={interactionError} />
                </div>
              ) : null}

              {step === "welcome" ? (
                hasBookableKioskOptions ? (
                  <div className="relative z-10 mt-8 grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingForm((current) => ({ ...current, kioskAction: "book_next_opening", preferredBarberId: "" }));
                        openStep("booking");
                      }}
                      className="rounded-[32px] border border-[#cfff93]/28 bg-[linear-gradient(135deg,rgba(124,255,0,0.16),rgba(16,16,16,0.96))] p-6 text-left transition hover:-translate-y-0.5 hover:border-[#cfff93]/40"
                      style={{ pointerEvents: "auto" }}
                    >
                      <p className="surface-label text-[#d7ffab]">{scope === "barber" ? "Book next opening" : "Next available barber"}</p>
                      <h2 className="mt-3 wrap-safe text-3xl font-semibold">Reserve the fastest open chair</h2>
                      <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">
                        {scope === "barber"
                          ? "Enter your info, pick your service, and reserve the next available time with this barber."
                          : "Enter your info, pick your service, and the shop will place you into the fastest available booking slot."}
                      </p>
                    </button>
                    {scope === "shop" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBookingForm((current) => ({ ...current, kioskAction: "book_next_opening" }));
                          openStep("booking");
                        }}
                        className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#7CFF00]/16 hover:bg-black/28"
                        style={{ pointerEvents: "auto" }}
                      >
                        <p className="surface-label">I already have a barber</p>
                        <h2 className="mt-3 wrap-safe text-3xl font-semibold">Choose a barber</h2>
                        <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">Pick from active shop barbers, then confirm your service and wait time.</p>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setBookingForm((current) => ({ ...current, kioskAction: "schedule_ahead" }));
                        openStep("booking");
                      }}
                      className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#7CFF00]/16 hover:bg-black/28"
                      style={{ pointerEvents: "auto" }}
                    >
                      <p className="surface-label">Schedule {scope === "shop" ? "for later" : "ahead"}</p>
                      <h2 className="mt-3 wrap-safe text-3xl font-semibold">Pick a future time</h2>
                      <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">Choose your service and confirm a future slot before anything is booked.</p>
                    </button>
                    {scope === "shop" ? (
                      <button
                        type="button"
                        onClick={() => openStep("walk_in")}
                        className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#7CFF00]/16 hover:bg-black/28"
                        style={{ pointerEvents: "auto" }}
                      >
                        <p className="surface-label">I already have an appointment</p>
                        <h2 className="mt-3 wrap-safe text-3xl font-semibold">Check in</h2>
                        <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">Find today&apos;s appointment or ask the front desk for help if it cannot be found.</p>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-8 rounded-[30px] border border-white/8 bg-black/22 p-6">
                    <p className="surface-label text-[#d7ffab]">Kiosk unavailable</p>
                    <h2 className="mt-3 wrap-safe text-3xl font-semibold">
                      {scope === "shop" ? "No active barbers available for kiosk booking." : "No services are available for kiosk booking."}
                    </h2>
                    <p className="mt-4 wrap-safe text-sm leading-7 text-white/62">
                      Need help? Ask the barber or front desk.
                    </p>
                  </div>
                )
              ) : null}

              {step === "booking" ? (
                <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-3 block surface-label">Full name</label>
                      <Input value={bookingForm.fullName} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({ ...current, fullName: event.target.value }));
                      }} placeholder="Jordan Ellis" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">Phone number</label>
                      <Input value={bookingForm.phone} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({ ...current, phone: event.target.value }));
                      }} placeholder="(813) 555-0101" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">Email</label>
                      <Input value={bookingForm.email} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({ ...current, email: event.target.value }));
                      }} placeholder="name@example.com" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">BVRB3R username</label>
                      <Input value={bookingForm.publicUsername} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({
                          ...current,
                          publicUsername: event.target.value,
                          selectedProfileId: ""
                        }));
                      }} placeholder="@yourusername" />
                      <p className="mt-2 text-xs leading-5 text-white/46">New clients create a username here. Existing clients can search and select their profile.</p>
                      {clientSearchResults.length > 0 && !bookingForm.selectedProfileId ? (
                        <div className="mt-3 space-y-2">
                          {clientSearchResults.map((result) => (
                            <button
                              key={result.profileId}
                              type="button"
                              onClick={() => {
                                setInteractionError(null);
                                setBookingForm((current) => ({
                                  ...current,
                                  selectedProfileId: result.profileId,
                                  publicUsername: result.publicUsername ? `@${result.publicUsername}` : current.publicUsername,
                                  fullName: result.displayName
                                }));
                              }}
                              className="flex w-full items-center justify-between rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-left transition hover:border-[#7CFF00]/22"
                              style={{ pointerEvents: "auto" }}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-white">{result.publicUsername ? `@${result.publicUsername}` : result.displayName}</span>
                                <span className="block text-xs text-white/48">{[result.displayName, result.locationLabel].filter(Boolean).join(" - ")}</span>
                              </span>
                              <span className="status-pill text-[#d7ffab]">This is me</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {bookingForm.selectedProfileId ? (
                        <p className="mt-3 rounded-[16px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-4 py-3 text-sm text-[#d7ffab]">Existing profile selected.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-3 block surface-label">Service</label>
                      <Select value={bookingForm.serviceId} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({ ...current, serviceId: event.target.value }));
                      }}>
                        {payload.services.map((service) => (
                          <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                      </Select>
                    </div>
                    {payload.defaults.allowChooseBarber !== false ? (
                    <div>
                      <label className="mb-3 block surface-label">Preferred barber</label>
                      <Select value={bookingForm.preferredBarberId} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({ ...current, preferredBarberId: event.target.value }));
                      }}>
                        <option value="">Fastest available barber</option>
                        {payload.barbers.map((barber) => (
                          <option key={barber.id} value={barber.id}>{barber.name} - {barber.liveStatusLabel}</option>
                        ))}
                      </Select>
                    </div>
                    ) : null}
                    {bookingForm.kioskAction === "schedule_ahead" ? (
                      <div>
                        <label className="mb-3 block surface-label">Preferred time</label>
                        <Input
                          type="datetime-local"
                          value={bookingForm.scheduledAt}
                          onChange={(event) => {
                            setInteractionError(null);
                            setBookingForm((current) => ({ ...current, scheduledAt: event.target.value }));
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4 text-sm leading-6 text-white/70">
                      <p className="surface-label text-[#d7ffab]">Estimated wait</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{waitLabel}</p>
                      <p className="mt-2 wrap-safe text-white/56">You will review and confirm before an appointment is created.</p>
                    </div>
                    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62">
                      Booking stays on the existing booking rail, requires this confirmation step, and uses canonical availability before creating an appointment.
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex flex-wrap gap-2">
                    <Button disabled={isSubmitting} onClick={() => void handleBookingSubmit()}>
                      {bookingMutation.isPending ? "Booking..." : bookingForm.kioskAction === "schedule_ahead" ? "Schedule appointment" : "Book next opening"}
                    </Button>
                    <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Back</Button>
                  </div>
                </div>
              ) : null}

              {step === "walk_in" ? (
                <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-3 block surface-label">Full name</label>
                      <Input value={walkInForm.fullName} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, fullName: event.target.value }));
                      }} placeholder="Jordan Ellis" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">Phone number</label>
                      <Input value={walkInForm.phone} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, phone: event.target.value }));
                      }} placeholder="(813) 555-0101" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">Email</label>
                      <Input value={walkInForm.email} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, email: event.target.value }));
                      }} placeholder="name@example.com" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-3 block surface-label">Service</label>
                      <Select value={walkInForm.serviceId} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, serviceId: event.target.value }));
                      }}>
                        {payload.services.map((service) => (
                          <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4 text-sm leading-6 text-white/70">
                      <div className="flex items-center gap-2 text-[#d7ffab]">
                        <Phone className="h-4 w-4" />
                        Fastest chair routing
                      </div>
                      <p className="mt-3 wrap-safe">{queueLabel}</p>
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex flex-wrap gap-2">
                    <Button disabled={isSubmitting} onClick={() => void handleWalkInSubmit()}>
                      {waitlistMutation.isPending ? "Joining..." : "Join walk-in queue"}
                    </Button>
                    <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Back</Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </Card>

        <div className="mt-4 text-center text-xs uppercase tracking-[0.22em] text-white/34">
          <span className="inline-flex items-center gap-2">
            <UserRound className="h-4 w-4 text-[#baff69]" />
            Powered quietly by BVRB3R
          </span>
        </div>
      </div>
    </div>
  );
}
