"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useInitializeRoleMutation } from "@/lib/onboarding/client";
import type { OnboardingRole } from "@/types/onboarding";

const roleCards: Array<{ role: OnboardingRole; title: string; copy: string }> = [
  { role: "client", title: "Client", copy: "Book faster, rebook naturally, and keep loyalty momentum in one place." },
  { role: "barber", title: "Barber / Professional", copy: "Set up your chair, services, availability, and verification so you can go live the right way." },
  { role: "shop_owner", title: "Shop Owner", copy: "Build the shop, set the structure, and enter business verification before public activation." }
];

export function RoleSelectWorkspace() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useInitializeRoleMutation();

  async function handleSelect(role: OnboardingRole) {
    setErrorMessage(null);
    try {
      const result = await mutation.mutateAsync(role);
      router.replace(result.nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start onboarding.");
    }
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Choose your lane</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">Tell BVRB3R how you&apos;re entering the platform.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">Signup stays fast. Lane setup, onboarding, and verification happen after account creation so trust stays strict without making account creation feel heavy.</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {roleCards.map((card) => (
            <button
              key={card.role}
              type="button"
              disabled={mutation.isPending}
              onClick={() => void handleSelect(card.role)}
              className="flex min-h-[220px] flex-col justify-between rounded-[28px] border border-white/8 bg-black/20 p-5 text-left transition hover:border-[#7cff00]/30 hover:bg-black/30"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#cfff93]">Lane</p>
                <h2 className="mt-4 text-2xl font-semibold text-white">{card.title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/62">{card.copy}</p>
              </div>
              <span className="mt-6 inline-flex text-sm text-white/78">Continue</span>
            </button>
          ))}
        </div>
        {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
      </Card>
    </section>
  );
}
