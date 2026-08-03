"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Check, ExternalLink, LockKeyhole, ShieldAlert } from "lucide-react";
import type { BillingWorkspaceSnapshot } from "@/lib/billing/pr34-domain";
import { roleTrueBalanceHoldCopy } from "@/lib/billing/pr34-domain";
import { cn } from "@/lib/utils";

type BalancePaymentSession = {
  attemptId: string;
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  currency: string;
};

function money(cents: number | null, currency = "USD") {
  if (cents === null) return "Needs review";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Balance recovery could not complete that request.");
  return body;
}

function BalancePaymentForm({ session, onCleared }: { session: BalancePaymentSession; onCleared: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/locked?balance_attempt=${encodeURIComponent(session.attemptId)}`
        },
        redirect: "if_required"
      });
      if (result.error) throw new Error(result.error.message ?? "Stripe could not confirm the payment.");
      const response = await fetch("/api/billing/balance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: session.attemptId })
      });
      await readJson(response);
      onCleared();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Payment confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 rounded-[20px] border border-[#C4F24E]/24 bg-black/25 p-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button type="submit" disabled={!stripe || !elements || busy} className="mt-4 min-h-13 w-full rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-[#060708] disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? "Confirming with Stripe…" : `Pay ${money(session.amountCents, session.currency.toUpperCase())} — unlock`}
      </button>
      {error ? <p className="mt-3 rounded-[14px] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <p className="mt-3 font-mono text-[9px] leading-5 text-white/34">Stripe securely handles the payment fields. BVRB3R unlocks only after the server re-verifies a successful PaymentIntent for this exact balance snapshot.</p>
    </form>
  );
}

export function BalanceLockWorkspace({
  initial,
  resumeAttemptId = null
}: {
  initial: BillingWorkspaceSnapshot;
  resumeAttemptId?: string | null;
}) {
  const router = useRouter();
  const [paymentSession, setPaymentSession] = useState<BalancePaymentSession | null>(null);
  const [busy, setBusy] = useState<string | null>(resumeAttemptId ? "resume" : null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [disputeLineId, setDisputeLineId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const stripePromise = useMemo(
    () => paymentSession?.publishableKey ? loadStripe(paymentSession.publishableKey) : null,
    [paymentSession?.publishableKey]
  );
  const destination = initial.plan.accountRole === "barber_user"
    ? "/dashboard/barber"
    : initial.plan.accountRole === "shop_owner_user"
      ? "/shop/home"
      : "/dashboard/client";

  useEffect(() => {
    if (!resumeAttemptId) return;
    let active = true;
    void fetch("/api/billing/balance/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: resumeAttemptId })
    })
      .then(readJson)
      .then(() => {
        if (!active) return;
        setMessage({ tone: "success", text: "Stripe confirmed payment. The balance is clear and account actions are unlocked." });
        router.replace("/locked");
        router.refresh();
      })
      .catch((error) => {
        if (!active) return;
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Payment confirmation needs review." });
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => { active = false; };
  }, [resumeAttemptId, router]);

  async function startPayment() {
    setBusy("payment");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/balance/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `balance:${crypto.randomUUID()}`
        },
        body: "{}"
      });
      const payload = await readJson<{ payment: BalancePaymentSession }>(response);
      if (!payload.payment.clientSecret) throw new Error("Stripe did not return a payable balance session.");
      setPaymentSession(payload.payment);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to start balance payment." });
    } finally {
      setBusy(null);
    }
  }

  async function submitDispute() {
    if (!disputeLineId) return;
    setBusy(`dispute:${disputeLineId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/balance/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: disputeLineId, reason: disputeReason })
      });
      await readJson(response);
      setDisputeLineId(null);
      setDisputeReason("");
      setMessage({ tone: "success", text: "Collection on that line is paused while support reviews the dispute. The owed balance remains itemized." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to submit the dispute." });
    } finally {
      setBusy(null);
    }
  }

  function paymentCleared() {
    setPaymentSession(null);
    setMessage({ tone: "success", text: "Balance paid in full. Server lock truth is refreshing now." });
    router.refresh();
  }

  if (initial.balance.state === "clear") {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#060708] p-6 text-[#F5F1E8]">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(196,242,78,0.10),transparent_42%)]" aria-hidden="true" />
        <section className="relative w-full max-w-2xl text-center">
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#C4F24E] bg-[#C4F24E]/10 text-[#C4F24E] shadow-[0_0_70px_rgba(196,242,78,0.22)]">
            <Check className="h-10 w-10" aria-hidden="true" />
          </span>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-[#C4F24E]">Balance $0.00 · all clear</p>
          <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,5rem)] leading-none">You’re square<span className="text-[#C4F24E]">.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/56">Booking, kiosk, and plan changes can reopen from server balance truth. Your records were never deleted.</p>
          <Link href={destination as never} className="mt-7 inline-flex min-h-13 items-center rounded-full bg-[#C4F24E] px-8 text-sm font-extrabold text-[#060708]">Into the app</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#060708] px-5 py-8 text-[#F5F1E8] sm:px-8 sm:py-10">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[30rem] bg-[radial-gradient(ellipse_at_top,rgba(255,138,101,0.09),transparent_65%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[820px]">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className="font-extrabold tracking-[0.28em] text-white">BVRB<span className="text-[#C4F24E]">3</span>R</Link>
          <span className="rounded-full border border-[#FF8A65]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#FFB39F]">Balance Lock</span>
          <Link href="/billing" className="ml-auto text-xs font-bold text-[#C4F24E]">Billing details</Link>
        </header>

        <section className="mt-12 text-center">
          <span className={cn(
            "mx-auto flex h-20 w-20 items-center justify-center rounded-full border",
            initial.balance.state === "locked" ? "border-[#FF8A65] bg-[#FF8A65]/10 text-[#FFB39F]" : "border-amber-300/45 bg-amber-300/10 text-amber-100"
          )}>
            {initial.balance.state === "locked" ? <LockKeyhole className="h-8 w-8" aria-hidden="true" /> : <ShieldAlert className="h-8 w-8" aria-hidden="true" />}
          </span>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#FFB39F]">
            {initial.balance.state === "locked" ? "Balance due · account locked" : "Balance proof · needs review"}
          </p>
          <h1 className="mt-4 font-serif text-[clamp(2.7rem,8vw,4.8rem)] leading-none">
            {initial.balance.state === "locked" ? `${money(initial.balance.totalOwedCents)} to reopen every door.` : "We need to verify your balance."}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/56">{roleTrueBalanceHoldCopy(initial.plan.accountRole)}</p>
        </section>

        {message ? <p className={cn("mt-7 rounded-[16px] border p-4 text-sm", message.tone === "success" ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#E4F9B8]" : "border-red-400/30 bg-red-500/10 text-red-100")} role="status">{message.text}</p> : null}

        <section className="mt-7 rounded-[24px] border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="balance-lines-heading">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="balance-lines-heading" className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">What makes up this balance</h2>
            <span className="ml-auto font-mono text-[9px] text-white/34">Every line stays in immutable history</span>
          </div>
          <div className="mt-4 divide-y divide-white/8">
            {initial.balance.lines.filter((line) => line.outstandingCents > 0).map((line) => (
              <article key={line.id} className="py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[14rem] flex-1">
                    <p className="text-sm font-extrabold">{line.description}</p>
                    <p className="mt-1 font-mono text-[9px] leading-5 text-white/38">{line.sourceLabel} · {line.reference} · {date(line.dueAt)}</p>
                    {line.stripeReference ? <p className="font-mono text-[9px] text-white/28">Stripe ref {line.stripeReference}</p> : null}
                  </div>
                  <p className="font-mono text-sm text-[#E4F9B8]">{money(line.outstandingCents)}</p>
                  <span className={cn("rounded-full border px-3 py-1 font-mono text-[8px] uppercase tracking-[0.12em]", line.status === "disputed" ? "border-amber-300/30 text-amber-100" : "border-[#FF8A65]/30 text-[#FFB39F]")}>{line.status}</span>
                </div>
                {line.status === "open" ? (
                  <button type="button" onClick={() => { setDisputeLineId(line.id); setDisputeReason(""); }} className="mt-3 text-xs font-bold text-[#C4F24E] underline decoration-[#C4F24E]/30 underline-offset-4">Dispute this line</button>
                ) : line.status === "disputed" ? (
                  <p className="mt-3 text-xs leading-5 text-amber-100/66">Collection is paused on this line while support reviews it. The line remains itemized and the owed balance is not erased.</p>
                ) : null}
                {disputeLineId === line.id ? (
                  <div className="mt-4 rounded-[18px] border border-amber-300/22 bg-amber-300/[0.055] p-4">
                    <label htmlFor={`dispute-${line.id}`} className="text-sm font-bold text-amber-100">Why is this line incorrect?</label>
                    <textarea id={`dispute-${line.id}`} value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} minLength={10} maxLength={1000} rows={4} className="mt-3 w-full rounded-[14px] border border-white/12 bg-black/30 p-3 text-sm text-white outline-none focus:border-[#C4F24E]/50" />
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button type="button" disabled={disputeReason.trim().length < 10 || busy === `dispute:${line.id}`} onClick={() => void submitDispute()} className="min-h-10 rounded-full bg-[#C4F24E] px-4 text-xs font-extrabold text-black disabled:opacity-40">Pause collection and submit</button>
                      <button type="button" onClick={() => setDisputeLineId(null)} className="min-h-10 rounded-full border border-white/12 px-4 text-xs font-bold text-white/62">Cancel</button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {initial.balance.state === "locked" ? (
            <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-5">
              <span className="flex-1 font-extrabold">Total to unlock</span>
              <span className="font-serif text-3xl text-[#C4F24E]">{money(initial.balance.totalOwedCents)}</span>
            </div>
          ) : null}
        </section>

        {initial.balance.state === "locked" ? (
          <section className="mt-5 rounded-[24px] border border-[#C4F24E]/24 bg-[#C4F24E]/[0.035] p-5 sm:p-6" aria-label="Pay balance">
            {initial.balance.disputedCents ? (
              <div>
                <p className="font-extrabold text-amber-100">Disputed balance under review</p>
                <p className="mt-2 text-sm leading-6 text-white/52">Collection is paused on {money(initial.balance.disputedCents)}. Support must resolve that line before Pay in full can clear the account.</p>
                <a href="mailto:support@bvrb3r.app" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/30 px-5 text-sm font-bold text-[#C4F24E]">Open support <ExternalLink className="h-4 w-4" /></a>
              </div>
            ) : paymentSession && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret: paymentSession.clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#C4F24E", colorBackground: "#0B0C0D", colorText: "#F5F1E8", borderRadius: "14px" } } }}>
                <BalancePaymentForm session={paymentSession} onCleared={paymentCleared} />
              </Elements>
            ) : (
              <div>
                <p className="font-extrabold">Pay the exact itemized balance through Stripe</p>
                <p className="mt-2 text-sm leading-6 text-white/52">One server-bound PaymentIntent covers every open line. Unlock happens only after Stripe confirms the full amount and the database settles the same line snapshot atomically.</p>
                <button type="button" disabled={busy === "payment" || busy === "resume"} onClick={() => void startPayment()} className="mt-5 min-h-13 w-full rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-[#060708] disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === "payment" || busy === "resume" ? "Verifying with Stripe…" : `Pay ${money(initial.balance.totalOwedCents)} — unlock instantly`}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="mt-5 rounded-[22px] border border-amber-300/22 bg-amber-300/[0.05] p-5">
            <p className="font-extrabold text-amber-100">Risk actions remain fail-closed</p>
            <p className="mt-2 text-sm leading-6 text-white/52">{initial.balance.reason} No payment amount is invented while server truth is unavailable.</p>
            <a href="mailto:support@bvrb3r.app" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-amber-300/25 px-5 text-sm font-bold text-amber-100">Contact support</a>
          </section>
        )}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-5 text-xs text-white/40">
          <span>Nothing is deleted on lock, dispute, downgrade, or cancel.</span>
          <Link href="/billing" className="font-bold text-[#C4F24E]">View subscription &amp; invoices</Link>
        </footer>
      </div>
    </main>
  );
}
