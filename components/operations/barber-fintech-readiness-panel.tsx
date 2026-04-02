"use client";

import { useState } from "react";
import { BadgeDollarSign, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBarberPayoutsQuery,
  useBarberFintechReadinessQuery,
  useCreateStripeDashboardLinkMutation,
  useCreateStripeOnboardingLinkMutation,
  useRefreshStripeConnectedAccountMutation,
  useRecordLegalAcceptanceMutation,
  type FintechApiError
} from "@/lib/fintech/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency } from "@/lib/utils";

function labelAgreement(agreementType: string) {
  switch (agreementType) {
    case "platform_terms":
      return "Platform terms";
    case "barber_agreement":
      return "Barber agreement";
    case "shop_agreement":
      return "Shop agreement";
    case "payout_tax_acknowledgment":
      return "Payout tax acknowledgment";
    default:
      return agreementType.replaceAll("_", " ");
  }
}

export function BarberFintechReadinessPanel() {
  const readinessQuery = useBarberFintechReadinessQuery();
  const payoutsQuery = useBarberPayoutsQuery();
  const recordAcceptanceMutation = useRecordLegalAcceptanceMutation();
  const onboardingMutation = useCreateStripeOnboardingLinkMutation();
  const dashboardMutation = useCreateStripeDashboardLinkMutation();
  const refreshMutation = useRefreshStripeConnectedAccountMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const payload = readinessQuery.data;
  const payoutsPayload = payoutsQuery.data;
  const recentPayoutExecutions = payoutsPayload?.recentExecutions ?? [];
  const account = payload?.connectedAccount;
  const errorMessage = readinessQuery.error ? getReadableActionError(readinessQuery.error as FintechApiError) : null;
  const payoutErrorMessage = payoutsQuery.error ? getReadableActionError(payoutsQuery.error as FintechApiError) : null;
  const missingAgreements = account?.missingAgreements ?? [];
  const operationalStatusLabel = account?.operationalStatus.replaceAll("_", " ") ?? "loading";
  const showOnboardingAction = Boolean(account && account.operationalStatus !== "payout_ready");

  async function navigateToStripeUrl(loadUrl: () => Promise<string>, successMessage: string) {
    setFeedback(null);
    try {
      const url = await loadUrl();
      setFeedback({ tone: "success", message: successMessage });
      window.location.assign(url);
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleAcceptance(agreementType: "platform_terms" | "barber_agreement" | "payout_tax_acknowledgment") {
    setFeedback(null);
    try {
      await recordAcceptanceMutation.mutateAsync({ agreementType });
      setFeedback({ tone: "success", message: `${labelAgreement(agreementType)} recorded and synced into payout readiness.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleRefresh() {
    setFeedback(null);
    try {
      await refreshMutation.mutateAsync({});
      setFeedback({ tone: "success", message: "Stripe readiness refreshed from the connected account." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  return (
    <Card className="rounded-[32px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="surface-label">Payout readiness</p>
          <p className="mt-3 text-2xl font-semibold sm:text-3xl">Stay ahead of payout blockers.</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
            This panel keeps legal acceptance, connected-account posture, and blocked payout causes visible without
            re-labeling gross sales as final payout.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
            <ShieldCheck className="h-4 w-4" />
            {operationalStatusLabel}
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">
            {payload?.routingSummary.blockedPaymentsCount ?? 0} payout blockers
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        {payoutErrorMessage ? <FeedbackBanner tone="error" message={payoutErrorMessage} /> : null}
      </div>

      {readinessQuery.isLoading && !payload ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-10 w-40" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-28 w-full" />
          </div>
        </div>
      ) : payload && account ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Connected account</p>
                  <p className="mt-2 text-lg font-semibold">{account.provider === "stripe_connect" ? "Stripe Connect ready model" : "Manual fallback routing"}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-white/42">
                    {account.operationalStatus.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="status-pill text-[#d7ffab]">{account.onboardingStatus.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Legal</p>
                  <p className="mt-2 text-base font-semibold">{account.legalReadinessStatus.replaceAll("_", " ")}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Tax</p>
                  <p className="mt-2 text-base font-semibold">{account.taxReadinessStatus.replaceAll("_", " ")}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Payout</p>
                  <p className="mt-2 text-base font-semibold">{account.payoutReadinessStatus.replaceAll("_", " ")}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/58">
                {account.missingSteps.length ? account.missingSteps.map((step) => (
                  <p key={step}>- {step}</p>
                )) : (
                  <p>No payout blockers are currently stored for this barber.</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {showOnboardingAction ? (
                    <Button
                      variant="primary"
                      disabled={onboardingMutation.isPending}
                      onClick={() => navigateToStripeUrl(
                        async () => (await onboardingMutation.mutateAsync({})).url,
                        account.providerAccountId ? "Stripe onboarding link refreshed." : "Stripe onboarding started."
                      )}
                    >
                    {account.providerAccountId ? "Resume Stripe onboarding" : "Start Stripe onboarding"}
                  </Button>
                ) : null}
                {account.providerAccountId ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={dashboardMutation.isPending}
                      onClick={() => navigateToStripeUrl(
                        async () => (await dashboardMutation.mutateAsync({})).url,
                        "Opening the Stripe Express dashboard."
                      )}
                    >
                      Open Stripe dashboard
                    </Button>
                    <Button variant="ghost" disabled={refreshMutation.isPending} onClick={handleRefresh}>
                      Refresh Stripe status
                    </Button>
                  </>
                ) : null}
              </div>
              {account.processorLastSyncedAt ? (
                <p className="mt-3 text-xs text-white/45">
                  Last synced {new Date(account.processorLastSyncedAt).toLocaleString()}
                  {account.processorLastEventType ? ` from ${account.processorLastEventType}` : ""}
                </p>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Legal actions</p>
                  <p className="mt-2 text-sm text-white/58">Record current agreement versions directly into the acceptance ledger.</p>
                </div>
                <BadgeDollarSign className="h-5 w-5 text-[#d7ffab]" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["platform_terms", "barber_agreement", "payout_tax_acknowledgment"] as const).map((agreementType) => {
                  const missing = missingAgreements.includes(agreementType);
                  return (
                    <Button
                      key={agreementType}
                      variant={missing ? "primary" : "secondary"}
                      disabled={recordAcceptanceMutation.isPending && missing}
                      onClick={() => handleAcceptance(agreementType)}
                    >
                      {missing ? `Accept ${labelAgreement(agreementType)}` : `${labelAgreement(agreementType)} on file`}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Routing snapshot</p>
                  <p className="mt-2 text-sm text-white/58">These numbers come from the payment routing ledger, not a payout estimate shortcut.</p>
                </div>
                <span className="status-pill text-[#d7ffab]">{currency(payload.routingSummary.readyForPayoutAmount)} ready</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Blocked payments</p>
                  <p className="mt-2 text-2xl font-semibold">{payload.routingSummary.blockedPaymentsCount}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Pending payments</p>
                  <p className="mt-2 text-2xl font-semibold">{payload.routingSummary.pendingPaymentsCount}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Ready for payout</p>
                  <p className="mt-2 text-2xl font-semibold">{currency(payload.routingSummary.readyForPayoutAmount)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/58">
                {payload.routingSummary.blockedReasons.length ? payload.routingSummary.blockedReasons.map((reason) => (
                  <p key={reason}>- {reason}</p>
                )) : (
                  <p>No blocked routing reasons are currently on file.</p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Payout execution</p>
                  <p className="mt-2 text-sm text-white/58">Watch what has actually transferred, what reversed after refunds, and what is still blocked before it becomes a payout promise.</p>
                </div>
                <span className="status-pill text-[#d7ffab]">{currency(payoutsPayload?.summary.executedAmount ?? 0)} executed</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Executable</p>
                  <p className="mt-2 text-2xl font-semibold">{payoutsPayload?.summary.executableRoutingRecords ?? 0}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Executed</p>
                  <p className="mt-2 text-2xl font-semibold">{payoutsPayload?.summary.executedTransferCount ?? 0}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Failed / blocked</p>
                  <p className="mt-2 text-2xl font-semibold">{(payoutsPayload?.summary.failedExecutionRecords ?? 0) + (payoutsPayload?.summary.blockedExecutionRecords ?? 0)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Reversed</p>
                  <p className="mt-2 text-2xl font-semibold">{payoutsPayload?.summary.reversedExecutionCount ?? 0}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {payoutsQuery.isLoading && !payoutsPayload ? (
                  <>
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </>
                ) : recentPayoutExecutions.length ? recentPayoutExecutions.map((execution) => (
                  <div key={execution.id} className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{execution.targetDisplayName ?? execution.shopLabel ?? "Payout execution"}</p>
                        <p className="mt-1 text-sm text-white/55">
                          {execution.executionType.replaceAll("_", " ")} | {execution.reconciliationStatus.replaceAll("_", " ")}
                        </p>
                      </div>
                      <span className="status-pill text-[#d7ffab]">{currency(execution.amount)}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/58">{execution.failureReason ?? execution.blockedReason ?? "Execution is synced to the canonical payout ledger."}</p>
                  </div>
                )) : (
                  <div className="empty-state-panel rounded-[20px] p-5 text-sm leading-7 text-white/58">
                    Payout executions will appear here once Stripe-backed routing begins moving funds or reversing them after refunds.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Shop assignments</p>
              <div className="mt-4 space-y-3">
                {payload.memberships.length ? payload.memberships.map((membership) => (
                  <div key={membership.id} className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{membership.shopLabel}</p>
                        <p className="mt-1 text-sm text-white/55">
                          {membership.routingModel.replaceAll("_", " ")}
                          {membership.commissionRate !== null ? ` | ${(membership.commissionRate * 100).toFixed(0)}% commission` : ""}
                          {membership.boothRentAmount !== null ? ` | ${currency(membership.boothRentAmount)} booth rent` : ""}
                        </p>
                      </div>
                      <span className="status-pill text-[#d7ffab]">
                        {membership.shopAccount?.payoutReadinessStatus.replaceAll("_", " ") ?? "shop pending"}
                      </span>
                    </div>
                    {membership.payoutBlockReason ? (
                      <p className="mt-3 text-sm text-white/58">{membership.payoutBlockReason}</p>
                    ) : null}
                  </div>
                )) : (
                  <div className="empty-state-panel rounded-[20px] p-5 text-sm leading-7 text-white/58">
                    Shop compensation assignments will appear here once the barber is attached to a payout-enabled location.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
