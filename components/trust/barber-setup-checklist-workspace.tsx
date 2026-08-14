"use client";

import type { Route } from "next";
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
  marketplaceProfileComplete?: boolean;
  canRequestActivation?: boolean;
  marketplaceLaunchChecks?: Array<{
    key: "profile_portfolio" | "services" | "availability" | "business_visibility";
    name: string;
    description: string;
    href: Route;
    status: "done" | "to_do";
  }>;
};

const ITEM_LINKS: Record<Pr27SetupItem["key"], Route> = {
  public_profile: "/dashboard/barber/profile",
  services_prices: "/dashboard/barber/services",
  license_verification: "/dashboard/barber/more?section=verification",
  stripe_payouts: "/dashboard/barber/payouts",
  shop_link_or_independent: "/dashboard/barber/more?section=shop",
  chairsync: "/dashboard/barber/command?section=chairsync",
  portfolio_culture: "/dashboard/barber/culture",
  chair_qr_nfc: "/dashboard/barber/more?section=chair"
};

const DEFAULT_MARKETPLACE_LAUNCH_CHECKS: NonNullable<SetupSnapshot["marketplaceLaunchChecks"]> = [
  {
    key: "profile_portfolio",
    name: "Profile photo & portfolio",
    description: "Add a real profile photo and at least three portfolio posts.",
    href: "/dashboard/barber/profile?section=portfolio",
    status: "to_do"
  },
  {
    key: "services",
    name: "Bookable services",
    description: "Publish at least three priced services with valid durations.",
    href: "/dashboard/barber/services",
    status: "to_do"
  },
  {
    key: "availability",
    name: "Operational availability",
    description: "Publish hours for an independent chair or mutually approved shop location.",
    href: "/dashboard/barber/more?section=availability",
    status: "to_do"
  },
  {
    key: "business_visibility",
    name: "Business visibility",
    description: "Turn on public visibility, then let server truth confirm booking eligibility.",
    href: "/dashboard/barber/more?section=visibility",
    status: "to_do"
  }
];

export function BarberSetupChecklistWorkspace({ initial }: { initial: SetupSnapshot }) {
  const [live, setLive] = useState(initial.live);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canRequestActivation = initial.canRequestActivation === true;
  const marketplaceLaunchChecks = initial.marketplaceLaunchChecks ?? DEFAULT_MARKETPLACE_LAUNCH_CHECKS;
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
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        live?: boolean;
        marketplaceProfileComplete?: boolean;
      };
      if (!response.ok) throw new Error(body.error ?? "Unable to activate this chair.");
      if (body.live !== true || body.marketplaceProfileComplete !== true) {
        throw new Error("Activation was not confirmed by canonical Road setup truth.");
      }
      setLive(true);
      setMessage("Server truth confirmed: your public profile is live and booking-eligible.");
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
          This page never marks you live by itself. Road and marketplace server truth must clear every launch requirement first.
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

          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Canonical Road launch checks</p>
                <h2 className="mt-2 font-display text-lg font-black text-white">Clear the blockers clients actually depend on.</h2>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">
                {initial.marketplaceProfileComplete ? "server confirmed" : "not yet confirmed"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {marketplaceLaunchChecks.map((check) => (
                <Link
                  key={check.key}
                  href={check.href}
                  className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4 transition hover:border-[#C4F24E]/30"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-display text-sm font-bold text-white">{check.name}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${check.status === "done" ? "text-[#9BE15D]" : "text-[#C9A87C]"}`}>
                      {check.status === "done" ? "cleared" : "open"}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-white/48">{check.description}</span>
                  <span className="mt-3 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">Open setup →</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center">
            <Pr27PrimaryButton onClick={goLive} disabled={!canRequestActivation || live || busy}>
              {busy ? "Checking server truth…" : live ? "Marketplace live ✓" : "Verify & activate →"}
            </Pr27PrimaryButton>
            <p className="max-w-xl text-xs leading-5 text-white/44">
              {live
                ? "Canonical Road truth confirms your profile is live and booking-eligible."
                : canRequestActivation
                  ? "Setup evidence is ready for the final server verification."
                  : initial.requiredComplete
                    ? "PR27 basics are complete; clear the canonical Road launch checks above."
                    : "Blocked: finish the required setup steps and Road launch checks above."}
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
