"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOnboardingMe, useOnboardingStepMutation } from "@/lib/onboarding/client";
import {
  useStartBarberConnectOnboardingMutation,
  useStartBarberIdentitySessionMutation,
  useStartOwnerConnectOnboardingMutation,
  useVerificationMe
} from "@/lib/trust/client";
import type { OnboardingRole, OnboardingStepKey } from "@/types/onboarding";

const config = {
  client_profile: {
    role: "client" as const,
    title: "Client profile",
    subtitle: "Set the basics so your first booking feels personal and fast.",
    endpoint: "/api/onboarding/client/profile",
    fields: [
      { name: "fullName", label: "Full name", placeholder: "Jordan Ellis" },
      { name: "phone", label: "Phone", placeholder: "(813) 555-0100" },
      { name: "city", label: "City", placeholder: "Tampa" }
    ]
  },
  client_preferences: {
    role: "client" as const,
    title: "Preferences",
    subtitle: "Tell BVRB3R what you usually book so rebooking gets better over time.",
    endpoint: "/api/onboarding/client/preferences",
    fields: [
      { name: "preferredServices", label: "Preferred services", placeholder: "Signature cut, beard sculpt" },
      { name: "bookingCadence", label: "Booking cadence", placeholder: "Every 2 weeks" },
      { name: "notifications", label: "Notifications", placeholder: "SMS, email" }
    ]
  },
  barber_profile: {
    role: "barber" as const,
    title: "Professional profile",
    subtitle: "Set the chair identity that powers your booking and verification lane.",
    endpoint: "/api/onboarding/barber/profile",
    fields: [
      { name: "fullName", label: "Full name", placeholder: "Luxe Reed" },
      { name: "phone", label: "Phone", placeholder: "(813) 555-0100" },
      { name: "city", label: "City", placeholder: "Tampa" },
      { name: "professionalType", label: "Professional type", placeholder: "Barber" },
      { name: "yearsExperience", label: "Years experience", placeholder: "7" },
      { name: "bio", label: "Bio", placeholder: "Precision-focused barber serving premium repeat clientele." },
      { name: "compensationModel", label: "Compensation model", placeholder: "booth_rent" }
    ]
  },
  barber_services: {
    role: "barber" as const,
    title: "Core services",
    subtitle: "Capture your baseline service stack so your lane can activate with the right timing and pricing context.",
    endpoint: "/api/onboarding/barber/services",
    fields: [
      { name: "primaryServices", label: "Primary services", placeholder: "Cuts, beard work, enhancements" },
      { name: "startingPrice", label: "Starting price", placeholder: "45" },
      { name: "averageDuration", label: "Average duration", placeholder: "45 min" }
    ]
  },
  barber_availability: {
    role: "barber" as const,
    title: "Availability",
    subtitle: "Set your schedule posture before you move into verification and activation.",
    endpoint: "/api/onboarding/barber/availability",
    fields: [
      { name: "weeklySchedule", label: "Weekly schedule", placeholder: "Tue-Sat 9a-6p" },
      { name: "acceptsSameDay", label: "Accepts same-day", placeholder: "true" },
      { name: "serviceMode", label: "Service mode", placeholder: "In-shop" }
    ]
  },
  owner_shop: {
    role: "shop_owner" as const,
    title: "Shop setup",
    subtitle: "Set the business identity that the client sees first.",
    endpoint: "/api/onboarding/owner/shop",
    fields: [
      { name: "shopName", label: "Shop name", placeholder: "BVRB3R Hyde Park" },
      { name: "phone", label: "Phone", placeholder: "(813) 555-0100" },
      { name: "address", label: "Address", placeholder: "123 Main St, Tampa, FL" },
      { name: "publicDescription", label: "Public description", placeholder: "Premium cuts, fast floor flow, and high-trust operators." },
      { name: "hours", label: "Hours", placeholder: "Mon-Sat 9a-8p" }
    ]
  },
  owner_structure: {
    role: "shop_owner" as const,
    title: "Operating structure",
    subtitle: "Define how the shop runs before you invite the team into it.",
    endpoint: "/api/onboarding/owner/structure",
    fields: [
      { name: "operatingModel", label: "Operating model", placeholder: "Hybrid" },
      { name: "walkInsEnabled", label: "Walk-ins enabled", placeholder: "true" },
      { name: "defaultServiceCategory", label: "Default service category", placeholder: "Haircuts" }
    ]
  },
  owner_team: {
    role: "shop_owner" as const,
    title: "Team setup",
    subtitle: "Add the first team invites now or leave the shop ready for later staffing.",
    endpoint: "/api/onboarding/owner/team",
    fields: [
      { name: "inviteEmails", label: "Invite emails", placeholder: "mia@shop.com, kayla@shop.com" }
    ]
  }
} satisfies Partial<Record<OnboardingStepKey, {
  role: OnboardingRole;
  title: string;
  subtitle: string;
  endpoint: string;
  fields: Array<{ name: string; label: string; placeholder: string }>;
}>>;

export function OnboardingStepWorkspace({ role, step }: { role: OnboardingRole; step: OnboardingStepKey }) {
  const router = useRouter();
  const onboardingQuery = useOnboardingMe();
  const verificationQuery = useVerificationMe(role !== "client" && step.endsWith("verification"));
  const stepConfig = config[step as keyof typeof config];
  const mutation = useOnboardingStepMutation(stepConfig?.endpoint ?? `/api/onboarding/${role}/${step}`);
  const completeVerificationMutation = useOnboardingStepMutation(
    role === "barber" ? "/api/onboarding/barber/verification" : "/api/onboarding/owner/verification"
  );
  const startIdentity = useStartBarberIdentitySessionMutation();
  const startBarberConnect = useStartBarberConnectOnboardingMutation();
  const startOwnerConnect = useStartOwnerConnectOnboardingMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lane = useMemo(
    () => onboardingQuery.data?.lanes.find((entry) => entry.role === role) ?? null,
    [onboardingQuery.data, role]
  );
  const verificationProfile = verificationQuery.data?.profiles.find((entry) => entry.role === role) ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
    );

    if ("acceptsSameDay" in payload || "walkInsEnabled" in payload) {
      payload.acceptsSameDay = `${payload.acceptsSameDay}`.toLowerCase() !== "false";
      payload.walkInsEnabled = `${payload.walkInsEnabled}`.toLowerCase() !== "false";
    }

    try {
      const result = await mutation.mutateAsync(payload);
      router.replace(result.nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this onboarding step.");
    }
  }

  async function handleVerificationContinue() {
    setErrorMessage(null);
    try {
      const result = await completeVerificationMutation.mutateAsync({});
      router.replace(result.nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue to activation.");
    }
  }

  async function handleStartBarberIdentity() {
    setErrorMessage(null);
    try {
      const result = await startIdentity.mutateAsync();
      if (result.url) {
        window.location.assign(result.url);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Stripe Identity.");
    }
  }

  async function handleStartBarberConnect() {
    setErrorMessage(null);
    try {
      const result = await startBarberConnect.mutateAsync();
      window.location.assign(result.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Stripe Connect.");
    }
  }

  async function handleStartOwnerConnect() {
    setErrorMessage(null);
    try {
      const shopId = typeof lane?.profileData.shopId === "string" ? lane.profileData.shopId : undefined;
      const result = await startOwnerConnect.mutateAsync({ shopId });
      window.location.assign(result.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Stripe Connect.");
    }
  }

  if (step.endsWith("verification")) {
    return (
      <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
        <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
          <Badge>Verification center</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
            {role === "barber" ? "Verification unlocks your public chair." : "Business verification unlocks the shop."}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
            {role === "barber"
              ? "Identity, payouts, and compliance are now driven by the canonical verification lane. Finish the setup now, then continue to activation while review runs."
              : "Business payouts and compliance now run through the same canonical verification lane the architect team reviews."}
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Verification state</p>
              <div className="mt-4 space-y-3 text-sm text-white/72">
                <p>Overall: <span className="text-white">{verificationProfile?.overallStatus ?? "not_started"}</span></p>
                <p>Identity: <span className="text-white">{verificationProfile?.identityStatus ?? "not_started"}</span></p>
                <p>Payout: <span className="text-white">{verificationProfile?.payoutStatus ?? "not_started"}</span></p>
                <p>Compliance: <span className="text-white">{verificationProfile?.complianceStatus ?? "not_started"}</span></p>
              </div>
              {verificationProfile?.currentRequirements?.length ? (
                <div className="mt-4 rounded-[22px] border border-white/8 bg-black/30 p-4 text-sm text-white/62">
                  {verificationProfile.currentRequirements.join(" • ")}
                </div>
              ) : null}
            </Card>
            <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Provider actions</p>
              <div className="mt-4 grid gap-3">
                {role === "barber" ? (
                  <>
                    <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleStartBarberIdentity()} disabled={startIdentity.isPending}>
                      {startIdentity.isPending ? "Starting identity..." : "Verify identity"}
                    </Button>
                    <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleStartBarberConnect()} disabled={startBarberConnect.isPending}>
                      {startBarberConnect.isPending ? "Opening payouts..." : "Connect payouts"}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleStartOwnerConnect()} disabled={startOwnerConnect.isPending}>
                    {startOwnerConnect.isPending ? "Opening business payouts..." : "Connect business payouts"}
                  </Button>
                )}
                <Button type="button" className="h-12 w-full" onClick={() => void handleVerificationContinue()} disabled={completeVerificationMutation.isPending}>
                  Continue to activation
                </Button>
              </div>
            </Card>
          </div>
          {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
        </Card>
      </section>
    );
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>{role.replace("_", " ")}</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">{stepConfig?.title ?? "Onboarding step"}</h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">{stepConfig?.subtitle}</p>
        <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
          {stepConfig?.fields.map((field) => (
            <label key={field.name} className="grid gap-2 text-sm text-white/66">
              <span>{field.label}</span>
              <Input
                name={field.name}
                defaultValue={typeof lane?.profileData?.[field.name] === "string" ? String(lane.profileData[field.name]) : ""}
                placeholder={field.placeholder}
              />
            </label>
          ))}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" className="h-12 px-6" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save and continue"}
            </Button>
            <Button type="button" variant="secondary" className="h-12 px-6" onClick={() => lane?.resumePath && router.replace(lane.resumePath)}>
              Resume later
            </Button>
          </div>
        </form>
        {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
      </Card>
    </section>
  );
}
