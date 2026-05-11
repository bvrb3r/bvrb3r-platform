"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import type { PaymentSetupIntentView } from "@/lib/payments/client";

export const STRIPE_CARD_FORM_LOAD_ERROR = "Secure card form failed to load.";

const STRIPE_CARD_READY_TIMEOUT_MS = 5000;
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

type StripeSetupReference =
  | "stripe_publishable_key_missing"
  | "stripe_load_failed"
  | "setup_intent_loading"
  | "setup_intent_ready"
  | "setup_intent_client_secret_missing"
  | "elements_provider_mounted"
  | "card_element_ready"
  | "card_element_focus"
  | "card_element_blur"
  | "card_element_change"
  | "card_element_iframe_detected"
  | "card_element_parent_pointer_events"
  | "card_element_active_element_after_click"
  | "card_element_not_ready_timeout"
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

const CARD_ELEMENT_CONTAINER_CLASS_NAME = "relative z-[50] min-h-[56px] rounded-[16px] border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] p-4";

function logStripeCardFormError(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.error("[payments] stripe card form failed", {
    reference,
    ...(details ?? {})
  });
}

function logStripeCardFormDebug(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.log("[payments] stripe card form state", {
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
  const elementsOptions = useMemo(
    () => clientSecret ? { clientSecret } : undefined,
    [clientSecret]
  );

  useEffect(() => {
    onReadyChange(false);
    onCompleteChange(false);
    onConfirmSetupChange(null);
  }, [clientSecret, onCompleteChange, onConfirmSetupChange, onReadyChange, publishableKey]);

  useEffect(() => {
    if (isSetupIntentLoading) {
      logStripeCardFormDebug("setup_intent_loading");
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
    logStripeCardFormDebug("setup_intent_ready", {
      hasClientSecret: Boolean(clientSecret),
      hasPublishableKey: Boolean(publishableKey)
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
  const showReady = Boolean(showStripeElement && elementReady && !elementFailed);
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
      {!showStripeElement ? (
        <div
          className={CARD_ELEMENT_CONTAINER_CLASS_NAME}
          style={{ pointerEvents: "auto", cursor: "text" }}
          aria-label="Card number, MM/YY, CVC, and ZIP"
          data-testid="stripe-card-element-container"
          data-stripe-card-host="true"
        />
      ) : null}
      {showStripeElement && elementsOptions ? (
        <Elements stripe={stripePromise} options={elementsOptions}>
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
      {showLoading ? (
        <p className="mt-3 text-sm text-white/50">Loading secure card form...</p>
      ) : null}
      {showReady ? (
        <p className="mt-3 text-sm text-[#baff69]/70">Secure card form ready.</p>
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
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const readyRef = useRef(false);

  const cardElementOptions = useMemo(() => ({
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
  }), []);

  const markFailed = useCallback((reference: StripeSetupReference, details?: Record<string, unknown>) => {
    logStripeCardFormError(reference, details);
    onElementFailure();
    onReadyChange(false);
    onStatusChange("error");
    onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
  }, [onElementFailure, onErrorMessage, onReadyChange, onStatusChange]);

  useEffect(() => {
    logStripeCardFormDebug("elements_provider_mounted", {
      hasStripe: Boolean(stripe),
      hasElements: Boolean(elements)
    });
  }, [elements, stripe]);

  useEffect(() => {
    readyRef.current = false;

    const timeout = window.setTimeout(() => {
      if (readyRef.current) {
        return;
      }

      markFailed("card_element_not_ready_timeout", {
        reason: "ready_timeout"
      });
    }, STRIPE_CARD_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clientSecret, markFailed]);

  useEffect(() => {
    if (!stripe || !elements) {
      onConfirmSetupChange(null);
      return;
    }

    onConfirmSetupChange(async () => {
      const card = elements.getElement(CardElement);
      if (!card) {
        markFailed("card_element_not_ready_timeout", {
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

  const logActiveElementAfterClick = useCallback((reason: string) => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      logStripeCardFormDebug("card_element_active_element_after_click", {
        reason,
        tagName: activeElement?.tagName?.toLowerCase() ?? null,
        title: activeElement?.getAttribute("title") ?? null,
        ariaLabel: activeElement?.getAttribute("aria-label") ?? null
      });
    });
  }, []);

  const logPointerDiagnostics = useCallback((reason: string) => {
    const host = elementHostRef.current;
    const ancestors: Array<Record<string, unknown>> = [];
    let node: HTMLElement | null = host;

    for (let depth = 0; node && depth < 6; depth += 1) {
      const style = window.getComputedStyle(node);
      ancestors.push({
        depth,
        tagName: node.tagName.toLowerCase(),
        dataStripeHost: node.getAttribute("data-stripe-card-host"),
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        ariaDisabled: node.getAttribute("aria-disabled"),
        disabled: node.hasAttribute("disabled")
      });
      node = node.parentElement;
    }

    logStripeCardFormDebug("card_element_parent_pointer_events", {
      reason,
      ancestors
    });
  }, []);

  const readIframeDiagnostics = useCallback((reason: string) => {
    const host = elementHostRef.current;
    const iframe = host?.querySelector("iframe") ?? null;
    const hostStyle = host ? window.getComputedStyle(host) : null;
    const hostRect = host?.getBoundingClientRect();
    const iframeRect = iframe?.getBoundingClientRect();
    const diagnostics = {
      reason,
      iframeExists: Boolean(iframe),
      hostHeight: hostRect?.height ?? null,
      hostWidth: hostRect?.width ?? null,
      iframeHeight: iframeRect?.height ?? null,
      iframeWidth: iframeRect?.width ?? null,
      pointerEvents: hostStyle?.pointerEvents ?? null,
      position: hostStyle?.position ?? null,
      zIndex: hostStyle?.zIndex ?? null
    };

    logStripeCardFormDebug("card_element_iframe_detected", diagnostics);
    logPointerDiagnostics(reason);

    return {
      hasInteractiveIframe: Boolean(host && iframe)
        && (hostRect?.height ?? 0) > 0
        && (iframeRect?.height ?? 0) > 0
        && hostStyle?.pointerEvents !== "none",
      diagnostics
    };
  }, [logPointerDiagnostics]);

  const verifyMountedIframe = useCallback((cardElement: StripeCardElement) => {
    cardElementRef.current = cardElement;
    readyRef.current = true;
    logStripeCardFormDebug("card_element_ready");
    onReadyChange(true);
    onStatusChange("ready");
    onErrorMessage(null);

    window.requestAnimationFrame(() => {
      const { hasInteractiveIframe, diagnostics } = readIframeDiagnostics("ready");
      if (!hasInteractiveIframe) {
        markFailed("card_element_not_ready_timeout", {
          ...diagnostics,
          failureReason: "iframe_missing_or_not_interactive_after_ready"
        });
        return;
      }
    });
  }, [markFailed, onErrorMessage, onReadyChange, onStatusChange, readIframeDiagnostics]);

  const handleHostClick = useCallback(() => {
    readIframeDiagnostics("click");
    cardElementRef.current?.focus();
    logActiveElementAfterClick("click");
  }, [logActiveElementAfterClick, readIframeDiagnostics]);

  const handleFocus = useCallback(() => {
    logStripeCardFormDebug("card_element_focus");
    readIframeDiagnostics("focus");
    logActiveElementAfterClick("focus");
  }, [logActiveElementAfterClick, readIframeDiagnostics]);

  const handleBlur = useCallback(() => {
    logStripeCardFormDebug("card_element_blur");
  }, []);

  const handleChange = useCallback((event: Parameters<NonNullable<ComponentProps<typeof CardElement>["onChange"]>>[0]) => {
    logStripeCardFormDebug("card_element_change", {
      complete: Boolean(event.complete),
      empty: Boolean(event.empty),
      error: event.error?.message ?? null
    });
    onCompleteChange(Boolean(event.complete));
    if (event.error?.message) {
      onErrorMessage(event.error.message);
    } else if (event.complete) {
      onErrorMessage(null);
    }
  }, [onCompleteChange, onErrorMessage]);

  const handleLoadError = useCallback((event: Parameters<NonNullable<ComponentProps<typeof CardElement>["onLoadError"]>>[0]) => {
    markFailed("card_element_load_error", {
      message: event.error?.message ?? null
    });
  }, [markFailed]);

  return (
    <div
      ref={elementHostRef}
      className={CARD_ELEMENT_CONTAINER_CLASS_NAME}
      style={{ pointerEvents: "auto", cursor: "text" }}
      aria-label="Card number, MM/YY, CVC, and ZIP"
      data-testid="stripe-card-element-container"
      data-stripe-card-host="true"
      onClick={handleHostClick}
    >
      <CardElement
        className="relative z-[60] block min-h-[24px] w-full"
        onReady={verifyMountedIframe}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onLoadError={handleLoadError}
        options={cardElementOptions}
      />
    </div>
  );
}
