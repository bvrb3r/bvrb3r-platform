"use client";

import Link from "next/link";
import { LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/design/components";
import type { ClientPaywallFeatureState, ClientPaywallSummary, ClientPaywallTone } from "@/lib/entitlements/client-paywall";

function badgeTone(tone: ClientPaywallTone) {
  if (tone === "green") return "green" as const;
  return "neutral" as const;
}

function featureTone(state: ClientPaywallFeatureState) {
  if (state === "available") return "green" as const;
  return "neutral" as const;
}

function stateIcon(state: ClientPaywallFeatureState) {
  if (state === "available") {
    return <ShieldCheck className="h-4 w-4 text-[#d9f985]" />;
  }

  if (state === "coming_soon") {
    return <Sparkles className="h-4 w-4 text-white/58" />;
  }

  return <LockKeyhole className="h-4 w-4 text-white/58" />;
}

export function ClientPlanAccessCard({
  summary,
  compact = false,
  showFeatureGroups = false
}: {
  summary: ClientPaywallSummary;
  compact?: boolean;
  showFeatureGroups?: boolean;
}) {
  const featureGroups = [
    { label: "Free", items: summary.features.free },
    { label: "Pro", items: summary.features.pro },
    { label: "Elite", items: summary.features.elite }
  ];

  return (
    <section
      aria-label="Client plan access"
      data-testid="client-plan-access-card"
      className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(7,7,7,0.98))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">Client plan access</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-white" data-display="true">
            {summary.currentPlanLabel} client access
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Free booking, search, discovery, account, and activity stay open. Pro and Elite tools unlock only from server entitlement proof.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={badgeTone(summary.statusTone)}>{summary.statusLabel}</StatusBadge>
          <StatusBadge tone="neutral">{summary.serverEvidenceLabel}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Billing</p>
          <p className="mt-2 text-sm font-semibold text-white">{summary.billingLabel}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Locked</p>
          <p className="mt-2 text-sm font-semibold text-white">{summary.lockedFeatureCount} paid tool{summary.lockedFeatureCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Review</p>
          <p className="mt-2 text-sm font-semibold text-white">{summary.needsReviewCount} item{summary.needsReviewCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {showFeatureGroups ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {featureGroups.map((group) => (
            <div key={group.label} className="rounded-[22px] border border-white/8 bg-black/18 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/46">{group.label}</p>
              <div className="mt-3 space-y-2">
                {group.items.map((feature) => (
                  <div key={feature.id} className="rounded-[18px] border border-white/8 bg-white/[0.035] p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{stateIcon(feature.state)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">{feature.title}</p>
                          <StatusBadge tone={featureTone(feature.state)}>{feature.stateLabel}</StatusBadge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-white/52">{feature.description}</p>
                        <p className="mt-2 text-[11px] leading-5 text-white/42">{feature.reason}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={compact ? "mt-4" : "mt-5"}>
        <Link
          href={summary.upgradeHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/28 bg-[#C4F24E]/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-[#C4F24E] transition hover:border-[#C4F24E]/46 hover:bg-[#C4F24E]/15"
        >
          {summary.upgradeActionLabel}
        </Link>
      </div>
    </section>
  );
}
