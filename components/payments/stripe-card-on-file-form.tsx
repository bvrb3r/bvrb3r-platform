"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  useElements,
  useStripe
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripeCardCvcElement,
  type StripeCardExpiryElement,
  type StripeCardNumberElement
} from "@stripe/stripe-js";
import type { PaymentSetupIntentView } from "@/lib/payments/client";

export const STRIPE_CARD_FORM_LOAD_ERROR = "Secure card fields did not finish loading. Refresh and try again.";
export const STRIPE_CARD_FORM_MISSING_KEY_ERROR = "Secure card form failed to load. Stripe publishable key is missing.";
export const STRIPE_CARD_FORM_MISSING_SECRET_ERROR = "Secure card form failed to load. SetupIntent was not created.";

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
  | "card_element_load_error"
  | "card_element_not_ready_timeout";

type StripeFieldKey = "cardNumber" | "cardExpiry" | "cardCvc" | "postalCode";

type StripeFieldState = Record<StripeFieldKey, {
  ready: boolean;
  complete: boolean;
  error: string | null;
}>;

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

const CARD_FIELD_CLASS_NAME = "relative z-[50] min-h-[56px] rounded-[16px] border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-4";
const CARD_FIELD_INPUT_CLASS_NAME = "relative z-[60] block min-h-[24px] w-full [&>iframe]:!w-full";
const POSTAL_INPUT_CLASS_NAME = "relative z-[60] block min-h-[24px] w-full border-0 bg-transparent p-0 text-base text-white outline-none placeholder:text-[#8a8a8a]";
const SPLIT_FIELD_GRID_CLASS_NAME = "grid w-full grid-cols-1 gap-3 md:grid-cols-[minmax(280px,2fr)_minmax(110px,0.7fr)_minmax(90px,0.55fr)_minmax(110px,0.7fr)]";

function createInitialFieldState(): StripeFieldState {
  return {
    cardNumber: { ready: false, complete: false, error: null },
    cardExpiry: { ready: false, complete: false, error: null },
    cardCvc: { ready: false, complete: false, error: null },
    postalCode: { ready: false, complete: false, error: null }
  };
}

function logStripeCardFormError(reference: StripeSetupReference, details?: Record<string, unknown>) {
  console.error("[payments] stripe card form failed", {
    reference,
    ...(details ?? {})
  });
}

function logStripeCardFormDebug(reference: StripeSetupReference, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
    return;
  }

  console.log("[payments] stripe card form state", {
    reference,
    ...(details ?? {})
  });
}

function getStripeKeyPrefix(publishableKey: string) {
  if (!publishableKey) {
    return "missing";
  }

  if (publishableKey.startsWith("pk_test")) {
    return "pk_test";
  }

  if (publishableKey.startsWith("pk_live")) {
    return "pk_live";
  }

  return "invalid";
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

function getAllFieldsReady(fields: StripeFieldState) {
  return Object.values(fields).every((field) => field.ready);
}

function getAllFieldsComplete(fields: StripeFieldState) {
  return Object.values(fields).every((field) => field.ready && field.complete && !field.error);
}

function getFieldDebugSnapshot(fields: StripeFieldState) {
  return {
    cardNumberReady: fields.cardNumber.ready,
    cardExpiryReady: fields.cardExpiry.ready,
    cardCvcReady: fields.cardCvc.ready,
    zipReady: fields.postalCode.ready,
    cardNumberComplete: fields.cardNumber.complete,
    cardExpiryComplete: fields.cardExpiry.complete,
    cardCvcComplete: fields.cardCvc.complete,
    zipComplete: fields.postalCode.complete,
    allReady: getAllFieldsReady(fields),
    allComplete: getAllFieldsComplete(fields)
  };
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
  const envPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const publishableKey = setupIntent?.publishableKey?.trim() || envPublishableKey;
  const publishableKeyPrefix = getStripeKeyPrefix(publishableKey);
  const clientSecret = setupIntent?.clientSecret?.trim() ?? "";
  const [retryNonce, setRetryNonce] = useState(0);
  const activeSetupKey = `${publishableKey}:${clientSecret}:${retryNonce}`;
  const [stripeLoadState, setStripeLoadState] = useState<{
    key: string;
    status: "idle" | "loading" | "ready" | "error";
  }>({
    key: "",
    status: "idle"
  });
  const [fields, setFields] = useState<StripeFieldState>(() => createInitialFieldState());
  const [fieldFailure, setFieldFailure] = useState<string | null>(null);
  const allFieldsReady = getAllFieldsReady(fields);
  const allFieldsComplete = getAllFieldsComplete(fields);
  const stripeReady = stripeLoadState.key === publishableKey && stripeLoadState.status === "ready";
  const stripeLoadFailed = stripeLoadState.key === publishableKey && stripeLoadState.status === "error";

  const stripePromise = useMemo(
    () => getStripePromise(publishableKey),
    [publishableKey]
  );
  const elementsOptions = useMemo(
    () => clientSecret ? { clientSecret } : undefined,
    [clientSecret]
  );

  const showStripeElement = Boolean(clientSecret && publishableKeyPrefix !== "missing" && stripePromise && stripeReady && !stripeLoadFailed);
  const showLoading = isSetupIntentLoading
    || Boolean(clientSecret && publishableKeyPrefix !== "missing" && stripePromise && !stripeReady && !stripeLoadFailed)
    || Boolean(showStripeElement && !allFieldsReady && !fieldFailure);
  const showReady = Boolean(showStripeElement && allFieldsReady && !fieldFailure);
  const hasResolvedSetupIntent = Boolean(setupIntent) && !isSetupIntentLoading;
  const failureMessage = fieldFailure
    ?? (hasResolvedSetupIntent && publishableKeyPrefix === "missing" ? STRIPE_CARD_FORM_MISSING_KEY_ERROR : null)
    ?? (hasResolvedSetupIntent && !clientSecret ? STRIPE_CARD_FORM_MISSING_SECRET_ERROR : null)
    ?? (stripeLoadFailed ? STRIPE_CARD_FORM_LOAD_ERROR : null);

  useEffect(() => {
    setFields(createInitialFieldState());
    setFieldFailure(null);
    onReadyChange(false);
    onCompleteChange(false);
    onConfirmSetupChange(null);
  }, [activeSetupKey, onCompleteChange, onConfirmSetupChange, onReadyChange]);

  useEffect(() => {
    onReadyChange(allFieldsReady);
    logStripeCardFormDebug("card_element_change", getFieldDebugSnapshot(fields));
    if (allFieldsReady) {
      onStatusChange("ready");
    }
  }, [allFieldsReady, fields, onReadyChange, onStatusChange]);

  useEffect(() => {
    onCompleteChange(allFieldsComplete);
  }, [allFieldsComplete, onCompleteChange]);

  useEffect(() => {
    if (failureMessage) {
      onStatusChange("error");
      onErrorMessage(failureMessage);
    }
  }, [failureMessage, onErrorMessage, onStatusChange]);

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
      logStripeCardFormError("setup_intent_client_secret_missing", {
        hasClientSecret: false
      });
      onStatusChange("error");
      onErrorMessage(STRIPE_CARD_FORM_MISSING_SECRET_ERROR);
      return;
    }

    if (publishableKeyPrefix === "missing" || !stripePromise) {
      logStripeCardFormError("stripe_publishable_key_missing", {
        present: false,
        prefix: publishableKeyPrefix
      });
      onStatusChange("error");
      onErrorMessage(STRIPE_CARD_FORM_MISSING_KEY_ERROR);
      return;
    }

    let cancelled = false;
    setStripeLoadState({
      key: publishableKey,
      status: "loading"
    });
    logStripeCardFormDebug("setup_intent_ready", {
      hasClientSecret: true,
      publishableKey: {
        present: true,
        prefix: publishableKeyPrefix
      }
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
            reason: "load_stripe_returned_null",
            publishableKey: {
              present: true,
              prefix: publishableKeyPrefix
            }
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
          message: error instanceof Error ? error.message : "Unknown Stripe load failure",
          publishableKey: {
            present: true,
            prefix: publishableKeyPrefix
          }
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
  }, [clientSecret, isSetupIntentLoading, onErrorMessage, onStatusChange, publishableKey, publishableKeyPrefix, setupIntent, stripePromise]);

  useEffect(() => {
    if (!showStripeElement || allFieldsReady || fieldFailure) {
      return;
    }

    const timeout = window.setTimeout(() => {
      logStripeCardFormError("card_element_not_ready_timeout", {
        reason: "split_fields_ready_timeout",
        ...getFieldDebugSnapshot(fields)
      });
      setFieldFailure(STRIPE_CARD_FORM_LOAD_ERROR);
    }, STRIPE_CARD_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [allFieldsReady, fieldFailure, fields, showStripeElement]);

  const handleFieldReady = useCallback((field: StripeFieldKey) => {
    setFields((current) => ({
      ...current,
      [field]: {
        ...current[field],
        ready: true,
        error: null
      }
    }));
    logStripeCardFormDebug("card_element_ready", { field });
  }, []);

  const handleFieldChange = useCallback((field: StripeFieldKey, complete: boolean, errorMessage?: string | null) => {
    setFields((current) => ({
      ...current,
      [field]: {
        ...current[field],
        complete,
        error: errorMessage ?? null
      }
    }));
    logStripeCardFormDebug("card_element_change", {
      field,
      complete,
      error: errorMessage ?? null
    });

    if (errorMessage) {
      onErrorMessage(errorMessage);
    } else {
      onErrorMessage(null);
    }
  }, [onErrorMessage]);

  const handleFieldLoadError = useCallback((field: StripeFieldKey, message?: string | null) => {
    logStripeCardFormError("card_element_load_error", {
      field,
      message: message ?? null
    });
    setFieldFailure(STRIPE_CARD_FORM_LOAD_ERROR);
  }, []);

  const handleRetry = useCallback(() => {
    setFields(createInitialFieldState());
    setFieldFailure(null);
    onReadyChange(false);
    onCompleteChange(false);
    onErrorMessage(null);
    onStatusChange("loading");
    onConfirmSetupChange(null);
    setRetryNonce((current) => current + 1);
  }, [onCompleteChange, onConfirmSetupChange, onErrorMessage, onReadyChange, onStatusChange]);

  return (
    <div>
      {showStripeElement && elementsOptions ? (
        <Elements key={activeSetupKey} stripe={stripePromise} options={elementsOptions}>
          <SplitStripeCardFields
            clientSecret={clientSecret}
            onFieldReady={handleFieldReady}
            onFieldChange={handleFieldChange}
            onFieldLoadError={handleFieldLoadError}
            onStatusChange={onStatusChange}
            onErrorMessage={onErrorMessage}
            onConfirmSetupChange={onConfirmSetupChange}
          />
        </Elements>
      ) : (
        <div className={SPLIT_FIELD_GRID_CLASS_NAME}>
          <StripeFieldShell label="Card number" minWidthClassName="min-w-[280px]" />
          <StripeFieldShell label="MM/YY" minWidthClassName="min-w-[110px]" />
          <StripeFieldShell label="CVC" minWidthClassName="min-w-[90px]" />
          <StripeFieldShell label="ZIP" minWidthClassName="min-w-[110px]" />
        </div>
      )}

      {showLoading ? (
        <p className="mt-3 text-sm text-white/50">Loading secure card form...</p>
      ) : null}
      {showReady ? (
        <p className="mt-3 text-sm text-[#baff69]/70">Secure card form ready.</p>
      ) : null}
      {failureMessage ? (
        <div className="mt-3 rounded-[14px] border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm leading-6 text-red-100">
          <p>{failureMessage}</p>
          {failureMessage === STRIPE_CARD_FORM_LOAD_ERROR ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-100 underline decoration-red-200/40 underline-offset-4"
              onClick={handleRetry}
            >
              Retry card form
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SplitStripeCardFields({
  clientSecret,
  onFieldReady,
  onFieldChange,
  onFieldLoadError,
  onStatusChange,
  onErrorMessage,
  onConfirmSetupChange
}: {
  clientSecret: string;
  onFieldReady: (field: StripeFieldKey) => void;
  onFieldChange: (field: StripeFieldKey, complete: boolean, errorMessage?: string | null) => void;
  onFieldLoadError: (field: StripeFieldKey, message?: string | null) => void;
  onStatusChange: (status: "idle" | "loading" | "ready" | "error") => void;
  onErrorMessage: (message: string | null) => void;
  onConfirmSetupChange: (confirmSetup: ConfirmStripeCardSetup | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const fieldHostRefs = useRef<Record<StripeFieldKey, HTMLDivElement | null>>({
    cardNumber: null,
    cardExpiry: null,
    cardCvc: null,
    postalCode: null
  });
  const cardNumberRef = useRef<StripeCardNumberElement | null>(null);
  const cardExpiryRef = useRef<StripeCardExpiryElement | null>(null);
  const cardCvcRef = useRef<StripeCardCvcElement | null>(null);
  const postalCodeRef = useRef("");
  const [postalCode, setPostalCode] = useState("");

  const baseElementOptions = useMemo(() => ({
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
  const cardNumberOptions = useMemo(() => ({
    ...baseElementOptions,
    showIcon: true,
    placeholder: "4242 4242 4242 4242"
  }), [baseElementOptions]);
  const cardExpiryOptions = useMemo(() => ({
    ...baseElementOptions,
    placeholder: "MM/YY"
  }), [baseElementOptions]);
  const cardCvcOptions = useMemo(() => ({
    ...baseElementOptions,
    placeholder: "CVC"
  }), [baseElementOptions]);

  useEffect(() => {
    logStripeCardFormDebug("elements_provider_mounted", {
      hasStripe: Boolean(stripe),
      hasElements: Boolean(elements)
    });
  }, [elements, stripe]);

  useEffect(() => {
    onFieldReady("postalCode");
  }, [onFieldReady]);

  useEffect(() => {
    if (!stripe || !elements) {
      onConfirmSetupChange(null);
      return;
    }

    onConfirmSetupChange(async () => {
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        onStatusChange("error");
        onErrorMessage(STRIPE_CARD_FORM_LOAD_ERROR);
        throw new Error(STRIPE_CARD_FORM_LOAD_ERROR);
      }

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            address: {
              postal_code: postalCodeRef.current.trim()
            }
          }
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
  }, [clientSecret, elements, onConfirmSetupChange, onErrorMessage, onStatusChange, stripe]);

  const handlePostalCodeChange = useCallback((value: string) => {
    postalCodeRef.current = value;
    setPostalCode(value);
    onFieldChange("postalCode", value.trim().length >= 5, null);
  }, [onFieldChange]);

  const setHostRef = useCallback((field: StripeFieldKey, node: HTMLDivElement | null) => {
    fieldHostRefs.current[field] = node;
  }, []);

  const logFieldIframeSize = useCallback((field: StripeFieldKey) => {
    window.requestAnimationFrame(() => {
      const host = fieldHostRefs.current[field];
      const iframe = host?.querySelector("iframe") ?? null;
      const hostRect = host?.getBoundingClientRect();
      const iframeRect = iframe?.getBoundingClientRect();
      logStripeCardFormDebug("card_element_ready", {
        field,
        hostWidth: hostRect?.width ?? 0,
        hostHeight: hostRect?.height ?? 0,
        iframeWidth: iframeRect?.width ?? 0,
        iframeHeight: iframeRect?.height ?? 0
      });
    });
  }, []);

  const focusField = useCallback((field: StripeFieldKey) => {
    if (field === "cardNumber") {
      cardNumberRef.current?.focus();
      return;
    }

    if (field === "cardExpiry") {
      cardExpiryRef.current?.focus();
      return;
    }

    if (field === "cardCvc") {
      cardCvcRef.current?.focus();
      return;
    }

    const postalInput = fieldHostRefs.current.postalCode?.querySelector("input");
    postalInput?.focus();
  }, []);

  const handleNumberReady = useCallback((element: StripeCardNumberElement) => {
    cardNumberRef.current = element;
    onFieldReady("cardNumber");
    logFieldIframeSize("cardNumber");
  }, [logFieldIframeSize, onFieldReady]);

  const handleExpiryReady = useCallback((element: StripeCardExpiryElement) => {
    cardExpiryRef.current = element;
    onFieldReady("cardExpiry");
    logFieldIframeSize("cardExpiry");
  }, [logFieldIframeSize, onFieldReady]);

  const handleCvcReady = useCallback((element: StripeCardCvcElement) => {
    cardCvcRef.current = element;
    onFieldReady("cardCvc");
    logFieldIframeSize("cardCvc");
  }, [logFieldIframeSize, onFieldReady]);

  return (
    <div className={SPLIT_FIELD_GRID_CLASS_NAME}>
      <StripeFieldShell
        label="Card number"
        minWidthClassName="min-w-[280px]"
        onFocusRequest={() => focusField("cardNumber")}
        setHostRef={(node) => setHostRef("cardNumber", node)}
      >
        <CardNumberElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={handleNumberReady}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardNumber" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardNumber" })}
          onChange={(event) => onFieldChange("cardNumber", Boolean(event.complete), event.error?.message ?? null)}
          onLoadError={(event) => onFieldLoadError("cardNumber", event.error?.message ?? null)}
          options={cardNumberOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell
        label="MM/YY"
        minWidthClassName="min-w-[110px]"
        onFocusRequest={() => focusField("cardExpiry")}
        setHostRef={(node) => setHostRef("cardExpiry", node)}
      >
        <CardExpiryElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={handleExpiryReady}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardExpiry" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardExpiry" })}
          onChange={(event) => onFieldChange("cardExpiry", Boolean(event.complete), event.error?.message ?? null)}
          options={cardExpiryOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell
        label="CVC"
        minWidthClassName="min-w-[90px]"
        onFocusRequest={() => focusField("cardCvc")}
        setHostRef={(node) => setHostRef("cardCvc", node)}
      >
        <CardCvcElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={handleCvcReady}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardCvc" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardCvc" })}
          onChange={(event) => onFieldChange("cardCvc", Boolean(event.complete), event.error?.message ?? null)}
          options={cardCvcOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell
        label="ZIP"
        minWidthClassName="min-w-[110px]"
        onFocusRequest={() => focusField("postalCode")}
        setHostRef={(node) => setHostRef("postalCode", node)}
      >
        <input
          aria-label="ZIP"
          className={POSTAL_INPUT_CLASS_NAME}
          data-testid="postal-code-input"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          value={postalCode}
          onChange={(event) => handlePostalCodeChange(event.target.value)}
          placeholder="33612"
        />
      </StripeFieldShell>
    </div>
  );
}

function StripeFieldShell({
  label,
  children,
  minWidthClassName,
  onFocusRequest,
  setHostRef
}: {
  label: string;
  children?: ReactNode;
  minWidthClassName: string;
  onFocusRequest?: () => void;
  setHostRef?: (node: HTMLDivElement | null) => void;
}) {
  const fieldId = `stripe-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-field`;

  return (
    <div className="min-w-0">
      <label
        htmlFor={fieldId}
        className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42"
        onClick={onFocusRequest}
      >
        {label}
      </label>
      <div
        ref={setHostRef}
        id={fieldId}
        className={`${CARD_FIELD_CLASS_NAME} w-full ${minWidthClassName} overflow-visible`}
        style={{ pointerEvents: "auto", cursor: "text" }}
        onClick={onFocusRequest}
        data-testid={`stripe-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-field`}
        data-stripe-card-host="true"
      >
        {children}
      </div>
    </div>
  );
}
