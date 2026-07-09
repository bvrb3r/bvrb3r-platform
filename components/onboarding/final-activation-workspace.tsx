"use client";

import Link from "next/link";
import type { Route } from "next";
import { OnboardingReadinessSummary } from "@/components/onboarding/onboarding-readiness-summary";
import type { FinalActivationResult } from "@/lib/onboarding/final-activation";

const SECTION_ORDER_BY_ROLE: Record<FinalActivationResult["roleScope"], Parameters<typeof OnboardingReadinessSummary>[0]["sectionOrder"]> = {
  guest: ["publicGuest", "browse"],
  client: ["account", "booking"],
  barber: ["account", "barberBusiness", "payout"],
  shop_owner: ["account", "shop", "kiosk", "payout"]
};

export function FinalActivationWorkspace({ result }: { result: FinalActivationResult }) {
  const blocked = result.blockedReasons[0] ?? null;

  return (
    <main className="page-shell safe-top-pad app-safe-bottom min-h-[100svh] py-8 text-white" data-testid="onboarding-final-activation">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-[28px] border border-white/10 bg-black/32 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">{result.userFacingRoleLabel}</p>
              <h1 className="mt-2 text-3xl font-semibold">{result.isV1OnboardingComplete ? "You're ready." : blocked?.title ?? "Needs setup."}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                {result.progressPercent}% complete. {blocked?.reason ?? "Continue where you left off."}
              </p>
            </div>
            <div className="min-w-36 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center">
              <p className="text-3xl font-black text-[#C4F24E]">{result.progressPercent}%</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-white/45">Progress</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-full bg-[#C4F24E] px-5 text-sm font-black text-black"
              href={result.finalActionHref as Route}
            >
              {result.finalAction.label}
            </Link>
            {result.secondaryActions.map((action) => (
              <Link
                key={`${action.label}-${action.href}`}
                className="inline-flex min-h-11 items-center rounded-full border border-white/12 px-5 text-sm font-bold text-white/82"
                href={action.href as Route}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        {result.blockedReasons.length ? (
          <section className="grid gap-3 md:grid-cols-2" aria-label="Blocked states">
            {result.blockedReasons.map((item) => (
              <article key={`${item.title}-${item.reason}`} className="rounded-[22px] border border-amber-300/20 bg-amber-300/8 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/68">{item.reason}</p>
                <Link className="mt-4 inline-flex text-sm font-bold text-[#e4f9b8]" href={item.nextAction.href as Route}>
                  {item.nextAction.label}
                </Link>
              </article>
            ))}
          </section>
        ) : null}

        {result.retryableActions.length ? (
          <section className="grid gap-3 md:grid-cols-2" aria-label="Retry states">
            {result.retryableActions.map((item) => (
              <article key={item.retryKey} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-white/68">{item.reason}</p>
                <Link className="mt-4 inline-flex text-sm font-bold text-[#e4f9b8]" href={item.href as Route}>
                  Try again
                </Link>
              </article>
            ))}
          </section>
        ) : null}

        <OnboardingReadinessSummary
          result={result.readiness}
          title={`${result.userFacingRoleLabel} readiness`}
          sectionOrder={SECTION_ORDER_BY_ROLE[result.roleScope]}
        />

        <section className="rounded-[28px] border border-white/10 bg-black/24 p-5" data-testid="onboarding-final-qa-matrix">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Final QA</p>
              <h2 className="mt-2 text-xl font-semibold">Activation proof</h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">
              {result.evidence.validationStatus}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Final action", result.qaMatrixRow.finalAction],
              ["Home handoff", result.qaMatrixRow.homeHandoff],
              ["Blocked state", result.qaMatrixRow.blockedState],
              ["Retry state", result.qaMatrixRow.retryState],
              ["No backend labels", result.qaMatrixRow.noBackendLabels],
              ["Money posture", result.qaMatrixRow.payoutMoneyPosture],
              ["Kiosk posture", result.qaMatrixRow.kioskReadiness],
              ["No fake truth", result.qaMatrixRow.noFakeMoneyPayoutKioskTruth]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-white/42">{label}</dt>
                <dd className="mt-2 text-sm font-semibold text-white/82">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  );
}
