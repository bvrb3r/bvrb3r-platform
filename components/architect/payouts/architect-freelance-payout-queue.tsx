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
  useReleaseFreelancePayoutBatchMutation,
  useReleaseFreelancePayoutMutation,
  useValidateFreelancePayoutMutation
} from "@/lib/fintech/client";
import type {
  ArchitectStripePlatformDiagnosticsPayload,
  FreelancePayoutBatchReleaseResult,
  FreelancePayoutQueueItem,
  FreelancePayoutReleaseResult,
  StripePlatformBalanceView
} from "@/lib/fintech/service";
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

function moneyValue(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatBalanceList(balances: StripePlatformBalanceView[]) {
  if (!balances.length) {
    return "$0.00";
  }

  return balances
    .map((balance) => `${payoutCurrency(balance.amount)} ${balance.currency.toUpperCase()}`)
    .join(" / ");
}

function availableUsdBalance(diagnostics?: ArchitectStripePlatformDiagnosticsPayload | null) {
  return diagnostics?.availableBalances.find((balance) => balance.currency.toLowerCase() === "usd")?.amount ?? 0;
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

function formatBatchReleaseFeedback(result: {
  releasedCount: number;
  failedCount: number;
  skippedCount: number;
  totalReleasedAmount: number;
  availableAmount?: number | null;
  requiredAmount?: number;
  errorCode?: string;
  errorMessage?: string;
  message: string;
}) {
  if (result.errorCode === "insufficient_platform_balance") {
    return [
      result.errorMessage ?? "Release blocked: Stripe platform available balance is below required payout total.",
      `Required: ${payoutCurrency(moneyValue(result.requiredAmount))}`,
      `Available: ${payoutCurrency(moneyValue(result.availableAmount))}`
    ].join(" ");
  }
  if (result.failedCount > 0) {
    return `Released ${result.releasedCount} payouts. ${result.failedCount} failed.`;
  }
  if (result.skippedCount > 0 && result.releasedCount === 0) {
    return result.message;
  }
  return `Released ${result.releasedCount} ${result.releasedCount === 1 ? "payout" : "payouts"} totaling ${payoutCurrency(result.totalReleasedAmount)}.`;
}

function formatBatchFailureSource(row: FreelancePayoutBatchReleaseResult["results"][number]) {
  if (row.appointmentId) {
    return `appointment ${row.appointmentId}`;
  }
  if (row.posSaleId) {
    return `POS sale ${row.posSaleId}`;
  }
  return `routing ${row.routingRecordId}`;
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
    <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.26))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.22)]">
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

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:min-w-[20rem]">
          {[
            ["Gross", payoutCurrency(item.providerGrossAmount)],
            ["BVRB3R fee", payoutCurrency(item.platformFeeAmount)],
            ["Barber payout", payoutCurrency(item.barberPayoutAmount)],
            ["Shop split", payoutCurrency(item.shopSplitAmount)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[20px] border border-white/8 bg-black/28 p-3">
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

function BatchReleaseConfirmation({
  count,
  total,
  availableBalance,
  isProcessing,
  onCancel,
  onConfirm
}: {
  count: number;
  total: number;
  availableBalance: number;
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="batch-release-title">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#050505] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="surface-label">Batch release</p>
            <h3 id="batch-release-title" className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">
              Release all ready payouts?
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/58">
              Release {count} {count === 1 ? "payout" : "payouts"} totaling {payoutCurrency(total)}?
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isProcessing}>
            Close
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-white/8 bg-black/36 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">Stripe available</p>
            <p className="mt-2 text-xl font-black text-white">{payoutCurrency(availableBalance)}</p>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-black/36 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">Required total</p>
            <p className="mt-2 text-xl font-black text-white">{payoutCurrency(total)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-amber-300/14 bg-amber-300/8 p-4 text-xs leading-6 text-amber-50/76">
          This sends transfers to barber connected payout accounts.
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Release all ready payouts
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ArchitectFreelancePayoutQueue() {
  const queueQuery = useArchitectFreelancePayoutQueueQuery();
  const diagnosticsQuery = useArchitectStripePlatformDiagnosticsQuery();
  const validateMutation = useValidateFreelancePayoutMutation();
  const approveReadinessMutation = useApproveFreelancePayoutReadinessMutation();
  const releaseMutation = useReleaseFreelancePayoutMutation();
  const batchReleaseMutation = useReleaseFreelancePayoutBatchMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [batchFailedRows, setBatchFailedRows] = useState<FreelancePayoutBatchReleaseResult["results"]>([]);
  const [activeRoutingId, setActiveRoutingId] = useState<string | null>(null);
  const [showBatchConfirmation, setShowBatchConfirmation] = useState(false);
  const payload = queueQuery.data;
  const batchCandidates = payload?.items.filter((item) =>
    item.canRelease
    && item.payoutReadinessStatus === "ready"
    && item.moneyRoutingStatus === "pending"
    && !item.releasedAt
    && item.shopSplitAmount === 0
    && item.barberPayoutAmount > 0
  ) ?? [];
  const batchCount = batchCandidates.length;
  const batchTotal = batchCandidates.reduce((sum, item) => sum + moneyValue(item.barberPayoutAmount), 0);
  const batchAvailableBalance = availableUsdBalance(diagnosticsQuery.data);
  const batchBalanceReady = batchAvailableBalance >= batchTotal;
  const showBatchButton = Boolean(payload?.summary.readyCount && batchCount > 0);
  const batchBlockedByBalance = showBatchButton && !diagnosticsQuery.isLoading && !diagnosticsQuery.isError && !batchBalanceReady;
  const batchButtonDisabled = batchReleaseMutation.isPending || batchBlockedByBalance || diagnosticsQuery.isLoading || diagnosticsQuery.isError;

  async function handleValidate(item: FreelancePayoutQueueItem) {
    setFeedback(null);
    setBatchFailedRows([]);
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
    setBatchFailedRows([]);
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
    setBatchFailedRows([]);
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

  async function handleBatchRelease() {
    if (batchButtonDisabled) {
      return;
    }

    setFeedback(null);
    setBatchFailedRows([]);
    try {
      const result = await batchReleaseMutation.mutateAsync({ scope: "freelance", mode: "ready_only" });
      setShowBatchConfirmation(false);
      setBatchFailedRows(result.results.filter((row) => row.status === "failed"));
      setFeedback({
        tone: result.failedCount > 0 || result.ok === false ? "error" : "success",
        message: formatBatchReleaseFeedback(result)
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  return (
    <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(5,5,5,0.96))] p-6" data-testid="architect-freelance-payout-queue">
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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Ready", String(payload?.summary.readyCount ?? 0), payoutCurrency(payload?.summary.readyAmount ?? 0)],
          ["Blocked", String(payload?.summary.blockedCount ?? 0), "Needs review"],
          ["Released", String(payload?.summary.releasedCount ?? 0), "Already paid out"],
          ["Scope", "Freelance", "Commission and booth rent release stay locked"]
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-[22px] border border-white/8 bg-black/28 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
            <p className="mt-3 text-2xl font-black text-white">{value}</p>
            <p className="mt-2 text-xs leading-5 text-white/50">{detail}</p>
          </div>
        ))}
      </div>

      <StripePlatformDiagnosticsCard />

      {showBatchButton ? (
        <div className={cn(
          "mt-5 rounded-[24px] border p-4",
          batchBlockedByBalance
            ? "border-amber-300/16 bg-amber-300/8"
            : "border-[#7CFF00]/14 bg-[#7CFF00]/8"
        )}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn(
                "text-[10px] font-extrabold uppercase tracking-[0.16em]",
                batchBlockedByBalance ? "text-amber-100/70" : "text-[#d7ffab]/70"
              )}>
                Batch ready release
              </p>
              <p className="mt-2 text-sm leading-6 text-white/64">
                Release {batchCount} {batchCount === 1 ? "ready payout" : "ready payouts"} totaling {payoutCurrency(batchTotal)}.
              </p>
              {batchBlockedByBalance ? (
                <div className="mt-3 rounded-[18px] border border-amber-300/14 bg-black/24 p-3 text-xs leading-5 text-amber-50/82">
                  <p className="font-bold">Release blocked: Stripe platform available balance is below required payout total.</p>
                  <p className="mt-2">Required: {payoutCurrency(batchTotal)}</p>
                  <p>Available: {payoutCurrency(batchAvailableBalance)}</p>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant={batchBlockedByBalance ? "secondary" : "primary"}
              className={cn(
                "min-w-[14rem]",
                batchBlockedByBalance ? "border-white/10 bg-white/[0.035] text-white/54 shadow-none hover:translate-y-0 hover:border-white/10 hover:bg-white/[0.035] hover:text-white/54" : null
              )}
              disabled={batchButtonDisabled}
              title={!batchBalanceReady ? "Stripe platform available balance is below the ready payout total." : undefined}
              onClick={() => {
                if (!batchButtonDisabled) {
                  setShowBatchConfirmation(true);
                }
              }}
            >
              {batchReleaseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {batchBlockedByBalance ? "Insufficient Stripe balance" : "Release all ready payouts"}
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? <FeedbackBanner className="mt-5" tone={feedback.tone} message={feedback.message} /> : null}
      {batchFailedRows.length ? (
        <div className="mt-5 rounded-[22px] border border-rose-300/14 bg-rose-300/8 p-4" data-testid="batch-payout-failures">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-rose-100/62">
            {batchFailedRows.length} {batchFailedRows.length === 1 ? "payout" : "payouts"} failed
          </p>
          <div className="mt-3 space-y-2">
            {batchFailedRows.map((row) => (
              <div key={row.routingRecordId} className="rounded-[16px] border border-white/8 bg-black/24 p-3 text-xs leading-5 text-rose-50/82">
                <p className="font-bold text-white">
                  {payoutCurrency(row.amount)} {formatBatchFailureSource(row)}
                </p>
                <p className="mt-1">
                  {row.reason ?? row.errorCode ?? "No failure reason returned."}
                </p>
                {row.errorCode || row.failedStep ? (
                  <p className="mt-1 text-rose-50/62">
                    {[row.failedStep ? `Step: ${row.failedStep}` : null, row.errorCode ? `Code: ${row.errorCode}` : null].filter(Boolean).join(" | ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
          <div className="rounded-[26px] border border-dashed border-[#7CFF00]/16 bg-[#7CFF00]/8 p-5 text-sm leading-7 text-white/62">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#baff69]" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">No freelance payout releases are waiting right now.</p>
                <p className="mt-1 text-sm leading-6 text-white/56">
                  Released payouts stay auditable. New ready freelance rows will appear here after routing clears.
                </p>
              </div>
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
      {showBatchConfirmation ? (
        <BatchReleaseConfirmation
          count={batchCount}
          total={batchTotal}
          availableBalance={batchAvailableBalance}
          isProcessing={batchReleaseMutation.isPending}
          onCancel={() => setShowBatchConfirmation(false)}
          onConfirm={() => void handleBatchRelease()}
        />
      ) : null}
    </Card>
  );
}
