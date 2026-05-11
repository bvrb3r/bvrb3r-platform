"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import type { PaymentSetupIntentView } from "@/lib/payments/client";

export const STRIPE_CARD_FORM_LOAD_ERROR = "Secure card form failed to load. Stripe setup is not ready.";

const STRIPE_CARD_READY_TIMEOUT_MS = 5000;
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

type StripeSetupReference =
  | "stripe_publishable_key_missing"
  | "stripe_load_failed"
  | "setup_intent_client_secret_missing"
  | "card_element_not_ready"
  | "card_element_load_error";

export type ConfirmStripeCardSetup = () => Promise<string>;

type StripeCardOnFileFormProps = {
  setupIntent: PaymentSetupIntentView | null;
  isSetupIntentLoading: boolean;
  onReadyChange: (ready: boolean) => void;
  onCompleteChange: (complete: boolean) => void;
  onErrorMessage: (message: string | null) => void;
  onStatusChange: (status: "idle" | "loading" | "ready" | "error") => void;
  onConfirmSetupChange: (confirmSetup: ConfirmStripeCardSetup | null) => void;
};

function logStripeCardFormError(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.error("[payments] stripe card form failed", {
    reference,
    ...(details ?? {})
  });
}

function getStripePromise(publishableKey: string) {
  const key = publishableKey.trim();
  if (!key) {
    return null;
  }

  const cached = stripePromiseCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = loadStripe(key);
  stripePromiseCache.set(key, promise);
  return promise;
}

function getStripePaymentMethodId(paymentMethod: string | { id?: string } | null | undefined) {
  if (typeof paymentMethod === "string") {
    return paymentMethod;
  }

  return paymentMethod?.id ?? "";
}

export function StripeCardOnFileForm({
  setupIntent,
  isSetupIntentLoading,
  onReadyChange,
  onCompleteChange,
  onErrorMessage,
  onStatusChange,
  onConfirmSetupChange
}: StripeCardOnFileFormProps) {
  const publishableKey = setupIntent?.publishableKey?.trim() ?? "";
  const clientSecret = setupIntent?.clientSecret?.trim() ?? "";
  const activeSetupKey = `${publishableKey}:${clientSecret}`;
  const [stripeLoadState, setStripeLoadState] = useState<{
    key: string;
    status: "idle" | "loading" | "ready" | "error";
  }>({
    key: "",
    status: "idle"
  });
  const [elementState, setElementState] = useState({
    key: "",
    ready: false,
    failed: false
  });
  const stripeReady = stripeLoadState.key === publishableKey && stripeLoadState.status === "ready";
  const stripeLoadFailed = stripeLoadState.key === publishableKey && stripeLoadState.status === "error";
  const elementReady = elementState.key === activeSetupKey && elementState.ready;
  const elementFailed = elementState.key === activeSetupKey && elementState.failed;

  const stripePromise = useMemo(
    () => getStripePromise(publishableKey),
    [publishableKey]
  );

  useEffect(() => {
    onReadyChange(false);
    onCompleteChange(false);
    onConfirmSetupChange(null);
  }, [clientSecret, onCompleteChange, onConfirmSetupChange, onReadyChange, publishableKey]);

  useEffect(() => {
    if (isSetupIntentLoading) {
      onStatusChange("loading");
      onErrorMessage(null);
      return;
    }

    if (!setupIntent) {
      return;
    }

    if (!clientSecret) {
      logStripeCardFormError("setup_intent_client_secret_missing");
      onStatusChange("error");
      onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
      return;
    }

    if (!publishableKey || !stripePromise) {
      logStripeCardFormError("stripe_publishable_key_missing");
      onStatusChange("error");
      onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
      return;
    }

    let cancelled = false;
    setStripeLoadState({
      key: publishableKey,
      status: "loading"
    });
    onStatusChange("loading");
    onErrorMessage(null);
    stripePromise
      .then((stripe) => {
        if (cancelled) {
          return;
        }

        if (!stripe) {
          logStripeCardFormError("stripe_load_failed", {
            reason: "load_stripe_returned_null"
          });
          stripePromiseCache.delete(publishableKey);
          onStatusChange("error");
          onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
          setStripeLoadState({
            key: publishableKey,
            status: "error"
          });
          return;
        }

        setStripeLoadState({
          key: publishableKey,
          status: "ready"
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        logStripeCardFormError("stripe_load_failed", {
          message: error instanceof Error ? error.message : "Unknown Stripe load failure"
        });
        setStripeLoadState({
          key: publishableKey,
          status: "error"
        });
        onStatusChange("error");
        onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
      });

    return () => {
      cancelled = true;
    };
  }, [clientSecret, isSetupIntentLoading, onErrorMessage, onStatusChange, publishableKey, setupIntent, stripePromise]);

  const showStripeElement = Boolean(clientSecret && publishableKey && stripePromise && stripeReady && !stripeLoadFailed);
  const showLoading = isSetupIntentLoading
    || Boolean(clientSecret && publishableKey && stripePromise && !stripeLoadFailed && !stripeReady)
    || Boolean(showStripeElement && !elementReady && !elementFailed);
  const handleReadyChange = useCallback((ready: boolean) => {
    setElementState((current) => {
      const nextFailed = ready ? false : current.key === activeSetupKey && current.failed;
      if (current.key === activeSetupKey && current.ready === ready && current.failed === nextFailed) {
        return current;
      }

      return {
        key: activeSetupKey,
        ready,
        failed: nextFailed
      };
    });
    onReadyChange(ready);
  }, [activeSetupKey, onReadyChange]);
  const handleElementFailure = useCallback(() => {
    setElementState((current) => {
      if (current.key === activeSetupKey && !current.ready && current.failed) {
        return current;
      }

      return {
        key: activeSetupKey,
        ready: false,
        failed: true
      };
    });
  }, [activeSetupKey]);

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1.45fr_0.7fr_0.55fr_0.7fr] gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
        <span>Card number</span>
        <span>MM/YY</span>
        <span>CVC</span>
        <span>ZIP</span>
      </div>
      <div
        className="relative z-[1] min-h-[56px] rounded-[16px] border border-white/10 bg-[#101010] px-4 py-4"
        style={{ pointerEvents: "auto" }}
        aria-label="Card number, MM/YY, CVC, and ZIP"
        data-testid="stripe-card-element-container"
        data-stripe-card-host="true"
      >
        {showStripeElement ? (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <StripeCardElementFields
              clientSecret={clientSecret}
              onReadyChange={handleReadyChange}
              onCompleteChange={onCompleteChange}
              onErrorMessage={onErrorMessage}
              onStatusChange={onStatusChange}
              onElementFailure={handleElementFailure}
              onConfirmSetupChange={onConfirmSetupChange}
            />
          </Elements>
        ) : null}
      </div>
      {showLoading ? (
        <p className="mt-3 text-sm text-white/50">Loading secure card form...</p>
      ) : null}
    </div>
  );
}

function StripeCardElementFields({
  clientSecret,
  onReadyChange,
  onCompleteChange,
  onErrorMessage,
  onStatusChange,
  onElementFailure,
  onConfirmSetupChange
}: Omit<StripeCardOnFileFormProps, "setupIntent" | "isSetupIntentLoading"> & {
  clientSecret: string;
  onElementFailure: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const elementHostRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);

  const markFailed = useCallback((reference: StripeSetupReference, details?: Record<string, unknown>) => {
    logStripeCardFormError(reference, details);
    onElementFailure();
    onReadyChange(false);
    onStatusChange("error");
    onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
  }, [onElementFailure, onErrorMessage, onReadyChange, onStatusChange]);

  useEffect(() => {
    readyRef.current = false;
    onReadyChange(false);
    onCompleteChange(false);
    onConfirmSetupChange(null);
    onStatusChange("loading");
    onErrorMessage(null);

    const timeout = window.setTimeout(() => {
      if (readyRef.current) {
        return;
      }

      markFailed("card_element_not_ready", {
        reason: "ready_timeout"
      });
    }, STRIPE_CARD_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clientSecret, markFailed, onCompleteChange, onConfirmSetupChange, onErrorMessage, onReadyChange, onStatusChange]);

  useEffect(() => {
    if (!stripe || !elements) {
      onConfirmSetupChange(null);
      return;
    }

    onConfirmSetupChange(async () => {
      const card = elements.getElement(CardElement);
      if (!card) {
        markFailed("card_element_not_ready", {
          reason: "card_element_missing_at_confirm"
        });
        throw new Error(STRIPE_CARD_FORM_LOAD_ERROR);
      }

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card
        }
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Card could not be saved.");
      }

      const providerPaymentMethodId = getStripePaymentMethodId(result.setupIntent?.payment_method);
      if (!providerPaymentMethodId) {
        throw new Error("Stripe did not return a saved card reference.");
      }

      return providerPaymentMethodId;
    });

    return () => {
      onConfirmSetupChange(null);
    };
  }, [clientSecret, elements, markFailed, onConfirmSetupChange, stripe]);

  const verifyMountedIframe = useCallback((cardElement: StripeCardElement) => {
    readyRef.current = true;
    onReadyChange(true);
    onStatusChange("ready");
    onErrorMessage(null);
    cardElement.focus();

    window.requestAnimationFrame(() => {
      const host = elementHostRef.current;
      const iframe = host?.querySelector("iframe") ?? null;
      const hostStyle = host ? window.getComputedStyle(host) : null;
      const hostRect = host?.getBoundingClientRect();
      const iframeRect = iframe?.getBoundingClientRect();

      if (!host || !iframe) {
        logStripeCardFormError("card_element_not_ready", {
          reason: "iframe_diagnostic_missing_after_ready",
          hostHeight: hostRect?.height ?? null,
          iframeHeight: iframeRect?.height ?? null,
          pointerEvents: hostStyle?.pointerEvents ?? null
        });
        return;
      }

      if ((hostRect?.height ?? 0) <= 0 || (iframeRect?.height ?? 0) <= 0 || hostStyle?.pointerEvents === "none") {
        markFailed("card_element_not_ready", {
          reason: "iframe_not_visible_or_interactive",
          hostHeight: hostRect?.height ?? null,
          iframeHeight: iframeRect?.height ?? null,
          pointerEvents: hostStyle?.pointerEvents ?? null
        });
        return;
      }
    });
  }, [markFailed, onErrorMessage, onReadyChange, onStatusChange]);

  return (
    <div ref={elementHostRef} className="min-h-6 w-full" style={{ pointerEvents: "auto" }}>
      <CardElement
        className="block min-h-6 w-full"
        onReady={verifyMountedIframe}
        onChange={(event) => {
          onCompleteChange(Boolean(event.complete));
          if (event.error?.message) {
            onErrorMessage(event.error.message);
          } else if (event.complete) {
            onErrorMessage(null);
          }
        }}
        onLoadError={(event) => {
          markFailed("card_element_load_error", {
            message: event.error?.message ?? null
          });
        }}
        options={{
          hidePostalCode: false,
          style: {
            base: {
              color: "#ffffff",
              fontSize: "16px",
              fontFamily: "Inter, system-ui, sans-serif",
              "::placeholder": {
                color: "#8a8a8a"
              }
            },
            invalid: {
              color: "#ff6b6b"
            }
          }
        }}
      />
    </div>
  );
}
