"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import {
  useApproveFreelancePayoutReadinessMutation,
  useArchitectFreelancePayoutQueueQuery,
  useArchitectStripePlatformDiagnosticsQuery,
  useReleaseFreelancePayoutMutation,
  useValidateFreelancePayoutMutation
} from "@/lib/fintech/client";
import type { ArchitectStripePlatformDiagnosticsPayload, FreelancePayoutQueueItem, FreelancePayoutReleaseResult, StripePlatformBalanceView } from "@/lib/fintech/service";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

const payoutCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function payoutCurrency(value: number) {
  return payoutCurrencyFormatter.format(value);
}

function formatBalanceList(balances: StripePlatformBalanceView[]) {
  if (!balances.length) {
    return "$0.00";
  }

  return balances
    .map((balance) => `${payoutCurrency(balance.amount)} ${balance.currency.toUpperCase()}`)
    .join(" / ");
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function statusPillClasses(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "pending" || normalized === "ready_for_payout" || normalized === "ready" || normalized === "eligible") {
    return "border-[#7CFF00]/20 bg-[#7CFF00]/10 text-[#d7ffab]";
  }
  if (normalized === "paid_out" || normalized === "executed") {
    return "border-sky-300/20 bg-sky-300/10 text-sky-100";
  }
  if (normalized === "blocked" || normalized === "manual_review" || normalized === "failed") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-black/20 text-white/62";
}

function formatStatus(value?: string | null) {
  return String(value ?? "not_set").replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function stripeRequirementCopy(item: FreelancePayoutQueueItem) {
  const readiness = item.stripePayoutReadiness;
  if (!readiness || readiness.canReceivePayouts) {
    return null;
  }

  const due = [...readiness.pastDue, ...readiness.currentlyDue];
  return {
    message: readiness.displayMessage,
    due
  };
}

function formatReleaseFeedback(result: FreelancePayoutReleaseResult) {
  const baseMessage = result.errorMessage ?? result.message;
  if (result.failedStep !== "create_payout_execution" || !result.debugSafeDetails) {
    return baseMessage;
  }

  const details = result.debugSafeDetails;
  const debugParts = [
    details.supabaseCode ? `Supabase code: ${details.supabaseCode}` : null,
    details.supabaseMessage ? `Supabase message: ${details.supabaseMessage}` : null,
    `Idempotency key: ${details.attemptedIdempotencyKey}`,
    `Attempt count: ${details.attemptedAttemptCount}`
  ].filter(Boolean);

  return debugParts.length ? `${baseMessage} ${debugParts.join(" | ")}` : baseMessage;
}

function StripePlatformDiagnosticsCard() {
  const diagnosticsQuery = useArchitectStripePlatformDiagnosticsQuery();
  const diagnostics = diagnosticsQuery.data;

  return (
    <div className="mt-5 rounded-[24px] border border-white/8 bg-black/24 p-4" data-testid="architect-stripe-platform-diagnostics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">
            Stripe platform used by app
          </p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            This reads the same server Stripe key used for payout release.
          </p>
        </div>
        <span className={cn(
          "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
          diagnostics?.mismatchWarning
            ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
            : "border-[#7CFF00]/20 bg-[#7CFF00]/10 text-[#d7ffab]"
        )}>
          {diagnostics?.stripeKeyMode ?? "checking"}
        </span>
      </div>

      {diagnosticsQuery.isLoading ? (
        <div className="mt-4 rounded-[18px] border border-white/8 bg-black/24 p-3 text-xs font-bold text-white/58">
          Checking Stripe platform account...
        </div>
      ) : diagnosticsQuery.isError ? (
        <FeedbackBanner
          className="mt-4"
          tone="error"
          message={getReadableActionError(diagnosticsQuery.error as { message?: string; status?: number; code?: string })}
        />
      ) : diagnostics ? (
        <StripePlatformDiagnosticsSummary diagnostics={diagnostics} />
      ) : null}
    </div>
  );
}

function StripePlatformDiagnosticsSummary({ diagnostics }: { diagnostics: ArchitectStripePlatformDiagnosticsPayload }) {
  return (
    <div className="mt-4 space-y-3">
      {diagnostics.mismatchWarning ? (
        <FeedbackBanner className="border-rose-300/18 bg-rose-300/10" tone="error" message={diagnostics.mismatchWarning} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Account", diagnostics.platformAccountId ?? "Unknown"],
          ["Available balance", formatBalanceList(diagnostics.availableBalances)],
          ["Pending balance", formatBalanceList(diagnostics.pendingBalances)],
          ["Last checked", formatDateTime(diagnostics.checkedAt)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
            <p className="mt-2 break-words text-sm font-black text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          `Mode: ${diagnostics.stripeKeyMode}`,
          `Country: ${diagnostics.country ?? "unknown"}`,
          `Currency: ${diagnostics.defaultCurrency?.toUpperCase() ?? "unknown"}`,
          `Charges: ${diagnostics.chargesEnabled ? "enabled" : "not enabled"}`,
          `Payouts: ${diagnostics.payoutsEnabled ? "enabled" : "not enabled"}`
        ].map((detail) => (
          <span key={detail} className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/52">
            {detail}
          </span>
        ))}
      </div>
      {diagnostics.expectedPlatformAccountId ? (
        <p className="text-xs leading-5 text-white/52">
          Expected account: {diagnostics.expectedPlatformAccountId}
        </p>
      ) : null}
      {diagnostics.dashboardDisplayName ? (
        <p className="text-xs leading-5 text-white/52">
          Dashboard label: {diagnostics.dashboardDisplayName}
        </p>
      ) : null}
    </div>
  );
}

function QueueRow({
  item,
  activeRoutingId,
  onValidate,
  onApprovePayoutSetup,
  onRelease
}: {
  item: FreelancePayoutQueueItem;
  activeRoutingId: string | null;
  onValidate: (item: FreelancePayoutQueueItem) => void;
  onApprovePayoutSetup: (item: FreelancePayoutQueueItem) => void;
  onRelease: (item: FreelancePayoutQueueItem) => void;
}) {
  const isBusy = activeRoutingId === item.routingRecordId;
  const releaseDisabled = isBusy || !item.canRelease;
  const reason = item.releaseBlockedReason ?? item.ineligibleReasons[0] ?? null;
  const stripeRequirement = stripeRequirementCopy(item);
  const releaseLabel = isBusy ? "Processing" : item.releaseActionLabel ?? (item.canRelease ? "Release payout" : "Payout blocked");
  const lastReleaseFailure = item.lastReleaseFailureMessage ?? item.lastFailedExecutionReason ?? null;

  return (
    <div className="rounded-[24px] border border-white/8 bg-black/24 p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-black text-white">{item.barberName ?? "Freelance barber"}</p>
            <span className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/52">
              {item.sourceLabel}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/52">
            Routing {item.routingRecordId} | Eligible {formatDateTime(item.eligibleAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]", statusPillClasses(item.payoutReadinessStatus))}>
              {formatStatus(item.payoutReadinessStatus)}
            </span>
            <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]", statusPillClasses(item.moneyRoutingStatus))}>
              {formatStatus(item.moneyRoutingStatus)}
            </span>
            {item.existingExecutionStatus ? (
              <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]", statusPillClasses(item.existingExecutionStatus))}>
                Execution {formatStatus(item.existingExecutionStatus)}
              </span>
            ) : null}
          </div>
          {reason ? (
            <p className="mt-3 text-xs leading-5 text-amber-100/80">
              {reason}
            </p>
          ) : null}
          {item.warnings.length ? (
            <div className="mt-3 space-y-1">
              {item.warnings.map((warning) => (
                <p key={warning} className="text-xs leading-5 text-amber-100/72">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
          {stripeRequirement ? (
            <div className="mt-3 rounded-[18px] border border-amber-300/14 bg-amber-300/8 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-100/62">
                Stripe payout setup incomplete
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-50/80">{stripeRequirement.message}</p>
              {stripeRequirement.due.length ? (
                <p className="mt-2 text-xs leading-5 text-amber-50/70">
                  Missing: {stripeRequirement.due.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {lastReleaseFailure ? (
            <div className="mt-3 rounded-[18px] border border-rose-300/14 bg-rose-300/8 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-rose-100/62">
                Last release attempt failed
              </p>
              <p className="mt-2 text-xs leading-5 text-rose-50/80">{lastReleaseFailure}</p>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-[18rem] gap-3 sm:grid-cols-2 lg:min-w-[20rem]">
          {[
            ["Gross", payoutCurrency(item.providerGrossAmount)],
            ["BVRB3R fee", payoutCurrency(item.platformFeeAmount)],
            ["Barber payout", payoutCurrency(item.barberPayoutAmount)],
            ["Shop split", payoutCurrency(item.shopSplitAmount)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[18px] border border-white/8 bg-black/24 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
              <p className="mt-2 text-sm font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="min-w-[9rem]" disabled={isBusy || item.canValidate === false} onClick={() => onValidate(item)}>
          Validate
        </Button>
        {item.canApprovePayoutSetup ? (
          <Button type="button" className="min-w-[12rem]" disabled={isBusy} onClick={() => onApprovePayoutSetup(item)}>
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Approve payout setup
          </Button>
        ) : null}
        <Button
          type="button"
          variant={item.canRelease ? "primary" : "secondary"}
          className={cn(
            "min-w-[10rem]",
            !item.canRelease ? "border-amber-300/16 bg-amber-300/8 text-amber-50/72 shadow-none hover:translate-y-0 hover:border-amber-300/16 hover:bg-amber-300/8 hover:text-amber-50/72" : null
          )}
          disabled={releaseDisabled}
          aria-disabled={releaseDisabled}
          title={releaseDisabled && reason ? reason : undefined}
          onClick={() => {
            if (item.canRelease) {
              onRelease(item);
            }
          }}
        >
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {releaseLabel}
        </Button>
      </div>
    </div>
  );
}

export function ArchitectFreelancePayoutQueue() {
  const queueQuery = useArchitectFreelancePayoutQueueQuery();
  const validateMutation = useValidateFreelancePayoutMutation();
  const approveReadinessMutation = useApproveFreelancePayoutReadinessMutation();
  const releaseMutation = useReleaseFreelancePayoutMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [activeRoutingId, setActiveRoutingId] = useState<string | null>(null);
  const payload = queueQuery.data;

  async function handleValidate(item: FreelancePayoutQueueItem) {
    setFeedback(null);
    setActiveRoutingId(item.routingRecordId);
    try {
      const result = await validateMutation.mutateAsync({ routingRecordId: item.routingRecordId });
      setFeedback({
        tone: result.eligible ? "success" : "info",
          message: result.eligible
          ? `${payoutCurrency(result.releaseAmount)} is ready for freelance release.`
          : result.reasons[0] ?? "This payout is not eligible for release yet."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    } finally {
      setActiveRoutingId(null);
    }
  }

  async function handleRelease(item: FreelancePayoutQueueItem) {
    if (!item.canRelease) {
      setFeedback({
        tone: "info",
        message: item.releaseBlockedReason ?? item.ineligibleReasons[0] ?? "This payout cannot be released yet."
      });
      return;
    }

    setFeedback(null);
    setActiveRoutingId(item.routingRecordId);
    try {
      const result = await releaseMutation.mutateAsync({ routingRecordId: item.routingRecordId });
      setFeedback({
        tone: result.ok ? "success" : "error",
        message: formatReleaseFeedback(result)
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    } finally {
      setActiveRoutingId(null);
    }
  }

  async function handleApprovePayoutSetup(item: FreelancePayoutQueueItem) {
    setFeedback(null);
    setActiveRoutingId(item.routingRecordId);
    try {
      const result = await approveReadinessMutation.mutateAsync({ routingRecordId: item.routingRecordId });
      setFeedback({
        tone: result.ok ? "success" : "error",
        message: result.message
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    } finally {
      setActiveRoutingId(null);
    }
  }

  return (
    <Card className="rounded-[32px] p-6" data-testid="architect-freelance-payout-queue">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="surface-label">Freelance payout release</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Manual Phase 1 release queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
            Only freelance barber payouts with ready routing, no shop split, and a live Stripe Connect account can move here.
          </p>
        </div>
        <WalletCards className="h-5 w-5 text-[#baff69]" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Ready", String(payload?.summary.readyCount ?? 0), payoutCurrency(payload?.summary.readyAmount ?? 0)],
          ["Blocked", String(payload?.summary.blockedCount ?? 0), "Needs review"],
          ["Released", String(payload?.summary.releasedCount ?? 0), "Already paid out"],
          ["Scope", "Freelance", "Commission and booth rent release stay locked"]
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
            <p className="mt-3 text-2xl font-black text-white">{value}</p>
            <p className="mt-2 text-xs leading-5 text-white/50">{detail}</p>
          </div>
        ))}
      </div>

      <StripePlatformDiagnosticsCard />

      {feedback ? <FeedbackBanner className="mt-5" tone={feedback.tone} message={feedback.message} /> : null}
      {payload?.warnings?.length ? payload.warnings.map((warning) => (
        <FeedbackBanner
          key={warning}
          className="mt-5"
          tone="info"
          message={warning}
        />
      )) : null}
      {queueQuery.isError ? (
        <FeedbackBanner
          className="mt-5"
          tone="error"
          message={getReadableActionError(queueQuery.error as { message?: string; status?: number; code?: string })}
        />
      ) : null}

      <div className="mt-5 space-y-3">
        {queueQuery.isLoading ? (
          <div className="rounded-[22px] border border-white/8 bg-black/24 p-5 text-sm font-bold text-white/58">
            Loading freelance payout queue...
          </div>
        ) : payload?.items.length ? payload.items.map((item) => (
          <QueueRow
            key={item.routingRecordId}
            item={item}
            activeRoutingId={activeRoutingId}
            onValidate={(next) => void handleValidate(next)}
            onApprovePayoutSetup={(next) => void handleApprovePayoutSetup(next)}
            onRelease={(next) => void handleRelease(next)}
          />
        )) : (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-black/24 p-5 text-sm leading-7 text-white/58">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#baff69]" aria-hidden="true" />
              <span>No freelance payout releases are waiting right now.</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-[20px] border border-amber-300/14 bg-amber-300/8 p-4 text-xs leading-6 text-amber-50/76">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Phase 1 releases barber payouts only. Cash sales, commission splits, booth-rent invoices, and shop-owner payouts stay outside this manual action.
          </p>
        </div>
      </div>
    </Card>
  );
}
