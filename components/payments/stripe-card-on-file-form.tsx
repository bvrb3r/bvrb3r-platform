"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  PostalCodeElement,
  useElements,
  useStripe
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripeCardCvcElement,
  type StripeCardExpiryElement,
  type StripeCardNumberElement,
  type StripePostalCodeElement
} from "@stripe/stripe-js";
import type { PaymentSetupIntentView } from "@/lib/payments/client";

export const STRIPE_CARD_FORM_LOAD_ERROR = "Secure card form failed to load.";

const STRIPE_CARD_READY_TIMEOUT_MS = 8000;
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

type StripeSetupReference =
  | "stripe_publishable_key_missing"
  | "stripe_load_failed"
  | "setup_intent_loading"
  | "setup_intent_ready"
  | "setup_intent_client_secret_missing"
  | "elements_provider_mounted"
  | "split_elements_ready"
  | "split_element_ready"
  | "split_element_focus"
  | "split_element_blur"
  | "split_element_change"
  | "split_element_iframe_detected"
  | "split_element_not_ready_timeout"
  | "split_element_load_error";

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

type SplitFieldName = "cardNumber" | "cardExpiry" | "cardCvc" | "postalCode";

type SplitFieldState = Record<SplitFieldName, {
  ready: boolean;
  complete: boolean;
  error: string | null;
}>;

const EMPTY_SPLIT_FIELD_STATE: SplitFieldState = {
  cardNumber: { ready: false, complete: false, error: null },
  cardExpiry: { ready: false, complete: false, error: null },
  cardCvc: { ready: false, complete: false, error: null },
  postalCode: { ready: false, complete: false, error: null }
};

const FIELD_CONTAINER_CLASS_NAME = "relative z-[50] min-h-[56px] rounded-[16px] border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-4";
const FIELD_LABEL_CLASS_NAME = "mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42";

function logStripeCardFormError(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.error("[payments] stripe split card form failed", {
    reference,
    ...(details ?? {})
  });
}

function logStripeCardFormDebug(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.log("[payments] stripe split card form state", {
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

function isSplitFieldStateReady(state: SplitFieldState) {
  return state.cardNumber.ready && state.cardExpiry.ready && state.cardCvc.ready && state.postalCode.ready;
}

function isSplitFieldStateComplete(state: SplitFieldState) {
  return state.cardNumber.complete && state.cardExpiry.complete && state.cardCvc.complete && state.postalCode.complete;
}

function getFirstSplitFieldError(state: SplitFieldState) {
  return state.cardNumber.error ?? state.cardExpiry.error ?? state.cardCvc.error ?? state.postalCode.error ?? null;
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
    setElementState({
      key: activeSetupKey,
      ready: false,
      failed: false
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
  }, [activeSetupKey, clientSecret, isSetupIntentLoading, onErrorMessage, onStatusChange, publishableKey, setupIntent, stripePromise]);

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
      {!showStripeElement ? (
        <div className="grid gap-3 sm:grid-cols-[1.45fr_0.7fr_0.55fr_0.7fr]">
          <EmptyStripeField label="Card number" />
          <EmptyStripeField label="MM/YY" />
          <EmptyStripeField label="CVC" />
          <EmptyStripeField label="ZIP" />
        </div>
      ) : null}
      {showStripeElement && elementsOptions ? (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <StripeSplitCardElementFields
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

function EmptyStripeField({ label }: { label: string }) {
  return (
    <div>
      <label className={FIELD_LABEL_CLASS_NAME}>{label}</label>
      <div
        className={FIELD_CONTAINER_CLASS_NAME}
        style={{ pointerEvents: "auto", cursor: "text" }}
        aria-label={label}
        data-testid={`stripe-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-placeholder`}
      />
    </div>
  );
}

function StripeSplitCardElementFields({
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
  const [fieldState, setFieldState] = useState<SplitFieldState>(EMPTY_SPLIT_FIELD_STATE);
  const readyRef = useRef(false);
  const cardNumberRef = useRef<StripeCardNumberElement | null>(null);
  const cardExpiryRef = useRef<StripeCardExpiryElement | null>(null);
  const cardCvcRef = useRef<StripeCardCvcElement | null>(null);
  const postalCodeRef = useRef<StripePostalCodeElement | null>(null);
  const postalCodeValueRef = useRef("");
  const fieldHostRefs = useRef<Record<SplitFieldName, HTMLDivElement | null>>({
    cardNumber: null,
    cardExpiry: null,
    cardCvc: null,
    postalCode: null
  });

  const elementStyle = useMemo(() => ({
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
  }), []);

  const cardNumberOptions = useMemo(() => ({
    showIcon: true,
    style: elementStyle
  }), [elementStyle]);
  const smallFieldOptions = useMemo(() => ({
    style: elementStyle
  }), [elementStyle]);

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
    setFieldState(EMPTY_SPLIT_FIELD_STATE);
    onReadyChange(false);
    onCompleteChange(false);

    const timeout = window.setTimeout(() => {
      if (readyRef.current) {
        return;
      }

      markFailed("split_element_not_ready_timeout", {
        reason: "ready_timeout",
        fieldState
      });
    }, STRIPE_CARD_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
    // fieldState intentionally excluded so the timeout reflects the initial mount window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, markFailed, onCompleteChange, onReadyChange]);

  useEffect(() => {
    const ready = isSplitFieldStateReady(fieldState);
    const complete = isSplitFieldStateComplete(fieldState);
    const firstError = getFirstSplitFieldError(fieldState);

    if (ready && !readyRef.current) {
      readyRef.current = true;
      logStripeCardFormDebug("split_elements_ready", {
        fields: Object.fromEntries(Object.entries(fieldState).map(([field, state]) => [field, state.ready]))
      });
      onReadyChange(true);
      onStatusChange("ready");
      onErrorMessage(firstError);
    }

    onCompleteChange(complete);
    if (firstError) {
      onErrorMessage(firstError);
    } else if (complete) {
      onErrorMessage(null);
    }
  }, [fieldState, onCompleteChange, onErrorMessage, onReadyChange, onStatusChange]);

  useEffect(() => {
    if (!stripe || !elements) {
      onConfirmSetupChange(null);
      return;
    }

    onConfirmSetupChange(async () => {
      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) {
        markFailed("split_element_not_ready_timeout", {
          reason: "card_number_element_missing_at_confirm"
        });
        throw new Error(STRIPE_CARD_FORM_LOAD_ERROR);
      }

      const postalCode = postalCodeValueRef.current.trim();
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: postalCode ? {
            address: {
              postal_code: postalCode
            }
          } : undefined
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

  const setHostRef = useCallback((field: SplitFieldName, node: HTMLDivElement | null) => {
    fieldHostRefs.current[field] = node;
  }, []);

  const updateField = useCallback((field: SplitFieldName, update: Partial<SplitFieldState[SplitFieldName]>) => {
    setFieldState((current) => ({
      ...current,
      [field]: {
        ...current[field],
        ...update
      }
    }));
  }, []);

  const readIframeDiagnostics = useCallback((field: SplitFieldName, reason: string) => {
    const host = fieldHostRefs.current[field];
    const iframe = host?.querySelector("iframe") ?? null;
    const hostStyle = host ? window.getComputedStyle(host) : null;
    const hostRect = host?.getBoundingClientRect();
    const iframeRect = iframe?.getBoundingClientRect();
    const diagnostics = {
      field,
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

    logStripeCardFormDebug("split_element_iframe_detected", diagnostics);

    return {
      hasInteractiveIframe: Boolean(host && iframe)
        && (hostRect?.height ?? 0) > 0
        && (iframeRect?.height ?? 0) > 0
        && hostStyle?.pointerEvents !== "none",
      diagnostics
    };
  }, []);

  const handleReady = useCallback((field: SplitFieldName) => {
    return (
      element: StripeCardNumberElement | StripeCardExpiryElement | StripeCardCvcElement | StripePostalCodeElement
    ) => {
      if (field === "cardNumber") {
        cardNumberRef.current = element as StripeCardNumberElement;
      }
      if (field === "cardExpiry") {
        cardExpiryRef.current = element as StripeCardExpiryElement;
      }
      if (field === "cardCvc") {
        cardCvcRef.current = element as StripeCardCvcElement;
      }
      if (field === "postalCode") {
        postalCodeRef.current = element as StripePostalCodeElement;
      }

      logStripeCardFormDebug("split_element_ready", { field });
      updateField(field, { ready: true });

      window.requestAnimationFrame(() => {
        const { hasInteractiveIframe, diagnostics } = readIframeDiagnostics(field, "ready");
        if (!hasInteractiveIframe) {
          markFailed("split_element_not_ready_timeout", {
            ...diagnostics,
            failureReason: "iframe_missing_or_not_interactive_after_ready"
          });
        }
      });
    };
  }, [markFailed, readIframeDiagnostics, updateField]);

  const handleFocus = useCallback((field: SplitFieldName) => {
    return () => {
      logStripeCardFormDebug("split_element_focus", { field });
      readIframeDiagnostics(field, "focus");
    };
  }, [readIframeDiagnostics]);

  const handleBlur = useCallback((field: SplitFieldName) => {
    return () => {
      logStripeCardFormDebug("split_element_blur", { field });
    };
  }, []);

  const handleFieldClick = useCallback((field: SplitFieldName) => {
    readIframeDiagnostics(field, "click");
    if (field === "cardNumber") {
      cardNumberRef.current?.focus();
    }
    if (field === "cardExpiry") {
      cardExpiryRef.current?.focus();
    }
    if (field === "cardCvc") {
      cardCvcRef.current?.focus();
    }
    if (field === "postalCode") {
      postalCodeRef.current?.focus();
    }
  }, [readIframeDiagnostics]);

  const handleCardNumberChange = useCallback((event: Parameters<NonNullable<ComponentProps<typeof CardNumberElement>["onChange"]>>[0]) => {
    logStripeCardFormDebug("split_element_change", {
      field: "cardNumber",
      complete: Boolean(event.complete),
      empty: Boolean(event.empty),
      error: event.error?.message ?? null
    });
    updateField("cardNumber", { complete: Boolean(event.complete), error: event.error?.message ?? null });
  }, [updateField]);

  const handleCardExpiryChange = useCallback((event: Parameters<NonNullable<ComponentProps<typeof CardExpiryElement>["onChange"]>>[0]) => {
    logStripeCardFormDebug("split_element_change", {
      field: "cardExpiry",
      complete: Boolean(event.complete),
      empty: Boolean(event.empty),
      error: event.error?.message ?? null
    });
    updateField("cardExpiry", { complete: Boolean(event.complete), error: event.error?.message ?? null });
  }, [updateField]);

  const handleCardCvcChange = useCallback((event: Parameters<NonNullable<ComponentProps<typeof CardCvcElement>["onChange"]>>[0]) => {
    logStripeCardFormDebug("split_element_change", {
      field: "cardCvc",
      complete: Boolean(event.complete),
      empty: Boolean(event.empty),
      error: event.error?.message ?? null
    });
    updateField("cardCvc", { complete: Boolean(event.complete), error: event.error?.message ?? null });
  }, [updateField]);

  const handlePostalCodeChange = useCallback((event: Parameters<NonNullable<ComponentProps<typeof PostalCodeElement>["onChange"]>>[0]) => {
    postalCodeValueRef.current = event.value ?? "";
    logStripeCardFormDebug("split_element_change", {
      field: "postalCode",
      complete: Boolean(event.complete),
      empty: Boolean(event.empty),
      error: event.error?.message ?? null
    });
    updateField("postalCode", { complete: Boolean(event.complete), error: event.error?.message ?? null });
  }, [updateField]);

  const handleLoadError = useCallback((field: SplitFieldName) => {
    return (event: Parameters<NonNullable<ComponentProps<typeof CardNumberElement>["onLoadError"]>>[0]) => {
      markFailed("split_element_load_error", {
        field,
        message: event.error?.message ?? null
      });
    };
  }, [markFailed]);

  return (
    <div className="grid gap-3 sm:grid-cols-[1.45fr_0.7fr_0.55fr_0.7fr]">
      <div>
        <label className={FIELD_LABEL_CLASS_NAME}>Card number</label>
        <div
          ref={(node) => setHostRef("cardNumber", node)}
          className={FIELD_CONTAINER_CLASS_NAME}
          style={{ pointerEvents: "auto", cursor: "text" }}
          data-testid="stripe-card-number-element-container"
          onClick={() => handleFieldClick("cardNumber")}
        >
          <CardNumberElement
            className="relative z-[60] block min-h-[24px] w-full"
            onReady={handleReady("cardNumber")}
            onFocus={handleFocus("cardNumber")}
            onBlur={handleBlur("cardNumber")}
            onChange={handleCardNumberChange}
            onLoadError={handleLoadError("cardNumber")}
            options={cardNumberOptions}
          />
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL_CLASS_NAME}>MM/YY</label>
        <div
          ref={(node) => setHostRef("cardExpiry", node)}
          className={FIELD_CONTAINER_CLASS_NAME}
          style={{ pointerEvents: "auto", cursor: "text" }}
          data-testid="stripe-card-expiry-element-container"
          onClick={() => handleFieldClick("cardExpiry")}
        >
          <CardExpiryElement
            className="relative z-[60] block min-h-[24px] w-full"
            onReady={handleReady("cardExpiry")}
            onFocus={handleFocus("cardExpiry")}
            onBlur={handleBlur("cardExpiry")}
            onChange={handleCardExpiryChange}
            onLoadError={handleLoadError("cardExpiry")}
            options={smallFieldOptions}
          />
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL_CLASS_NAME}>CVC</label>
        <div
          ref={(node) => setHostRef("cardCvc", node)}
          className={FIELD_CONTAINER_CLASS_NAME}
          style={{ pointerEvents: "auto", cursor: "text" }}
          data-testid="stripe-card-cvc-element-container"
          onClick={() => handleFieldClick("cardCvc")}
        >
          <CardCvcElement
            className="relative z-[60] block min-h-[24px] w-full"
            onReady={handleReady("cardCvc")}
            onFocus={handleFocus("cardCvc")}
            onBlur={handleBlur("cardCvc")}
            onChange={handleCardCvcChange}
            onLoadError={handleLoadError("cardCvc")}
            options={smallFieldOptions}
          />
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL_CLASS_NAME}>ZIP</label>
        <div
          ref={(node) => setHostRef("postalCode", node)}
          className={FIELD_CONTAINER_CLASS_NAME}
          style={{ pointerEvents: "auto", cursor: "text" }}
          data-testid="stripe-postal-code-element-container"
          onClick={() => handleFieldClick("postalCode")}
        >
          <PostalCodeElement
            className="relative z-[60] block min-h-[24px] w-full"
            onReady={handleReady("postalCode")}
            onFocus={handleFocus("postalCode")}
            onBlur={handleBlur("postalCode")}
            onChange={handlePostalCodeChange}
            onLoadError={handleLoadError("postalCode")}
            options={smallFieldOptions}
          />
        </div>
      </div>
    </div>
  );
}
