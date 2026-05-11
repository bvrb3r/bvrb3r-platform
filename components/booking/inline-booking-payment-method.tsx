"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
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

type StripeCardElementLike = {
  mount(target: HTMLElement): void;
  unmount?: () => void;
};

type StripeElementsLike = {
  create(type: "card", options?: Record<string, unknown>): StripeCardElementLike;
};

type StripeLike = {
  elements(options: { clientSecret: string }): StripeElementsLike;
  confirmCardSetup(clientSecret: string, options: {
    payment_method: {
      card: StripeCardElementLike;
    };
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
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [setupIntent, setSetupIntent] = useState<PaymentSetupIntentView | null>(null);
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const setupMutation = useCreateSavedPaymentMethodSetupMutation();
  const addMethodMutation = useAddPaymentMethodMutation();
  const stripeRef = useRef<StripeLike | null>(null);
  const cardElementRef = useRef<StripeCardElementLike | null>(null);
  const elementContainerRef = useRef<HTMLDivElement | null>(null);
  const setupRequestStartedRef = useRef(false);

  const showAddForm = mode === "add" || (!paymentMethods.length && !isLoading);
  const isPending = setupMutation.isPending || addMethodMutation.isPending || setupStatus === "loading";
  const canSaveCard = setupStatus === "ready" && saveForFuture && !addMethodMutation.isPending;
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
          setSetupMessage("Secure card form failed to load. Check Stripe publishable key.");
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
        const cardElement = elements.create("card", {
          hidePostalCode: false,
          style: {
            base: {
              color: "#ffffff",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "16px",
              "::placeholder": {
                color: "rgba(255,255,255,0.42)"
              }
            },
            invalid: {
              color: "#fecdd3"
            }
          }
        });
        cardElement.mount(elementContainerRef.current);
        stripeRef.current = stripe;
        cardElementRef.current = cardElement;
        setSetupStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSetupStatus("error");
        setSetupMessage("Secure card form failed to load. Check Stripe publishable key.");
      });

    return () => {
      cancelled = true;
      cardElementRef.current?.unmount?.();
      cardElementRef.current = null;
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

    const stripe = stripeRef.current;
    const cardElement = cardElementRef.current;
    if (!stripe || !cardElement || !setupIntent) {
      setSetupStatus("error");
      setSetupMessage("Secure card form failed to load. Check Stripe publishable key.");
      return;
    }

    try {
      if (!saveForFuture) {
        setSetupMessage("Authorize BVRB3R to save this card before continuing.");
        return;
      }

      const result = await stripe.confirmCardSetup(setupIntent.clientSecret, {
        payment_method: {
          card: cardElement
        }
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
              <p className="mt-1 text-sm text-white/58">Charged when you book</p>
              <p className="mt-1 text-xs text-white/42">{selectedExpiration}</p>
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

          <div className="mt-4">
            <div className="mb-2 grid grid-cols-[1.45fr_0.7fr_0.55fr_0.7fr] gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
              <span>Card number</span>
              <span>MM/YY</span>
              <span>CVC</span>
              <span>ZIP</span>
            </div>
            <div
              ref={elementContainerRef}
              className="min-h-[54px] rounded-[16px] border border-white/10 bg-[#101010] px-4 py-4"
              aria-label="Card number, MM/YY, CVC, and ZIP"
            />
            {setupStatus === "loading" ? (
              <p className="mt-3 text-sm text-white/50">Loading secure card form...</p>
            ) : null}
          </div>

          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-white/68">
            <input
              type="checkbox"
              className="mt-1 accent-[#7CFF00]"
              checked={saveForFuture}
              onChange={(event) => setSaveForFuture(event.target.checked)}
            />
            <span>I authorize BVRB3R to save this card on file for future bookings.</span>
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
