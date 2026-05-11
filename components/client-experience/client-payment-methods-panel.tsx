"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddPaymentMethodMutation,
  useCreateSavedPaymentMethodSetupMutation,
  usePaymentMethodsQuery,
  useRemovePaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
  type ClientPaymentMethodView,
  type PaymentApiError,
  type PaymentSetupIntentView
} from "@/lib/payments/client";
import { getReadableActionError } from "@/lib/utils/feedback";

type StripePaymentElementLike = {
  mount(target: HTMLElement): void;
  unmount?: () => void;
};

type StripeElementsLike = {
  create(type: "payment", options?: Record<string, unknown>): StripePaymentElementLike;
  submit?: () => Promise<{ error?: { message?: string } }>;
};

type StripeLike = {
  elements(options: { clientSecret: string }): StripeElementsLike;
  confirmSetup(options: {
    elements: StripeElementsLike;
    confirmParams?: Record<string, unknown>;
    redirect: "if_required";
  }): Promise<{
    error?: { message?: string };
    setupIntent?: {
      payment_method?: string | { id?: string };
    };
  }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeLike;
  }
}

let stripeScriptPromise: Promise<void> | null = null;

function loadStripeJs(publishableKey: string): Promise<StripeLike> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stripe cannot load outside the browser."));
  }

  if (window.Stripe) {
    return Promise.resolve(window.Stripe(publishableKey));
  }

  if (!stripeScriptPromise) {
    stripeScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>("script[src='https://js.stripe.com/v3']");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Unable to load Stripe.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3";
      script.async = true;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Unable to load Stripe.")), { once: true });
      document.head.appendChild(script);
    });
  }

  return stripeScriptPromise.then(() => {
    if (!window.Stripe) {
      throw new Error("Stripe did not initialize.");
    }

    return window.Stripe(publishableKey);
  });
}

function getPaymentMethodTitle(method: ClientPaymentMethodView) {
  const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : "Card";
  return method.last4 ? `${brand} •••• ${method.last4}` : method.label;
}

function getExpirationLabel(method: ClientPaymentMethodView) {
  if (!method.expMonth || !method.expYear) {
    return "Default for bookings";
  }

  const month = String(method.expMonth).padStart(2, "0");
  const year = String(method.expYear).slice(-2);
  return `Exp ${month}/${year}`;
}

function getStripePaymentMethodId(paymentMethod: string | { id?: string } | undefined) {
  if (typeof paymentMethod === "string") {
    return paymentMethod;
  }

  return paymentMethod?.id ?? "";
}

export function ClientPaymentMethodsPanel({
  initialMethods,
  isSignedInClient
}: {
  initialMethods: ClientPaymentMethodView[];
  isSignedInClient: boolean;
}) {
  const methodsQuery = usePaymentMethodsQuery({ methods: initialMethods }, isSignedInClient);
  const addMethodMutation = useAddPaymentMethodMutation();
  const setDefaultMutation = useSetDefaultPaymentMethodMutation();
  const removeMethodMutation = useRemovePaymentMethodMutation();
  const setupMutation = useCreateSavedPaymentMethodSetupMutation();
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [mode, setMode] = useState<"saved" | "add">("saved");
  const [cardholderName, setCardholderName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [setupIntent, setSetupIntent] = useState<PaymentSetupIntentView | null>(null);
  const [inlineSavedPaymentMethod, setInlineSavedPaymentMethod] = useState<ClientPaymentMethodView | null>(null);
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const setupRequestStartedRef = useRef(false);
  const stripeRef = useRef<StripeLike | null>(null);
  const elementsRef = useRef<StripeElementsLike | null>(null);
  const paymentElementRef = useRef<StripePaymentElementLike | null>(null);
  const elementContainerRef = useRef<HTMLDivElement | null>(null);

  const methods = useMemo(() => {
    const methodsById = new Map<string, ClientPaymentMethodView>();
    for (const method of methodsQuery.data?.methods ?? []) {
      methodsById.set(method.id, method);
    }

    if (inlineSavedPaymentMethod) {
      methodsById.set(inlineSavedPaymentMethod.id, inlineSavedPaymentMethod);
    }

    return Array.from(methodsById.values());
  }, [inlineSavedPaymentMethod, methodsQuery.data?.methods]);
  const defaultMethod = useMemo(
    () => methods.find((method) => method.isDefault) ?? methods[0] ?? null,
    [methods]
  );
  const showAddForm = isSignedInClient && (mode === "add" || !methods.length);
  const savePending = setupMutation.isPending || addMethodMutation.isPending || setupStatus === "loading";
  const canSaveCard = setupStatus === "ready" && authorized && !addMethodMutation.isPending;

  useEffect(() => {
    if (!showAddForm || setupIntent || setupRequestStartedRef.current) {
      return;
    }

    let cancelled = false;
    setupRequestStartedRef.current = true;
    setSetupStatus("loading");
    setSetupMessage(null);
    setupMutation.mutateAsync()
      .then((intent) => {
        if (cancelled) {
          return;
        }

        if (!intent.clientSecret || !intent.publishableKey) {
          setSetupStatus("error");
          setSetupMessage("Secure card setup is unavailable right now.");
          return;
        }

        setSetupIntent(intent);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSetupStatus("error");
        setSetupMessage(getReadableActionError(error as PaymentApiError));
      });

    return () => {
      cancelled = true;
    };
  }, [setupIntent, setupMutation, showAddForm]);

  useEffect(() => {
    if (!showAddForm || !setupIntent?.clientSecret || !setupIntent.publishableKey || !elementContainerRef.current) {
      return;
    }

    let cancelled = false;
    loadStripeJs(setupIntent.publishableKey)
      .then((stripe) => {
        if (cancelled || !elementContainerRef.current) {
          return;
        }

        const elements = stripe.elements({ clientSecret: setupIntent.clientSecret });
        const paymentElement = elements.create("payment", {
          layout: "tabs"
        });
        paymentElement.mount(elementContainerRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        paymentElementRef.current = paymentElement;
        setSetupStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSetupStatus("error");
        setSetupMessage(getReadableActionError(error as PaymentApiError));
      });

    return () => {
      cancelled = true;
      paymentElementRef.current?.unmount?.();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [setupIntent?.clientSecret, setupIntent?.publishableKey, showAddForm]);

  function startAddCard() {
    setMode("add");
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setStatusMessage(null);
  }

  function cancelAddCard() {
    setMode("saved");
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setAuthorized(false);
  }

  async function handleSaveCard() {
    setStatusMessage(null);
    setSetupMessage(null);

    if (!authorized) {
      setSetupMessage("Authorize BVRB3R to save this card before continuing.");
      return;
    }

    if (!cardholderName.trim()) {
      setSetupMessage("Enter the cardholder name.");
      return;
    }

    if (!postalCode.trim()) {
      setSetupMessage("Enter the billing ZIP.");
      return;
    }

    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !setupIntent) {
      setSetupStatus("error");
      setSetupMessage("Secure card setup is still loading.");
      return;
    }

    try {
      const submitResult = await elements.submit?.();
      if (submitResult?.error) {
        throw new Error(submitResult.error.message ?? "Check the card details and try again.");
      }

      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: cardholderName.trim(),
              address: {
                postal_code: postalCode.trim()
              }
            }
          }
        },
        redirect: "if_required"
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Unable to save this card.");
      }

      const providerPaymentMethodId = getStripePaymentMethodId(result.setupIntent?.payment_method);
      if (!providerPaymentMethodId) {
        throw new Error("Stripe did not return a saved card reference.");
      }

      const response = await addMethodMutation.mutateAsync({
        provider: "stripe",
        providerCustomerId: setupIntent.customerId,
        providerPaymentMethodId,
        isDefault: true
      });

      setInlineSavedPaymentMethod(response.method);
      setCardholderName("");
      setPostalCode("");
      setAuthorized(false);
      setMode("saved");
      setSetupIntent(null);
      setupRequestStartedRef.current = false;
      setSetupStatus("success");
      setStatusMessage({
        tone: "success",
        message: `${response.method.label} is saved for future bookings.`
      });
    } catch (error) {
      setSetupStatus("ready");
      setSetupMessage(getReadableActionError(error as PaymentApiError));
    }
  }

  async function handleSetDefault(paymentMethodId: string) {
    setStatusMessage(null);
    try {
      const result = await setDefaultMutation.mutateAsync(paymentMethodId);
      setStatusMessage({
        tone: "success",
        message: `${result.method.label} is now the default card for bookings.`
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        message: getReadableActionError(error as PaymentApiError)
      });
    }
  }

  async function handleRemove(paymentMethodId: string) {
    setStatusMessage(null);
    try {
      await removeMethodMutation.mutateAsync(paymentMethodId);
      setInlineSavedPaymentMethod((current) => current?.id === paymentMethodId ? null : current);
      setStatusMessage({
        tone: "success",
        message: "Card removed from your wallet."
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        message: getReadableActionError(error as PaymentApiError)
      });
    }
  }

  return (
    <div className="rounded-[28px] border border-white/8 bg-black/20 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-sm text-white/78">
            <CreditCard className="h-4 w-4 text-[#baff69]" />
            Card on file
          </div>
          <p className="mt-3 text-lg font-semibold text-white">Card on file</p>
          <p className="mt-2 text-sm leading-7 text-white/58">
            Add a card so booking and rebooking stay fast. Protected and encrypted by Stripe.
          </p>
        </div>
        <div className="rounded-[20px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
          {methods.length} saved
        </div>
      </div>

      {statusMessage ? <div className="mt-4"><FeedbackBanner tone={statusMessage.tone} message={statusMessage.message} /></div> : null}
      {methodsQuery.error ? <div className="mt-4"><FeedbackBanner tone="error" message={getReadableActionError(methodsQuery.error as PaymentApiError)} /></div> : null}

      {methodsQuery.isLoading && !methods.length ? (
        <div className="mt-4 rounded-[22px] border border-white/10 bg-black/25 p-4">
          <Skeleton className="h-14 w-full rounded-[18px]" />
        </div>
      ) : defaultMethod && !showAddForm ? (
        <div className="mt-4 rounded-[22px] border border-white/10 bg-black/25 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#7CFF00]/20 bg-[#7CFF00]/10 text-[#d7ffab]">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-white">{getPaymentMethodTitle(defaultMethod)}</p>
                <p className="mt-1 text-sm text-white/55">Default for bookings</p>
                <p className="mt-1 text-xs text-white/40">{getExpirationLabel(defaultMethod)}</p>
              </div>
            </div>
            <Badge className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Saved
            </Badge>
          </div>

          {methods.length > 1 ? (
            <div className="mt-4 grid gap-2">
              {methods.filter((method) => method.id !== defaultMethod.id).map((method) => (
                <div key={method.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{getPaymentMethodTitle(method)}</p>
                    <p className="mt-1 text-xs text-white/45">{getExpirationLabel(method)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 px-3"
                    disabled={!isSignedInClient || setDefaultMutation.isPending}
                    onClick={() => void handleSetDefault(method.id)}
                  >
                    Make default
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="h-10 px-4" onClick={startAddCard}>
              Change card
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              disabled={removeMethodMutation.isPending}
              onClick={() => void handleRemove(defaultMethod.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      {!isSignedInClient ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm leading-7 text-white/58">
          Sign in as the client account to manage your card on file.
        </div>
      ) : null}

      {showAddForm ? (
        <div className="mt-5 rounded-[22px] border border-white/10 bg-black/22 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-white">Secure card entry</p>
              <p className="mt-2 text-sm leading-7 text-white/58">Card number, MM/YY, CVC, and ZIP/postal code are handled by Stripe.</p>
            </div>
            <Badge className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Stripe encrypted
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <label className="surface-label mb-2 block" htmlFor="wallet-cardholder-name">Cardholder name</label>
              <Input
                id="wallet-cardholder-name"
                value={cardholderName}
                onChange={(event) => setCardholderName(event.target.value)}
                autoComplete="cc-name"
              />
            </div>
            <div>
              <label className="surface-label mb-2 block" htmlFor="wallet-card-zip">ZIP</label>
              <Input
                id="wallet-card-zip"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="surface-label mb-2">Stripe secure card entry</p>
            <div
              ref={elementContainerRef}
              className="min-h-[78px] rounded-[16px] border border-white/10 bg-black/30 p-3"
              aria-label="Stripe secure card entry: Card number, expiration, CVC, and postal code"
            />
            {setupStatus === "loading" ? <Skeleton className="mt-3 h-4 w-44 rounded-full" /> : null}
          </div>

          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-white/68">
            <input
              type="checkbox"
              className="mt-1 accent-[#7CFF00]"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
            />
            <span>I authorize BVRB3R to save this card on file for future bookings.</span>
          </label>

          {setupMessage ? (
            <div className="mt-4">
              <FeedbackBanner tone={setupStatus === "success" ? "success" : "error"} message={setupMessage} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" className="h-11 px-5" disabled={!canSaveCard || savePending} onClick={() => void handleSaveCard()}>
              {addMethodMutation.isPending ? "Saving card..." : "Save card"}
            </Button>
            {methods.length ? (
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={cancelAddCard}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
