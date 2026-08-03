"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOnboardingStepMutation } from "@/lib/onboarding/client";
import type { BarberSubtype } from "@/types/domain";

const barberSubtypeCards: Array<{
  subtype: BarberSubtype;
  title: string;
  copy: string;
  approvalCopy: string;
}> = [
  {
    subtype: "freelance",
    title: "Freelance Barber",
    copy: "Independent barber building a personal chair and book of business through BVRB3R.",
    approvalCopy: "Requires BVRB3R app approval before going live."
  },
  {
    subtype: "booth_rent",
    title: "Full Booth Rent Barber",
    copy: "Independent booth-rent barber operating inside a shop with location approval and verification controls. Eligible service proceeds remain barber money after the 5% BVRB3R platform fee and separately disclosed authorized adjustments; rent is billed separately.",
    approvalCopy: "Requires BVRB3R app approval and shop approval."
  },
  {
    subtype: "autobooth_rent",
    title: "AutoBooth Rent Barber",
    copy: "Full Booth Rent with an owner-approved portion of eligible proceeds applied automatically toward your outstanding rent. It never exceeds what you owe, and it is never a cut of your work.",
    approvalCopy: "Requires BVRB3R app approval and shop approval."
  }
];

export function BarberTypeWorkspace() {
  const router = useRouter();
  const mutation = useOnboardingStepMutation("/api/onboarding/barber/type");
  const [selectedSubtype, setSelectedSubtype] = useState<BarberSubtype>("freelance");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleContinue() {
    setErrorMessage(null);
    try {
      const result = await mutation.mutateAsync({ barberSubtype: selectedSubtype });
      router.replace(result.nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save your barber subtype.");
    }
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Barber type</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Choose the barber lane you operate inside BVRB3R.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          Your subtype controls the approval path, compensation posture, and which barber dashboard state you enter after setup.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {barberSubtypeCards.map((card) => {
            const isSelected = selectedSubtype === card.subtype;
            return (
              <button
                key={card.subtype}
                type="button"
                onClick={() => setSelectedSubtype(card.subtype)}
                className={`flex min-h-[210px] flex-col justify-between rounded-[24px] border p-4 text-left transition ${
                  isSelected
                    ? "border-[#c4f24e]/34 bg-[#c4f24e]/10"
                    : "border-white/8 bg-black/25 hover:border-[#c4f24e]/18 hover:bg-black/35"
                }`}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#e0f6a0]">Subtype</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">{card.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-white/62">{card.copy}</p>
                </div>
                <p className="mt-5 text-xs leading-6 text-[#e4f9b8]">{card.approvalCopy}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" className="h-12 px-6" disabled={mutation.isPending} onClick={() => void handleContinue()}>
            {mutation.isPending ? "Saving subtype..." : "Continue to barber dashboard"}
          </Button>
        </div>

        {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
      </Card>
    </section>
  );
}
