"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import {
  StripeCardOnFileForm,
  STRIPE_CARD_FORM_LOAD_ERROR,
  STRIPE_CARD_FORM_MISSING_KEY_ERROR,
  STRIPE_CARD_FORM_MISSING_SECRET_ERROR,
  type ConfirmStripeCardSetup,
  type StripeSetupIntentRequestDebug
} from "@/components/payments/stripe-card-on-file-form";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddPaymentMethodMutation,
  useCreateSavedPaymentMethodSetupMutation,
  type PaymentApiError,
  type ClientPaymentMethodView,
  type PaymentSetupIntentView
} from "@/lib/payments/client";
import { currency } from "@/lib/utils";

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

function getPaymentMethodTitle(method: ClientPaymentMethodView) {
  if (method.nickname?.trim()) {
    return method.nickname.trim();
  }

  return getPaymentMethodCardLine(method);
}

function getPaymentMethodCardLine(method: ClientPaymentMethodView) {
  const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : "Card";
  return method.last4 ? `${brand} \u2022\u2022\u2022\u2022 ${method.last4}` : method.label;
}

function getExpirationLabel(method: ClientPaymentMethodView) {
  if (!method.expMonth || !method.expYear) {
    return "Exp saved on file";
  }

  const month = String(method.expMonth).padStart(2, "0");
  const year = String(method.expYear).slice(-2);
  return `Exp ${month}/${year}`;
}

const PAYMENT_SETUP_START_ERROR = "Payment setup could not start. Refresh and try again.";

function createInitialSetupDebug(): StripeSetupIntentRequestDebug {
  return {
    requestStarted: false,
    statusCode: null,
    ready: false,
    error: null,
    clientSecretPresent: false,
    publishableKeyPresent: false,
    customerIdPresent: false
  };
}

type PaymentMethodSaveDebug = {
  pendingStripePaymentMethodIdPresent: boolean;
  requestStarted: boolean;
  statusCode: number | null;
  lastError: string | null;
  savedMethodId: string | null;
  defaultPaymentMethodId: string | null;
  clientPreferencesUpdated: boolean;
};

function createInitialSaveDebug(): PaymentMethodSaveDebug {
  return {
    pendingStripePaymentMethodIdPresent: false,
    requestStarted: false,
    statusCode: null,
    lastError: null,
    savedMethodId: null,
    defaultPaymentMethodId: null,
    clientPreferencesUpdated: false
  };
}

function getPaymentSaveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Card could not be saved.";
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
  const [cardComplete, setCardComplete] = useState(false);
  const [setupIntent, setSetupIntent] = useState<PaymentSetupIntentView | null>(null);
  const [pendingStripePaymentMethodId, setPendingStripePaymentMethodId] = useState<string | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [setupDebug, setSetupDebug] = useState<StripeSetupIntentRequestDebug>(() => createInitialSetupDebug());
  const [saveDebug, setSaveDebug] = useState<PaymentMethodSaveDebug>(() => createInitialSaveDebug());
  const setupMutation = useCreateSavedPaymentMethodSetupMutation();
  const addMethodMutation = useAddPaymentMethodMutation();
  const confirmCardSetupRef = useRef<ConfirmStripeCardSetup | null>(null);
  const setupRequestStartedRef = useRef(false);
  const createSetupIntentRef = useRef(setupMutation.mutateAsync);
  const showPaymentDebugPanel = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("debugPayments") === "1";

  const showAddForm = mode === "add" || (!paymentMethods.length && !isLoading);
  const isPending = setupMutation.isPending || addMethodMutation.isPending || setupStatus === "loading";
  const canSaveCard = setupStatus === "ready"
    && cardComplete
    && saveForFuture
    && Boolean(setupIntent?.clientSecret)
    && Boolean(confirmCardSetupRef.current)
    && !addMethodMutation.isPending;
  const saveCardButtonLabel = addMethodMutation.isPending
    ? "Saving card..."
    : setupMutation.isPending || setupStatus === "idle"
      ? "Creating secure card session..."
      : setupStatus === "loading"
        ? "Loading secure card fields..."
        : "Save card";
  const selectedTitle = selectedPaymentMethod ? getPaymentMethodTitle(selectedPaymentMethod) : "";
  const selectedCardLine = selectedPaymentMethod ? getPaymentMethodCardLine(selectedPaymentMethod) : "";
  const selectedExpiration = selectedPaymentMethod ? getExpirationLabel(selectedPaymentMethod) : "";

  useEffect(() => {
    createSetupIntentRef.current = setupMutation.mutateAsync;
  }, [setupMutation.mutateAsync]);

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
    setSetupDebug({
      ...createInitialSetupDebug(),
      requestStarted: true
    });
    console.log("[payments] setup_intent_request_started", {
      reference: "setup_intent_request_started",
      surface: "booking"
    });
    createSetupIntentRef.current()
      .then((intent) => {
        if (cancelled) {
          return;
        }

        const responseDebug = {
          requestStarted: true,
          statusCode: intent.setupIntentStatusCode ?? 200,
          ready: Boolean(intent.clientSecret && intent.publishableKey),
          error: null,
          clientSecretPresent: Boolean(intent.clientSecret),
          publishableKeyPresent: Boolean(intent.publishableKey),
          customerIdPresent: Boolean(intent.customerId)
        };
        setSetupDebug(responseDebug);
        console.log("[payments] setup_intent_response_ready", {
          reference: "setup_intent_response_ready",
          surface: "booking",
          hasClientSecret: Boolean(intent.clientSecret),
          clientSecretPrefix: intent.clientSecret?.startsWith("seti_")
            ? "seti"
            : intent.clientSecret?.startsWith("pi_")
              ? "pi"
              : intent.clientSecret
                ? "invalid"
                : "missing",
          clientSecretStartsWithSeti: Boolean(intent.clientSecret?.startsWith("seti_")),
          hasPublishableKey: Boolean(intent.publishableKey),
          publishableKeyPrefix: intent.publishableKey?.startsWith("pk_test_")
            ? "pk_test"
            : intent.publishableKey?.startsWith("pk_live_")
              ? "pk_live"
              : intent.publishableKey
                ? "invalid"
                : "missing"
        });

        if (!intent.clientSecret || !intent.publishableKey) {
          console.error("[payments] booking payment setup intent is incomplete", {
            reference: intent.clientSecret ? "stripe_publishable_key_missing" : "setup_intent_client_secret_missing",
            hasClientSecret: Boolean(intent.clientSecret),
            hasPublishableKey: Boolean(intent.publishableKey)
          });
          setSetupStatus("error");
          setSetupMessage(intent.clientSecret ? STRIPE_CARD_FORM_MISSING_KEY_ERROR : STRIPE_CARD_FORM_MISSING_SECRET_ERROR);
          setSetupDebug({
            ...responseDebug,
            ready: false,
            error: intent.clientSecret ? "publishable_key_missing" : "client_secret_missing"
          });
          return;
        }

        setSetupIntent(intent);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("[payments] booking payment setup intent could not be created", {
          reference: "stripe_setup_intent_create_failed"
        });
        setSetupStatus("error");
        setSetupMessage(PAYMENT_SETUP_START_ERROR);
        setSetupDebug({
          requestStarted: true,
          statusCode: typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : null,
          ready: false,
          error: error instanceof Error && error.message ? error.message : "setup_intent_request_failed",
          clientSecretPresent: false,
          publishableKeyPresent: false,
          customerIdPresent: false
        });
      });

    return () => {
      cancelled = true;
    };
  }, [setupIntent, showAddForm]);

  const handleStripeStatusChange = useCallback((status: "idle" | "loading" | "ready" | "error") => {
    setSetupStatus(status);
  }, []);

  const handleStripeReadyChange = useCallback((ready: boolean) => {
    if (ready) {
      setSetupStatus("ready");
    }
  }, []);

  const handleStripeCompleteChange = useCallback((complete: boolean) => {
    setCardComplete(complete);
  }, []);

  const handleStripeErrorMessage = useCallback((message: string | null) => {
    setSetupMessage(message);
  }, []);

  const handleConfirmSetupChange = useCallback((confirmSetup: ConfirmStripeCardSetup | null) => {
    confirmCardSetupRef.current = confirmSetup;
  }, []);

  const retryCardSetup = useCallback(() => {
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setSetupDebug(createInitialSetupDebug());
    setSaveDebug(createInitialSaveDebug());
    setCardComplete(false);
    confirmCardSetupRef.current = null;
  }, []);

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
    setSetupDebug(createInitialSetupDebug());
    setSaveDebug(createInitialSaveDebug());
    setCardComplete(false);
    confirmCardSetupRef.current = null;
    setPendingStripePaymentMethodId(null);
    setNicknameDraft("");
  }

  async function handleSaveCard() {
    setSetupMessage(null);

    try {
      if (!saveForFuture) {
        setSetupMessage("Authorize BVRB3R to save this card before continuing.");
        return;
      }

      if (!cardComplete) {
        setSetupMessage("Enter complete card details before saving.");
        return;
      }

      const confirmCardSetup = confirmCardSetupRef.current;
      if (!confirmCardSetup || !setupIntent?.clientSecret) {
        setSetupStatus("error");
        setSetupMessage(STRIPE_CARD_FORM_LOAD_ERROR);
        return;
      }

      const providerPaymentMethodId = await confirmCardSetup();
      setPendingStripePaymentMethodId(providerPaymentMethodId);
      setNicknameDraft("");
    } catch (error) {
      setSetupStatus("ready");
      console.error("[payments] stripe_confirm_card_setup_failed", {
        reference: "stripe_confirm_card_setup_failed",
        message: error instanceof Error ? error.message : "Unknown Stripe card setup failure"
      });
      setSetupMessage(error instanceof Error && error.message ? error.message : "Card could not be saved.");
    }
  }

  function resetConfirmedCardState() {
    setPendingStripePaymentMethodId(null);
    setNicknameDraft("");
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setSetupDebug(createInitialSetupDebug());
    setSaveDebug(createInitialSaveDebug());
    setSaveForFuture(false);
    setCardComplete(false);
    confirmCardSetupRef.current = null;
  }

  async function saveConfirmedCard() {
    if (!pendingStripePaymentMethodId || !setupIntent) {
      setSetupMessage("Card could not be saved.");
      setSaveDebug({
        pendingStripePaymentMethodIdPresent: Boolean(pendingStripePaymentMethodId),
        requestStarted: false,
        statusCode: null,
        lastError: "missing_confirmed_payment_method",
        savedMethodId: null,
        defaultPaymentMethodId: null,
        clientPreferencesUpdated: false
      });
      return;
    }

    const nickname = nicknameDraft.trim();
    const payload = {
      provider: "stripe" as const,
      providerCustomerId: setupIntent.customerId,
      providerPaymentMethodId: pendingStripePaymentMethodId,
      nickname: nickname || undefined,
      isDefault: saveForFuture || paymentMethods.length === 0
    };

    try {
      setSaveDebug({
        pendingStripePaymentMethodIdPresent: true,
        requestStarted: true,
        statusCode: null,
        lastError: null,
        savedMethodId: null,
        defaultPaymentMethodId: null,
        clientPreferencesUpdated: false
      });
      const response = await addMethodMutation.mutateAsync(payload);
      setSaveDebug({
        pendingStripePaymentMethodIdPresent: true,
        requestStarted: true,
        statusCode: response.savePaymentStatusCode ?? 200,
        lastError: null,
        savedMethodId: response.method.id,
        defaultPaymentMethodId: response.defaultPaymentMethodId ?? (response.method.isDefault ? response.method.id : null),
        clientPreferencesUpdated: Boolean(response.clientPreferencesUpdated)
      });
      onSavedPaymentMethod(response.method);
      onSelectPaymentMethod(response.method.id);
      setMode("saved");
      setChangeOpen(false);
      setSetupStatus("success");
      resetConfirmedCardState();
    } catch (error) {
      if (nickname) {
        console.error("[payments] payment_method_nickname_save_failed", {
          reference: "payment_method_nickname_save_failed",
          message: error instanceof Error ? error.message : "Unknown card nickname save failure"
        });
        try {
          const response = await addMethodMutation.mutateAsync({
            ...payload,
            nickname: undefined
          });
          setSaveDebug({
            pendingStripePaymentMethodIdPresent: true,
            requestStarted: true,
            statusCode: response.savePaymentStatusCode ?? 200,
            lastError: "nickname_save_failed_card_saved",
            savedMethodId: response.method.id,
            defaultPaymentMethodId: response.defaultPaymentMethodId ?? (response.method.isDefault ? response.method.id : null),
            clientPreferencesUpdated: Boolean(response.clientPreferencesUpdated)
          });
          onSavedPaymentMethod(response.method);
          onSelectPaymentMethod(response.method.id);
          setMode("saved");
          setChangeOpen(false);
          resetConfirmedCardState();
          setSetupMessage("Card name could not be saved, but the card was saved.");
          return;
        } catch (retryError) {
          const retryMessage = getPaymentSaveErrorMessage(retryError);
          setSaveDebug({
            pendingStripePaymentMethodIdPresent: true,
            requestStarted: true,
            statusCode: typeof (retryError as PaymentApiError).status === "number" ? (retryError as PaymentApiError).status! : null,
            lastError: retryMessage,
            savedMethodId: null,
            defaultPaymentMethodId: null,
            clientPreferencesUpdated: false
          });
          // Fall through to the normal card-save error.
        }
      }

      const message = getPaymentSaveErrorMessage(error);
      setSaveDebug({
        pendingStripePaymentMethodIdPresent: true,
        requestStarted: true,
        statusCode: typeof (error as PaymentApiError).status === "number" ? (error as PaymentApiError).status! : null,
        lastError: message,
        savedMethodId: null,
        defaultPaymentMethodId: null,
        clientPreferencesUpdated: false
      });
      setSetupMessage(message);
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
              {selectedPaymentMethod.nickname ? (
                <p className="mt-1 text-sm text-white/68">{selectedCardLine}</p>
              ) : null}
              <p className="mt-1 text-sm text-white/58">
                {selectedPaymentMethod.isDefault ? "Default for bookings" : "Charged when you book"}
              </p>
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
                    {method.title}{method.nickname ? ` - ${getPaymentMethodCardLine(method)}` : ""}{method.isDefault ? " (default)" : ""}
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
            <StripeCardOnFileForm
              setupIntent={setupIntent}
              setupIntentError={setupStatus === "error" ? setupMessage : null}
              setupIntentDebug={setupDebug}
              isSetupIntentLoading={setupMutation.isPending || setupStatus === "idle"}
              onReadyChange={handleStripeReadyChange}
              onCompleteChange={handleStripeCompleteChange}
              onErrorMessage={handleStripeErrorMessage}
              onStatusChange={handleStripeStatusChange}
              onConfirmSetupChange={handleConfirmSetupChange}
              onRetryLoad={retryCardSetup}
            />
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
            <Button type="button" className="h-11 px-5" disabled={!canSaveCard || isPending} onClick={handleSaveCard}>
              {saveCardButtonLabel}
            </Button>
            {paymentMethods.length ? (
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => setMode("saved")}>
                Cancel
              </Button>
            ) : null}
            {setupStatus === "error" ? (
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={retryCardSetup}>
                Retry loading card form
              </Button>
            ) : null}
            <Link href="/dashboard/client/profile?section=wallet" className="text-sm font-medium text-white/48 transition hover:text-[#d7ffab]">
              Manage payment methods
            </Link>
          </div>

          {pendingStripePaymentMethodId ? (
            <CardNameModal
              value={nicknameDraft}
              isPending={addMethodMutation.isPending}
              debug={showPaymentDebugPanel ? saveDebug : null}
              onChange={setNicknameDraft}
              onCancel={resetConfirmedCardState}
              onSave={() => void saveConfirmedCard()}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function CardNameModal({
  value,
  isPending,
  debug,
  onChange,
  onCancel,
  onSave
}: {
  value: string;
  isPending: boolean;
  debug?: PaymentMethodSaveDebug | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-5 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-[22px] border border-white/10 bg-[#080808] p-5 shadow-2xl">
        <p className="text-lg font-semibold text-white">Name this card</p>
        <p className="mt-2 text-sm leading-6 text-white/58">Give this card a name so it is easy to recognize later.</p>
        <div className="mt-4">
          <label className="surface-label mb-2 block" htmlFor="booking-saved-card-nickname">Card name</label>
          <Input
            id="booking-saved-card-nickname"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Example: Phil Stripe Card"
            maxLength={80}
          />
          <p className="mt-2 text-xs leading-5 text-white/42">We&apos;ll also show the card brand and last 4 digits.</p>
        </div>
        {debug ? <PaymentSaveDebugPanel debug={debug} /> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" className="h-10 px-4" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="h-10 px-4" disabled={isPending} onClick={onSave}>
            {isPending ? "Saving..." : "Save Card"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentSaveDebugPanel({ debug }: { debug: PaymentMethodSaveDebug }) {
  const rows: Array<[string, string]> = [
    ["pendingStripePaymentMethodId", String(debug.pendingStripePaymentMethodIdPresent)],
    ["savePaymentRequestStarted", String(debug.requestStarted)],
    ["savePaymentStatusCode", debug.statusCode == null ? "none" : String(debug.statusCode)],
    ["savePaymentLastError", debug.lastError ?? "none"],
    ["savedMethodId", debug.savedMethodId ?? "none"],
    ["defaultPaymentMethodId", debug.defaultPaymentMethodId ?? "none"],
    ["clientPreferencesUpdated", String(debug.clientPreferencesUpdated)]
  ];

  return (
    <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/58">
      <p className="mb-2 font-semibold text-white/74">Payment save debug</p>
      <div className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span>{label}</span>
            <span className="font-mono text-white/78">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

