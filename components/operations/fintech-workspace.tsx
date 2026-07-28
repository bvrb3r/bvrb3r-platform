"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateStripeDashboardLinkMutation,
  useCreateStripeOnboardingLinkMutation,
  useExecuteFintechPayoutsMutation,
  useFintechManagementQuery,
  useFintechPayoutsQuery,
  useRefreshStripeConnectedAccountMutation,
  useRecordLegalAcceptanceMutation,
  useUpdateConnectedAccountStatusMutation,
  useUpdateMembershipCompensationMutation,
  type FintechApiError
} from "@/lib/fintech/client";
import type { FintechManagementPayload } from "@/lib/fintech/service";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Role } from "@/types/domain";

type FintechWorkspaceRole = Extract<Role, "owner" | "manager">;

type AccountFormState = {
  provider: "stripe_connect" | "manual";
  providerAccountId: string;
  onboardingStatus: "not_started" | "invited" | "pending" | "submitted" | "restricted" | "verified";
  taxReadinessStatus: "pending" | "submitted" | "verified";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string;
  requirementsEventuallyDue: string;
  requirementsPastDue: string;
  disabledReason: string;
};

type MembershipFormState = {
  routingModel: "freelance" | "booth_rent" | "autobooth_rent";
  autoBoothPercent: string;
  boothRentAmount: string;
  boothRentFrequency: "" | "weekly" | "monthly";
  payoutBlockReason: string;
};

function createAccountForm(account: FintechManagementPayload["shops"][number] | FintechManagementPayload["barbers"][number]): AccountFormState {
  return {
    provider: account.provider,
    providerAccountId: account.providerAccountId ?? "",
    onboardingStatus: account.onboardingStatus,
    taxReadinessStatus: account.taxReadinessStatus,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    requirementsCurrentlyDue: account.requirementsCurrentlyDue.join(", "),
    requirementsEventuallyDue: account.requirementsEventuallyDue.join(", "),
    requirementsPastDue: account.requirementsPastDue.join(", "),
    disabledReason: account.disabledReason ?? ""
  };
}

function createMembershipForm(membership: FintechManagementPayload["memberships"][number]): MembershipFormState {
  return {
    routingModel: membership.routingModel,
    autoBoothPercent: membership.autoBoothPercent === null ? "" : String(membership.autoBoothPercent),
    boothRentAmount: membership.boothRentAmount === null ? "" : String(membership.boothRentAmount),
    boothRentFrequency: membership.boothRentFrequency ?? "",
    payoutBlockReason: membership.payoutBlockReason ?? ""
  };
}

function labelAgreement(agreementType: string) {
  switch (agreementType) {
    case "platform_terms":
      return "Platform terms";
    case "shop_agreement":
      return "Shop agreement";
    case "payout_tax_acknowledgment":
      return "Payout tax acknowledgment";
    default:
      return agreementType.replaceAll("_", " ");
  }
}

function SummarySkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-28" />
    </div>
  );
}

export function FintechWorkspace({
  viewerRole,
  locationIds
}: {
  viewerRole: FintechWorkspaceRole;
  locationIds: string[];
}) {
  const fintechQuery = useFintechManagementQuery();
  const payoutsQuery = useFintechPayoutsQuery();
  const updateAccountMutation = useUpdateConnectedAccountStatusMutation();
  const updateMembershipMutation = useUpdateMembershipCompensationMutation();
  const recordLegalAcceptanceMutation = useRecordLegalAcceptanceMutation();
  const onboardingMutation = useCreateStripeOnboardingLinkMutation();
  const dashboardMutation = useCreateStripeDashboardLinkMutation();
  const refreshStripeMutation = useRefreshStripeConnectedAccountMutation();
  const executePayoutsMutation = useExecuteFintechPayoutsMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [accountForms, setAccountForms] = useState<Record<string, AccountFormState>>({});
  const [membershipForms, setMembershipForms] = useState<Record<string, MembershipFormState>>({});

  const payload = fintechQuery.data;
  const payoutsPayload = payoutsQuery.data;
  const readyPayoutRouting = payoutsPayload?.readyRouting ?? [];
  const recentPayoutExecutions = payoutsPayload?.recentExecutions ?? [];
  const errorMessage = fintechQuery.error ? getReadableActionError(fintechQuery.error as FintechApiError) : null;
  const payoutErrorMessage = payoutsQuery.error ? getReadableActionError(payoutsQuery.error as FintechApiError) : null;
  const isInitialLoading = fintechQuery.isLoading && !payload;
  const scopedShops = payload?.shops ?? [];
  const scopedBarbers = payload?.barbers ?? [];
  const scopedMemberships = useMemo(
    () => (payload?.memberships ?? []).filter((membership) => !locationIds.length || locationIds.includes(membership.shopId)),
    [locationIds, payload?.memberships]
  );

  useEffect(() => {
    if (!payload) {
      return;
    }

    setAccountForms((current) => {
      const next = { ...current };
      for (const account of [...payload.shops, ...payload.barbers]) {
        if (!next[account.id]) {
          next[account.id] = createAccountForm(account);
        }
      }
      return next;
    });

    setMembershipForms((current) => {
      const next = { ...current };
      for (const membership of payload.memberships) {
        if (!next[membership.id]) {
          next[membership.id] = createMembershipForm(membership);
        }
      }
      return next;
    });
  }, [payload]);

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

  async function handleSaveAccount(accountId: string) {
    const form = accountForms[accountId];
    if (!form) {
      return;
    }

    setFeedback(null);
    try {
      await updateAccountMutation.mutateAsync({
        accountId,
        provider: form.provider,
        providerAccountId: form.providerAccountId || null,
        onboardingStatus: form.onboardingStatus,
        taxReadinessStatus: form.taxReadinessStatus,
        chargesEnabled: form.chargesEnabled,
        payoutsEnabled: form.payoutsEnabled,
        requirementsCurrentlyDue: form.requirementsCurrentlyDue,
        requirementsEventuallyDue: form.requirementsEventuallyDue,
        requirementsPastDue: form.requirementsPastDue,
        disabledReason: form.disabledReason || null
      });
      setFeedback({ tone: "success", message: "Connected account readiness updated." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleSaveMembership(membershipId: string) {
    const form = membershipForms[membershipId];
    if (!form) {
      return;
    }

    setFeedback(null);
    try {
      await updateMembershipMutation.mutateAsync({
        membershipId,
        routingModel: form.routingModel,
        autoBoothPercent: form.autoBoothPercent ? Number(form.autoBoothPercent) : null,
        boothRentAmount: form.boothRentAmount ? Number(form.boothRentAmount) : null,
        boothRentFrequency: form.boothRentFrequency || null,
        payoutBlockReason: form.payoutBlockReason || null
      });
      setFeedback({ tone: "success", message: "Compensation assignment updated for future payout routing." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleShopAcceptance(shopId: string, agreementType: "platform_terms" | "shop_agreement" | "payout_tax_acknowledgment") {
    setFeedback(null);
    try {
      await recordLegalAcceptanceMutation.mutateAsync({ agreementType, shopId });
      setFeedback({ tone: "success", message: `${labelAgreement(agreementType)} recorded for the shop readiness ledger.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleRefreshShop(shopId: string) {
    setFeedback(null);
    try {
      await refreshStripeMutation.mutateAsync({ shopId });
      setFeedback({ tone: "success", message: "Stripe readiness refreshed for this shop." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleExecutePayouts(mode: "ready" | "retry_failed") {
    setFeedback(null);
    try {
      const result = await executePayoutsMutation.mutateAsync({ mode });
      setFeedback({
        tone: "success",
        message:
          mode === "ready"
            ? `Executed ${result.summary.executed} payout transfers, with ${result.summary.blocked} blocked and ${result.summary.failed} failed.`
            : `Retried failed payouts: ${result.summary.executed} executed, ${result.summary.failed} still failed, ${result.summary.blocked} blocked.`
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="fintech-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Payments and fintech hardening</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Route money safely before payouts go live.</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
              {viewerRole === "owner"
                ? "See missing payout steps, lock compensation assignment by membership, and keep routing truth auditable without pretending payouts already execute."
                : "Keep payout readiness, blocked routing causes, and compensation assignment visible for your scoped shops without exposing raw client payment data."}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
              <Wallet className="h-4 w-4" />
              {payload?.summary.totalAccounts ?? 0} accounts in scope
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">
              {payload?.summary.blockedRoutingRecords ?? 0} blocked routing records
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
          {payoutErrorMessage ? <FeedbackBanner tone="error" message={payoutErrorMessage} /> : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isInitialLoading ? (
            <>
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
            </>
          ) : (
            <>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Ready accounts</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.readyAccounts ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Fully payout-ready connected accounts.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Needs attention</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.needsAttentionAccounts ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Onboarding or legal/tax steps are incomplete.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Blocked accounts</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.blockedAccounts ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Past-due requirements or disabled routing states.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Ready for payout</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(payload?.summary.readyForPayoutAmount ?? 0)}</p>
                <p className="mt-2 text-sm text-white/58">Deterministic routing value marked ready in the ledger.</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Shop readiness</p>
            <Landmark className="h-5 w-5 text-[#e4f9b8]" />
          </div>
          <div className="mt-4 space-y-4">
            {isInitialLoading ? (
              <>
                <SummarySkeleton />
                <SummarySkeleton />
              </>
            ) : scopedShops.length ? scopedShops.map((account) => {
              const form = accountForms[account.id] ?? createAccountForm(account);
              return (
                <div key={account.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{account.shopLabel ?? account.displayName}</p>
                      <p className="mt-1 text-sm text-white/55">
                        {account.operationalStatus.replaceAll("_", " ")} | {account.onboardingStatus.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span className="status-pill text-[#e4f9b8]">{account.legalReadinessStatus.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Select value={form.onboardingStatus} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, onboardingStatus: event.target.value as AccountFormState["onboardingStatus"] } }))}>
                      <option value="not_started">Not started</option>
                      <option value="invited">Invited</option>
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="restricted">Restricted</option>
                      <option value="verified">Verified</option>
                    </Select>
                    <Select value={form.taxReadinessStatus} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, taxReadinessStatus: event.target.value as AccountFormState["taxReadinessStatus"] } }))}>
                      <option value="pending">Tax pending</option>
                      <option value="submitted">Tax submitted</option>
                      <option value="verified">Tax verified</option>
                    </Select>
                    <Input value={form.providerAccountId} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, providerAccountId: event.target.value } }))} placeholder="Provider account id" />
                    <Input value={form.requirementsCurrentlyDue} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, requirementsCurrentlyDue: event.target.value } }))} placeholder="Current requirements" />
                    <Input value={form.requirementsPastDue} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, requirementsPastDue: event.target.value } }))} placeholder="Past-due requirements" />
                    <Input value={form.disabledReason} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, disabledReason: event.target.value } }))} placeholder="Disabled reason" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/58">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.chargesEnabled} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, chargesEnabled: event.target.checked } }))} />
                      Charges enabled
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.payoutsEnabled} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, payoutsEnabled: event.target.checked } }))} />
                      Payouts enabled
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handleSaveAccount(account.id)} disabled={updateAccountMutation.isPending}>Save readiness</Button>
                    {account.operationalStatus !== "payout_ready" && account.shopId ? (
                      <Button
                        variant="primary"
                        disabled={onboardingMutation.isPending}
                        onClick={() => navigateToStripeUrl(
                          async () => (await onboardingMutation.mutateAsync({ shopId: account.shopId })).url,
                          account.providerAccountId ? "Stripe onboarding link refreshed for the shop." : "Stripe onboarding started for the shop."
                        )}
                      >
                        {account.providerAccountId ? "Resume Stripe onboarding" : "Start Stripe onboarding"}
                      </Button>
                    ) : null}
                    {account.providerAccountId && account.shopId ? (
                      <>
                        <Button
                          variant="ghost"
                          disabled={dashboardMutation.isPending}
                          onClick={() => navigateToStripeUrl(
                            async () => (await dashboardMutation.mutateAsync({ shopId: account.shopId })).url,
                            "Opening the Stripe Express dashboard."
                          )}
                        >
                          Open Stripe dashboard
                        </Button>
                        <Button variant="ghost" disabled={refreshStripeMutation.isPending} onClick={() => handleRefreshShop(account.shopId!)}>
                          Refresh Stripe status
                        </Button>
                      </>
                    ) : null}
                    {(["platform_terms", "shop_agreement", "payout_tax_acknowledgment"] as const).map((agreementType) => (
                      <Button
                        key={agreementType}
                        variant={account.missingAgreements.includes(agreementType) ? "primary" : "ghost"}
                        onClick={() => handleShopAcceptance(account.shopId ?? "", agreementType)}
                        disabled={!account.shopId || recordLegalAcceptanceMutation.isPending}
                      >
                        {labelAgreement(agreementType)}
                      </Button>
                    ))}
                  </div>
                  {account.missingSteps.length ? (
                    <div className="mt-4 space-y-2 text-sm text-white/58">
                      {account.missingSteps.map((step) => <p key={step}>- {step}</p>)}
                    </div>
                  ) : null}
                  {account.processorLastSyncedAt ? (
                    <p className="mt-4 text-xs text-white/45">
                      Last synced {new Date(account.processorLastSyncedAt).toLocaleString()}
                      {account.processorLastEventType ? ` from ${account.processorLastEventType}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            }) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                Shop payout-readiness records will appear here when the current user has owner or manager scope.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Barber readiness and compensation</p>
            <ShieldCheck className="h-5 w-5 text-[#e4f9b8]" />
          </div>
          <div className="mt-4 space-y-4">
            {isInitialLoading ? (
              <>
                <SummarySkeleton />
                <SummarySkeleton />
              </>
            ) : scopedBarbers.length ? scopedBarbers.map((account) => {
              const form = accountForms[account.id] ?? createAccountForm(account);
              const membership = scopedMemberships.find((entry) => entry.barberId === account.barberId);
              const membershipForm = membership ? (membershipForms[membership.id] ?? createMembershipForm(membership)) : null;
              return (
                <div key={account.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{account.displayName}</p>
                      <p className="mt-1 text-sm text-white/55">
                        {account.shopLabel ?? "No shop assigned"} | {account.operationalStatus.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span className="status-pill text-[#e4f9b8]">{account.taxReadinessStatus.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Select value={form.onboardingStatus} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, onboardingStatus: event.target.value as AccountFormState["onboardingStatus"] } }))}>
                      <option value="not_started">Not started</option>
                      <option value="invited">Invited</option>
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="restricted">Restricted</option>
                      <option value="verified">Verified</option>
                    </Select>
                    <Select value={form.taxReadinessStatus} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, taxReadinessStatus: event.target.value as AccountFormState["taxReadinessStatus"] } }))}>
                      <option value="pending">Tax pending</option>
                      <option value="submitted">Tax submitted</option>
                      <option value="verified">Tax verified</option>
                    </Select>
                    <Input value={form.providerAccountId} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, providerAccountId: event.target.value } }))} placeholder="Provider account id" />
                    <Input value={form.requirementsCurrentlyDue} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, requirementsCurrentlyDue: event.target.value } }))} placeholder="Current requirements" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/58">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.chargesEnabled} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, chargesEnabled: event.target.checked } }))} />
                      Charges enabled
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.payoutsEnabled} onChange={(event) => setAccountForms((current) => ({ ...current, [account.id]: { ...form, payoutsEnabled: event.target.checked } }))} />
                      Payouts enabled
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handleSaveAccount(account.id)} disabled={updateAccountMutation.isPending}>Save barber readiness</Button>
                  </div>

                  {membership && membershipForm ? (
                    <div className="mt-5 rounded-[20px] border border-white/8 bg-black/18 p-4">
                      <p className="surface-label">Compensation assignment</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Select value={membershipForm.routingModel} onChange={(event) => setMembershipForms((current) => ({ ...current, [membership.id]: { ...membershipForm, routingModel: event.target.value as MembershipFormState["routingModel"] } }))}>
                          <option value="freelance">Freelance</option>
                          <option value="autobooth_rent">AutoBooth Rent</option>
                          <option value="booth_rent">Full Booth Rent</option>
                        </Select>
                        <Input value={membershipForm.autoBoothPercent} onChange={(event) => setMembershipForms((current) => ({ ...current, [membership.id]: { ...membershipForm, autoBoothPercent: event.target.value } }))} placeholder="AutoBooth portion of eligible proceeds (0-1)" />
                        <Input value={membershipForm.boothRentAmount} onChange={(event) => setMembershipForms((current) => ({ ...current, [membership.id]: { ...membershipForm, boothRentAmount: event.target.value } }))} placeholder="Booth-rent amount" />
                        <Select value={membershipForm.boothRentFrequency} onChange={(event) => setMembershipForms((current) => ({ ...current, [membership.id]: { ...membershipForm, boothRentFrequency: event.target.value as MembershipFormState["boothRentFrequency"] } }))}>
                          <option value="">Frequency</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </Select>
                        <Input className="sm:col-span-2" value={membershipForm.payoutBlockReason} onChange={(event) => setMembershipForms((current) => ({ ...current, [membership.id]: { ...membershipForm, payoutBlockReason: event.target.value } }))} placeholder="Optional payout block reason" />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => handleSaveMembership(membership.id)} disabled={updateMembershipMutation.isPending}>Save compensation</Button>
                      </div>
                    </div>
                  ) : null}

                  {account.missingSteps.length ? (
                    <div className="mt-4 space-y-2 text-sm text-white/58">
                      {account.missingSteps.map((step) => <p key={step}>- {step}</p>)}
                    </div>
                  ) : null}
                  {account.processorLastSyncedAt ? (
                    <p className="mt-4 text-xs text-white/45">
                      Last synced {new Date(account.processorLastSyncedAt).toLocaleString()}
                      {account.processorLastEventType ? ` from ${account.processorLastEventType}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            }) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                Barber payout-readiness rows will surface here when active memberships are attached to the scoped shops.
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="surface-label">Blocked routing records</p>
          <span className="status-pill text-[#e4f9b8]">{payload?.blockedPayments.length ?? 0} flagged</span>
        </div>
        <div className="mt-4 space-y-3">
          {isInitialLoading ? (
            <>
              <SummarySkeleton />
              <SummarySkeleton />
            </>
          ) : payload?.blockedPayments.length ? payload.blockedPayments.map((row) => (
            <div key={row.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{row.barberName ?? "Barber"}</p>
                  <p className="mt-1 text-sm text-white/55">{row.shopLabel ?? "No shop"} | {row.routingModel.replaceAll("_", " ")}</p>
                </div>
                <span className="status-pill text-[#e4f9b8]">{row.moneyRoutingStatus.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Gross</p>
                  <p className="mt-2 text-base font-semibold">{currency(row.providerGrossAmount)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Net</p>
                  <p className="mt-2 text-base font-semibold">{currency(row.providerNetAmount)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Barber route</p>
                  <p className="mt-2 text-base font-semibold">{currency(row.barberPayoutAmount)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Shop split</p>
                  <p className="mt-2 text-base font-semibold">{currency(row.shopSplitAmount)}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/58">{row.blockedReason ?? "No explicit blocked reason stored."}</p>
            </div>
          )) : (
            <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
              Blocked payment routing records will surface here whenever captured funds cannot safely move forward to payout readiness.
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Payout execution</p>
            <p className="mt-2 text-sm text-white/58">
              Execute Stripe transfers from the canonical routing ledger, then watch reversals and failed attempts without leaving the reports lane.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => handleExecutePayouts("ready")}
              disabled={executePayoutsMutation.isPending}
            >
              Execute ready payouts
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExecutePayouts("retry_failed")}
              disabled={executePayoutsMutation.isPending}
            >
              Retry failed
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {payoutsQuery.isLoading && !payoutsPayload ? (
            <>
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
            </>
          ) : (
            <>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Executable routing</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payoutsPayload?.summary.executableRoutingRecords ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">{currency(payoutsPayload?.summary.readyForPayoutAmount ?? 0)} ready to move.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Executed transfers</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payoutsPayload?.summary.executedTransferCount ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">{currency(payoutsPayload?.summary.executedAmount ?? 0)} executed.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Failed or blocked</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{(payoutsPayload?.summary.failedExecutionRecords ?? 0) + (payoutsPayload?.summary.blockedExecutionRecords ?? 0)}</p>
                <p className="mt-2 text-sm text-white/58">Keep retries and readiness blockers visible.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Reversed</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{payoutsPayload?.summary.reversedExecutionCount ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">{currency(payoutsPayload?.summary.reversedAmount ?? 0)} reconciled back.</p>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <p className="surface-label">Ready routing</p>
            {payoutsQuery.isLoading && !payoutsPayload ? (
              <>
                <SummarySkeleton />
                <SummarySkeleton />
              </>
            ) : readyPayoutRouting.length ? readyPayoutRouting.map((row) => (
              <div key={row.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{row.barberName ?? "Barber"}</p>
                    <p className="mt-1 text-sm text-white/55">{row.shopLabel ?? "No shop"} | {row.routingModel.replaceAll("_", " ")}</p>
                  </div>
                  <span className="status-pill text-[#e4f9b8]">{currency(row.barberPayoutAmount + row.shopSplitAmount)}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Net</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.providerNetAmount)}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Processor fee</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.processorFeeAmount)}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Barber route</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.barberPayoutAmount)}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Shop split</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.shopSplitAmount)}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                Executable routing records will surface here once Stripe-backed captured funds and payout-ready accounts line up safely.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="surface-label">Recent payout executions</p>
            {payoutsQuery.isLoading && !payoutsPayload ? (
              <>
                <SummarySkeleton />
                <SummarySkeleton />
              </>
            ) : recentPayoutExecutions.length ? recentPayoutExecutions.map((row) => (
              <div key={row.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{row.targetDisplayName ?? row.barberName ?? row.shopLabel ?? "Payout execution"}</p>
                    <p className="mt-1 text-sm text-white/55">
                      {row.executionType.replaceAll("_", " ")} | {row.routingModel.replaceAll("_", " ")} | {row.shopLabel ?? "No shop"}
                    </p>
                  </div>
                  <span className="status-pill text-[#e4f9b8]">{row.executionStatus.replaceAll("_", " ")}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Amount</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.amount)}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Reconciliation</p>
                    <p className="mt-2 text-base font-semibold">{row.reconciliationStatus.replaceAll("_", " ")}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Processor fee</p>
                    <p className="mt-2 text-base font-semibold">{currency(row.providerFeeAmount)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/58">{row.failureReason ?? row.blockedReason ?? "Execution recorded with no current blocker."}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                Transfer and reversal records will appear here as soon as payout execution begins.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
