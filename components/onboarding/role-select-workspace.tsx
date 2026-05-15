"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useInitializeRoleMutation } from "@/lib/onboarding/client";
import type { OnboardingRole, RoleSelectionPayload } from "@/types/onboarding";

const roleCards: Array<{ role: OnboardingRole; title: string; copy: string }> = [
  { role: "client", title: "Client", copy: "Book, rebook, and keep your loyalty history tied to a clean personal account." },
  { role: "barber", title: "Barber", copy: "Choose how you cut on BVRB3R so the right approval and verification lane is attached from day one." },
  { role: "shop_owner", title: "Shop Owner", copy: "Open the owner lane, create the shop identity, and move into business approval the right way." }
];

export function RoleSelectWorkspace() {
  const router = useRouter();
  const mutation = useInitializeRoleMutation();
  const [selectedRole, setSelectedRole] = useState<OnboardingRole | null>(null);
  const [shopName, setShopName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedRoleCard = useMemo(
    () => roleCards.find((card) => card.role === selectedRole) ?? null,
    [selectedRole]
  );

  async function handleContinue(payload: RoleSelectionPayload) {
    setErrorMessage(null);
    console.info("[role-select] submit clicked", {
      selectedRole,
      payload
    });
    try {
      const result = await mutation.mutateAsync(payload);
      console.info("[role-select] lane launch succeeded", {
        selectedRole: payload.role,
        nextPath: result.nextPath
      });
      router.replace(result.nextPath);
    } catch (error) {
      console.error("[role-select] lane launch failed", {
        selectedRole: payload.role,
        error
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to initialize this lane.");
    }
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Choose your lane</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Choose the identity lane that matches how you use BVRB3R.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          This step creates a real account bound to your authenticated user id. Nothing is borrowed from demo data, and the right approval flow is attached immediately.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {roleCards.map((card) => {
            const isSelected = selectedRole === card.role;
            return (
              <button
                key={card.role}
                type="button"
                onClick={() => {
                  console.info("[role-select] role card selected", {
                    role: card.role
                  });
                  setSelectedRole(card.role);
                }}
                data-role-card={card.role}
                className={`flex min-h-[220px] flex-col justify-between rounded-[28px] border p-5 text-left transition ${
                  isSelected
                    ? "border-[#7cff00]/34 bg-[#7cff00]/10"
                    : "border-white/8 bg-black/20 hover:border-[#7cff00]/20 hover:bg-black/30"
                }`}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#cfff93]">Lane</p>
                  <h2 className="mt-4 text-2xl font-semibold text-white">{card.title}</h2>
                  <p className="mt-4 text-sm leading-7 text-white/62">{card.copy}</p>
                </div>
                <span className="mt-6 inline-flex text-sm text-white/78">{isSelected ? "Selected" : "Choose lane"}</span>
              </button>
            );
          })}
        </div>

        {selectedRoleCard ? (
          <Card className="mt-6 rounded-[30px] border border-white/8 bg-black/20 p-5 sm:p-6">
            <p className="surface-label">{selectedRoleCard.title}</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">{selectedRoleCard.copy}</p>

            {selectedRole === "client" ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="h-12 px-6"
                  disabled={mutation.isPending}
                  onClick={() => void handleContinue({ role: "client" })}
                >
                  {mutation.isPending ? "Creating client account..." : "Continue as client"}
                </Button>
              </div>
            ) : null}

            {selectedRole === "barber" ? (
              <>
                <p className="mt-5 text-sm leading-7 text-white/58">
                  The next step will ask whether you are entering as a freelance, commission, or booth-rent barber, then attach the correct approval lane before you reach the barber dashboard.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="h-12 px-6"
                    disabled={mutation.isPending}
                    onClick={() => void handleContinue({ role: "barber" })}
                  >
                    {mutation.isPending ? "Opening barber setup..." : "Continue as barber"}
                  </Button>
                </div>
              </>
            ) : null}

            {selectedRole === "shop_owner" ? (
              <>
                <div className="mt-5 max-w-xl grid gap-2">
                  <label className="grid gap-2 text-sm text-white/66">
                    <span>Shop name</span>
                    <Input
                      value={shopName}
                      onChange={(event) => setShopName(event.target.value)}
                      placeholder="BVRB3R Hyde Park"
                    />
                  </label>
                </div>
                <p className="mt-4 text-sm leading-7 text-white/58">
                  Shop owners enter the owner dashboard immediately, but public business activation and payouts stay pending until BVRB3R approval is complete.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="h-12 px-6"
                    disabled={mutation.isPending || shopName.trim().length < 2}
                    onClick={() => void handleContinue({ role: "shop_owner", shopName, shop_name: shopName })}
                  >
                    {mutation.isPending ? "Creating owner account..." : "Continue as shop owner"}
                  </Button>
                </div>
              </>
            ) : null}
          </Card>
        ) : null}

        {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
      </Card>
    </section>
  );
}
