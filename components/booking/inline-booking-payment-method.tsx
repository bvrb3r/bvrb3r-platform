"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddPaymentMethodMutation,
  useCreateSavedPaymentMethodSetupMutation,
  type ClientPaymentMethodView,
  type PaymentSetupIntentView
} from "@/lib/payments/client";
import { currency } from "@/lib/utils";
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

interface InlineBookingPaymentMethodProps {
  paymentMethods: ClientPaymentMethodView[];
  selectedPaymentMethodId: string;
  selectedPaymentMethod: ClientPaymentMethodView | null;
  totalDue: number;
  isLoading: boolean;
  errorMessage?: string | null;
  onSelectPaymentMethod: (paymentMethodId: string) => void;
  onSavedPaymentMethod: (paymentMethod: ClientPaymentMethodView) => void;
  onPendingChange?: (isPending: boolean) => void;
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
    return "Exp saved on file";
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

export function InlineBookingPaymentMethod({
  paymentMethods,
  selectedPaymentMethodId,
  selectedPaymentMethod,
  totalDue,
  isLoading,
  errorMessage,
  onSelectPaymentMethod,
  onSavedPaymentMethod,
  onPendingChange
}: InlineBookingPaymentMethodProps) {
  const [mode, setMode] = useState<"saved" | "add">("saved");
  const [changeOpen, setChangeOpen] = useState(false);
  const [cardholderName, setCardholderName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [setupIntent, setSetupIntent] = useState<PaymentSetupIntentView | null>(null);
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const setupMutation = useCreateSavedPaymentMethodSetupMutation();
  const addMethodMutation = useAddPaymentMethodMutation();
  const stripeRef = useRef<StripeLike | null>(null);
  const elementsRef = useRef<StripeElementsLike | null>(null);
  const paymentElementRef = useRef<StripePaymentElementLike | null>(null);
  const elementContainerRef = useRef<HTMLDivElement | null>(null);
  const setupRequestStartedRef = useRef(false);

  const showAddForm = mode === "add" || (!paymentMethods.length && !isLoading);
  const isPending = setupMutation.isPending || addMethodMutation.isPending || setupStatus === "loading";
  const canSaveCard = setupStatus === "ready" && !addMethodMutation.isPending;
  const selectedTitle = selectedPaymentMethod ? getPaymentMethodTitle(selectedPaymentMethod) : "";
  const selectedExpiration = selectedPaymentMethod ? getExpirationLabel(selectedPaymentMethod) : "";

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => () => {
    onPendingChange?.(false);
  }, [onPendingChange]);

  useEffect(() => {
    if (!paymentMethods.length || mode === "add") {
      return;
    }

    setMode("saved");
  }, [mode, paymentMethods.length]);

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
        setSetupMessage(getReadableActionError(error as Error));
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
        setSetupMessage(getReadableActionError(error as Error));
      });

    return () => {
      cancelled = true;
      paymentElementRef.current?.unmount?.();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [setupIntent?.clientSecret, setupIntent?.publishableKey, showAddForm]);

  const savedOptions = useMemo(
    () => paymentMethods.map((method) => ({
      ...method,
      title: getPaymentMethodTitle(method),
      expiration: getExpirationLabel(method)
    })),
    [paymentMethods]
  );

  function startAddCard() {
    setMode("add");
    setChangeOpen(false);
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
  }

  async function handleSaveCard() {
    setSetupMessage(null);

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
        isDefault: saveForFuture || paymentMethods.length === 0
      });

      onSavedPaymentMethod(response.method);
      onSelectPaymentMethod(response.method.id);
      setMode("saved");
      setChangeOpen(false);
      setSetupStatus("success");
      setSetupMessage("Payment method saved.");
    } catch (error) {
      setSetupStatus("ready");
      setSetupMessage(getReadableActionError(error as Error));
    }
  }

  return (
    <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="surface-label">Payment method</p>
          <p className="mt-2 text-sm leading-7 text-white/62">Pay securely when you book.</p>
        </div>
        {selectedPaymentMethod ? (
          <Badge className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Selected
          </Badge>
        ) : null}
      </div>

      {errorMessage ? <div className="mt-4"><FeedbackBanner tone="error" message={errorMessage} /></div> : null}

      {isLoading ? (
        <div className="mt-4 rounded-[18px] border border-white/8 bg-black/18 p-4">
          <Skeleton className="h-12 w-full rounded-[16px]" />
        </div>
      ) : selectedPaymentMethod && !showAddForm ? (
        <div className="mt-4 rounded-[18px] border border-white/10 bg-black/22 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#7CFF00]/20 bg-[#7CFF00]/10 text-[#d7ffab]">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-white">{selectedTitle}</p>
              <p className="mt-1 text-sm text-white/58">{selectedExpiration}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/38">{currency(totalDue)} due today</p>
            </div>
          </div>

          {changeOpen ? (
            <div className="mt-4">
              <label className="surface-label mb-2 block" htmlFor="booking-payment-method">Choose card</label>
              <Select
                id="booking-payment-method"
                value={selectedPaymentMethodId || selectedPaymentMethod.id}
                onChange={(event) => onSelectPaymentMethod(event.target.value)}
              >
                {savedOptions.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.title}{method.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => setChangeOpen((current) => !current)}>
              Change
            </Button>
            <Button type="button" variant="secondary" className="h-10 px-4" onClick={startAddCard}>
              Add new card
            </Button>
            <Link href="/dashboard/client/profile?section=wallet" className="text-sm font-medium text-white/48 transition hover:text-[#d7ffab]">
              Manage payment methods
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-white/10 bg-black/22 p-4">
          <p className="text-sm leading-7 text-white/72">Add a payment method to complete booking.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <label className="surface-label mb-2 block" htmlFor="booking-cardholder-name">Cardholder name</label>
              <Input
                id="booking-cardholder-name"
                value={cardholderName}
                onChange={(event) => setCardholderName(event.target.value)}
                autoComplete="cc-name"
              />
            </div>
            <div>
              <label className="surface-label mb-2 block" htmlFor="booking-card-zip">ZIP</label>
              <Input
                id="booking-card-zip"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="surface-label mb-2">Secure card details</p>
            <div
              ref={elementContainerRef}
              className="min-h-[74px] rounded-[16px] border border-white/10 bg-black/30 p-3"
              aria-label="Secure card details"
            />
            {setupStatus === "loading" ? <Skeleton className="mt-3 h-4 w-44 rounded-full" /> : null}
          </div>

          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-white/68">
            <input
              type="checkbox"
              className="mt-1 accent-[#7CFF00]"
              checked={saveForFuture}
              onChange={(event) => setSaveForFuture(event.target.checked)}
            />
            <span>Save card for future bookings</span>
          </label>

          {setupMessage ? (
            <div className="mt-4">
              <FeedbackBanner tone={setupStatus === "success" ? "success" : "error"} message={setupMessage} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" className="h-11 px-5" disabled={!canSaveCard} onClick={handleSaveCard}>
              {addMethodMutation.isPending ? "Saving card..." : "Save card"}
            </Button>
            {paymentMethods.length ? (
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => setMode("saved")}>
                Cancel
              </Button>
            ) : null}
            <Link href="/dashboard/client/profile?section=wallet" className="text-sm font-medium text-white/48 transition hover:text-[#d7ffab]">
              Manage payment methods
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
