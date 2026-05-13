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
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { PaymentSetupIntentView } from "@/lib/payments/client";

export const STRIPE_CARD_FORM_LOAD_ERROR = "Secure card form failed to load. Refresh the page or contact support.";
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
const CARD_FIELD_INPUT_CLASS_NAME = "relative z-[60] block min-h-[24px] w-full";
const POSTAL_INPUT_CLASS_NAME = "relative z-[60] block h-6 w-full border-0 bg-transparent p-0 text-base text-white outline-none placeholder:text-[#8a8a8a]";

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
    if (allFieldsReady) {
      onStatusChange("ready");
    }
  }, [allFieldsReady, onReadyChange, onStatusChange]);

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
        readyFields: Object.fromEntries(Object.entries(fields).map(([key, state]) => [key, state.ready]))
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
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]">
          <StripeFieldShell label="Card number" />
          <StripeFieldShell label="MM/YY" />
          <StripeFieldShell label="CVC" />
          <StripeFieldShell label="ZIP" />
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
    onFieldChange("postalCode", value.trim().length >= 3, null);
  }, [onFieldChange]);

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]">
      <StripeFieldShell label="Card number">
        <CardNumberElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={() => onFieldReady("cardNumber")}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardNumber" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardNumber" })}
          onChange={(event) => onFieldChange("cardNumber", Boolean(event.complete), event.error?.message ?? null)}
          onLoadError={(event) => onFieldLoadError("cardNumber", event.error?.message ?? null)}
          options={cardNumberOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell label="MM/YY">
        <CardExpiryElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={() => onFieldReady("cardExpiry")}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardExpiry" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardExpiry" })}
          onChange={(event) => onFieldChange("cardExpiry", Boolean(event.complete), event.error?.message ?? null)}
          options={cardExpiryOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell label="CVC">
        <CardCvcElement
          className={CARD_FIELD_INPUT_CLASS_NAME}
          onReady={() => onFieldReady("cardCvc")}
          onFocus={() => logStripeCardFormDebug("card_element_focus", { field: "cardCvc" })}
          onBlur={() => logStripeCardFormDebug("card_element_blur", { field: "cardCvc" })}
          onChange={(event) => onFieldChange("cardCvc", Boolean(event.complete), event.error?.message ?? null)}
          options={cardCvcOptions}
        />
      </StripeFieldShell>
      <StripeFieldShell label="ZIP">
        <input
          aria-label="ZIP"
          className={POSTAL_INPUT_CLASS_NAME}
          data-testid="postal-code-input"
          inputMode="numeric"
          autoComplete="postal-code"
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
  children
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
        {label}
      </span>
      <span
        className={CARD_FIELD_CLASS_NAME}
        style={{ pointerEvents: "auto", cursor: "text" }}
        data-testid={`stripe-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-field`}
        data-stripe-card-host="true"
      >
        {children}
      </span>
    </label>
  );
}
