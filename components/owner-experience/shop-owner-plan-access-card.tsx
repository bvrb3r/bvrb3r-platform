"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/design/components";
import type {
  ShopOwnerPaywallFeatureState,
  ShopOwnerPaywallFeatureView,
  ShopOwnerPaywallSummary,
  ShopOwnerPaywallTone
} from "@/lib/entitlements/shop-owner-paywall";

function badgeTone(tone: ShopOwnerPaywallTone) {
  if (tone === "green") return "green" as const;
  return "neutral" as const;
}

function featureTone(state: ShopOwnerPaywallFeatureState) {
  if (state === "available") return "green" as const;
  if (state === "unavailable") return "danger" as const;
  return "neutral" as const;
}

function stateIcon(state: ShopOwnerPaywallFeatureState) {
  if (state === "available") {
    return <ShieldCheck className="h-4 w-4 text-[#d9f985]" />;
  }

  if (state === "coming_soon") {
    return <Sparkles className="h-4 w-4 text-white/58" />;
  }

  return <LockKeyhole className="h-4 w-4 text-white/58" />;
}

function PlanAction({ summary }: { summary: ShopOwnerPaywallSummary }) {
  if (summary.upgradeHref) {
    return (
      <Link
        href={summary.upgradeHref}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/28 bg-[#C4F24E]/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-[#C4F24E] transition hover:border-[#C4F24E]/46 hover:bg-[#C4F24E]/15"
      >
        {summary.upgradeActionLabel}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-[0.14em] text-white/42"
    >
      {summary.upgradeActionLabel}
    </button>
  );
}

function FeatureCard({ feature }: { feature: ShopOwnerPaywallFeatureView }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.035] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{stateIcon(feature.state)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">{feature.title}</p>
            <StatusBadge tone={featureTone(feature.state)}>{feature.stateLabel}</StatusBadge>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/52">{feature.description}</p>
          <p className="mt-2 text-[11px] leading-5 text-white/42">{feature.reason}</p>
          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/34">
            Required: {feature.requiredPlanLabel} / {feature.evidenceSource}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ShopOwnerPlanAccessCard({
  summary,
  compact = false,
  showFeatureGroups = false
}: {
  summary: ShopOwnerPaywallSummary;
  compact?: boolean;
  showFeatureGroups?: boolean;
}) {
  if (!summary.activeOwnerPaywall) {
    return null;
  }

  const featureGroups = [
    { label: "Free", items: summary.features.free },
    { label: "Pro", items: summary.features.pro },
    { label: "Elite", items: summary.features.elite }
  ];

  return (
    <section
      aria-label="Shop owner plan access"
      data-testid="shop-owner-plan-access-card"
      className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(7,7,7,0.98))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">Shop owner plan access</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-white" data-display="true">
            {summary.currentPlanLabel} shop access
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Free shop profile, hours, chairs, first invite, More/settings, support, and compliance stay open. Pro and Elite shop tools unlock only from server entitlement proof.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={badgeTone(summary.statusTone)}>{summary.statusLabel}</StatusBadge>
          <StatusBadge tone="neutral">{summary.serverEvidenceLabel}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
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
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Coming soon</p>
          <p className="mt-2 text-sm font-semibold text-white">{summary.comingSoonCount} item{summary.comingSoonCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {showFeatureGroups ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {featureGroups.map((group) => (
            <div key={group.label} className="rounded-[22px] border border-white/8 bg-black/18 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/46">{group.label}</p>
              <div className="mt-3 space-y-2">
                {group.items.map((feature) => <FeatureCard key={feature.id} feature={feature} />)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={compact ? "mt-4 flex flex-wrap gap-3" : "mt-5 flex flex-wrap gap-3"}>
        <PlanAction summary={summary} />
        <Link
          href={summary.fallbackHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-5 text-xs font-black uppercase tracking-[0.14em] text-white/68 transition hover:border-[#C4F24E]/28 hover:text-[#C4F24E]"
        >
          {summary.fallbackActionLabel}
        </Link>
      </div>
    </section>
  );
}

export function ShopOwnerLockedFeatureOverlay({
  feature,
  children
}: {
  feature: ShopOwnerPaywallFeatureView;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={`${feature.title} locked state`}
      data-testid="shop-owner-locked-feature-overlay"
      className="rounded-[28px] border border-white/10 bg-black/35 p-4 sm:p-5"
    >
      {children ? <div className="opacity-50 blur-[0.5px]">{children}</div> : null}
      <div className="mt-4 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(4,4,4,0.98))] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#C4F24E]">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Locked shop tool</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/58">{feature.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone={featureTone(feature.state)}>{feature.stateLabel}</StatusBadge>
              <StatusBadge tone="neutral">Required: {feature.requiredPlanLabel}</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/54">{feature.reason}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ShopOwnerUpgradePrompt({
  summary,
  feature
}: {
  summary: ShopOwnerPaywallSummary;
  feature?: ShopOwnerPaywallFeatureView;
}) {
  return (
    <section data-testid="shop-owner-upgrade-prompt" className="space-y-4">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#C4F24E]">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Plan access</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
              {feature ? feature.title : `${summary.currentPlanLabel} shop access`}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/58">
              {feature?.reason ?? "Start with your shop profile, hours, chairs, and first barber. Paid shop tools unlock only after server entitlement proof is connected."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.guardrails.map((guardrail) => (
          <div key={guardrail.title} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-sm font-black text-white">{guardrail.title}</p>
            <p className="mt-2 text-sm leading-6 text-white/54">{guardrail.description}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <PlanAction summary={summary} />
        <Link
          href={summary.fallbackHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-5 text-xs font-black uppercase tracking-[0.14em] text-white/68 transition hover:border-[#C4F24E]/28 hover:text-[#C4F24E]"
        >
          {summary.fallbackActionLabel}
        </Link>
      </div>
    </section>
  );
}
