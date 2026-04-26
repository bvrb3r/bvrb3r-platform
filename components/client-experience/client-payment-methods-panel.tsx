"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAddPaymentMethodMutation, usePaymentMethodsQuery, useSetDefaultPaymentMethodMutation, type PaymentApiError } from "@/lib/payments/client";
import { getReadableActionError } from "@/lib/utils/feedback";

export function ClientPaymentMethodsPanel({
  initialMethods,
  isSignedInClient
}: {
  initialMethods: Array<{
    id: string;
    provider: "stripe";
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
    createdAt: string;
    label: string;
  }>;
  isSignedInClient: boolean;
}) {
  const methodsQuery = usePaymentMethodsQuery({ methods: initialMethods }, isSignedInClient);
  const addMethodMutation = useAddPaymentMethodMutation();
  const setDefaultMutation = useSetDefaultPaymentMethodMutation();
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [draft, setDraft] = useState({
    provider: "stripe" as const,
    providerCustomerId: "",
    providerPaymentMethodId: "",
    brand: "",
    last4: "",
    expMonth: "",
    expYear: "",
    isDefault: true
  });

  const methods = methodsQuery.data?.methods ?? [];

  async function handleAddMethod() {
    setStatusMessage(null);
    try {
      const result = await addMethodMutation.mutateAsync({
        provider: draft.provider,
        providerCustomerId: draft.providerCustomerId || undefined,
        providerPaymentMethodId: draft.providerPaymentMethodId,
        brand: draft.brand || undefined,
        last4: draft.last4 || undefined,
        expMonth: draft.expMonth ? Number(draft.expMonth) : undefined,
        expYear: draft.expYear ? Number(draft.expYear) : undefined,
        isDefault: draft.isDefault
      });

      setDraft({
        provider: draft.provider,
        providerCustomerId: "",
        providerPaymentMethodId: "",
        brand: "",
        last4: "",
        expMonth: "",
        expYear: "",
        isDefault: false
      });
      setStatusMessage({
        tone: "success",
        message: `${result.method.label} is now stored as a tokenized payment reference.`
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        message: getReadableActionError(error as PaymentApiError)
      });
    }
  }

  async function handleSetDefault(paymentMethodId: string) {
    setStatusMessage(null);
    try {
      const result = await setDefaultMutation.mutateAsync(paymentMethodId);
      setStatusMessage({
        tone: "success",
        message: `${result.method.label} is now the default payment method.`
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
            Payment methods
          </div>
          <p className="mt-3 text-lg font-semibold text-white">Saved payment methods</p>
          <p className="mt-2 text-sm leading-7 text-white/58">
            Cards are securely stored through the payment provider. BVRB3R does not store raw card numbers.
          </p>
        </div>
        <div className="rounded-[20px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
          {methods.length} saved
        </div>
      </div>

      {statusMessage ? <div className="mt-4"><FeedbackBanner tone={statusMessage.tone} message={statusMessage.message} /></div> : null}

      <div className="mt-4 space-y-3">
        {methods.length ? methods.map((method) => (
          <div key={method.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-black/25 px-4 py-4">
            <div>
              <p className="font-medium text-white">{method.label}</p>
              <p className="mt-1 text-sm text-white/55">
                {method.expMonth && method.expYear ? `Expires ${String(method.expMonth).padStart(2, "0")}/${method.expYear}` : "No expiry metadata stored"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {method.isDefault ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#d7ffab]">
                  <ShieldCheck className="h-4 w-4" />
                  Default
                </span>
              ) : (
                <Button
                  variant="secondary"
                  className="h-10 px-4"
                  disabled={!isSignedInClient || setDefaultMutation.isPending}
                  onClick={() => void handleSetDefault(method.id)}
                >
                  Make default
                </Button>
              )}
            </div>
          </div>
        )) : (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm leading-7 text-white/58">
            No saved payment method yet. Add one below to keep booking and rebooking fast.
          </div>
        )}
      </div>

      {!isSignedInClient ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm leading-7 text-white/58">
          Sign in as the client account to add or update saved payment method references.
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-3 block surface-label">Provider</label>
          <Select value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value as typeof draft.provider }))}>
            <option value="stripe">Stripe</option>
          </Select>
        </div>
        <div>
          <label className="mb-3 block surface-label">Provider customer ref</label>
          <Input value={draft.providerCustomerId} onChange={(event) => setDraft((current) => ({ ...current, providerCustomerId: event.target.value }))} placeholder="cus_..." />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-3 block surface-label">Payment method ref</label>
          <Input value={draft.providerPaymentMethodId} onChange={(event) => setDraft((current) => ({ ...current, providerPaymentMethodId: event.target.value }))} placeholder="pm_... or tokenized provider ref" />
        </div>
        <div>
          <label className="mb-3 block surface-label">Brand</label>
          <Input value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} placeholder="Visa" />
        </div>
        <div>
          <label className="mb-3 block surface-label">Last 4</label>
          <Input value={draft.last4} maxLength={4} onChange={(event) => setDraft((current) => ({ ...current, last4: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="4242" />
        </div>
        <div>
          <label className="mb-3 block surface-label">Exp month</label>
          <Input value={draft.expMonth} onChange={(event) => setDraft((current) => ({ ...current, expMonth: event.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder="08" />
        </div>
        <div>
          <label className="mb-3 block surface-label">Exp year</label>
          <Input value={draft.expYear} onChange={(event) => setDraft((current) => ({ ...current, expYear: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="2028" />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm text-white/62">
        <input
          type="checkbox"
          className="accent-[#7CFF00]"
          checked={draft.isDefault}
          onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))}
        />
        Save as default method
      </label>

      <Button
        className="mt-4 h-11 px-5"
        disabled={!isSignedInClient || addMethodMutation.isPending || !draft.providerPaymentMethodId.trim()}
        onClick={() => void handleAddMethod()}
      >
        {addMethodMutation.isPending ? "Saving..." : "Add payment method"}
      </Button>
    </div>
  );
}
