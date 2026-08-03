"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Check, Copy, Gift, History, ShieldCheck, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

type Wallet = {
  availableCents: number;
  currency: string;
  cards: Array<{ id: string; last4: string; balanceCents: number; initialBalanceCents: number; scopeType: string; status: string; purchasedAt: string; expiresAt: null }>;
  history: Array<{ id: string; type: string; amountCents: number; balanceAfterCents: number; createdAt: string }>;
};

type PaymentSession = {
  purchaseId: string;
  purchaseToken: string;
  claimToken: string;
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  currency: "usd";
  scopeLabel: string;
};

type ActivatedGift = {
  giftCardId: string;
  amountCents: number;
  currency: string;
  scopeLabel: string;
  delivery: { status: string; provider: string; claimUrl: string | null; explanation: string };
};

type ScopeCatalog = {
  barbers: Array<{ id: string; label: string }>;
  shops: Array<{ id: string; label: string }>;
};

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

async function json<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "That gift card request could not be completed.");
  return body;
}

function GiftPaymentForm({
  session,
  onActivated
}: {
  session: PaymentSession;
  onActivated: (gift: ActivatedGift) => void;
}) {
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
      const confirmation = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (confirmation.error) throw new Error(confirmation.error.message ?? "Stripe could not confirm the gift payment.");
      const response = await fetch("/api/gift-cards/purchase/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: session.purchaseId,
          purchaseToken: session.purchaseToken,
          claimToken: session.claimToken
        })
      });
      const body = await json<{ gift: ActivatedGift }>(response);
      onActivated(body.gift);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gift payment confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 rounded-[20px] border border-[#C4F24E]/24 bg-black/25 p-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button disabled={!stripe || !elements || busy} className="mt-4 min-h-13 w-full rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-black disabled:opacity-40">{busy ? "Verifying with Stripe…" : `Pay ${money(session.amountCents)} & send`}</button>
      {error ? <p role="alert" className="mt-3 rounded-[14px] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
      <p className="mt-3 font-mono text-[9px] leading-5 text-white/34">Stripe owns the payment fields. BVRB3R activates value only after the server verifies this exact PaymentIntent, amount, currency, and purchase.</p>
    </form>
  );
}

const inputClass = "min-h-12 w-full rounded-[14px] border border-white/12 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/28 focus:border-[#C4F24E]/55";

export function GiftCardWorkspace({
  authenticated,
  initialWallet,
  initialClaimToken = ""
}: {
  authenticated: boolean;
  initialWallet: Wallet | null;
  initialClaimToken?: string;
}) {
  const [tab, setTab] = useState<"buy" | "claim" | "balance">(initialClaimToken ? "claim" : "buy");
  const [amountCents, setAmountCents] = useState(5000);
  const [customDollars, setCustomDollars] = useState("60");
  const [scopeType, setScopeType] = useState<"platform" | "barber" | "shop">("platform");
  const [scopeId, setScopeId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [activated, setActivated] = useState<ActivatedGift | null>(null);
  const [claimToken, setClaimToken] = useState(initialClaimToken);
  const [appointmentId, setAppointmentId] = useState("");
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [scopeCatalog, setScopeCatalog] = useState<ScopeCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const stripePromise = useMemo(() => payment?.publishableKey ? loadStripe(payment.publishableKey) : null, [payment?.publishableKey]);

  useEffect(() => {
    let active = true;
    void fetch("/api/gift-cards/catalog", { cache: "no-store" })
      .then((response) => json<{ catalog: ScopeCatalog }>(response))
      .then((body) => { if (active) setScopeCatalog(body.catalog); })
      .catch(() => { /* A missing catalog leaves scoped purchase choices closed. */ });
    return () => { active = false; };
  }, []);

  async function refreshWallet() {
    if (!authenticated) return;
    const response = await fetch("/api/gift-cards", { cache: "no-store" });
    const body = await json<{ wallet: Wallet }>(response);
    setWallet(body.wallet);
  }

  async function startPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setPayment(null);
    setActivated(null);
    try {
      const response = await fetch("/api/gift-cards/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          scopeType,
          scopeId: scopeType === "platform" ? null : scopeId,
          senderName,
          recipientName,
          deliveryChannel: channel,
          recipientEmail: channel === "email" ? recipient : null,
          recipientPhone: channel === "sms" ? recipient : null,
          message,
          idempotencyKey: `gift:${crypto.randomUUID()}`
        })
      });
      const body = await json<{ payment: PaymentSession }>(response);
      setPayment(body.payment);
    } catch (purchaseError) {
      setNotice({ tone: "error", text: purchaseError instanceof Error ? purchaseError.message : "Gift purchase could not start." });
    } finally {
      setBusy(false);
    }
  }

  async function claim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/gift-cards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken })
      });
      const body = await json<{ giftCard: { balanceCents: number; currency: string } }>(response);
      setNotice({ tone: "success", text: `${money(body.giftCard.balanceCents, body.giftCard.currency)} was added to your account. It never expires.` });
      await refreshWallet();
      setTab("balance");
    } catch (claimError) {
      setNotice({ tone: "error", text: claimError instanceof Error ? claimError.message : "Gift card claim failed." });
    } finally {
      setBusy(false);
    }
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/gift-cards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, idempotencyKey: `gift-redeem:${crypto.randomUUID()}` })
      });
      const body = await json<{ redemption: { appliedCents: number; tipAppliedCents: number } }>(response);
      setNotice({ tone: "success", text: `${money(body.redemption.appliedCents)} applied to the service. Tip applied: ${money(body.redemption.tipAppliedCents)}.` });
      await refreshWallet();
    } catch (redeemError) {
      setNotice({ tone: "error", text: redeemError instanceof Error ? redeemError.message : "Gift balance could not be applied." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#060708] px-4 py-5 text-[#F5F1E8] sm:px-8">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center gap-4">
        <span className="font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Gift cards · a fresh cut, wrapped</span>
        <div className="ml-auto inline-flex rounded-full border border-white/14 p-1">
          {(["buy", "claim", "balance"] as const).map((item) => <button key={item} type="button" onClick={() => { setTab(item); setNotice(null); }} className={cn("min-h-9 rounded-full px-4 font-mono text-[9px] uppercase tracking-[0.14em]", tab === item ? "bg-[#C4F24E] text-black" : "text-white/48")}>{item === "buy" ? "Buy & send" : item === "claim" ? "Receive & redeem" : "Balance"}</button>)}
        </div>
      </header>

      {notice ? <div role={notice.tone === "error" ? "alert" : "status"} className={cn("mx-auto mt-5 max-w-3xl rounded-[16px] border p-4 text-sm", notice.tone === "success" ? "border-[#C4F24E]/30 bg-[#C4F24E]/5 text-[#E4F9B8]" : "border-red-400/25 bg-red-500/10 text-red-100")}>{notice.text}</div> : null}

      {tab === "buy" ? (
        <form onSubmit={(event) => void startPurchase(event)} className="mx-auto mt-8 max-w-5xl">
          <h1 className="font-serif text-4xl font-normal sm:text-5xl">Give somebody a good day.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">Good at any chair on BVRB3R, or lock it to a verified barber or shop. Stripe funds it; the barber receives the full service value.</p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="relative aspect-[8/5] overflow-hidden rounded-[24px] border border-[#D9B461]/45 bg-[linear-gradient(140deg,#141509,#0B0C0D_55%,#101007)] p-6">
              <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_0%,rgba(196,242,78,0.1),transparent_65%)]" />
              <div className="relative flex h-full flex-col"><p className="text-xs font-extrabold tracking-[0.26em]">BVRB<span className="text-[#C4F24E]">3</span>R <span className="ml-2 font-mono text-[8px] tracking-[0.2em] text-[#D9B461]">GIFT CARD</span></p><p className="mt-auto font-serif text-5xl text-[#E4F9B8]">{money(amountCents)}</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/48">{scopeType === "platform" ? "Any chair on BVRB3R" : scopeType === "barber" ? "One verified barber" : "One verified shop"}</p></div>
            </div>
            <div className="space-y-4">
              <div><p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Amount</p><div className="flex flex-wrap gap-2">{[2500, 5000, 7500, 10_000].map((amount) => <button key={amount} type="button" onClick={() => setAmountCents(amount)} className={cn("min-h-11 rounded-full border px-5 font-mono text-xs", amountCents === amount ? "border-[#C4F24E]/55 bg-[#C4F24E]/5 text-[#E4F9B8]" : "border-white/14 text-white/58")}>{money(amount)}</button>)}<label className="flex min-h-11 items-center rounded-full border border-white/14 px-4 font-mono text-xs text-white/58">$<input aria-label="Custom gift amount" type="number" min="10" max="500" step="1" className="ml-1 w-16 bg-transparent outline-none" value={customDollars} onChange={(event) => { setCustomDollars(event.target.value); setAmountCents(Math.round(Number(event.target.value || 0) * 100)); }} /></label></div></div>
              <div><p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Good at</p><div className="flex flex-wrap gap-2">{(["platform", "barber", "shop"] as const).map((scope) => <button key={scope} type="button" onClick={() => { setScopeType(scope); setScopeId(""); }} className={cn("min-h-11 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.1em]", scopeType === scope ? "border-[#D9B461]/55 bg-[#D9B461]/7 text-[#EAD9B0]" : "border-white/14 text-white/58")}>{scope === "platform" ? "Any chair" : `One ${scope}`}</button>)}</div>{scopeType !== "platform" ? <select required className={`${inputClass} mt-3 bg-[#0b0c0d]`} value={scopeId} onChange={(event) => setScopeId(event.target.value)}><option value="">Select a verified {scopeType}</option>{(scopeType === "barber" ? scopeCatalog?.barbers : scopeCatalog?.shops)?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : null}</div>
              <div className="grid gap-3 sm:grid-cols-2"><input required className={inputClass} placeholder="Your name" value={senderName} onChange={(event) => setSenderName(event.target.value)} /><input required className={inputClass} placeholder="Recipient name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></div>
              <div className="flex gap-2"><select aria-label="Delivery channel" value={channel} onChange={(event) => setChannel(event.target.value as "email" | "sms")} className="min-h-12 rounded-[14px] border border-white/12 bg-[#0b0c0d] px-3 text-sm"><option value="email">Email</option><option value="sms">Text</option></select><input required type={channel === "email" ? "email" : "tel"} className={inputClass} placeholder={channel === "email" ? "recipient@example.com" : "+1 555 555 5555"} value={recipient} onChange={(event) => setRecipient(event.target.value)} /></div>
              <textarea maxLength={280} rows={3} className={`${inputClass} py-3`} placeholder="Add a message" value={message} onChange={(event) => setMessage(event.target.value)} />
              {!payment && !activated ? <button disabled={busy} className="min-h-14 w-full rounded-full bg-[#C4F24E] text-sm font-extrabold text-black disabled:opacity-40">{busy ? "Opening Stripe…" : `Continue to Stripe · ${money(amountCents)}`}</button> : null}
              {payment && stripePromise && !activated ? <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#C4F24E" } } }}><GiftPaymentForm session={payment} onActivated={setActivated} /></Elements> : null}
              {activated ? <div className="rounded-[18px] border border-[#C4F24E]/30 bg-[#C4F24E]/5 p-4"><p className="flex items-center gap-2 font-bold text-[#E4F9B8]"><Check className="h-5 w-5" />Gift card active</p><p className="mt-2 text-sm leading-6 text-white/62">{activated.delivery.explanation}</p>{activated.delivery.claimUrl ? <button type="button" onClick={() => void navigator.clipboard.writeText(activated.delivery.claimUrl!)} className="mt-3 flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-bold"><Copy className="h-4 w-4" />Copy secure claim link</button> : null}</div> : null}
              <p className="font-mono text-[9px] leading-5 text-white/34">Paid via Stripe · never expires · services only · tips stay separate · partial balance carries forward.</p>
            </div>
          </div>
        </form>
      ) : null}

      {tab === "claim" ? (
        <section className="mx-auto mt-10 max-w-xl">
          <div className="rounded-[26px] border border-[#D9B461]/45 bg-[#0B0C0D] p-7 text-center"><Gift className="mx-auto h-8 w-8 text-[#D9B461]" /><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[#D9B461]">You&apos;ve been gifted</p><h1 className="mt-3 font-serif text-4xl font-normal text-[#E4F9B8]">Claim it to your account.</h1><p className="mt-3 text-sm leading-6 text-white/58">The secure token binds the paid gift to one account. It cannot cover tips and it never expires.</p>{authenticated ? <form onSubmit={(event) => void claim(event)} className="mt-5"><input required className={`${inputClass} font-mono`} placeholder="Secure claim token" value={claimToken} onChange={(event) => setClaimToken(event.target.value)} /><button disabled={busy} className="mt-3 min-h-13 w-full rounded-full bg-[#C4F24E] text-sm font-extrabold text-black disabled:opacity-40">{busy ? "Claiming…" : "Add to my account"}</button></form> : <Link href={`/login?redirect=${encodeURIComponent(`/gift-cards?claim=${claimToken}`)}`} className="mt-5 inline-flex min-h-13 w-full items-center justify-center rounded-full bg-[#C4F24E] text-sm font-extrabold text-black">Sign in to claim</Link>}</div>
          {authenticated ? <form onSubmit={(event) => void redeem(event)} className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.025] p-5"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Apply at checkout</p><p className="mt-2 text-sm leading-6 text-white/55">Enter your appointment reference. The server applies eligible balance to the service line only.</p><input required className={`${inputClass} mt-4 font-mono`} placeholder="Appointment UUID" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} /><button disabled={busy} className="mt-3 min-h-12 w-full rounded-full border border-[#C4F24E]/45 text-sm font-bold text-[#C4F24E] disabled:opacity-40">Apply eligible gift balance</button><p className="mt-3 font-mono text-[9px] text-white/34">The tip remains due separately. The barber&apos;s full service value becomes a payout obligation.</p></form> : null}
        </section>
      ) : null}

      {tab === "balance" ? (
        <section className="mx-auto mt-10 max-w-3xl">
          {!authenticated ? <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-7 text-center"><WalletCards className="mx-auto h-8 w-8 text-[#C4F24E]" /><h1 className="mt-4 font-serif text-3xl">Your gift balance lives with your account.</h1><Link href="/login?redirect=/gift-cards" className="mt-5 inline-flex min-h-12 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-black">Sign in</Link></div> : <><h1 className="font-serif text-4xl font-normal">Your gift balance</h1><div className="mt-5 flex flex-wrap items-center gap-5 rounded-[22px] border border-[#D9B461]/35 bg-[#D9B461]/[0.045] p-6"><div className="flex-1"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#D9B461]">Available now</p><p className="mt-1 font-serif text-5xl text-[#E4F9B8]">{money(wallet?.availableCents ?? 0, wallet?.currency)}</p></div><p className="font-mono text-[9px] leading-5 text-white/40">Applies automatically when requested at checkout<br />Services only · never expires</p></div><div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.025] p-5"><p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]"><History className="h-4 w-4" />History</p><div className="mt-3 divide-y divide-white/6">{wallet?.history.length ? wallet.history.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-3 text-sm"><span className="min-w-0 flex-1 capitalize text-white/68">{entry.type.replaceAll("_", " ")}</span><span className="font-mono text-[10px] text-white/38">{new Date(entry.createdAt).toLocaleDateString()}</span><span className={cn("w-20 text-right font-mono text-xs", entry.amountCents >= 0 ? "text-[#9BE15D]" : "text-[#E4F9B8]")}>{entry.amountCents >= 0 ? "+" : ""}{money(entry.amountCents)}</span></div>) : <p className="py-6 text-sm text-white/42">No gift-card activity yet.</p>}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{["Never expires", "Service only · never tips", "Barber paid full value"].map((rule) => <div key={rule} className="flex items-center gap-2 rounded-[16px] border border-white/8 bg-black/20 p-3 text-xs text-white/56"><ShieldCheck className="h-4 w-4 shrink-0 text-[#C4F24E]" />{rule}</div>)}</div></>}
        </section>
      ) : null}
    </main>
  );
}
