"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Download,
  FileText,
  Loader2,
  Pause,
  ReceiptText,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import type { RentWorkspacePayload } from "@/lib/rent/service";
import { cn } from "@/lib/utils";

type RentScreen = "lifecycle" | "autobooth" | "statement";
type LifecycleTab = "pay" | "relationship" | "changes";
type PaymentRail = "card" | "barber_balance" | "cash";

const EMPTY_PAYLOAD = (viewer: "owner" | "barber"): RentWorkspacePayload => ({
  viewer,
  scope: { shopId: null },
  relationships: [],
  agreements: [],
  obligations: [],
  contributions: [],
  actions: [],
  autopay: [],
  paymentRequests: [],
  disputes: [],
  lifecycleRequests: [],
  warnings: []
});

function demoPayload(viewer: "owner" | "barber", shopId: string | null): RentWorkspacePayload {
  return {
    viewer,
    scope: { shopId: shopId ?? "shop-ybor" },
    relationships: [{
      id: "11111111-1111-4111-8111-111111111111",
      shopId: shopId ?? "shop-ybor",
      barberId: "22222222-2222-4222-8222-222222222222",
      status: "active"
    }],
    agreements: [{
      id: "33333333-3333-4333-8333-333333333333",
      relationshipId: "11111111-1111-4111-8111-111111111111",
      shopId: shopId ?? "shop-ybor",
      barberId: "22222222-2222-4222-8222-222222222222",
      version: 3,
      model: "autobooth_rent",
      status: "active",
      rentAmountCents: 35_000,
      billingFrequency: "weekly",
      autoBoothBasisPoints: 2_000,
      ownerAcceptedAt: "2026-04-12T12:00:00.000Z",
      barberAcceptedAt: "2026-04-12T12:05:00.000Z",
      effectiveAt: "2026-04-20T00:00:00.000Z",
      termsHash: "d".repeat(64)
    }],
    obligations: [{
      id: "44444444-4444-4444-8444-444444444444",
      agreementId: "33333333-3333-4333-8333-333333333333",
      shopId: shopId ?? "shop-ybor",
      barberId: "22222222-2222-4222-8222-222222222222",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      dueAt: "2026-08-02T23:00:00.000Z",
      status: "partially_funded",
      obligationCents: 35_000,
      settledCents: 20_740,
      remainingCents: 14_260,
      graceUsedAt: null,
      graceExpiresAt: "2026-08-03T09:00:00.000Z",
      lateFeeAppliedAt: null,
      waiverReason: null
    }],
    contributions: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        obligationId: "44444444-4444-4444-8444-444444444444",
        kind: "autobooth_card",
        status: "settled",
        appliedCents: 15_440,
        eligibleServiceCents: viewer === "barber" ? 77_200 : null,
        excludedTipCents: viewer === "barber" ? 12_000 : null,
        excludedTaxCents: viewer === "barber" ? 0 : null,
        excludedExternalCents: viewer === "barber" ? 0 : null,
        refundedServiceCents: viewer === "barber" ? 0 : null,
        requestedCents: viewer === "barber" ? 15_440 : null,
        appointmentId: viewer === "barber" ? "66666666-6666-4666-8666-666666666666" : null,
        paymentId: viewer === "barber" ? "77777777-7777-4777-8777-777777777777" : null,
        providerEventId: viewer === "barber" ? "pi_demo_native" : null,
        evidenceReference: "BVR-RCT-15440",
        reversalOfContributionId: null,
        createdAt: "2026-07-28T16:00:00.000Z",
        settledAt: "2026-07-28T16:00:01.000Z"
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        obligationId: "44444444-4444-4444-8444-444444444444",
        kind: "manual_payment",
        status: "settled",
        appliedCents: 5_300,
        eligibleServiceCents: null,
        excludedTipCents: null,
        excludedTaxCents: null,
        excludedExternalCents: null,
        refundedServiceCents: null,
        requestedCents: viewer === "barber" ? 5_300 : null,
        appointmentId: null,
        paymentId: null,
        providerEventId: viewer === "barber" ? "pi_demo_manual" : null,
        evidenceReference: "BVR-RCT-5300",
        reversalOfContributionId: null,
        createdAt: "2026-07-29T16:00:00.000Z",
        settledAt: "2026-07-29T16:00:01.000Z"
      }
    ],
    actions: [{
      id: "99999999-9999-4999-8999-999999999999",
      obligationId: "44444444-4444-4444-8444-444444444444",
      actionType: "contribution_created",
      actorRole: "system",
      reason: null,
      createdAt: "2026-07-29T16:00:01.000Z"
    }],
    autopay: [{
      agreementId: "33333333-3333-4333-8333-333333333333",
      enabled: false,
      version: 1,
      enabledAt: null,
      disabledAt: "2026-07-20T12:00:00.000Z"
    }],
    paymentRequests: [],
    disputes: [],
    lifecycleRequests: [],
    warnings: []
  };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The request did not complete.");
  return body;
}

function ScreenRail({
  screen,
  onChange
}: {
  screen: RentScreen;
  onChange: (screen: RentScreen) => void;
}) {
  return (
    <nav aria-label="Rent screens" className="flex gap-2 overflow-x-auto">
      {([
        ["lifecycle", "Rent lifecycle"],
        ["autobooth", "AutoBooth detail"],
        ["statement", "Rent statement"]
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "min-h-10 shrink-0 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.16em]",
            screen === key
              ? "border-[#C4F24E]/45 bg-[#C4F24E]/10 text-[#E4F9B8]"
              : "border-white/10 text-white/48"
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function LifecycleScreen({
  payload,
  viewer,
  onRefresh
}: {
  payload: RentWorkspacePayload;
  viewer: "owner" | "barber";
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<LifecycleTab>("pay");
  const [rail, setRail] = useState<PaymentRail>("card");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [proposedRent, setProposedRent] = useState("350");
  const [proposedAutoBooth, setProposedAutoBooth] = useState("15");
  const current = payload.obligations.find((row) => (
    !["funded", "waived", "canceled"].includes(row.status)
  )) ?? payload.obligations[0];
  const agreement = current
    ? payload.agreements.find((row) => row.id === current.agreementId)
    : payload.agreements[0];
  const autopay = agreement
    ? payload.autopay.find((row) => row.agreementId === agreement.id)
    : null;
  const autoBoothCents = payload.contributions
    .filter((row) => row.kind.startsWith("autobooth") && row.status === "settled")
    .reduce((total, row) => total + row.appliedCents, 0);
  const manualCents = payload.contributions
    .filter((row) => !row.kind.startsWith("autobooth") && row.status === "settled")
    .reduce((total, row) => total + row.appliedCents, 0);

  async function pay() {
    if (!current) return;
    setBusy("pay");
    setMessage(null);
    try {
      await requestJson(`/api/rent/obligations/${current.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          rail,
          amountCents: current.remainingCents,
          idempotencyKey: `rent-pay:${current.id}:${rail}:${Date.now()}`
        })
      });
      setMessage(
        rail === "cash"
          ? "Cash is pending. It will count only after the transfer reference is recorded."
          : "Payment requested. Rent will update only after settlement is confirmed."
      );
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutopay() {
    if (!agreement) return;
    setBusy("autopay");
    setMessage(null);
    try {
      await requestJson("/api/rent/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          agreementId: agreement.id,
          enabled: !autopay?.enabled,
          paymentMethodReference: !autopay?.enabled ? "pm_saved_default" : null
        })
      });
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AutoPay could not change.");
    } finally {
      setBusy(null);
    }
  }

  async function relationshipAction(type: "pause" | "leave" | "end") {
    const relationship = payload.relationships[0];
    if (!relationship) return;
    setBusy(type);
    setMessage(null);
    try {
      await requestJson(`/api/rent/relationships/${relationship.id}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({
          type,
          reason,
          effectiveAt: new Date(Date.now() + 60_000).toISOString(),
          idempotencyKey: `rent-${type}:${relationship.id}:${Date.now()}`,
          shopId: payload.scope.shopId
        })
      });
      setMessage(type === "pause" ? "Relationship paused." : "Relationship end recorded.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Relationship could not change.");
    } finally {
      setBusy(null);
    }
  }

  async function requestTermChange() {
    const relationship = payload.relationships[0];
    if (!relationship || !current) return;
    setBusy("change_terms");
    setMessage(null);
    try {
      const nextPeriod = new Date(`${current.periodEnd}T00:00:00.000Z`);
      nextPeriod.setUTCDate(nextPeriod.getUTCDate() + 1);
      await requestJson(`/api/rent/relationships/${relationship.id}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({
          type: "change_terms",
          reason,
          effectiveAt: nextPeriod.toISOString(),
          idempotencyKey: `rent-change:${relationship.id}:${Date.now()}`,
          proposedTerms: {
            rentAmountCents: Math.round(Number(proposedRent) * 100),
            autoBoothBasisPoints: Math.round(Number(proposedAutoBooth) * 100)
          },
          shopId: payload.scope.shopId
        })
      });
      setMessage("Change requested. It creates no new terms until the owner drafts a dated version and both parties accept it.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agreement change could not be requested.");
    } finally {
      setBusy(null);
    }
  }

  async function createAgreementVersion() {
    const relationship = payload.relationships[0];
    if (!relationship || !current) return;
    setBusy("create_version");
    setMessage(null);
    try {
      const nextPeriod = new Date(`${current.periodEnd}T00:00:00.000Z`);
      nextPeriod.setUTCDate(nextPeriod.getUTCDate() + 1);
      await requestJson("/api/rent/agreements", {
        method: "POST",
        body: JSON.stringify({
          relationshipId: relationship.id,
          model: Number(proposedAutoBooth) > 0 ? "autobooth_rent" : "booth_rent",
          rentAmountCents: Math.round(Number(proposedRent) * 100),
          billingFrequency: "weekly",
          autoBoothBasisPoints: Math.round(Number(proposedAutoBooth) * 100),
          graceHours: 24,
          lateFeeCents: 2_500,
          cashSettlementMethod: "provider_transfer",
          termsSnapshot: {
            requestedReason: reason,
            tipsExcluded: true,
            taxesExcluded: true,
            externalMoneyExcluded: true,
            currentWeekImmutable: true
          },
          effectiveAt: nextPeriod.toISOString(),
          shopId: payload.scope.shopId
        })
      });
      setMessage("New dated version created. It stays pending until both parties accept the exact same copy.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agreement version could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function acceptAgreement(agreementId: string) {
    setBusy(`accept:${agreementId}`);
    setMessage(null);
    try {
      const query = payload.scope.shopId
        ? `?shopId=${encodeURIComponent(payload.scope.shopId)}`
        : "";
      await requestJson(`/api/rent/agreements/${agreementId}/accept${query}`, {
        method: "POST"
      });
      setMessage("This exact agreement version is accepted. It still cannot alter the current rent week.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agreement version could not be accepted.");
    } finally {
      setBusy(null);
    }
  }

  if (!current) {
    return (
      <GlobalSafetyState
        state="empty"
        detail="No rent week exists for this relationship. A week appears only after both parties accept the same prospective agreement."
      />
    );
  }

  return (
    <section data-screen-label="Rent Lifecycle" className="overflow-hidden rounded-[28px] border border-white/10 bg-[#060708]">
      <header className="border-b border-white/8 px-5 py-4 sm:px-7">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">
          {viewer === "barber" ? "Barber" : "Shop owner"} · Rent & relationship
        </p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h1 className="text-5xl font-normal tracking-[-0.045em] text-[#F5F1E8] sm:text-7xl" data-display="true">
            Rent lifecycle.
          </h1>
          <div className="flex gap-2">
            {([
              ["pay", "Pay rent"],
              ["relationship", "Relationship"],
              ["changes", "Agreement changes"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-xs font-bold",
                  tab === key
                    ? "border-[#C4F24E]/40 bg-[#C4F24E]/10 text-[#E4F9B8]"
                    : "border-white/10 text-white/48"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === "pay" ? (
        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <div className="border-b border-white/8 p-6 lg:border-b-0 lg:border-r sm:p-8">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">
              Current week · {dateLabel(current.periodStart)}–{dateLabel(current.periodEnd)}
            </p>
            <p className="mt-5 text-6xl tracking-[-0.055em] text-[#F5F1E8] sm:text-8xl" data-display="true">
              {money(current.remainingCents)}
            </p>
            <p className="mt-2 text-sm text-white/42">
              remaining of {money(current.obligationCents)}
            </p>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full bg-[#C4F24E]"
                style={{
                  width: `${Math.min((current.settledCents / current.obligationCents) * 100, 100)}%`
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9px] text-white/42">
              <span><span className="text-[#C4F24E]">■</span> AutoBooth {money(autoBoothCents)}</span>
              <span><span className="text-[#D9B461]">■</span> Manual {money(manualCents)}</span>
              <span>Due Sun 11 PM · grace to Mon 9 AM</span>
            </div>

            {viewer === "barber" ? (
              <>
                <p className="mt-9 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">
                  Pay remaining
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    ["card", "Card"],
                    ["barber_balance", "From earnings"],
                    ["cash", "Cash"]
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRail(key)}
                      className={cn(
                        "min-h-12 rounded-xl border text-xs font-bold",
                        rail === key
                          ? "border-[#C4F24E]/45 bg-[#C4F24E]/10 text-[#E4F9B8]"
                          : "border-white/10 text-white/52"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void pay()}
                  disabled={busy !== null || current.remainingCents === 0}
                  className="mt-3 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#C4F24E] px-5 text-sm font-black text-black disabled:opacity-40"
                >
                  {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
                  Pay booth rent · {money(current.remainingCents)}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleAutopay()}
                  disabled={busy !== null}
                  aria-pressed={Boolean(autopay?.enabled)}
                  className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/10 p-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-bold text-white">AutoPay</span>
                    <span className="mt-1 block text-xs text-white/40">
                      Pay only the verified remainder at the due time.
                    </span>
                  </span>
                  <span className={cn(
                    "rounded-full px-3 py-1 font-mono text-[9px]",
                    autopay?.enabled ? "bg-[#C4F24E] text-black" : "bg-white/8 text-white/46"
                  )}>
                    {autopay?.enabled ? "ON" : "OFF"}
                  </span>
                </button>
              </>
            ) : (
              <p className="mt-8 rounded-xl border border-white/10 p-4 text-sm leading-6 text-white/52">
                Owner view shows rent billed, funded, pending, and outstanding only. Barber service earnings and tips never enter this payload.
              </p>
            )}
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Rent history</p>
              <button type="button" className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#C4F24E]">
                Full statement →
              </button>
            </div>
            <div className="mt-4 divide-y divide-white/8 border-y border-white/8">
              {payload.contributions.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-bold text-white">{row.kind.replaceAll("_", " ")}</p>
                    <p className="mt-1 font-mono text-[9px] text-white/38">{dateLabel(row.createdAt)} · {row.status}</p>
                  </div>
                  <p className="text-sm font-bold text-[#C4F24E]">{money(row.appliedCents)}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 grid gap-2">
              <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 text-sm font-bold text-white/62">
                <FileText className="h-4 w-4" /> View agreement
              </button>
              {viewer === "barber" && payload.contributions.some((row) => row.status === "settled") ? (
                <button
                  type="button"
                  onClick={() => setMessage("Choose a settled line in the statement to open a line-only dispute.")}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D9B461]/25 text-sm font-bold text-[#F8E5B5]"
                >
                  <ReceiptText className="h-4 w-4" /> Dispute a rent charge
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "relationship" ? (
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Relationship state</p>
            <h2 className="mt-3 text-5xl text-white" data-display="true">Active since Jan 2026.</h2>
            <p className="mt-4 text-sm leading-6 text-white/48">
              Pause, leave, and end are server-owned transitions. Open, pending, or held rent closes the door until the balance settles.
            </p>
          </div>
          <div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason required for the audit"
              className="min-h-24 w-full rounded-xl border border-white/12 bg-black/30 p-4 text-sm text-white outline-none focus:border-[#C4F24E]/45"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([
                ["pause", "Pause relationship", Pause],
                ["leave", "Leave shop", ArrowRight],
                ["end", "End relationship", ShieldCheck]
              ] as const).map(([type, label, Icon]) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy !== null || reason.trim().length < 3}
                  onClick={() => void relationshipAction(type)}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/12 text-xs font-bold text-white/62 disabled:opacity-35"
                >
                  {busy === type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.13em] text-[#D9B461]">
              Settle-first · current balance {money(current.remainingCents)}
            </p>
          </div>
        </div>
      ) : null}

      {tab === "changes" ? (
        <div className="grid gap-5 p-6 sm:p-8">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Version history</p>
            <h2 className="mt-3 text-5xl text-white" data-display="true">Both accept. Next week changes.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/48">
              A changed amount, AutoBooth percentage, or term creates a new dated version. It cannot change a rent week already in progress.
            </p>
          </div>
          <div className="grid gap-3">
            {payload.agreements.map((row) => (
              <article key={row.id} className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                <span className="font-mono text-[10px] text-[#C9A87C]">v{row.version}</span>
                <div>
                  <p className="text-sm font-bold text-white">{money(row.rentAmountCents)} / {row.billingFrequency} · AutoBooth {row.autoBoothBasisPoints / 100}%</p>
                  <p className="mt-1 text-xs text-white/38">Effective {dateLabel(row.effectiveAt)} · identical copy for both parties</p>
                </div>
                {["pending_acceptance", "accepted"].includes(row.status)
                  && (viewer === "barber" ? !row.barberAcceptedAt : !row.ownerAcceptedAt) ? (
                    <button
                      type="button"
                      onClick={() => void acceptAgreement(row.id)}
                      disabled={busy !== null}
                      className="min-h-9 rounded-full border border-[#C4F24E]/30 px-3 font-mono text-[9px] uppercase text-[#C4F24E]"
                    >
                      {busy === `accept:${row.id}` ? "Accepting…" : "Accept this version"}
                    </button>
                  ) : (
                    <span className="rounded-full border border-[#C4F24E]/25 px-3 py-1 font-mono text-[9px] uppercase text-[#C4F24E]">
                      {row.status}
                    </span>
                  )}
              </article>
            ))}
          </div>
          {viewer === "barber" ? (
            <div className="grid gap-3 rounded-xl border border-white/10 p-5 md:grid-cols-3">
              <label className="text-xs text-white/48">
                Proposed weekly rent
                <input
                  value={proposedRent}
                  onChange={(event) => setProposedRent(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <label className="text-xs text-white/48">
                Proposed AutoBooth %
                <input
                  value={proposedAutoBooth}
                  onChange={(event) => setProposedAutoBooth(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <label className="text-xs text-white/48">
                Reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <button
                type="button"
                onClick={() => void requestTermChange()}
                disabled={busy !== null || reason.trim().length < 3}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C4F24E] px-4 text-sm font-black text-black disabled:opacity-35 md:col-span-3"
              >
                {busy === "change_terms" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Request changed terms for the next rent week
              </button>
            </div>
          ) : (
            <div className="grid gap-3 rounded-xl border border-white/10 p-5 md:grid-cols-3">
              <label className="text-xs text-white/48">
                New weekly rent
                <input
                  value={proposedRent}
                  onChange={(event) => setProposedRent(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <label className="text-xs text-white/48">
                New AutoBooth %
                <input
                  value={proposedAutoBooth}
                  onChange={(event) => setProposedAutoBooth(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <label className="text-xs text-white/48">
                Change reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/40"
                />
              </label>
              <button
                type="button"
                onClick={() => void createAgreementVersion()}
                disabled={busy !== null || reason.trim().length < 3}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C4F24E] px-4 text-sm font-black text-black disabled:opacity-35 md:col-span-3"
              >
                {busy === "create_version" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Create next-week version and invite barber
              </button>
            </div>
          )}
        </div>
      ) : null}

      {message ? (
        <div className="border-t border-white/8 px-6 py-4 text-sm text-[#F8E5B5]">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function AutoBoothScreen({ payload }: { payload: RentWorkspacePayload }) {
  const [selected, setSelected] = useState("eligibility");
  const current = payload.obligations[0];
  const contribution = payload.contributions.find((row) => row.kind.startsWith("autobooth"));
  const states = [
    ["eligibility", "Eligibility", "Five gates, all required."],
    ["settled", "Settled card", "Eligible base → percentage → rent before and after."],
    ["cash", "Cash pending", "Owed until the transfer reference settles."],
    ["stopped", "Stopped at $0", "No contribution can exceed remaining rent."],
    ["external", "External · excluded", "Provider-owned work contributes exactly $0."],
    ["refund", "Refund reversal", "The exact original contribution reverses."],
    ["dispute", "Dispute hold", "One line freezes; the rest of the week proceeds."]
  ] as const;
  const active = states.find(([key]) => key === selected) ?? states[0];

  return (
    <section data-screen-label="AutoBooth State" className="rounded-[28px] border border-white/10 bg-[#060708] p-5 sm:p-7">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">
        AutoBooth · eligibility & transaction detail
      </p>
      <div className="mt-5 space-y-5">
        <nav aria-label="AutoBooth states" className="flex flex-wrap gap-2">
          {states.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={cn(
                "min-h-10 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.12em]",
                selected === key
                  ? "border-[#C4F24E]/45 bg-[#C4F24E]/10 text-[#E4F9B8]"
                  : "border-white/8 text-white/44"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <article className="grid min-h-[28rem] place-content-center rounded-[24px] border border-[#C4F24E]/28 bg-[radial-gradient(circle_at_center,rgba(196,242,78,0.08),transparent_38%)] p-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#C4F24E]/30 text-3xl text-[#C4F24E]">
            {selected === "eligibility" ? "5" : selected === "external" ? "0" : "✓"}
          </span>
          <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">{active[1]}</p>
          <h1 className="mt-3 text-5xl text-white sm:text-6xl" data-display="true">{active[2]}</h1>
          {selected === "eligibility" ? (
            <div className="mx-auto mt-7 grid max-w-xl gap-2 text-left sm:grid-cols-2">
              {[
                "Native BVRB3R transaction",
                "Active rent obligation",
                "Stripe payment or settled cash",
                "Shop offers AutoBooth",
                "Barber authorized AutoBooth"
              ].map((label) => (
                <p key={label} className="flex items-center gap-2 rounded-xl border border-white/8 p-3 text-xs text-white/58">
                  <Check className="h-4 w-4 text-[#C4F24E]" /> {label}
                </p>
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-7 grid max-w-xl gap-2 sm:grid-cols-2">
              <p className="rounded-xl border border-white/8 p-4 text-sm text-white/52">
                Applied <strong className="block text-xl text-white">{money(contribution?.appliedCents ?? 0)}</strong>
              </p>
              <p className="rounded-xl border border-white/8 p-4 text-sm text-white/52">
                Remaining <strong className="block text-xl text-white">{money(current?.remainingCents ?? 0)}</strong>
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function StatementScreen({
  payload,
  viewer,
  onRefresh
}: {
  payload: RentWorkspacePayload;
  viewer: "owner" | "barber";
  onRefresh: () => Promise<void>;
}) {
  const [downloadState, setDownloadState] = useState<"idle" | "preparing" | "saved" | "failed_retry">("idle");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);
  const current = payload.obligations[0];
  const disputeByLine = new Map(payload.disputes.map((row) => [row.contributionId, row]));

  async function download(format: "csv" | "pdf") {
    if (!current) return;
    setDownloadState("preparing");
    try {
      const query = new URLSearchParams({ format });
      if (payload.scope.shopId) query.set("shopId", payload.scope.shopId);
      const response = await fetch(`/api/rent/statements/${current.id}/export?${query}`);
      if (!response.ok) throw new Error("Statement is not ready.");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `bvrb3r-rent-statement-${current.periodStart}.${format}`;
      anchor.click();
      URL.revokeObjectURL(href);
      setDownloadState("saved");
    } catch {
      setDownloadState("failed_retry");
    }
  }

  async function disputeLine() {
    if (!selectedLineId) return;
    setDisputing(true);
    setDisputeMessage(null);
    try {
      await requestJson(`/api/rent/contributions/${selectedLineId}/dispute`, {
        method: "POST",
        body: JSON.stringify({
          reason: disputeReason,
          evidenceReference
        })
      });
      setDisputeMessage("Line held for review. Every other rent line continues normally.");
      setSelectedLineId(null);
      setDisputeReason("");
      setEvidenceReference("");
      await onRefresh();
    } catch (error) {
      setDisputeMessage(error instanceof Error ? error.message : "The line could not be disputed.");
    } finally {
      setDisputing(false);
    }
  }

  if (!current) return <GlobalSafetyState state="empty" detail="No rent statement is ready." />;
  const delta = current.obligationCents - current.settledCents - current.remainingCents;

  return (
    <section data-screen-label="Rent Statement" className="rounded-[28px] border border-white/10 bg-[#060708] p-5 sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">
            Statement — {viewer}
          </p>
          <h1 className="mt-4 text-5xl text-white sm:text-7xl" data-display="true">
            Your rent week, itemized.
          </h1>
        </div>
        <div className="flex gap-2">
          {(["pdf", "csv"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => void download(format)}
              disabled={downloadState === "preparing"}
              className="flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/30 px-4 text-xs font-bold uppercase text-[#C4F24E]"
            >
              {downloadState === "preparing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloadState === "saved" ? "Saved ✓" : `Download ${format}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-7 flex flex-wrap gap-2 font-mono text-[9px] uppercase">
        {["Fully funded truth", "Contributions stop at $0", "External excluded"].map((label) => (
          <span key={label} className="rounded-full border border-[#C4F24E]/25 px-3 py-2 text-[#E4F9B8]">{label}</span>
        ))}
      </div>
      <div className="mt-7 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/34">
            <tr className="border-b border-white/10">
              <th className="py-3">Date</th>
              <th>Line</th>
              <th>State</th>
              <th>Reference</th>
              <th className="text-right">Applied</th>
              {viewer === "barber" ? <th aria-label="Line action" /> : null}
            </tr>
          </thead>
          <tbody className="text-sm">
            {payload.contributions.filter((row) => row.obligationId === current.id).map((row) => {
              const dispute = disputeByLine.get(row.id);
              return (
                <tr key={row.id} className="border-b border-white/7">
                  <td className="py-4 text-white/42">{dateLabel(row.createdAt)}</td>
                  <td className="font-bold text-white">{row.kind.replaceAll("_", " ")}</td>
                  <td className={dispute ? "text-[#D9B461]" : "text-[#C4F24E]"}>
                    {dispute?.status ?? row.status}
                  </td>
                  <td className="font-mono text-[10px] text-white/36">{dispute?.evidenceReference ?? row.evidenceReference ?? "—"}</td>
                  <td className="text-right font-bold text-white">{money(row.appliedCents)}</td>
                  {viewer === "barber" ? (
                    <td className="pl-4 text-right">
                      {row.status === "settled" && !dispute ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLineId(row.id)}
                          className="min-h-9 rounded-full border border-[#D9B461]/25 px-3 text-[10px] font-bold text-[#F8E5B5]"
                        >
                          Dispute line
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedLineId ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-[#D9B461]/25 bg-[#D9B461]/5 p-5 md:grid-cols-2">
          <label className="text-xs text-white/48">
            Why this line is wrong
            <input
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none"
            />
          </label>
          <label className="text-xs text-white/48">
            Evidence reference
            <input
              value={evidenceReference}
              onChange={(event) => setEvidenceReference(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void disputeLine()}
            disabled={disputing || disputeReason.trim().length < 3 || evidenceReference.trim().length < 3}
            className="min-h-11 rounded-xl bg-[#D9B461] px-4 text-sm font-black text-black disabled:opacity-35 md:col-span-2"
          >
            {disputing ? "Holding line…" : "Hold only this line for review"}
          </button>
        </div>
      ) : null}
      {disputeMessage ? <p className="mt-4 text-sm text-[#F8E5B5]">{disputeMessage}</p> : null}
      <div className="mt-7 grid gap-3 sm:grid-cols-4">
        {[
          ["Obligation", current.obligationCents],
          ["Settled", current.settledCents],
          ["Remaining", current.remainingCents],
          ["Reconciliation", delta]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/9 p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{label}</p>
            <p className={cn("mt-2 text-xl font-bold", label === "Reconciliation" ? "text-[#C4F24E]" : "text-white")}>
              {money(value as number)}
            </p>
          </div>
        ))}
      </div>
      {downloadState === "failed_retry" ? (
        <GlobalSafetyState
          state="failed"
          detail="The statement export did not finish. The ledger stayed unchanged."
          actionLabel="Retry the statement"
          onAction={() => void download("pdf")}
          className="mt-5"
        />
      ) : null}
    </section>
  );
}

export function RentOperationsWorkspace({
  viewer,
  initialScreen = "lifecycle",
  shopIds = []
}: {
  viewer: "owner" | "barber";
  initialScreen?: RentScreen;
  shopIds?: string[];
}) {
  const uniqueShopIds = useMemo(
    () => [...new Set(shopIds.filter(Boolean))],
    [shopIds]
  );
  const [shopId, setShopId] = useState(uniqueShopIds[0] ?? "");
  const [screen, setScreen] = useState<RentScreen>(initialScreen);
  const [payload, setPayload] = useState<RentWorkspacePayload>(EMPTY_PAYLOAD(viewer));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams();
    if (viewer === "owner" && shopId) query.set("shopId", shopId);
    const response = await fetch(`/api/rent${query.size ? `?${query}` : ""}`, {
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as RentWorkspacePayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Rent truth could not load.");
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    setPayload(demo && body.obligations.length === 0 ? demoPayload(viewer, shopId || null) : body);
  }, [shopId, viewer]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Rent truth could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <main className="space-y-4" data-testid={`${viewer}-rent-operations-workspace`}>
      <header className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-[#090A0B] px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">
            BVRB3R · Rent operations
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-white/44">
            <span className="h-2 w-2 rounded-full bg-[#C4F24E]" /> Server truth synced
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {viewer === "owner" && uniqueShopIds.length > 1 ? (
            <select
              value={shopId}
              onChange={(event) => setShopId(event.target.value)}
              aria-label="Choose one shop"
              className="min-h-10 rounded-full border border-white/10 bg-black px-4 text-xs text-white"
            >
              {uniqueShopIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          ) : null}
          <ScreenRail screen={screen} onChange={setScreen} />
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh rent truth"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/45"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loading ? <GlobalSafetyState state="loading" /> : null}
      {error ? (
        <GlobalSafetyState
          state="failed"
          detail={error}
          actionLabel="Retry rent truth"
          onAction={() => void load()}
        />
      ) : null}
      {!loading && !error && screen === "lifecycle" ? (
        <LifecycleScreen payload={payload} viewer={viewer} onRefresh={load} />
      ) : null}
      {!loading && !error && screen === "autobooth" ? (
        <AutoBoothScreen payload={payload} />
      ) : null}
      {!loading && !error && screen === "statement" ? (
        <StatementScreen payload={payload} viewer={viewer} onRefresh={load} />
      ) : null}
    </main>
  );
}
