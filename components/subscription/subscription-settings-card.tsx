"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/design/components";
import { cn } from "@/lib/utils";
import type { SubscriptionSettingsSummary, SubscriptionSettingsTone } from "@/lib/entitlements/subscription-settings";

function badgeTone(tone: SubscriptionSettingsTone) {
  if (tone === "green") return "green" as const;
  if (tone === "red") return "danger" as const;
  return "neutral" as const;
}

function ActionControl({ action }: { action: SubscriptionSettingsSummary["upgradeAction"] }) {
  const classes = "inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-xs font-black uppercase tracking-[0.14em] transition";
  if (action.state === "available" && action.href) {
    return (
      <Link href={action.href as never} className={cn(classes, "border-[#C4F24E]/28 bg-[#C4F24E]/10 text-[#C4F24E] hover:border-[#C4F24E]/46 hover:bg-[#C4F24E]/15")}>
        {action.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={action.unavailableReason ?? undefined}
      className={cn(classes, "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/42")}
    >
      {action.unavailableReason ?? action.label}
    </button>
  );
}

export function SubscriptionSettingsCard({
  summary,
  compact = false
}: {
  summary: SubscriptionSettingsSummary;
  compact?: boolean;
}) {
  const [current, setCurrent] = useState(summary);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshState("loading");
    setMessage(null);
    try {
      const response = await fetch(current.refreshEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_entitlement" })
      });
      const body = (await response.json().catch(() => ({}))) as { subscription?: SubscriptionSettingsSummary; error?: string };
      if (!response.ok || !body.subscription) {
        throw new Error(body.error ?? "Unable to refresh plan status.");
      }
      setCurrent(body.subscription);
      setRefreshState("success");
      setMessage("Plan status refreshed from server truth.");
    } catch (error) {
      setRefreshState("error");
      setMessage(error instanceof Error ? error.message : "Unable to refresh plan status.");
    }
  }

  return (
    <section
      aria-label={`${current.roleLabel} subscription settings`}
      data-testid={`subscription-settings-card-${current.role}`}
      className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.98))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">Subscription settings</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-white" data-display="true">
            {current.currentTierLabel} {current.roleLabel} plan
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            {current.roleCopy}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={badgeTone(current.accessTone)}>{current.accessStateLabel}</StatusBadge>
          <StatusBadge tone="neutral">{current.evidenceLabel}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Role</p>
          <p className="mt-2 text-sm font-semibold text-white">{current.roleLabel}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Current tier</p>
          <p className="mt-2 text-sm font-semibold text-white">{current.currentTierLabel}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Access state</p>
          <p className="mt-2 text-sm font-semibold text-white">{current.accessStateLabel}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Billing</p>
          <p className="mt-2 text-sm font-semibold text-white">{current.billingLabel}</p>
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[20px] border border-[#C4F24E]/16 bg-[#C4F24E]/[0.06] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#C4F24E]" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-white">Included now</p>
                <p className="mt-2 text-sm leading-6 text-white/58">{current.includedCopy}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.035] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-white/58" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-white">Locked safely</p>
                <p className="mt-2 text-sm leading-6 text-white/58">{current.lockedCopy}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.035] p-4">
            <p className="text-sm font-black text-white">Refresh source</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{current.supportCopy}</p>
            <p className="mt-2 text-xs leading-5 text-white/42">{current.updatedAtLabel}</p>
          </div>
        </div>
      ) : null}

      {current.reviewReasons.length ? (
        <div className="mt-4 rounded-[20px] border border-amber-300/20 bg-amber-300/10 p-4" data-testid="subscription-settings-review-reasons">
          <p className="text-sm font-black text-amber-100">Needs Review</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-100/78">
            {current.reviewReasons.map((reason) => (
              <li key={reason}>- {reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionControl action={current.upgradeAction} />
        <ActionControl action={current.manageAction} />
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshState === "loading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-5 text-xs font-black uppercase tracking-[0.14em] text-white/68 transition hover:border-[#C4F24E]/28 hover:text-[#C4F24E] disabled:cursor-not-allowed disabled:text-white/36"
        >
          <RefreshCw className={cn("h-4 w-4", refreshState === "loading" && "animate-spin")} aria-hidden="true" />
          {refreshState === "loading" ? "Refreshing..." : "Refresh plan status"}
        </button>
      </div>

      {message ? (
        <p
          className={cn(
            "mt-3 rounded-[16px] border px-4 py-3 text-sm font-semibold",
            refreshState === "success" && "border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#e4f9b8]",
            refreshState === "error" && "border-red-400/22 bg-red-500/10 text-red-100"
          )}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
