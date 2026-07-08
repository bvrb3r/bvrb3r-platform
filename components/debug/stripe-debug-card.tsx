"use client";

import { useEffect, useMemo, useState } from "react";
import { CardNumberElement, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type SetupIntentResponse = {
  clientSecret?: string;
  publishableKey?: string;
  customerId?: string;
  error?: string;
};

type MinimalStatus = {
  setupIntent: "idle" | "loading" | "ready" | "failed";
  stripe: "idle" | "loading" | "ready" | "failed";
  cardNumber: "waiting" | "ready" | "focused" | "changed" | "failed";
  message: string | null;
  clientSecretPrefix: string;
  publishableKeyPrefix: string;
};

function getPublishableKeyPrefix(publishableKey?: string) {
  if (!publishableKey) {
    return "missing";
  }

  if (publishableKey.startsWith("pk_test_")) {
    return "pk_test";
  }

  if (publishableKey.startsWith("pk_live_")) {
    return "pk_live";
  }

  return "invalid";
}

function getClientSecretPrefix(clientSecret?: string) {
  if (!clientSecret) {
    return "missing";
  }

  if (clientSecret.startsWith("seti_")) {
    return "seti";
  }

  if (clientSecret.startsWith("pi_")) {
    return "pi";
  }

  return "invalid";
}

export function StripeDebugCard() {
  const [setupIntent, setSetupIntent] = useState<SetupIntentResponse | null>(null);
  const [status, setStatus] = useState<MinimalStatus>({
    setupIntent: "idle",
    stripe: "idle",
    cardNumber: "waiting",
    message: null,
    clientSecretPrefix: "missing",
    publishableKeyPrefix: "missing"
  });

  useEffect(() => {
    let cancelled = false;
    setStatus((current) => ({
      ...current,
      setupIntent: "loading",
      message: "Creating SetupIntent..."
    }));
    console.log("[payments] stripe_minimal_test_setup_started", {
      reference: "stripe_minimal_test_setup_started"
    });

    fetch("/api/payments/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "stripe_minimal_test" })
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as SetupIntentResponse;
        if (cancelled) {
          return;
        }

        console.log("[payments] stripe_minimal_test_setup_response", {
          reference: "stripe_minimal_test_setup_response",
          ok: response.ok,
          status: response.status,
          hasClientSecret: Boolean(body.clientSecret),
          clientSecretPrefix: getClientSecretPrefix(body.clientSecret),
          hasPublishableKey: Boolean(body.publishableKey),
          publishableKeyPrefix: getPublishableKeyPrefix(body.publishableKey)
        });

        if (!response.ok || !body.clientSecret || !body.publishableKey) {
          setStatus({
            setupIntent: "failed",
            stripe: "failed",
            cardNumber: "failed",
            message: body.error ?? "SetupIntent was not created.",
            clientSecretPrefix: getClientSecretPrefix(body.clientSecret),
            publishableKeyPrefix: getPublishableKeyPrefix(body.publishableKey)
          });
          return;
        }

        setSetupIntent(body);
        setStatus({
          setupIntent: "ready",
          stripe: "loading",
          cardNumber: "waiting",
          message: "SetupIntent ready. Loading Stripe.js...",
          clientSecretPrefix: getClientSecretPrefix(body.clientSecret),
          publishableKeyPrefix: getPublishableKeyPrefix(body.publishableKey)
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("[payments] stripe_minimal_test_setup_failed", {
          reference: "stripe_minimal_test_setup_failed",
          message: error instanceof Error ? error.message : "Unknown setup failure"
        });
        setStatus((current) => ({
          ...current,
          setupIntent: "failed",
          stripe: "failed",
          cardNumber: "failed",
          message: "SetupIntent request failed."
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stripePromise = useMemo(
    () => setupIntent?.publishableKey ? loadStripe(setupIntent.publishableKey) : null,
    [setupIntent?.publishableKey]
  );

  useEffect(() => {
    if (!stripePromise) {
      return;
    }

    let cancelled = false;
    stripePromise
      .then((stripe) => {
        if (cancelled) {
          return;
        }

        setStatus((current) => ({
          ...current,
          stripe: stripe ? "ready" : "failed",
          message: stripe ? "Stripe.js ready. Waiting for CardNumberElement..." : "Stripe.js returned null."
        }));
        console.log("[payments] stripe_minimal_test_stripe_resolved", {
          reference: "stripe_minimal_test_stripe_resolved",
          stripeResolved: Boolean(stripe)
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("[payments] stripe_minimal_test_stripe_failed", {
          reference: "stripe_minimal_test_stripe_failed",
          message: error instanceof Error ? error.message : "Unknown Stripe load failure"
        });
        setStatus((current) => ({
          ...current,
          stripe: "failed",
          cardNumber: "failed",
          message: "Stripe.js failed to load."
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [stripePromise]);

  return (
    <div className="mx-auto max-w-3xl rounded-[24px] border border-white/10 bg-black p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f985]">Stripe minimal test</p>
      <h1 className="mt-3 text-2xl font-semibold">Minimal CardNumberElement mount</h1>
      <p className="mt-3 text-sm leading-7 text-white/60">
        This bypasses BVRB3R wallet wrappers. If typing works here, the issue is layout/CSS around the wallet form.
        If typing fails here, the issue is Stripe setup, client secret, publishable key, CSP, or Stripe.js loading.
      </p>

      <dl className="mt-5 grid gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt className="text-white/45">setupIntent</dt><dd>{status.setupIntent}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-white/45">stripe</dt><dd>{status.stripe}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-white/45">cardNumber</dt><dd>{status.cardNumber}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-white/45">clientSecret</dt><dd>{status.clientSecretPrefix}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-white/45">publishableKey</dt><dd>{status.publishableKeyPrefix}</dd></div>
      </dl>

      {status.message ? (
        <p className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">{status.message}</p>
      ) : null}

      {stripePromise && setupIntent?.clientSecret ? (
        <div className="mt-6 rounded-[18px] border border-[#d9f985]/20 bg-white/[0.04] p-5">
          <Elements stripe={stripePromise}>
            <CardNumberElement
              options={{
                showIcon: true,
                placeholder: "4242 4242 4242 4242",
                style: {
                  base: {
                    color: "#ffffff",
                    fontSize: "18px",
                    "::placeholder": { color: "#8a8a8a" }
                  },
                  invalid: { color: "#ff6b6b" }
                }
              }}
              onReady={() => {
                console.log("[payments] stripe_minimal_test_card_number_ready", {
                  reference: "stripe_minimal_test_card_number_ready"
                });
                setStatus((current) => ({
                  ...current,
                  cardNumber: "ready",
                  message: "CardNumberElement ready. Click the field and type 4242 4242 4242 4242."
                }));
              }}
              onFocus={() => {
                console.log("[payments] stripe_minimal_test_card_number_focus", {
                  reference: "stripe_minimal_test_card_number_focus"
                });
                setStatus((current) => ({
                  ...current,
                  cardNumber: "focused"
                }));
              }}
              onChange={(event) => {
                console.log("[payments] stripe_minimal_test_card_number_change", {
                  reference: "stripe_minimal_test_card_number_change",
                  complete: event.complete,
                  empty: event.empty,
                  error: event.error?.message ?? null
                });
                setStatus((current) => ({
                  ...current,
                  cardNumber: "changed",
                  message: event.complete ? "Card number complete." : "Card number received input."
                }));
              }}
            />
          </Elements>
        </div>
      ) : null}
    </div>
  );
}
