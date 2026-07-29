"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Pr27EvidenceCard,
  Pr27PrimaryButton
} from "@/components/trust/pr27-trust-shell";
import type { Pr27SetupItem } from "@/lib/trust/product-pr27-domain";

type SetupSnapshot = {
  firstName: string;
  live: boolean;
  demo: boolean;
  items: Pr27SetupItem[];
  doneCount: number;
  totalCount: number;
  progressPercent: number;
  requiredComplete: boolean;
  canGoLive: boolean;
  canReceiveBookings: boolean;
  kioskEligible: boolean;
  walkInEligible: boolean;
};

const ITEM_LINKS: Record<Pr27SetupItem["key"], string> = {
  public_profile: "/dashboard/barber/profile",
  services_prices: "/dashboard/barber/services",
  license_verification: "/dashboard/barber/more?section=verification",
  stripe_payouts: "/dashboard/barber/payouts",
  shop_link_or_independent: "/dashboard/barber/more?section=shop",
  chairsync: "/dashboard/barber/command?section=chairsync",
  portfolio_culture: "/dashboard/barber/culture",
  chair_qr_nfc: "/dashboard/barber/more?section=chair"
};

export function BarberSetupChecklistWorkspace({ initial }: { initial: SetupSnapshot }) {
  const [live, setLive] = useState(initial.live);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const headline = live
    ? `Your chair is live, ${initial.firstName}`
    : initial.requiredComplete
      ? "Ready when you are"
      : "Let’s get your chair live";

  async function goLive() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/barber/setup-checklist", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to activate this chair.");
      setLive(true);
      setMessage("Chair is live. Booking, kiosk, and floor eligibility are active.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to activate this chair.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#060708] text-[#F5F1E8]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(196,242,78,0.07),transparent_34%)]" />
      <header className="relative z-10 flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="font-display text-sm font-black tracking-[0.28em] text-white">
          BVRB3R
        </Link>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#C9A87C]">
          Barber setup · {initial.firstName}
        </span>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-12 pt-4 sm:px-8 sm:pt-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/62">
          Setup — {initial.doneCount} of {initial.totalCount} done
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-[clamp(42px,6vw,64px)] font-normal leading-[1.02] tracking-[-0.03em]">
          {headline}<span className="text-[#C4F24E]">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/56">
          Your chair goes live when the required steps clear. Optional ones make it earn harder.
        </p>
        <div className="mt-6 h-2 max-w-xl overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#C9A84E,#C4F24E)]"
            style={{ width: `${initial.progressPercent}%` }}
          />
        </div>

        <Pr27EvidenceCard>
          <div className="grid gap-3 md:grid-cols-2">
            {initial.items.map((item) => {
              const done = item.status === "done";
              const review = item.status === "in_review";
              return (
                <Link
                  key={item.key}
                  href={ITEM_LINKS[item.key]}
                  className="group flex min-h-[124px] items-start gap-4 rounded-[20px] border p-4 transition hover:-translate-y-0.5"
                  style={{
                    borderColor: done
                      ? "rgba(196,242,78,0.25)"
                      : review
                        ? "rgba(201,168,124,0.35)"
                        : "rgba(245,241,232,0.10)",
                    background: "rgba(255,255,255,0.025)"
                  }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border font-mono text-xs font-bold"
                    style={{
                      background: done ? "#C4F24E" : review ? "#C9A87C" : "transparent",
                      borderColor: done ? "#C4F24E" : review ? "#C9A87C" : "rgba(245,241,232,0.25)",
                      color: done || review ? "#060708" : "rgba(245,241,232,0.4)"
                    }}
                  >
                    {done ? "✓" : review ? "~" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-bold text-white">
                      {item.name}{item.required ? "" : " · optional"}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-white/48">{item.description}</span>
                    <span
                      className="mt-3 block font-mono text-[9px] uppercase tracking-[0.16em]"
                      style={{ color: done ? "#9BE15D" : review ? "#C9A87C" : "rgba(245,241,232,0.42)" }}
                    >
                      {done ? "done" : review ? "in review" : "to do"} · open
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center">
            <Pr27PrimaryButton onClick={goLive} disabled={!initial.canGoLive || live || busy}>
              {busy ? "Checking truth…" : live ? "Chair is live ✓" : "Go live →"}
            </Pr27PrimaryButton>
            <p className="max-w-xl text-xs leading-5 text-white/44">
              {live
                ? "You’re bookable, kiosk-eligible, and on the shop floor."
                : initial.requiredComplete
                  ? "All required steps clear."
                  : "Blocked: finish the required steps above."}
            </p>
            {message ? <p role="status" className="text-xs text-[#C9A87C]">{message}</p> : null}
          </div>
        </Pr27EvidenceCard>
      </section>
      <footer className="relative z-10 pb-5 text-center font-mono text-[9px] uppercase tracking-[0.26em] text-white/25">
        Quietly powered by BVRB3R
      </footer>
    </main>
  );
}
