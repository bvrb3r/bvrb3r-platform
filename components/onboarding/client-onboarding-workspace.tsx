"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OnboardingReadinessSummary } from "@/components/onboarding/onboarding-readiness-summary";
import {
  CLIENT_BOOKING_TIMING_OPTIONS,
  CLIENT_FIRST_BOOKING_MISSION_OPTIONS,
  CLIENT_SEARCH_PRIORITY_OPTIONS,
  CLIENT_SERVICE_INTEREST_OPTIONS,
  buildClientOnboardingReadiness,
  getClientFirstBookingHref,
  getClientOptionLabel,
  type ClientBookingTiming,
  type ClientFirstBookingMission,
  type ClientPreferenceInput,
  type ClientSearchPriority,
  type ClientServiceInterest
} from "@/lib/onboarding/client-path";

type ClientOnboardingStep = "client_profile" | "client_preferences";
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid" | "error";

type UsernameAvailabilityPayload = {
  available?: boolean;
  reason?: "taken" | "reserved" | "invalid" | "unavailable" | null;
};

type JsonResponse = {
  error?: string;
  nextPath?: string;
};

const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

function cleanUsername(value: string) {
  return value.trim().toLowerCase();
}

function getUsernameMessage(status: UsernameStatus) {
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
      return "Claim your BVRB3R name before account readiness can pass.";
  }
}

async function readJson(response: Response): Promise<JsonResponse> {
  return response.json().catch(() => ({})) as Promise<JsonResponse>;
}

function OptionSelect<TValue extends string>({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string;
  label: string;
  value: TValue | "";
  options: readonly { value: TValue; label: string }[];
  onChange: (value: TValue | "") => void;
}) {
  return (
    <label className="grid gap-2 text-sm text-white/72" htmlFor={id}>
      <span>{label}</span>
      <Select
        id={id}
        value={value}
        required
        onChange={(event) => onChange(event.target.value as TValue | "")}
      >
        <option value="">Choose one</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function ClientOnboardingWorkspace({ step }: { step: ClientOnboardingStep }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [username, setUsername] = useState("");
  const [availableUsername, setAvailableUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [trustRulesAccepted, setTrustRulesAccepted] = useState(false);

  const [serviceInterest, setServiceInterest] = useState<ClientServiceInterest | "">("");
  const [bookingTiming, setBookingTiming] = useState<ClientBookingTiming | "">("");
  const [searchPriority, setSearchPriority] = useState<ClientSearchPriority | "">("");
  const [firstBookingMission, setFirstBookingMission] = useState<ClientFirstBookingMission | "">("");

  const normalizedUsername = cleanUsername(username);
  const usernameProofConnected = usernameStatus === "available" && availableUsername === normalizedUsername;
  const busy = isSubmitting || isPending || usernameStatus === "checking";
  const readiness = useMemo(
    () => buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName,
      username: normalizedUsername,
      usernameAvailable: usernameProofConnected,
      email,
      phone,
      trustRulesAccepted
    }),
    [email, fullName, normalizedUsername, phone, trustRulesAccepted, usernameProofConnected]
  );

  const preferences: ClientPreferenceInput = {
    serviceInterest,
    bookingTiming,
    searchPriority,
    firstBookingMission
  };
  const firstBookingHref = getClientFirstBookingHref(preferences);

  async function checkUsernameAvailability() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setAvailableUsername("");

    if (normalizedUsername.length < 3 || !USERNAME_PATTERN.test(normalizedUsername)) {
      setUsernameStatus("invalid");
      return false;
    }

    setUsernameStatus("checking");
    try {
      const response = await fetch(`/api/profile/username/availability?username=${encodeURIComponent(normalizedUsername)}&ownerType=client`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        setUsernameStatus("error");
        return false;
      }

      const body = await response.json().catch(() => ({})) as UsernameAvailabilityPayload;
      if (body.available) {
        setAvailableUsername(normalizedUsername);
        setUsernameStatus("available");
        return true;
      }

      if (body.reason === "reserved") {
        setUsernameStatus("reserved");
        return false;
      }

      if (body.reason === "invalid") {
        setUsernameStatus("invalid");
        return false;
      }

      setUsernameStatus(body.reason === "taken" ? "taken" : "error");
      return false;
    } catch {
      setUsernameStatus("error");
      return false;
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!fullName.trim() || !email.trim() || !phone.trim() || !city.trim()) {
      setErrorMessage("Name, email, phone, and city are required before Client setup can continue.");
      return;
    }

    if (!trustRulesAccepted) {
      setErrorMessage("Accept the BVRB3R trust rules before continuing.");
      return;
    }

    const usernameReady = usernameProofConnected || await checkUsernameAvailability();
    if (!usernameReady) {
      setErrorMessage("Claim an available BVRB3R name before continuing.");
      return;
    }

    setIsSubmitting(true);
    try {
      const usernameResponse = await fetch("/api/profile/media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          action: "set_client_public_username",
          username: normalizedUsername
        })
      });
      if (!usernameResponse.ok) {
        const body = await readJson(usernameResponse);
        throw new Error(body.error ?? "Could not claim your BVRB3R name.");
      }

      const response = await fetch("/api/onboarding/client/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          city,
          username: normalizedUsername,
          usernameAvailabilityConfirmed: true,
          trustRulesAccepted
        })
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(body.error ?? "Client profile details are required.");
      }

      setSuccessMessage("Client setup saved. Continue to preferences.");
      startTransition(() => {
        router.replace((body.nextPath ?? "/onboarding/client/preferences") as Route);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Client setup could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePreferencesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!serviceInterest || !bookingTiming || !searchPriority || !firstBookingMission) {
      setErrorMessage("Service interest, booking timing, search priority, and first booking mission are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/onboarding/client/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          serviceInterest,
          bookingTiming,
          searchPriority,
          firstBookingMission,
          preferredServices: getClientOptionLabel(serviceInterest, CLIENT_SERVICE_INTEREST_OPTIONS),
          bookingCadence: getClientOptionLabel(bookingTiming, CLIENT_BOOKING_TIMING_OPTIONS),
          notifications: "booking_updates"
        })
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(body.error ?? "Client preferences are required.");
      }

      setSuccessMessage("Client preferences saved.");
      startTransition(() => {
        router.replace((body.nextPath ?? firstBookingHref) as Route);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Client preferences could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "client_preferences") {
    return (
      <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10" data-testid="client-onboarding-preferences">
        <div className="grid w-full gap-4 lg:grid-cols-[1fr_0.82fr]">
          <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
            <Badge>Client</Badge>
            <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Need. Timing. Search priority.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
              Tell BVRB3R what kind of first cut you want. Browsing never requires a card, and final booking still uses the canonical booking flow.
            </p>
            <form onSubmit={handlePreferencesSubmit} className="mt-8 grid gap-4 rounded-[28px] border border-white/8 bg-black/20 p-4">
              <OptionSelect id="serviceInterest" label="Service Interest" value={serviceInterest} options={CLIENT_SERVICE_INTEREST_OPTIONS} onChange={setServiceInterest} />
              <OptionSelect id="bookingTiming" label="Booking Timing" value={bookingTiming} options={CLIENT_BOOKING_TIMING_OPTIONS} onChange={setBookingTiming} />
              <OptionSelect id="searchPriority" label="Search Priority" value={searchPriority} options={CLIENT_SEARCH_PRIORITY_OPTIONS} onChange={setSearchPriority} />
              <OptionSelect id="firstBookingMission" label="First Booking Mission" value={firstBookingMission} options={CLIENT_FIRST_BOOKING_MISSION_OPTIONS} onChange={setFirstBookingMission} />
              <div className="rounded-[22px] border border-[#A3FF12]/16 bg-[#A3FF12]/8 p-4 text-sm leading-7 text-white/70">
                First action route: {firstBookingMission === "enter_client_home" ? "Enter Client Home" : "Find My First Cut"}
              </div>
              <Button type="submit" className="h-12 w-full" disabled={busy}>
                {firstBookingMission === "enter_client_home" ? "Enter Client Home" : "Find My First Cut"}
              </Button>
            </form>
            {errorMessage ? <p className="mt-4 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
            {successMessage ? <p className="mt-4 text-sm leading-7 text-[#d7ffab]">{successMessage}</p> : null}
          </Card>
          <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
            <p className="surface-label text-[#d7ffab]">Booking ready gate</p>
            <h2 className="mt-4 text-2xl font-semibold">Booking confirmation stays gated.</h2>
            <p className="mt-4 text-sm leading-7 text-white/62">
              First Booking Mission routes to discovery or Client Home. Final confirmation still requires a real barber or shop, service, time, policy acceptance, and payment method only when payment is required.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-white/68">
              <p>Service interest: {getClientOptionLabel(serviceInterest, CLIENT_SERVICE_INTEREST_OPTIONS) || "Needs setup"}</p>
              <p>Booking timing: {getClientOptionLabel(bookingTiming, CLIENT_BOOKING_TIMING_OPTIONS) || "Needs setup"}</p>
              <p>Search priority: {getClientOptionLabel(searchPriority, CLIENT_SEARCH_PRIORITY_OPTIONS) || "Needs setup"}</p>
              <p>First booking mission: {getClientOptionLabel(firstBookingMission, CLIENT_FIRST_BOOKING_MISSION_OPTIONS) || "Needs setup"}</p>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10" data-testid="client-onboarding-profile">
      <div className="grid w-full gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
          <Badge>Client</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Claim your BVRB3R name.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
            This creates your Client setup path for booking identity, support, receipts, and safe account recovery. Verification is not faked here.
          </p>
          <form onSubmit={handleProfileSubmit} className="mt-8 grid gap-4 rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="grid gap-2 text-sm text-white/72">
              <span>Name</span>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Jordan Ellis" autoComplete="name" required />
            </label>
            <label className="grid gap-2 text-sm text-white/72">
              <span>Email</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jordan@example.com" type="email" autoComplete="email" required />
            </label>
            <label className="grid gap-2 text-sm text-white/72">
              <span>Phone</span>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8135550101" type="tel" autoComplete="tel" required />
            </label>
            <label className="grid gap-2 text-sm text-white/72">
              <span>City</span>
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Tampa" autoComplete="address-level2" required />
            </label>
            <div className="grid gap-2 text-sm text-white/72">
              <label htmlFor="client-username">BVRB3R name</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  id="client-username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setUsernameStatus("idle");
                    setAvailableUsername("");
                  }}
                  placeholder="jordan"
                  autoComplete="username"
                  required
                />
                <Button type="button" variant="secondary" disabled={busy || !username.trim()} onClick={() => void checkUsernameAvailability()}>
                  Check Availability
                </Button>
              </div>
              <p className="text-xs leading-6 text-white/52" data-testid="username-status">{getUsernameMessage(usernameStatus)}</p>
            </div>
            <label className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-black/25 p-4 text-sm leading-6 text-white/70">
              <input
                type="checkbox"
                checked={trustRulesAccepted}
                onChange={(event) => setTrustRulesAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#A3FF12]"
                required
              />
              <span>I accept the BVRB3R trust rules required before serious account and booking actions unlock.</span>
            </label>
            <Button type="submit" className="h-12 w-full" disabled={busy}>
              Continue to preferences
            </Button>
          </form>
          {errorMessage ? <p className="mt-4 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 text-sm leading-7 text-[#d7ffab]">{successMessage}</p> : null}
        </Card>
        <OnboardingReadinessSummary result={readiness} title="Client readiness" sectionOrder={["account", "booking"]} />
      </div>
    </section>
  );
}
