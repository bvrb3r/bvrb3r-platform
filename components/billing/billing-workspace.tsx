"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CreditCard, ExternalLink, LockKeyhole, ReceiptText, RotateCcw, X } from "lucide-react";
import { GiftedCutsV3Gate } from "@/components/billing/gifted-cuts-v3-gate";
import type { BillingPlanCard, BillingWorkspaceSnapshot } from "@/lib/billing/pr34-domain";
import { cn } from "@/lib/utils";

function money(cents: number | null, currency = "USD") {
  if (cents === null) return "Needs review";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function idempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function postJson<T>(url: string, body: unknown, key?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Billing could not complete that request.");
  return payload;
}

function PlanCard({
  card,
  busy,
  interval,
  onAction
}: {
  card: BillingPlanCard;
  busy: boolean;
  interval: "monthly" | "yearly";
  onAction: (card: BillingPlanCard) => void;
}) {
  const price = interval === "yearly" ? card.yearlyCents : card.monthlyCents;
  return (
    <article className={cn(
      "relative flex min-h-[31rem] flex-col overflow-hidden rounded-[24px] border p-6",
      card.current ? "border-[#C4F24E]/42 bg-[#C4F24E]/[0.045]" : "border-white/10 bg-white/[0.025]"
    )}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(196,242,78,0.08),transparent_70%)]" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">
          {card.tier === "standard" ? "V1 essentials" : card.tier === "pro" ? "V2 business" : "V3 complete"}
        </p>
        {card.current ? (
          <span className="rounded-full border border-[#C4F24E]/35 bg-[#C4F24E]/10 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#C4F24E]">Current plan</span>
        ) : null}
      </div>
      <h2 className="relative mt-4 font-serif text-3xl text-white">{card.label}</h2>
      <p className="relative mt-3 min-h-12 font-serif text-base italic leading-6 text-white/58">{card.pitch}</p>
      <div className="relative mt-5 flex items-baseline gap-2">
        <span className="font-serif text-4xl text-[#E4F9B8]">{money(price)}</span>
        <span className="font-mono text-[10px] text-white/38">/{interval === "yearly" ? "year" : "month"}</span>
      </div>
      {card.tier === "standard" ? (
        <p className="relative mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#C4F24E]">Exactly $0 · never billed by Stripe</p>
      ) : null}
      <ul className="relative mt-6 space-y-3 text-sm leading-6 text-white/62">
        {card.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#C4F24E]" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!card.action.enabled || busy}
        title={card.action.reason ?? undefined}
        onClick={() => onAction(card)}
        className={cn(
          "relative mt-auto min-h-12 rounded-full border px-5 text-sm font-extrabold transition",
          card.action.enabled
            ? "border-[#C4F24E]/35 bg-[#C4F24E] text-[#060708] hover:bg-[#E4F9B8]"
            : "cursor-not-allowed border-white/10 bg-white/[0.035] text-white/35"
        )}
      >
        {busy ? "Working with Stripe…" : card.action.label}
      </button>
      {card.action.timing !== "none" ? (
        <p className="relative mt-3 text-center font-mono text-[9px] uppercase tracking-[0.11em] text-white/38">
          {card.action.timing === "now" ? "Applies after Stripe confirms" : "Applies at paid period end"}
        </p>
      ) : null}
    </article>
  );
}

export function BillingWorkspace({ initial }: { initial: BillingWorkspaceSnapshot }) {
  const router = useRouter();
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    initial.plan.billingInterval === "yearly" ? "yearly" : "monthly"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function runPlanAction(card: BillingPlanCard) {
    if (!card.action.enabled) return;
    setBusy(card.tier);
    setMessage(null);
    try {
      if (card.action.kind === "restore") {
        await postJson("/api/billing/restore", {}, idempotencyKey("restore"));
        setMessage({ tone: "success", text: "Restore submitted to Stripe. Server entitlement truth will refresh from verified billing evidence." });
      } else {
        const payload = await postJson<{ result: { redirectUrl: string | null; timing: "now" | "period_end" } }>(
          "/api/billing/plan",
          { targetTier: card.tier, billingInterval: card.tier === "standard" ? "none" : interval },
          idempotencyKey("plan")
        );
        if (payload.result.redirectUrl) {
          window.location.assign(payload.result.redirectUrl);
          return;
        }
        setMessage({
          tone: "success",
          text: payload.result.timing === "period_end"
            ? "Downgrade scheduled at the paid period boundary. Nothing was deleted."
            : "Plan change submitted to Stripe. Access changes only after server billing proof confirms it."
        });
      }
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Plan change failed." });
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setMessage(null);
    try {
      const payload = await postJson<{ result: { url: string } }>("/api/billing/portal", {});
      window.location.assign(payload.result.url);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Stripe Billing management is unavailable." });
      setBusy(null);
    }
  }

  async function confirmCancel() {
    setBusy("cancel");
    setMessage(null);
    try {
      await postJson("/api/billing/cancel", {}, idempotencyKey("cancel"));
      setCancelOpen(false);
      setMessage({ tone: "success", text: "Cancellation is scheduled at the paid period boundary. Your account, history, reviews, messages, and progress remain." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Cancellation could not be scheduled." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#060708] px-5 py-8 text-[#F5F1E8] sm:px-8 sm:py-10">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[30rem] bg-[radial-gradient(ellipse_at_top,rgba(217,180,97,0.07),transparent_66%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1120px]">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className="font-extrabold tracking-[0.28em] text-white">BVRB<span className="text-[#C4F24E]">3</span>R</Link>
          <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Subscription &amp; Billing</span>
          <span className="ml-auto rounded-full border border-white/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/48">{initial.plan.roleLabel}</span>
        </header>

        <section className="mt-8">
          <h1 className="font-serif text-[clamp(2.4rem,6vw,4rem)] leading-none text-white">The plan should work for you<span className="text-[#C4F24E]">.</span></h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/56">
            Standard, Pro, and Elite use Stripe Billing only. Subscription money never mixes with earnings, tips, payouts, or booth rent. Any owed balance pauses risk actions until the account reaches $0.00.
          </p>
        </section>

        {initial.balance.state === "locked" ? (
          <section className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] border border-[#FF8A65]/55 bg-[#FF8A65]/[0.07] p-5" role="alert">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#FF8A65] bg-[#FF8A65]/10 text-[#FFB39F]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-[15rem] flex-1">
              <p className="font-extrabold text-[#FFB39F]">Balance due — {money(initial.balance.totalOwedCents)} · account locked</p>
              <p className="mt-1 text-xs leading-5 text-white/48">Booking, kiosk, upgrades, downgrades, and cancel are paused. Nothing is deleted.</p>
            </div>
            <Link href="/locked" className="inline-flex min-h-12 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-[#060708]">Pay in full</Link>
          </section>
        ) : initial.balance.state === "needs_review" ? (
          <section className="mt-6 rounded-[20px] border border-amber-300/28 bg-amber-300/[0.065] p-5" role="status">
            <p className="font-extrabold text-amber-100">Balance proof needs review</p>
            <p className="mt-2 text-sm leading-6 text-white/52">{initial.balance.reason} Risk actions remain closed.</p>
          </section>
        ) : null}

        {initial.plan.statusLabel === "Past due" ? (
          <section className="mt-4 flex flex-wrap items-center gap-4 rounded-[20px] border border-[#FF8A65]/38 bg-[#FF8A65]/[0.055] p-5">
            <div className="min-w-[15rem] flex-1">
              <p className="font-extrabold text-[#FFB39F]">Subscription past due — paid features are paused, your data is safe</p>
              <p className="mt-1 text-xs leading-5 text-white/48">A failed Stripe invoice becomes an owed balance only when the server records the final amount.</p>
            </div>
            <button type="button" disabled={!initial.manageCardEnabled || busy === "portal"} onClick={() => void openPortal()} className="min-h-11 rounded-full bg-[#C4F24E] px-5 text-sm font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-40">Update card</button>
          </section>
        ) : null}

        {initial.plan.statusLabel === "Canceled" ? (
          <section className="mt-4 flex flex-wrap items-center gap-4 rounded-[20px] border border-white/12 bg-white/[0.025] p-5">
            <div className="min-w-[15rem] flex-1">
              <p className="font-extrabold">{initial.plan.tierLabel} runs until {date(initial.plan.currentPeriodEnd)}</p>
              <p className="mt-1 text-xs leading-5 text-white/48">History and settings remain. Restore before the paid period ends.</p>
            </div>
            {initial.plan.cards.find((card) => card.current)?.action.kind === "restore" ? (
              <button type="button" onClick={() => void runPlanAction(initial.plan.cards.find((card) => card.current)!)} className="min-h-11 rounded-full bg-[#C4F24E] px-5 text-sm font-extrabold text-black">Restore {initial.plan.tierLabel}</button>
            ) : null}
          </section>
        ) : null}

        {message ? (
          <p className={cn("mt-5 rounded-[16px] border px-4 py-3 text-sm", message.tone === "success" ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#E4F9B8]" : "border-red-400/30 bg-red-500/10 text-red-100")} role="status">
            {message.text}
          </p>
        ) : null}

        <section className="mt-8" aria-labelledby="billing-plans-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="billing-plans-heading" className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#C9A87C]">The three tiers</h2>
            <div className="flex rounded-full border border-white/12 p-1" aria-label="Billing interval">
              {(["monthly", "yearly"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={interval === value} onClick={() => setInterval(value)} className={cn("min-h-9 rounded-full px-4 font-mono text-[9px] uppercase tracking-[0.13em]", interval === value ? "bg-[#C4F24E] text-black" : "text-white/48")}>{value}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {initial.plan.cards.map((card) => <PlanCard key={card.tier} card={card} busy={busy === card.tier} interval={interval} onAction={(selected) => void runPlanAction(selected)} />)}
          </div>
          <p className="mt-3 font-mono text-[9px] leading-5 text-white/38">Balance $0.00: upgrades submit now; downgrades wait until the paid period end. Access changes only from verified server and Stripe evidence.</p>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3" aria-label="Manage billing">
          <article className="rounded-[22px] border border-white/10 bg-white/[0.025] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Billing</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-white/42">Balance</dt><dd className={initial.balance.state === "locked" ? "font-bold text-[#FFB39F]" : "font-bold text-[#9BE15D]"}>{money(initial.balance.totalOwedCents)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/42">Status</dt><dd>{initial.plan.statusLabel}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/42">Renews / ends</dt><dd>{date(initial.plan.currentPeriodEnd)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/42">Provider</dt><dd>{initial.plan.tier === "standard" ? "None · $0" : "Stripe Billing"}</dd></div>
            </dl>
          </article>

          <article className="rounded-[22px] border border-white/10 bg-white/[0.025] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Manage card</p>
            <p className="mt-4 text-sm leading-6 text-white/52">Stripe’s secure Billing Portal owns payment-method changes. BVRB3R never accepts a customer id from this screen.</p>
            <button type="button" disabled={!initial.manageCardEnabled || busy === "portal"} onClick={() => void openPortal()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/30 px-5 text-sm font-extrabold text-[#C4F24E] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30">
              <CreditCard className="h-4 w-4" aria-hidden="true" /> Manage in Stripe
            </button>
            {initial.providerReason ? <p className="mt-3 text-xs leading-5 text-white/38">{initial.providerReason}</p> : null}
          </article>

          <article className="rounded-[22px] border border-white/10 bg-white/[0.025] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Change or leave</p>
            <p className="mt-4 text-sm leading-6 text-white/52">Cancellation checks the server balance first and takes effect at the paid period end.</p>
            <button type="button" disabled={!initial.cancelEnabled} title={initial.cancelReason ?? undefined} onClick={() => setCancelOpen(true)} className="mt-5 min-h-11 rounded-full border border-[#FF8A65]/35 px-5 text-sm font-bold text-[#FFB39F] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30">
              {initial.cancelEnabled ? "Cancel subscription" : initial.cancelReason ?? "Cancel unavailable"}
            </button>
          </article>
        </section>

        <section className="mt-8 rounded-[22px] border border-white/10 bg-white/[0.025] p-5" aria-labelledby="invoice-heading">
          <div className="flex items-center gap-3">
            <ReceiptText className="h-5 w-5 text-[#C9A87C]" aria-hidden="true" />
            <h2 id="invoice-heading" className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Invoices — Stripe Billing history</h2>
          </div>
          <div className="mt-4 divide-y divide-white/8">
            {initial.invoices.length ? initial.invoices.map((invoice) => (
              <details key={invoice.id} className="group py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 text-sm">
                  <span className="w-28 font-mono text-[10px] text-white/42">{date(invoice.createdAt)}</span>
                  <span className="min-w-[12rem] flex-1 font-semibold">{invoice.number ?? "Stripe invoice"}</span>
                  <span className="font-mono text-xs text-[#E4F9B8]">{money(invoice.amountDueCents, invoice.currency.toUpperCase())}</span>
                  <span className="rounded-full border border-white/12 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/52">{invoice.status}</span>
                </summary>
                <div className="mt-4 rounded-[18px] border border-[#C4F24E]/20 bg-[#C4F24E]/[0.035] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-bold">Line-item detail</p>
                    <span className="ml-auto font-mono text-[9px] text-white/38">{invoice.stripeReference}</span>
                    {invoice.invoicePdfUrl ? <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#C4F24E]">Invoice PDF <ExternalLink className="h-3.5 w-3.5" /></a> : null}
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    {invoice.lines.map((line) => <div key={line.id} className="flex gap-3"><dt className="flex-1 text-white/58">{line.description}</dt><dd className="font-mono text-xs">{money(line.amountCents, line.currency.toUpperCase())}</dd></div>)}
                  </dl>
                  <p className="mt-3 border-t border-white/8 pt-3 font-mono text-[9px] leading-5 text-white/34">Paid through Stripe Billing. This history is separate from earnings, tips, payouts, and booth rent.</p>
                </div>
              </details>
            )) : (
              <p className="py-5 text-sm text-white/42">{initial.providerState === "needs_review" ? "Stripe invoice history needs review." : "No Stripe invoices exist for this account."}</p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-[22px] border border-white/10 bg-white/[0.025] p-5" aria-labelledby="billing-history-heading">
          <h2 id="billing-history-heading" className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Immutable account billing history</h2>
          {initial.history.length ? (
            <ol className="mt-4 divide-y divide-white/8">
              {initial.history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-28 font-mono text-[10px] text-white/40">{date(event.createdAt)}</span>
                  <span className="min-w-[12rem] flex-1 text-white/68">{event.label}</span>
                  {event.stripeReference ? <span className="font-mono text-[9px] text-white/32">{event.stripeReference}</span> : null}
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-white/42">No PR34 billing events have been recorded.</p>}
        </section>

        <section className="mt-8"><GiftedCutsV3Gate /></section>
      </div>

      {cancelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="w-full max-w-xl rounded-[26px] border border-[#FF8A65]/30 bg-[#0B0C0D] p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#FFB39F]">Balance check passed · $0.00</p>
                <h2 id="cancel-title" className="mt-3 font-serif text-3xl">Cancel {initial.plan.tierLabel}?</h2>
              </div>
              <button type="button" aria-label="Close cancel confirmation" onClick={() => setCancelOpen(false)} className="rounded-full border border-white/10 p-2 text-white/52"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-[#FF8A65]/20 bg-[#FF8A65]/[0.055] p-4">
                <p className="text-sm font-bold text-[#FFB39F]">At period end</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-white/52"><li>Paid plan features pause</li><li>Future plan-only doors close</li><li>Standard remains exactly $0</li></ul>
              </div>
              <div className="rounded-[18px] border border-[#C4F24E]/20 bg-[#C4F24E]/[0.045] p-4">
                <p className="text-sm font-bold text-[#E4F9B8]">Kept forever</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-white/52"><li>Account and billing history</li><li>Badges, reviews, and messages</li><li>Settings and Road progress</li></ul>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/52">The subscription continues until {date(initial.plan.currentPeriodEnd)}. Restore before then if you change your mind.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setCancelOpen(false)} className="min-h-11 rounded-full border border-white/14 px-5 text-sm font-bold text-white/70">Keep {initial.plan.tierLabel}</button>
              <button type="button" disabled={busy === "cancel"} onClick={() => void confirmCancel()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#FF8A65]/40 px-5 text-sm font-bold text-[#FFB39F]"><RotateCcw className="h-4 w-4" />{busy === "cancel" ? "Scheduling…" : "Cancel at period end"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
