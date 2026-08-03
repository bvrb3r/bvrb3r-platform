"use client";

import { FormEvent, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Check, ShieldCheck } from "lucide-react";

type PaymentView = {
  memberName: string;
  amountCents: number;
  currency: string;
  appointmentId: string;
  clientSecret: string | null;
  publishableKey: string | null;
  paymentStatus: string;
  alreadyPaid: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(cents / 100);
}

function PaymentFields({
  payment,
  returnUrl
}: {
  payment: PaymentView;
  returnUrl: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required"
    });
    if (result.error) {
      setError(result.error.message ?? "Stripe could not confirm this payment.");
      setBusy(false);
      return;
    }
    if (result.paymentIntent?.status !== "succeeded") {
      setError("Stripe has not verified this payment yet. Follow the provider instructions or try again.");
      setBusy(false);
      return;
    }
    setPaid(true);
    setBusy(false);
  }

  if (paid) {
    return (
      <div role="status" className="mt-6 rounded-[18px] border border-[#C4F24E]/30 bg-[#C4F24E]/5 p-5 text-[#E4F9B8]">
        <p className="flex items-center gap-2 font-bold"><Check className="h-5 w-5" />Stripe verified the payment.</p>
        <p className="mt-2 text-sm leading-6 text-white/60">The signed webhook will reconcile this exact appointment and payment ledger. No other group member was charged.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 rounded-[20px] border border-white/10 bg-black/25 p-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button disabled={!stripe || !elements || busy} className="mt-4 min-h-14 w-full rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-black disabled:opacity-40">
        {busy ? "Verifying with Stripe…" : `Pay ${money(payment.amountCents, payment.currency)}`}
      </button>
      {error ? <p role="alert" className="mt-3 rounded-[14px] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
      <p className="mt-3 font-mono text-[9px] leading-5 text-white/34">Stripe owns the card fields. BVRB3R accepts this result only for the exact signed group member, appointment, amount, and currency in this link.</p>
    </form>
  );
}

export function GroupSplitPaymentForm({
  payment,
  returnUrl
}: {
  payment: PaymentView;
  returnUrl: string;
}) {
  const stripePromise = useMemo(
    () => payment.publishableKey ? loadStripe(payment.publishableKey) : null,
    [payment.publishableKey]
  );

  if (payment.alreadyPaid) {
    return (
      <div role="status" className="mt-6 rounded-[18px] border border-[#C4F24E]/30 bg-[#C4F24E]/5 p-5 text-[#E4F9B8]">
        <p className="flex items-center gap-2 font-bold"><Check className="h-5 w-5" />Already paid through Stripe.</p>
        <p className="mt-2 text-sm leading-6 text-white/60">This link cannot create a second payment for the appointment.</p>
      </div>
    );
  }

  if (payment.paymentStatus === "processing") {
    return (
      <div role="status" className="mt-6 rounded-[18px] border border-[#C9A87C]/30 bg-[#C9A87C]/5 p-5 text-[#F5E1C4]">
        <p className="font-bold">Stripe is processing this payment.</p>
        <p className="mt-2 text-sm leading-6 text-white/60">This page will not submit a second payment. The signed webhook will reconcile the appointment when Stripe reaches a final result.</p>
      </div>
    );
  }

  if (!stripePromise || !payment.clientSecret) {
    return (
      <div role="alert" className="mt-6 rounded-[18px] border border-amber-300/25 bg-amber-300/5 p-5 text-amber-100">
        Stripe payment fields are temporarily unavailable. No charge was created. Ask the organizer or shop for help.
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/58">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A87C]" />
        This link covers {payment.memberName}&apos;s appointment only. Other group members keep separate payment responsibility.
      </div>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: payment.clientSecret,
          appearance: { theme: "night", variables: { colorPrimary: "#C4F24E" } }
        }}
      >
        <PaymentFields payment={payment} returnUrl={returnUrl} />
      </Elements>
    </>
  );
}
