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
  useKioskAppointmentCheckInMutation,
  useKioskAppointmentSearchMutation,
  useKioskBookingMutation,
  useKioskClientBridgeMutation,
  useKioskClientSearchQuery,
  useKioskDeviceState,
  useKioskPayloadQuery,
  useVerifyKioskPinMutation,
  useKioskWaitlistMutation
} from "@/lib/kiosk/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { sourceBadge } from "@/lib/clientbridge/domain";

type KioskStep = "welcome" | "booking" | "pick_barber" | "walk_in" | "check_in";

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
  policyAccepted: boolean;
};

type WalkInFormState = {
  fullName: string;
  phone: string;
  email: string;
  serviceId: string;
  policyAccepted: boolean;
};

type CheckInFormState = {
  kind: "phone" | "email" | "name_time" | "code" | "qr";
  value: string;
  appointmentTime: string;
  contactPhone: string;
  contactEmail: string;
  operationalSmsConsent: boolean;
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
  | {
      kind: "check_in";
      title: string;
      detail: string;
      helper: string;
      waitlistEntryId: string;
      contactPhone: string;
      contactEmail: string;
      bridgeResolved: boolean;
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

function formatLastRefreshed(iso?: string) {
  if (!iso) {
    return "Refresh available";
  }

  return `Last refreshed ${formatTime(iso)}`;
}

function isCleanPhone(value: string) {
  return value.replace(/\D/g, "").length >= 7;
}

function isCleanEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isUnavailableWaitLabel(label?: string) {
  return ["not available today", "schedule ahead only"].includes(label?.toLowerCase() ?? "");
}

function newQueueRequestKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStepFromMode(mode: string | null): KioskStep {
  if (mode === "booking") {
    return "booking";
  }

  if (mode === "pick-barber" || mode === "pick_barber") {
    return "pick_barber";
  }

  if (mode === "walk-in" || mode === "walk_in") {
    return "walk_in";
  }
  if (mode === "check-in" || mode === "check_in") {
    return "check_in";
  }

  return "welcome";
}

export function KioskModeScreen({ shopId, scope = "shop" }: { shopId: string; scope?: "shop" | "barber" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kioskQuery = useKioskPayloadQuery(shopId, scope);
  const bookingMutation = useKioskBookingMutation(shopId, scope);
  const waitlistMutation = useKioskWaitlistMutation(shopId);
  const appointmentSearchMutation = useKioskAppointmentSearchMutation(shopId);
  const appointmentCheckInMutation = useKioskAppointmentCheckInMutation(shopId);
  const clientBridgeMutation = useKioskClientBridgeMutation(shopId);
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
  const [idleWarning, setIdleWarning] = useState(false);
  const idleWarningTimerRef = useRef<number | null>(null);
  const idleResetTimerRef = useRef<number | null>(null);
  const resetToWelcomeRef = useRef<() => void>(() => undefined);
  const bookingFormRef = useRef<BookingFormState>({
    fullName: "",
    phone: "",
    email: "",
    publicUsername: "",
    selectedProfileId: "",
    serviceId: "",
    preferredBarberId: "",
    kioskAction: "book_next_opening",
    scheduledAt: "",
    policyAccepted: false
  });
  const walkInFormRef = useRef<WalkInFormState>({
    fullName: "",
    phone: "",
    email: "",
    serviceId: "",
    policyAccepted: false
  });
  const walkInRequestRef = useRef<{ payload: string; key: string } | null>(null);
  const checkInRequestRef = useRef<{ payload: string; key: string } | null>(null);
  const [checkInForm, setCheckInForm] = useState<CheckInFormState>({
    kind: "phone",
    value: "",
    appointmentTime: "",
    contactPhone: "",
    contactEmail: "",
    operationalSmsConsent: false
  });
  const [bookingForm, setBookingForm] = useState<BookingFormState>(bookingFormRef.current);
  const [walkInForm, setWalkInForm] = useState<WalkInFormState>(walkInFormRef.current);
  const clientSearchQuery = useKioskClientSearchQuery(bookingForm.publicUsername);

  const payload = kioskQuery.data;
  const formError = bookingMutation.error
    || waitlistMutation.error
    || appointmentSearchMutation.error
    || appointmentCheckInMutation.error
    || clientBridgeMutation.error;
  const autoResetSeconds = Math.min(8, Math.max(payload?.defaults.autoResetSeconds ?? 7, 5));
  const inactivityResetSeconds = Math.min(90, Math.max(payload?.defaults.inactivityResetSeconds ?? 75, 60));
  const isSubmitting = bookingMutation.isPending
    || waitlistMutation.isPending
    || appointmentSearchMutation.isPending
    || appointmentCheckInMutation.isPending
    || clientBridgeMutation.isPending;
  const hasServiceOptions = Boolean(payload?.services.length);
  const eligibleWalkInBarbers = useMemo(
    () => (payload?.barbers ?? []).filter((barber) => barber.acceptsWalkIns && !isUnavailableWaitLabel(barber.waitDisplayLabel)),
    [payload?.barbers]
  );
  const pickableBarbers = useMemo(
    () => (payload?.barbers ?? []).filter((barber) => !isUnavailableWaitLabel(barber.waitDisplayLabel)),
    [payload?.barbers]
  );
  const hasEligibleNextAvailable = hasServiceOptions && eligibleWalkInBarbers.length > 0;
  const hasPickableBarbers = hasServiceOptions && pickableBarbers.length > 0;
  const hasBookableKioskOptions = hasServiceOptions && (hasEligibleNextAvailable || hasPickableBarbers);
  const selectedBarber = payload?.barbers.find((barber) => barber.id === bookingForm.preferredBarberId)
    ?? eligibleWalkInBarbers[0]
    ?? payload?.barbers[0];
  const waitLabel = selectedBarber?.waitDisplayLabel
    ?? (payload?.queue.averageWaitMinutes ? `About ${payload.queue.averageWaitMinutes} min average wait` : "Wait time unavailable");
  const waitStateLabel = isUnavailableWaitLabel(waitLabel) || waitLabel === "Wait time unavailable" ? "Wait unavailable" : "Estimated wait";
  const clientSearchResults = clientSearchQuery.data?.results ?? [];
  const usernameSearchLength = bookingForm.publicUsername.trim().replace(/^@+/, "").length;

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
    if (success.kind === "check_in" && !success.bridgeResolved) {
      setCountdown(null);
      return;
    }

    setCountdown(autoResetSeconds);
    const intervalId = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null || current <= 1) {
          window.clearInterval(intervalId);
          resetToWelcomeRef.current();
          return null;
        }

        return current - 1;
      });
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoResetSeconds, success]);

  function resetFormsToDefaults() {
    const defaultServiceId = payload?.services[0]?.id ?? "";
    const nextBookingForm = {
      fullName: "",
      phone: "",
      email: "",
      publicUsername: "",
      selectedProfileId: "",
      serviceId: defaultServiceId,
      preferredBarberId: "",
      kioskAction: "book_next_opening" as const,
      scheduledAt: "",
      policyAccepted: false
    };
    const nextWalkInForm = {
      fullName: "",
      phone: "",
      email: "",
      serviceId: defaultServiceId,
      policyAccepted: false
    };
    bookingFormRef.current = nextBookingForm;
    walkInFormRef.current = nextWalkInForm;
    setBookingForm(nextBookingForm);
    setWalkInForm(nextWalkInForm);
    walkInRequestRef.current = null;
    checkInRequestRef.current = null;
    setCheckInForm({
      kind: "phone",
      value: "",
      appointmentTime: "",
      contactPhone: "",
      contactEmail: "",
      operationalSmsConsent: false
    });
    appointmentSearchMutation.reset();
    appointmentCheckInMutation.reset();
    clientBridgeMutation.reset();
  }

  const queueLabel = useMemo(() => {
    if (!payload) {
      return "";
    }

    if (!hasServiceOptions) {
      return "Services need setup";
    }

    if (!eligibleWalkInBarbers.length) {
      return "No eligible walk-in barber right now";
    }

    if (payload.queue.activeCount && payload.queue.averageWaitMinutes > 0) {
      return `${payload.queue.activeCount} guests waiting - about ${payload.queue.averageWaitMinutes} min average wait`;
    }

    if (payload.queue.activeCount) {
      return `${payload.queue.activeCount} guests waiting - wait estimate unavailable`;
    }

    return "No active walk-in wait right now";
  }, [eligibleWalkInBarbers.length, hasServiceOptions, payload]);

  function resetToWelcome() {
    setInteractionError(null);
    setSuccess(null);
    setStep("welcome");
    resetFormsToDefaults();
    router.replace((scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/shop/${shopId}`) as Route);
  }

  resetToWelcomeRef.current = resetToWelcome;

  useEffect(() => {
    const clearIdleTimers = () => {
      if (idleWarningTimerRef.current !== null) {
        window.clearTimeout(idleWarningTimerRef.current);
      }
      if (idleResetTimerRef.current !== null) {
        window.clearTimeout(idleResetTimerRef.current);
      }
    };
    const armIdleTimers = () => {
      clearIdleTimers();
      setIdleWarning(false);
      if (success || isSubmitting || exitPromptOpen || step === "welcome") {
        return;
      }
      idleWarningTimerRef.current = window.setTimeout(() => {
        setIdleWarning(true);
        idleResetTimerRef.current = window.setTimeout(() => {
          setIdleWarning(false);
          resetToWelcomeRef.current();
        }, 15_000);
      }, Math.max(inactivityResetSeconds - 15, 45) * 1_000);
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, armIdleTimers, { passive: true }));
    armIdleTimers();
    return () => {
      clearIdleTimers();
      events.forEach((event) => window.removeEventListener(event, armIdleTimers));
    };
  }, [exitPromptOpen, inactivityResetSeconds, isSubmitting, step, success]);

  function openStep(nextStep: Exclude<KioskStep, "welcome">) {
    setInteractionError(null);
    setSuccess(null);
    setStep(nextStep);
    const basePath = scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/shop/${shopId}`;
    const modeValue = nextStep === "walk_in" ? "walk-in" : nextStep === "pick_barber" ? "pick-barber" : "booking";
    router.push(`${basePath}?mode=${modeValue}` as Route);
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
      const basePath = scope === "barber" ? `/kiosk/barber/${shopId}` : `/kiosk/shop/${shopId}`;
      router.push(`/login?redirect=${encodeURIComponent(basePath)}&unlock=true` as Route);
    } catch (error) {
      setExitError(getReadableActionError(error as { message?: string; status?: number; code?: string }));
    }
  }

  async function handleBookingSubmit() {
    if (bookingForm.kioskAction === "book_next_opening" && !bookingForm.preferredBarberId && !hasEligibleNextAvailable) {
      setInteractionError("No eligible barber is available for walk-ins right now.");
      return;
    }

    if (!bookingForm.selectedProfileId && !bookingForm.publicUsername.trim()) {
      setInteractionError("Choose your BVRB3R username before confirming.");
      return;
    }

    if (!bookingForm.selectedProfileId && (!bookingForm.fullName.trim() || !bookingForm.phone.trim() || !bookingForm.email.trim())) {
      setInteractionError("Add your full name, phone number, email, and service before booking.");
      return;
    }

    if (!bookingForm.selectedProfileId && !isCleanPhone(bookingForm.phone)) {
      setInteractionError("Enter a valid phone number for booking updates.");
      return;
    }

    if (!bookingForm.selectedProfileId && !isCleanEmail(bookingForm.email)) {
      setInteractionError("Enter a valid email address for booking updates.");
      return;
    }

    if (!bookingForm.selectedProfileId && !bookingForm.policyAccepted) {
      setInteractionError("Accept the kiosk booking policy before confirming.");
      return;
    }

    if (!bookingForm.serviceId) {
      setInteractionError("Choose your service before booking.");
      return;
    }

    setInteractionError(null);
    const contactPayload = bookingForm.selectedProfileId
      ? {}
      : {
          fullName: bookingForm.fullName.trim(),
          phone: bookingForm.phone.trim(),
          email: bookingForm.email.trim() || undefined
        };
    const result = await bookingMutation.mutateAsync({
      ...contactPayload,
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
      serviceId: payload?.services[0]?.id ?? "",
      preferredBarberId: "",
      kioskAction: "book_next_opening",
      scheduledAt: "",
      policyAccepted: false
    };
    setBookingForm(bookingFormRef.current);
    setSuccess({
      kind: "booking",
      title: "Appointment booked",
      detail: `${result.serviceName} with ${result.barberName} at ${formatTime(result.startsAt)}`,
      helper: [result.clientPublicUsername ? `Booking as @${result.clientPublicUsername.replace(/^@+/, "")}.` : null, result.confirmationCode ? `Confirmation ${result.confirmationCode}` : "Your appointment is confirmed.", result.waitDisplayLabel ? `Estimated wait ${result.waitDisplayLabel}` : null, result.activationInviteQueued ? "Your BVRB3R activation link is queued." : null].filter(Boolean).join(" ")
    });
  }

  async function handleWalkInSubmit() {
    if (!walkInForm.fullName.trim() || !walkInForm.phone.trim()) {
      setInteractionError("Add your full name and phone number before joining the walk-in queue.");
      return;
    }

    if (!isCleanPhone(walkInForm.phone)) {
      setInteractionError("Enter a valid phone number for queue updates.");
      return;
    }

    if (walkInForm.email.trim() && !isCleanEmail(walkInForm.email)) {
      setInteractionError("Enter a valid email address or leave email blank for the walk-in queue.");
      return;
    }

    if (!walkInForm.policyAccepted) {
      setInteractionError("Accept the kiosk walk-in policy before joining the queue.");
      return;
    }

    setInteractionError(null);
    const requestPayload = JSON.stringify({
      fullName: walkInForm.fullName.trim(),
      phone: walkInForm.phone.replace(/\D/g, ""),
      email: walkInForm.email.trim().toLowerCase(),
      serviceId: walkInForm.serviceId
    });
    if (walkInRequestRef.current?.payload !== requestPayload) {
      walkInRequestRef.current = { payload: requestPayload, key: newQueueRequestKey() };
    }
    const result = await waitlistMutation.mutateAsync({
      fullName: walkInForm.fullName.trim(),
      phone: walkInForm.phone.trim(),
      email: walkInForm.email.trim() || undefined,
      serviceId: walkInForm.serviceId || undefined,
      idempotencyKey: walkInRequestRef.current.key,
      operationalSmsConsent: true
    });

    walkInFormRef.current = {
      ...walkInFormRef.current,
      fullName: "",
      phone: "",
      email: "",
      serviceId: payload?.services[0]?.id ?? "",
      policyAccepted: false
    };
    setWalkInForm(walkInFormRef.current);
    walkInRequestRef.current = null;
    setSuccess({
      kind: "walk_in",
      title: `You are #${result.queuePosition} in line`,
      detail: result.bestBarberName
        ? `${result.bestBarberName} is the current best eligible chair.`
        : "The shop will route you using the current walk-in queue.",
      helper: `${result.duplicate ? "Your existing live spot was kept — no duplicate was created. " : ""}Estimated wait ${result.estimatedWaitMinutes} minutes. ${result.waitReason ?? "Queue position came from the server."}${result.queueStatusUrl ? ` Private status: ${result.queueStatusUrl}` : " Ask the front desk to resend the existing private status link."}`
    });
  }

  async function handleAppointmentSearch() {
    if (checkInForm.value.trim().length < 2) {
      setInteractionError("Enter the appointment phone, email, code, QR value, or name plus time.");
      return;
    }
    if (checkInForm.kind === "name_time" && !checkInForm.appointmentTime) {
      setInteractionError("Name lookup requires the appointment time too. A name alone is never enough.");
      return;
    }
    setInteractionError(null);
    await appointmentSearchMutation.mutateAsync({
      kind: checkInForm.kind,
      value: checkInForm.value.trim(),
      appointmentTime: checkInForm.kind === "name_time"
        ? new Date(checkInForm.appointmentTime).toISOString()
        : undefined
    });
  }

  async function handleAppointmentCheckIn(appointment: {
    id: string;
    sourceProvider: "bvrb3r" | "booksy" | "square" | "thecut";
    paymentOwner: string;
    serviceName: string;
    barberLabel: string;
  }) {
    if (!checkInForm.operationalSmsConsent) {
      setInteractionError("Choose whether this visit may use operational queue texts before check-in.");
      return;
    }
    const checkInPayload = JSON.stringify({
      appointmentId: appointment.id,
      sourceProvider: appointment.sourceProvider,
      contactPhone: checkInForm.contactPhone.trim(),
      contactEmail: checkInForm.contactEmail.trim().toLowerCase(),
      searchKind: checkInForm.kind,
      searchValue: checkInForm.kind === "phone" || checkInForm.kind === "email"
        ? checkInForm.value.trim().toLowerCase()
        : ""
    });
    if (checkInRequestRef.current?.payload !== checkInPayload) {
      checkInRequestRef.current = { payload: checkInPayload, key: newQueueRequestKey() };
    }
    setInteractionError(null);
    const result = await appointmentCheckInMutation.mutateAsync({
      appointmentId: appointment.id,
      sourceProvider: appointment.sourceProvider,
      idempotencyKey: checkInRequestRef.current.key,
      operationalSmsConsent: true,
      contactPhone: checkInForm.contactPhone.trim() || (
        checkInForm.kind === "phone" ? checkInForm.value.trim() : undefined
      ),
      contactEmail: checkInForm.contactEmail.trim() || (
        checkInForm.kind === "email" ? checkInForm.value.trim() : undefined
      )
    });
    setSuccess({
      kind: "check_in",
      title: result.duplicate ? "Already checked in" : "Check-in complete",
      detail: `${sourceBadge(result.sourceProvider)} · ${appointment.serviceName} with ${appointment.barberLabel}`,
      helper: `${result.queue.position === null ? "Position syncing" : `Position ${result.queue.position}`} · ${result.queue.estimatedWaitMinutes === null ? "wait calculating" : `~${result.queue.estimatedWaitMinutes} min`} · payment ${result.paymentOwner.startsWith("external:") ? `stays with ${sourceBadge(result.sourceProvider)}` : "owner disclosed"}.`,
      waitlistEntryId: result.queue.id,
      contactPhone: checkInForm.contactPhone.trim() || (
        checkInForm.kind === "phone" ? checkInForm.value.trim() : ""
      ),
      contactEmail: checkInForm.contactEmail.trim() || (
        checkInForm.kind === "email" ? checkInForm.value.trim() : ""
      ),
      bridgeResolved: result.sourceProvider === "bvrb3r"
    });
  }

  async function handleClientBridgeChoice(join: boolean) {
    if (!success || success.kind !== "check_in") return;
    if (!join) {
      setSuccess({ ...success, title: "Guest check-in complete", helper: `${success.helper} No account was created.`, bridgeResolved: true });
      return;
    }
    const contactChannel = success.contactPhone ? "sms" : success.contactEmail ? "email" : null;
    const contactValue = success.contactPhone || success.contactEmail;
    if (!contactChannel || !contactValue) {
      setInteractionError("Add a phone or email before requesting the optional account link.");
      return;
    }
    setInteractionError(null);
    const invitation = await clientBridgeMutation.mutateAsync({
      waitlistEntryId: success.waitlistEntryId,
      contactChannel,
      contactValue,
      consentGranted: true
    });
    const invitationCopy = invitation.status === "suppressed"
      ? `Invitation suppressed: ${invitation.suppressionReason?.replaceAll("_", " ") ?? "not eligible"}.`
      : "Invitation queued for delivery. Check-in was already complete.";
    setSuccess({
      ...success,
      title: invitation.status === "suppressed" ? "Guest check-in complete" : "Invitation queued",
      helper: `${success.helper} ${invitationCopy}`,
      bridgeResolved: true
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
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,rgba(196, 242, 78,0.14),transparent_42%),linear-gradient(180deg,#050505_0%,#0a0a0a_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Card className="overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,15,15,0.98),rgba(7,7,7,0.98))] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#e0f6a0]">{scope === "barber" ? "Barber kiosk" : "Shop kiosk"}</p>
              <h1 className="mt-3 wrap-safe text-4xl font-semibold sm:text-6xl" data-display="true">{payload.shop.shopName}</h1>
              <p className="mt-4 max-w-2xl wrap-safe text-base leading-8 text-white/66">{payload.shop.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em]">
                <span className="status-pill text-[#e4f9b8]">{payload.shop.locationLabel}</span>
                <span className="status-pill text-white/58">{queueLabel}</span>
                {kioskDevice.state.activeShopId === payload.shop.shopId ? (
                  <span className="status-pill text-[#e4f9b8]">Locked on this device</span>
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

          {idleWarning ? (
            <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Kiosk inactivity warning">
              <div className="w-full max-w-sm rounded-[24px] border border-[#C4F24E]/24 bg-[linear-gradient(180deg,rgba(18,18,18,0.99),rgba(4,4,4,0.99))] p-6 text-center text-white shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
                <TimerReset className="mx-auto h-7 w-7 text-[#C4F24E]" />
                <h2 className="mt-4 text-2xl font-semibold">Still there?</h2>
                <p className="mt-3 text-sm leading-6 text-white/62">For privacy, this kiosk will clear the current client details and return home in 15 seconds.</p>
                <Button className="mt-5 w-full" onClick={() => setIdleWarning(false)}>Yes, keep going</Button>
              </div>
            </div>
          ) : null}

          {exitPromptOpen ? (
            <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/76 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Exit kiosk mode">
              <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
                <div className="flex items-start gap-3">
                  <span className="rounded-[12px] border border-[#C4F24E]/20 bg-[#C4F24E]/10 p-2 text-[#C4F24E]">
                    <LockKeyhole className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Staff unlock</p>
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
            <div className="mt-8 rounded-[30px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-6 text-center">
              <p className="surface-label text-[#e4f9b8]">
                {success.kind === "booking" ? "Booking confirmed" : success.kind === "check_in" ? "Appointment check-in" : "Walk-in saved"}
              </p>
              <h2 className="mt-3 wrap-safe text-3xl font-semibold text-white">{success.title}</h2>
              <p className="mt-4 wrap-safe text-base leading-8 text-white/70">{success.detail}</p>
              <p className="mt-2 wrap-safe text-sm text-white/54">{success.helper}</p>
              {success.kind === "check_in" && !success.bridgeResolved ? (
                <div className="mt-6">
                  <p className="text-sm leading-7 text-white/62">Joining BVRB3R is optional. Your appointment and queue spot are already confirmed.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button disabled={clientBridgeMutation.isPending} onClick={() => void handleClientBridgeChoice(true)}>
                      {clientBridgeMutation.isPending ? "Queuing invitation…" : "Join BVRB3R"}
                    </Button>
                    <Button variant="secondary" disabled={clientBridgeMutation.isPending} onClick={() => void handleClientBridgeChoice(false)}>
                      Continue as guest
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
                    <TimerReset className="h-4 w-4 text-[#e4f9b8]" />
                    Returning to welcome screen {countdown ? `in ${countdown}s` : "now"}
                  </div>
                  <div className="mt-6">
                    <Button variant="secondary" onClick={resetToWelcome}>Done</Button>
                  </div>
                </>
              )}
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
                  <div className="relative z-10 mt-8 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {hasEligibleNextAvailable ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBookingForm((current) => ({ ...current, kioskAction: "book_next_opening", preferredBarberId: "" }));
                            openStep("booking");
                          }}
                          className="rounded-[32px] border border-[#e0f6a0]/28 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.16),rgba(16,16,16,0.96))] p-6 text-left transition hover:-translate-y-0.5 hover:border-[#e0f6a0]/40"
                          style={{ pointerEvents: "auto" }}
                        >
                          <p className="surface-label text-[#e4f9b8]">{scope === "barber" ? "Book next opening" : "Book next available"}</p>
                          <h2 className="mt-3 wrap-safe text-3xl font-semibold">Reserve the next eligible chair</h2>
                          <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">
                            {scope === "barber"
                              ? "Enter your info, pick your service, and reserve the next available time with this barber."
                              : "The shop uses current walk-in eligibility and availability. This does not move a rotation marker unless the backend does it."}
                          </p>
                          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/42">{formatLastRefreshed(payload.queue.waitEstimateUpdatedAt)}</p>
                        </button>
                      ) : (
                        <div className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left">
                          <p className="surface-label text-white/48">Book next available</p>
                          <h2 className="mt-3 wrap-safe text-3xl font-semibold">No eligible barber is available for walk-ins right now.</h2>
                          <p className="mt-4 wrap-safe text-sm leading-7 text-white/62">Ask the front desk for help or schedule ahead with a barber who has bookable time.</p>
                        </div>
                      )}
                      {scope === "shop" && hasPickableBarbers ? (
                        <button
                          type="button"
                          onClick={() => openStep("pick_barber")}
                          className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#C4F24E]/16 hover:bg-black/28"
                          style={{ pointerEvents: "auto" }}
                        >
                          <p className="surface-label">Pick a barber</p>
                          <h2 className="mt-3 wrap-safe text-3xl font-semibold">Choose your chair</h2>
                          <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">See public-safe barber names and wait posture, then continue into that barber kiosk.</p>
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {scope === "shop" ? (
                        <button
                          type="button"
                          onClick={() => openStep("check_in")}
                          className="rounded-[32px] border border-[#D9B461]/24 bg-[linear-gradient(135deg,rgba(217,180,97,0.10),rgba(10,10,10,0.96))] p-6 text-left transition hover:-translate-y-0.5 hover:border-[#D9B461]/40"
                          style={{ pointerEvents: "auto" }}
                        >
                          <p className="surface-label text-[#D9B461]">Appointment check-in</p>
                          <h2 className="mt-3 wrap-safe text-3xl font-semibold">I already have a booking</h2>
                          <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">Find BVRB3R, Booksy, Square, or theCut. External payment stays private at its provider.</p>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setBookingForm((current) => ({ ...current, kioskAction: "schedule_ahead", preferredBarberId: "" }));
                          openStep("booking");
                        }}
                        className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#C4F24E]/16 hover:bg-black/28"
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
                          className="rounded-[32px] border border-white/8 bg-black/20 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#C4F24E]/16 hover:bg-black/28"
                          style={{ pointerEvents: "auto" }}
                        >
                          <p className="surface-label">Walk-in queue</p>
                          <h2 className="mt-3 wrap-safe text-3xl font-semibold">Join the walk-in queue</h2>
                          <p className="mt-4 wrap-safe text-sm leading-7 text-white/66">Add your info and service. Queue position appears only after the server creates the entry.</p>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 rounded-[30px] border border-white/8 bg-black/22 p-6">
                    <p className="surface-label text-[#e4f9b8]">Kiosk unavailable</p>
                    <h2 className="mt-3 wrap-safe text-3xl font-semibold">
                      {!hasServiceOptions
                        ? "No services are available for kiosk booking."
                        : scope === "shop"
                          ? "No eligible barber is available for walk-ins right now."
                          : "This barber does not have a bookable kiosk opening right now."}
                    </h2>
                    <p className="mt-4 wrap-safe text-sm leading-7 text-white/62">
                      Need help? Ask the barber or front desk.
                    </p>
                    {scope === "shop" ? (
                      <Button className="mt-5" variant="secondary" onClick={() => openStep("check_in")}>
                        Check in an existing appointment
                      </Button>
                    ) : null}
                  </div>
                )
              ) : null}

              {step === "check_in" ? (
                <div className="mt-8 space-y-5">
                  <div className="rounded-[26px] border border-[#D9B461]/20 bg-[#D9B461]/8 p-5">
                    <p className="surface-label text-[#D9B461]">ChairSync check-in</p>
                    <h2 className="mt-3 wrap-safe text-3xl font-semibold">Find your appointment</h2>
                    <p className="mt-3 text-sm leading-7 text-white/62">Search across BVRB3R, Booksy, Square, and theCut. Results stay masked until you choose yours; a name is never accepted without the appointment time.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
                    <Select
                      value={checkInForm.kind}
                      onChange={(event) => {
                        appointmentSearchMutation.reset();
                        setCheckInForm((current) => ({ ...current, kind: event.target.value as CheckInFormState["kind"], value: "" }));
                      }}
                    >
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                      <option value="code">Confirmation code</option>
                      <option value="qr">Booking QR value</option>
                      <option value="name_time">Name + appointment time</option>
                    </Select>
                    <Input
                      value={checkInForm.value}
                      onChange={(event) => {
                        appointmentSearchMutation.reset();
                        setCheckInForm((current) => ({ ...current, value: event.target.value }));
                      }}
                      placeholder={checkInForm.kind === "phone"
                        ? "(813) 555-0101"
                        : checkInForm.kind === "email"
                          ? "name@example.com"
                          : checkInForm.kind === "name_time"
                            ? "Jordan"
                            : "Confirmation or QR value"}
                    />
                  </div>
                  {checkInForm.kind === "name_time" ? (
                    <div>
                      <label className="mb-3 block surface-label">Approximate appointment time</label>
                      <Input
                        type="datetime-local"
                        value={checkInForm.appointmentTime}
                        onChange={(event) => {
                          appointmentSearchMutation.reset();
                          setCheckInForm((current) => ({ ...current, appointmentTime: event.target.value }));
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={appointmentSearchMutation.isPending} onClick={() => void handleAppointmentSearch()}>
                      {appointmentSearchMutation.isPending ? "Searching securely…" : "Find appointment"}
                    </Button>
                    <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Cancel and privacy reset</Button>
                  </div>

                  {appointmentSearchMutation.data ? (
                    appointmentSearchMutation.data.results.length ? (
                      <div className="space-y-3">
                        <p className="surface-label">Masked results</p>
                        {appointmentSearchMutation.data.results.map((appointment) => (
                          <div key={`${appointment.sourceProvider}-${appointment.id}`} className="rounded-[26px] border border-white/8 bg-black/20 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-[#D9B461]/25 px-3 py-1.5 text-[10px] font-black tracking-[0.18em] text-[#D9B461]">{appointment.sourceBadge}</span>
                                  {appointment.externalFinancialDataPrivate ? <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black tracking-[0.14em] text-white/45">READ-ONLY</span> : null}
                                </div>
                                <h3 className="mt-3 text-2xl font-semibold">{appointment.clientLabel}</h3>
                                <p className="mt-2 text-sm text-white/62">{new Date(appointment.startsAt).toLocaleString()} · {appointment.serviceName} · {appointment.barberLabel}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/42">
                                  {appointment.externalFinancialDataPrivate
                                    ? `Payment managed by ${appointment.sourceBadge} · no external amount enters BVRB3R`
                                    : `Payment owner: ${appointment.paymentOwner.replaceAll("_", " ")}`}
                                </p>
                              </div>
                              <span className="status-pill text-[#e4f9b8]">{appointment.checkedIn ? "Already checked in" : appointment.status.replaceAll("_", " ")}</span>
                            </div>

                            {!appointment.checkedIn && !["canceled", "cancelled"].includes(appointment.status) ? (
                              <div className="mt-5 space-y-3">
                                {appointment.providerDataRestricted || checkInForm.kind !== "phone" ? (
                                  <Input
                                    inputMode="tel"
                                    placeholder="Phone for this visit’s queue updates"
                                    value={checkInForm.contactPhone}
                                    onChange={(event) => setCheckInForm((current) => ({ ...current, contactPhone: event.target.value }))}
                                  />
                                ) : null}
                                <label className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62">
                                  <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 accent-[#C4F24E]"
                                    checked={checkInForm.operationalSmsConsent}
                                    onChange={(event) => setCheckInForm((current) => ({ ...current, operationalSmsConsent: event.target.checked }))}
                                    aria-label="Consent to operational appointment queue texts"
                                  />
                                  <span>OK to text “you’re up” for this visit only. This is operational consent, never marketing consent.</span>
                                </label>
                                <Button
                                  disabled={appointmentCheckInMutation.isPending || !checkInForm.operationalSmsConsent}
                                  onClick={() => void handleAppointmentCheckIn(appointment)}
                                >
                                  {appointmentCheckInMutation.isPending ? "Confirming on the server…" : "Check in"}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[26px] border border-amber-300/18 bg-amber-300/8 p-5">
                        <p className="surface-label text-amber-100/80">Not found</p>
                        <h3 className="mt-3 text-2xl font-semibold">We couldn’t find that booking.</h3>
                        <p className="mt-3 text-sm leading-7 text-white/62">Try another verified field, or ask the front desk. No queue entry was created.</p>
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}

              {step === "pick_barber" ? (
                <div className="mt-8 space-y-4">
                  <div className="rounded-[26px] border border-white/8 bg-black/20 p-5">
                    <p className="surface-label text-[#e4f9b8]">Pick a barber</p>
                    <h2 className="mt-3 wrap-safe text-3xl font-semibold">Choose a public chair</h2>
                    <p className="mt-3 text-sm leading-7 text-white/62">This list only shows public-safe barber identity and current wait posture. It does not expose contact, payout, or team settings.</p>
                  </div>
                  {pickableBarbers.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pickableBarbers.map((barber) => (
                        <button
                          key={barber.id}
                          type="button"
                          className="rounded-[26px] border border-white/8 bg-black/20 p-5 text-left transition hover:-translate-y-0.5 hover:border-[#C4F24E]/16"
                          style={{ pointerEvents: "auto" }}
                          onClick={() => router.push(`/kiosk/barber/${barber.id}` as Route)}
                        >
                          <p className="surface-label text-white/48">{barber.liveStatusLabel}</p>
                          <h3 className="mt-3 wrap-safe text-2xl font-semibold text-white">{barber.name}</h3>
                          <p className="mt-3 text-sm leading-6 text-white/62">{barber.waitDisplayLabel ?? "Wait time unavailable"}</p>
                          <span className="mt-4 inline-flex rounded-full border border-[#C4F24E]/16 bg-[#C4F24E]/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e4f9b8]">
                            Open barber kiosk
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[26px] border border-white/8 bg-black/20 p-5">
                      <h3 className="wrap-safe text-2xl font-semibold">No public bookable barber is available right now.</h3>
                      <p className="mt-3 text-sm leading-7 text-white/62">Ask the front desk for help or try schedule ahead.</p>
                    </div>
                  )}
                  <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Back to kiosk home</Button>
                </div>
              ) : null}

              {step === "booking" ? (
                <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-3 block surface-label">BVRB3R Username</label>
                      <Input aria-label="BVRB3R Username" value={bookingForm.publicUsername} onChange={(event) => {
                        setInteractionError(null);
                        setBookingForm((current) => ({
                          ...current,
                          publicUsername: event.target.value,
                          selectedProfileId: ""
                        }));
                      }} placeholder="@yourusername" aria-describedby="kiosk-username-helper" />
                      <p id="kiosk-username-helper" className="mt-2 text-sm leading-6 text-white/58">Search your @username or create one if you are new.</p>
                      {clientSearchQuery.isLoading && usernameSearchLength >= 2 ? (
                        <div className="mt-3 rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-sm text-white/58">Searching BVRB3R profiles...</div>
                      ) : null}
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
                              className="flex w-full items-center justify-between rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-left transition hover:border-[#C4F24E]/22"
                              style={{ pointerEvents: "auto" }}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-white">{result.publicUsername ? `@${result.publicUsername}` : result.displayName}</span>
                                <span className="block text-xs text-white/48">{[result.displayName, result.locationLabel, result.roleLabel].filter(Boolean).join(" - ")}</span>
                              </span>
                              <span className="status-pill text-[#e4f9b8]">This is me</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {usernameSearchLength >= 2 && !clientSearchQuery.isLoading && !clientSearchResults.length && !bookingForm.selectedProfileId ? (
                        <p className="mt-3 rounded-[16px] border border-white/8 bg-black/24 px-4 py-3 text-sm leading-6 text-white/62">
                          No profile found for {bookingForm.publicUsername.startsWith("@") ? bookingForm.publicUsername : `@${bookingForm.publicUsername}`}. New here? Keep this username and finish your info below.
                        </p>
                      ) : null}
                      {bookingForm.selectedProfileId ? (
                        <div className="mt-3 rounded-[18px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-4 py-3 text-sm leading-6 text-[#e4f9b8]">
                          <p className="font-semibold">Welcome back, {bookingForm.publicUsername}.</p>
                          <p className="text-white/68">We&apos;ll use your saved BVRB3R profile for this booking.</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/46">Contact on file</p>
                          <p className="text-white/62">Saved phone and email will be used privately for booking updates.</p>
                          <button
                            type="button"
                            className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/58 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                            onClick={() => {
                              setInteractionError(null);
                              setBookingForm((current) => ({
                                ...current,
                                selectedProfileId: "",
                                fullName: "",
                                phone: "",
                                email: "",
                                policyAccepted: false
                              }));
                            }}
                          >
                            Use different info
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {bookingForm.selectedProfileId ? null : (
                      <>
                        <div>
                          <label className="mb-3 block surface-label">Full name</label>
                          <Input value={bookingForm.fullName} onChange={(event) => {
                            setInteractionError(null);
                            setBookingForm((current) => ({ ...current, fullName: event.target.value }));
                          }} placeholder="Jordan Ellis" />
                        </div>
                        <div>
                          <label className="mb-3 block surface-label">Phone number</label>
                          <Input inputMode="tel" value={bookingForm.phone} onChange={(event) => {
                            setInteractionError(null);
                            setBookingForm((current) => ({ ...current, phone: event.target.value }));
                          }} placeholder="(813) 555-0101" />
                        </div>
                        <div>
                          <label className="mb-3 block surface-label">Email</label>
                          <Input type="email" value={bookingForm.email} onChange={(event) => {
                            setInteractionError(null);
                            setBookingForm((current) => ({ ...current, email: event.target.value }));
                          }} placeholder="name@example.com" />
                        </div>
                        <label className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-[#C4F24E]"
                            checked={bookingForm.policyAccepted}
                            onChange={(event) => {
                              setInteractionError(null);
                              setBookingForm((current) => ({ ...current, policyAccepted: event.target.checked }));
                            }}
                            aria-label="Accept kiosk booking policy"
                          />
                          <span>
                            I agree this kiosk can use my contact info for this booking. This does not sign me into a public account or expose my private contact details.
                          </span>
                        </label>
                      </>
                    )}
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
                    {payload.defaults.allowChooseBarber !== false && bookingForm.kioskAction === "schedule_ahead" ? (
                      <div>
                        <label className="mb-3 block surface-label">Preferred barber</label>
                        <Select value={bookingForm.preferredBarberId} onChange={(event) => {
                          setInteractionError(null);
                          setBookingForm((current) => ({ ...current, preferredBarberId: event.target.value }));
                        }}>
                          <option value="">Any eligible barber</option>
                          {pickableBarbers.map((barber) => (
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
                    <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4 text-sm leading-6 text-white/70">
                      <p className="surface-label text-[#e4f9b8]">{waitStateLabel}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{waitLabel}</p>
                      <p className="mt-2 wrap-safe text-white/56">{formatLastRefreshed(payload.queue.waitEstimateUpdatedAt)}. You will review and confirm before an appointment is created.</p>
                      <button
                        type="button"
                        className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/58 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                        onClick={() => void kioskQuery.refetch?.()}
                      >
                        Refresh wait estimate
                      </button>
                    </div>
                    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62">
                      Booking stays on the existing booking rail, requires this confirmation step, and uses canonical availability before creating an appointment. If payment is required, the server must confirm it or the booking will fail safely.
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex flex-wrap gap-2">
                    <Button disabled={isSubmitting} onClick={() => void handleBookingSubmit()}>
                      {bookingMutation.isPending ? "Booking..." : bookingForm.kioskAction === "schedule_ahead" ? "Schedule appointment" : "Book next eligible opening"}
                    </Button>
                    <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Cancel and reset</Button>
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
                      <Input inputMode="tel" value={walkInForm.phone} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, phone: event.target.value }));
                      }} placeholder="(813) 555-0101" />
                    </div>
                    <div>
                      <label className="mb-3 block surface-label">Email</label>
                      <Input type="email" value={walkInForm.email} onChange={(event) => {
                        setInteractionError(null);
                        setWalkInForm((current) => ({ ...current, email: event.target.value }));
                      }} placeholder="name@example.com" />
                    </div>
                    <label className="flex items-start gap-3 rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[#C4F24E]"
                        checked={walkInForm.policyAccepted}
                        onChange={(event) => {
                          setInteractionError(null);
                          setWalkInForm((current) => ({ ...current, policyAccepted: event.target.checked }));
                        }}
                        aria-label="Accept kiosk walk-in policy"
                      />
                      <span>
                        I agree this kiosk can use my contact info for queue updates. Queue position is confirmed only after the server creates the walk-in entry.
                      </span>
                    </label>
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
                    <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4 text-sm leading-6 text-white/70">
                      <div className="flex items-center gap-2 text-[#e4f9b8]">
                        <Phone className="h-4 w-4" />
                        Walk-in routing
                      </div>
                      <p className="mt-3 wrap-safe">{queueLabel}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/42">{formatLastRefreshed(payload.queue.waitEstimateUpdatedAt)}</p>
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex flex-wrap gap-2">
                    <Button disabled={isSubmitting} onClick={() => void handleWalkInSubmit()}>
                      {waitlistMutation.isPending ? "Joining..." : "Join walk-in queue"}
                    </Button>
                    <Button variant="secondary" disabled={isSubmitting} onClick={resetToWelcome}>Cancel and reset</Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </Card>

        <div className="mt-4 text-center text-xs uppercase tracking-[0.22em] text-white/34">
          <span className="inline-flex items-center gap-2">
            <UserRound className="h-4 w-4 text-[#d9f985]" />
            Powered quietly by BVRB3R
          </span>
        </div>
      </div>
    </div>
  );
}
