"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import {
  StripeCardOnFileForm,
  STRIPE_CARD_FORM_LOAD_ERROR,
  type ConfirmStripeCardSetup
} from "@/components/payments/stripe-card-on-file-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddPaymentMethodMutation,
  useCreateSavedPaymentMethodSetupMutation,
  usePaymentMethodsQuery,
  useRenamePaymentMethodMutation,
  useRemovePaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
  type ClientPaymentMethodView,
  type PaymentApiError,
  type PaymentSetupIntentView
} from "@/lib/payments/client";
import { getReadableActionError } from "@/lib/utils/feedback";

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
    return "Default for bookings";
  }

  const month = String(method.expMonth).padStart(2, "0");
  const year = String(method.expYear).slice(-2);
  return `Exp ${month}/${year}`;
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
  const renameMethodMutation = useRenamePaymentMethodMutation();
  const removeMethodMutation = useRemovePaymentMethodMutation();
  const setupMutation = useCreateSavedPaymentMethodSetupMutation();
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [mode, setMode] = useState<"saved" | "add">("saved");
  const [authorized, setAuthorized] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [setupIntent, setSetupIntent] = useState<PaymentSetupIntentView | null>(null);
  const [inlineSavedPaymentMethod, setInlineSavedPaymentMethod] = useState<ClientPaymentMethodView | null>(null);
  const [pendingStripePaymentMethodId, setPendingStripePaymentMethodId] = useState<string | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [renamingMethod, setRenamingMethod] = useState<ClientPaymentMethodView | null>(null);
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const setupRequestStartedRef = useRef(false);
  const confirmCardSetupRef = useRef<ConfirmStripeCardSetup | null>(null);

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
  const canSaveCard = setupStatus === "ready" && cardComplete && authorized && Boolean(confirmCardSetupRef.current) && !addMethodMutation.isPending;

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
          console.error("[payments] payment setup intent is incomplete", {
            reference: intent.clientSecret ? "stripe_publishable_key_missing" : "setup_intent_client_secret_missing",
            hasClientSecret: Boolean(intent.clientSecret),
            hasPublishableKey: Boolean(intent.publishableKey)
          });
          setSetupStatus("error");
          setSetupMessage(STRIPE_CARD_FORM_LOAD_ERROR);
          return;
        }

        setSetupIntent(intent);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        console.error("[payments] payment setup intent could not be created", {
          reference: "stripe_setup_intent_create_failed"
        });
        setSetupStatus("error");
        setSetupMessage(STRIPE_CARD_FORM_LOAD_ERROR);
      });

    return () => {
      cancelled = true;
    };
  }, [setupIntent, setupMutation, showAddForm]);

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

  function startAddCard() {
    setMode("add");
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setStatusMessage(null);
    setCardComplete(false);
    confirmCardSetupRef.current = null;
    setPendingStripePaymentMethodId(null);
    setNicknameDraft("");
  }

  function cancelAddCard() {
    setMode("saved");
    setSetupIntent(null);
    setupRequestStartedRef.current = false;
    setSetupStatus("idle");
    setSetupMessage(null);
    setAuthorized(false);
    setCardComplete(false);
    confirmCardSetupRef.current = null;
    setPendingStripePaymentMethodId(null);
    setNicknameDraft("");
  }

  async function handleSaveCard() {
    setStatusMessage(null);
    setSetupMessage(null);

    if (!authorized) {
      setSetupMessage("Authorize BVRB3R to save this card before continuing.");
      return;
    }

    const confirmCardSetup = confirmCardSetupRef.current;
    if (!confirmCardSetup || !setupIntent?.clientSecret) {
      setSetupStatus("error");
      setSetupMessage(STRIPE_CARD_FORM_LOAD_ERROR);
      return;
    }

    if (!cardComplete) {
      setSetupMessage("Enter complete card details.");
      return;
    }

    try {
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
    setAuthorized(false);
    setCardComplete(false);
    confirmCardSetupRef.current = null;
  }

  async function saveConfirmedCard() {
    if (!pendingStripePaymentMethodId || !setupIntent) {
      setSetupMessage("Card could not be saved.");
      return;
    }

    const nickname = nicknameDraft.trim();
    const payload = {
      provider: "stripe" as const,
      providerCustomerId: setupIntent.customerId,
      providerPaymentMethodId: pendingStripePaymentMethodId,
      nickname: nickname || undefined,
      isDefault: true
    };

    try {
      const response = await addMethodMutation.mutateAsync(payload);
      setInlineSavedPaymentMethod(response.method);
      setMode("saved");
      resetConfirmedCardState();
      setStatusMessage({
        tone: "success",
        message: "Card saved."
      });
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
          setInlineSavedPaymentMethod(response.method);
          setMode("saved");
          resetConfirmedCardState();
          setStatusMessage({
            tone: "error",
            message: "Card name could not be saved, but the card was saved."
          });
          return;
        } catch {
          // Fall through to the normal card-save error.
        }
      }

      setSetupMessage("Card could not be saved.");
    }
  }

  async function handleRenameCard() {
    if (!renamingMethod) {
      return;
    }

    try {
      const response = await renameMethodMutation.mutateAsync({
        paymentMethodId: renamingMethod.id,
        nickname: nicknameDraft
      });
      setInlineSavedPaymentMethod(response.method);
      setRenamingMethod(null);
      setNicknameDraft("");
      setStatusMessage({
        tone: "success",
        message: "Card name saved."
      });
    } catch (error) {
      console.error("[payments] payment_method_nickname_save_failed", {
        reference: "payment_method_nickname_save_failed",
        message: error instanceof Error ? error.message : "Unknown card nickname save failure"
      });
      setStatusMessage({
        tone: "error",
        message: "Card name could not be saved, but the card was saved."
      });
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
                {defaultMethod.nickname ? (
                  <p className="mt-1 text-sm text-white/68">{getPaymentMethodCardLine(defaultMethod)}</p>
                ) : null}
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
                    {method.nickname ? (
                      <p className="mt-1 text-xs text-white/58">{getPaymentMethodCardLine(method)}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-white/45">{getExpirationLabel(method)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 px-3"
                      disabled={!isSignedInClient || setDefaultMutation.isPending}
                      onClick={() => void handleSetDefault(method.id)}
                    >
                      Make default
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 px-3"
                      onClick={() => {
                        setRenamingMethod(method);
                        setNicknameDraft(method.nickname ?? "");
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 px-3"
                      disabled={removeMethodMutation.isPending}
                      onClick={() => void handleRemove(method.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              onClick={() => {
                setRenamingMethod(defaultMethod);
                setNicknameDraft(defaultMethod.nickname ?? "");
              }}
            >
              Rename
            </Button>
            <Button type="button" variant="secondary" className="h-10 px-4" onClick={startAddCard}>
              Replace
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
              <p className="text-base font-semibold text-white">Card details</p>
              <p className="mt-2 text-sm leading-7 text-white/58">Enter a card to keep booking and rebooking fast.</p>
            </div>
            <Badge className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure
            </Badge>
          </div>

          <div className="mt-4">
            <StripeCardOnFileForm
              setupIntent={setupIntent}
              isSetupIntentLoading={setupMutation.isPending || setupStatus === "idle"}
              onReadyChange={handleStripeReadyChange}
              onCompleteChange={handleStripeCompleteChange}
              onErrorMessage={handleStripeErrorMessage}
              onStatusChange={handleStripeStatusChange}
              onConfirmSetupChange={handleConfirmSetupChange}
            />
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
              {setupMutation.isPending || setupStatus === "loading" ? "Loading card form..." : addMethodMutation.isPending ? "Saving card..." : "Save card"}
            </Button>
            {methods.length ? (
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={cancelAddCard}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingStripePaymentMethodId ? (
        <CardNameModal
          title="Name this card"
          copy="Give this card a name so it is easy to recognize later."
          value={nicknameDraft}
          isPending={addMethodMutation.isPending}
          onChange={setNicknameDraft}
          onCancel={resetConfirmedCardState}
          onSave={() => void saveConfirmedCard()}
        />
      ) : null}

      {renamingMethod ? (
        <CardNameModal
          title="Rename card"
          copy="Update the name clients see for this saved card."
          value={nicknameDraft}
          isPending={renameMethodMutation.isPending}
          onChange={setNicknameDraft}
          onCancel={() => {
            setRenamingMethod(null);
            setNicknameDraft("");
          }}
          onSave={() => void handleRenameCard()}
        />
      ) : null}
    </div>
  );
}

function CardNameModal({
  title,
  copy,
  value,
  isPending,
  onChange,
  onCancel,
  onSave
}: {
  title: string;
  copy: string;
  value: string;
  isPending: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-5 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-[22px] border border-white/10 bg-[#080808] p-5 shadow-2xl">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm leading-6 text-white/58">{copy}</p>
        <div className="mt-4">
          <label className="surface-label mb-2 block" htmlFor="saved-card-nickname">Card name</label>
          <Input
            id="saved-card-nickname"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Example: Phil Stripe Card"
            maxLength={80}
          />
          <p className="mt-2 text-xs leading-5 text-white/42">We&apos;ll also show the card brand and last 4 digits.</p>
        </div>
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

