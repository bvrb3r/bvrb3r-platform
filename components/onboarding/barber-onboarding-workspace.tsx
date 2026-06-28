"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OnboardingReadinessSummary } from "@/components/onboarding/onboarding-readiness-summary";
import {
  BARBER_BOOKING_MODE_OPTIONS,
  BARBER_PAYMENT_LANE_OPTIONS,
  BARBER_SPECIALTY_VALUES,
  buildBarberOnboardingReadiness,
  canUseBookingMode,
  cleanBarberUsername,
  dollarsToCents,
  getBarberBookingLink,
  getBarberHomeFallbackPrompts,
  getNextBarberOnboardingStep,
  normalizeBarberOnboardingStep,
  validateServiceDurationMinutes,
  type BarberBookingMode,
  type BarberOnboardingDraft,
  type BarberOnboardingStep,
  type BarberPaymentLane,
  type BarberServiceChoice
} from "@/lib/onboarding/barber-path";

type JsonResponse = {
  error?: string;
  message?: string;
  nextPath?: string;
};

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid" | "error";

const SERVICE_OPTIONS: Array<{ value: BarberServiceChoice; label: string }> = [
  { value: "haircut", label: "Haircut" },
  { value: "haircut_beard", label: "Haircut + Beard" },
  { value: "lineup", label: "Lineup" },
  { value: "kids_cut", label: "Kids Cut" },
  { value: "custom_service", label: "Custom Service" }
];

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function readJson(response: Response): Promise<JsonResponse> {
  return response.json().catch(() => ({})) as Promise<JsonResponse>;
}

function usernameMessage(status: UsernameStatus) {
  switch (status) {
    case "checking":
      return "Checking availability...";
    case "available":
      return "Available";
    case "taken":
      return "Already claimed";
    case "reserved":
      return "This name is protected";
    case "invalid":
      return "Use letters, numbers, hyphens, or underscores";
    case "error":
      return "Could not check username. Try again.";
    default:
      return "Claim your BVRB3R name before business readiness can pass.";
  }
}

function routeFor(step: BarberOnboardingStep) {
  return `/onboarding/barber?step=${step}` as Route;
}

function optionLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

export function BarberOnboardingWorkspace({
  step,
  initialDraft
}: {
  step?: string;
  initialDraft: BarberOnboardingDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeStep = normalizeBarberOnboardingStep(step);
  const [draft, setDraft] = useState<BarberOnboardingDraft>({
    authenticated: true,
    role: "barber_user",
    currency: "USD",
    bufferMinutes: 10,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    ...initialDraft
  });
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>(draft.usernameAvailable ? "available" : "idle");
  const [availableUsername, setAvailableUsername] = useState(draft.usernameAvailable ? draft.publicUsername ?? "" : "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const readiness = useMemo(() => buildBarberOnboardingReadiness(draft), [draft]);
  const bookingLink = getBarberBookingLink(draft);
  const homePrompts = getBarberHomeFallbackPrompts(draft);
  const busy = isPending || usernameStatus === "checking";

  function go(nextStep: BarberOnboardingStep) {
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(() => router.replace(routeFor(nextStep)));
  }

  function continueToNext() {
    go(getNextBarberOnboardingStep(activeStep));
  }

  async function checkUsernameAvailability() {
    setErrorMessage(null);
    const username = cleanBarberUsername(draft.publicUsername ?? "");
    setDraft((current) => ({ ...current, publicUsername: username, usernameAvailable: false }));
    setAvailableUsername("");

    if (username.length < 3) {
      setUsernameStatus("invalid");
      return false;
    }

    setUsernameStatus("checking");
    try {
      const response = await fetch(`/api/profile/username/availability?username=${encodeURIComponent(username)}&ownerType=barber`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        setUsernameStatus("error");
        return false;
      }

      const body = await response.json().catch(() => ({})) as { available?: boolean; reason?: string | null };
      if (body.available) {
        setUsernameStatus("available");
        setAvailableUsername(username);
        setDraft((current) => ({ ...current, publicUsername: username, usernameAvailable: true }));
        return true;
      }

      setUsernameStatus(body.reason === "reserved" ? "reserved" : body.reason === "invalid" ? "invalid" : "taken");
      return false;
    } catch {
      setUsernameStatus("error");
      return false;
    }
  }

  async function savePublicIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!draft.displayName?.trim()) {
      setErrorMessage("Add a public barber name before continuing.");
      return;
    }

    const usernameReady = usernameStatus === "available" && availableUsername === cleanBarberUsername(draft.publicUsername ?? "")
      ? true
      : await checkUsernameAvailability();
    if (!usernameReady) {
      setErrorMessage("Claim an available BVRB3R name before continuing.");
      return;
    }

    try {
      const usernameResponse = await fetch("/api/profile/media", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "set_barber_public_username", username: cleanBarberUsername(draft.publicUsername ?? "") })
      });
      if (!usernameResponse.ok) {
        const body = await readJson(usernameResponse);
        throw new Error(body.error ?? "Could not save your public name.");
      }

      const response = await fetch("/api/onboarding/barber/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fullName: draft.displayName,
          phone: draft.phone || "0000000000",
          city: draft.city || "Add later",
          professionalType: "Barber",
          yearsExperience: "1",
          bio: "Barber profile started through BVRB3R onboarding.",
          compensationModel: "booth_rent"
        })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Public identity could not be saved.");
      }

      setSuccessMessage("Public identity saved.");
      continueToNext();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Public identity could not be saved.");
    }
  }

  async function saveServiceAndPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const priceCents = dollarsToCents(draft.servicePriceCents === null || draft.servicePriceCents === undefined ? "" : draft.servicePriceCents / 100);
    const duration = validateServiceDurationMinutes(draft.serviceDurationMinutes ?? "");

    if (!draft.firstServiceName?.trim()) {
      setErrorMessage("Add your first service before continuing.");
      return;
    }

    if (priceCents === null || priceCents < 0) {
      setErrorMessage("Set a valid nonnegative price before continuing.");
      return;
    }

    if (!duration) {
      setErrorMessage("Duration must be a realistic number of minutes.");
      return;
    }

    try {
      const response = await fetch("/api/onboarding/barber/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          primaryServices: draft.firstServiceName,
          startingPrice: String(priceCents / 100),
          averageDuration: `${duration} min`
        })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Service could not be saved.");
      }
      setDraft((current) => ({ ...current, servicePriceCents: priceCents, serviceDurationMinutes: duration }));
      continueToNext();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Service could not be saved.");
    }
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (!draft.availableDays?.length || !draft.startTime || !draft.endTime || draft.startTime >= draft.endTime || !draft.timezone) {
      setErrorMessage("Choose days, a valid time range, and timezone before continuing.");
      return;
    }

    try {
      const response = await fetch("/api/onboarding/barber/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          weeklySchedule: `${draft.availableDays.join(", ")} ${draft.startTime}-${draft.endTime} ${draft.timezone}`,
          acceptsSameDay: draft.bookingMode !== "request",
          serviceMode: "BVRB3R booking link"
        })
      });
      if (!response.ok) {
        const body = await readJson(response);
        throw new Error(body.message ?? body.error ?? "Schedule could not be saved.");
      }
      continueToNext();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Schedule could not be saved.");
    }
  }

  async function copyBookingLink() {
    setCopyState("idle");
    if (!bookingLink.href) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${bookingLink.href}`);
      setCopyState("copied");
      setDraft((current) => ({ ...current, bookingLinkCopied: true }));
    } catch {
      setCopyState("failed");
    }
  }

  function renderPreview() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Your chair path is ready.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
          Build your profile, share your link, and start booking through BVRB3R.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-12 px-6" onClick={() => go("identity")}>Set Up My Barber Profile</Button>
          <Link className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-semibold text-white/78" href="/dashboard/barber">
            Enter Home
          </Link>
        </div>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/64">
          Entering Home keeps missing setup prompts visible. No setup is marked complete from this preview.
        </div>
      </Card>
    );
  }

  function renderIdentity() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Create your public face.</h1>
        <form onSubmit={savePublicIdentity} className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Display name<Input value={draft.displayName ?? ""} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Wave Carter" required /></label>
          <label className="grid gap-2 text-sm text-white/72">Public username<Input value={draft.publicUsername ?? ""} onChange={(event) => { setDraft((current) => ({ ...current, publicUsername: event.target.value, usernameAvailable: false })); setUsernameStatus("idle"); }} placeholder="wave" required /></label>
          <Button type="button" variant="secondary" className="h-11" disabled={busy || !draft.publicUsername?.trim()} onClick={() => void checkUsernameAvailability()}>Check Availability</Button>
          <p className="text-xs leading-6 text-white/52" data-testid="barber-username-status">{usernameMessage(usernameStatus)}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/72">City<Input value={draft.city ?? ""} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Tampa" /></label>
            <label className="grid gap-2 text-sm text-white/72">State<Input value={draft.state ?? ""} onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))} placeholder="FL" /></label>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/64">
            Profile photo can be added from Barber Profile. It is not faked here.
          </div>
          <Button type="submit" className="h-12" disabled={busy}>Use this identity</Button>
        </form>
      </Card>
    );
  }

  function renderSpecialty() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">What do you want to be known for?</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {BARBER_SPECIALTY_VALUES.map((specialty) => {
            const selected = draft.specialties?.includes(specialty) ?? false;
            return (
              <button key={specialty} type="button" className={`rounded-[22px] border p-4 text-left text-sm font-semibold ${selected ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => {
                const currentSpecialties = current.specialties ?? [];
                const next = selected ? currentSpecialties.filter((item) => item !== specialty) : [...currentSpecialties, specialty];
                return { ...current, specialties: next, primarySpecialty: next[0] ?? "" };
              })}>{optionLabel(specialty)}</button>
            );
          })}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.specialties?.length ? continueToNext() : setErrorMessage("Choose at least one specialty or continue later from Home.")}>Continue</Button>
      </Card>
    );
  }

  function renderWorkSetup() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Start the proof layer.</h1>
        <div className="mt-8 grid gap-3">
          <Button type="button" variant="secondary" className="h-12" onClick={() => { setDraft((current) => ({ ...current, workSetupPreference: "add_now" })); setErrorMessage("Portfolio upload opens from Barber Profile. Add work there, then return to setup."); }}>Add work now</Button>
          <Button type="button" className="h-12" onClick={() => { setDraft((current) => ({ ...current, workSetupPreference: "basics_first" })); go("first_service"); }}>Set up basics first</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => { setDraft((current) => ({ ...current, workSetupPreference: "skip_for_now" })); go("first_service"); }}>Skip for now</Button>
        </div>
      </Card>
    );
  }

  function renderFirstService() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Add your first service.</h1>
        <div className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Service type<Select value={draft.firstServiceCategory ?? ""} onChange={(event) => {
            const value = event.target.value as BarberServiceChoice;
            const label = SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? "";
            setDraft((current) => ({ ...current, firstServiceCategory: value, firstServiceName: value === "custom_service" ? current.firstServiceName : label }));
          }}><option value="">Choose service</option>{SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>
          <label className="grid gap-2 text-sm text-white/72">Service name<Input value={draft.firstServiceName ?? ""} onChange={(event) => setDraft((current) => ({ ...current, firstServiceName: event.target.value }))} placeholder="Signature Cut" /></label>
          <Button type="button" className="h-12" onClick={() => draft.firstServiceName?.trim() ? go("price_duration") : setErrorMessage("Service name is required before pricing.")}>Continue</Button>
        </div>
      </Card>
    );
  }

  function renderPriceDuration() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Set price and time.</h1>
        <form onSubmit={saveServiceAndPrice} className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm text-white/72">Price<Input inputMode="decimal" value={draft.servicePriceCents === undefined || draft.servicePriceCents === null ? "" : String(draft.servicePriceCents / 100)} onChange={(event) => setDraft((current) => ({ ...current, servicePriceCents: dollarsToCents(event.target.value) }))} placeholder="45" required /></label>
          <label className="grid gap-2 text-sm text-white/72">Duration minutes<Input inputMode="numeric" value={draft.serviceDurationMinutes ?? ""} onChange={(event) => setDraft((current) => ({ ...current, serviceDurationMinutes: validateServiceDurationMinutes(event.target.value) ?? undefined }))} placeholder="45" required /></label>
          <p className="text-sm leading-7 text-white/56">BVRB3R stores service price as cents for canonical money posture. Frontend values are not final payment truth.</p>
          <Button type="submit" className="h-12">Continue</Button>
        </form>
      </Card>
    );
  }

  function renderSchedule() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Set your open times.</h1>
        <form onSubmit={saveSchedule} className="mt-8 grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DAY_OPTIONS.map((day) => {
            const selected = draft.availableDays?.includes(day) ?? false;
            return <button key={day} type="button" className={`rounded-2xl border px-3 py-3 text-xs font-bold ${selected ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/62"}`} onClick={() => setDraft((current) => {
              const days = current.availableDays ?? [];
              return { ...current, availableDays: selected ? days.filter((item) => item !== day) : [...days, day] };
            })}>{day}</button>;
          })}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/72">Start time<Input type="time" value={draft.startTime ?? ""} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} required /></label>
            <label className="grid gap-2 text-sm text-white/72">End time<Input type="time" value={draft.endTime ?? ""} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} required /></label>
          </div>
          <label className="grid gap-2 text-sm text-white/72">Timezone<Input value={draft.timezone ?? ""} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} required /></label>
          <Button type="submit" className="h-12">Continue</Button>
        </form>
      </Card>
    );
  }

  function renderBookingMode() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Choose how clients can book.</h1>
        <div className="mt-8 grid gap-3">
          {BARBER_BOOKING_MODE_OPTIONS.map((option) => {
            const value = option.value as BarberBookingMode;
            const supported = option.supported && canUseBookingMode(value, draft);
            return (
              <button key={option.value} type="button" disabled={!supported} className={`rounded-[22px] border p-4 text-left ${draft.bookingMode === option.value ? "border-[#d6b46a] bg-[#d6b46a]/12" : "border-white/10 bg-black/20"} ${supported ? "text-white" : "text-white/40"}`} onClick={() => setDraft((current) => ({ ...current, bookingMode: value }))}>
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-2 block text-sm">{supported ? "Available from current setup." : "Requires supported service, schedule, or backend workflow."}</span>
              </button>
            );
          })}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.bookingMode ? continueToNext() : setErrorMessage("Choose a supported booking mode before continuing.")}>Continue</Button>
      </Card>
    );
  }

  function renderPaymentLane() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Choose your payment lane.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">Money stays clean. Payment tools unlock only when payout setup and processor truth are confirmed.</p>
        <div className="mt-8 grid gap-3">
          {BARBER_PAYMENT_LANE_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={`rounded-[22px] border p-4 text-left ${draft.paymentLane === option.value ? "border-[#d6b46a] bg-[#d6b46a]/12 text-white" : "border-white/10 bg-black/20 text-white/66"}`} onClick={() => setDraft((current) => ({ ...current, paymentLane: option.value as BarberPaymentLane, providerTruthConnected: false, providerPayoutStatus: "unknown" }))}>
              <span className="block font-semibold">{option.label}</span>
              <span className="mt-2 block text-sm">{option.detail}</span>
            </button>
          ))}
        </div>
        <Button type="button" className="mt-6 h-12 w-full" onClick={() => draft.paymentLane ? continueToNext() : setErrorMessage("Choose a payment lane or set up later.")}>Continue</Button>
      </Card>
    );
  }

  function renderBookingLink() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Your booking link is ready.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">{bookingLink.href ? "Share it so clients can book your page." : bookingLink.reason}</p>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/66">
          <p>Profile: {draft.publicUsername ? "Public" : "Needs setup"}</p>
          <p>Services: {draft.firstServiceName && typeof draft.servicePriceCents === "number" && draft.serviceDurationMinutes ? "Ready" : "Needs setup"}</p>
          <p>Open times: {draft.availableDays?.length && draft.startTime && draft.endTime ? "Ready" : "Needs setup"}</p>
          <p className="mt-3 break-all">{bookingLink.href ?? "Booking link unavailable until setup is complete."}</p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-12 px-6" disabled={!bookingLink.href} onClick={() => void copyBookingLink()}>Copy Link</Button>
          <Button type="button" variant="secondary" className="h-12 px-6" onClick={continueToNext}>Share later</Button>
          <Button type="button" variant="secondary" className="h-12 px-6" onClick={continueToNext}>Continue</Button>
        </div>
        {copyState === "copied" ? <p className="mt-4 text-sm text-[#d6b46a]">Copied</p> : null}
        {copyState === "failed" ? <p className="mt-4 text-sm text-[#ff8f8f]">Copy failed. Use Share later or try again.</p> : null}
      </Card>
    );
  }

  function renderInvite() {
    const invite = bookingLink.href ? `Book with me on BVRB3R: ${typeof window === "undefined" ? "" : window.location.origin}${bookingLink.href}` : "Book with me on BVRB3R.";
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Invite your first client.</h1>
        <div className="mt-8 grid gap-3">
          <a className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-semibold text-white/78" href={`sms:?&body=${encodeURIComponent(invite)}`}>Text message</a>
          <Button type="button" variant="secondary" className="h-12" onClick={() => void copyBookingLink()}>Copy invite</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => setErrorMessage("QR coming soon. Copy or text the booking link for now.")}>Show QR code</Button>
          <Button type="button" className="h-12" onClick={continueToNext}>Send Invite</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => { setDraft((current) => ({ ...current, inviteSkipped: true })); continueToNext(); }}>Skip for now</Button>
        </div>
      </Card>
    );
  }

  function renderHandoff() {
    return (
      <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Enter Barber Home.</h1>
        <p className="mt-4 text-sm leading-7 text-white/64">Your chair path is ready enough to continue. Missing setup stays visible as next action prompts.</p>
        {homePrompts.length ? <ul className="mt-6 grid gap-2 text-sm leading-7 text-white/66">{homePrompts.map((prompt) => <li key={prompt}>- {prompt}</li>)}</ul> : <p className="mt-6 text-sm text-[#d6b46a]">Barber onboarding is complete.</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link className="inline-flex h-12 items-center justify-center rounded-full bg-[#d6b46a] px-6 text-sm font-semibold text-black" href="/dashboard/barber">Enter Barber Home</Link>
          <Button type="button" variant="secondary" className="h-12 px-6" onClick={() => go("invite_first_client")}>Invite First Client</Button>
        </div>
      </Card>
    );
  }

  const surface = {
    preview: renderPreview,
    identity: renderIdentity,
    specialty: renderSpecialty,
    work_setup: renderWorkSetup,
    first_service: renderFirstService,
    price_duration: renderPriceDuration,
    schedule: renderSchedule,
    booking_mode: renderBookingMode,
    payment_lane: renderPaymentLane,
    booking_link: renderBookingLink,
    invite_first_client: renderInvite,
    home_handoff: renderHandoff
  }[activeStep]();

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10" data-testid="barber-onboarding-path">
      <div className="grid w-full gap-4 lg:grid-cols-[1fr_0.86fr]">
        <div>
          {surface}
          {errorMessage ? <p className="mt-4 rounded-[22px] border border-[#ff8f8f]/25 bg-[#ff8f8f]/10 p-4 text-sm leading-7 text-[#ffb3b3]">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 rounded-[22px] border border-[#d6b46a]/25 bg-[#d6b46a]/10 p-4 text-sm leading-7 text-[#f1d79d]">{successMessage}</p> : null}
        </div>
        <OnboardingReadinessSummary result={readiness} title="Barber readiness" sectionOrder={["account", "barberBusiness", "payout"]} />
      </div>
    </section>
  );
}
