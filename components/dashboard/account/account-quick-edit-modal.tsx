"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AccountQuickEditVariant = "client" | "barber" | "owner";

export type AccountQuickEditInput = {
  displayName: string;
  email: string;
  phone: string;
  cityLocation: string;
};

export function AccountQuickEditModal({
  open,
  variant,
  displayName,
  email,
  phone,
  cityLocation,
  defaultPaymentMethodLabel,
  managePaymentHref,
  emailVerified = false,
  phoneVerified = false,
  onClose,
  onSave
}: {
  open: boolean;
  variant: AccountQuickEditVariant;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  cityLocation?: string | null;
  defaultPaymentMethodLabel?: string | null;
  managePaymentHref: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onClose: () => void;
  onSave?: (input: AccountQuickEditInput) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AccountQuickEditInput>(() => ({
    displayName,
    email: email ?? "",
    phone: phone ?? "",
    cityLocation: cityLocation ?? ""
  }));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const roleLabel = variant === "owner" ? "Owner account" : variant === "barber" ? "Barber account" : "Client account";
  const normalizedOriginalEmail = (email ?? "").trim().toLowerCase();
  const normalizedOriginalPhone = (phone ?? "").trim();
  const emailChanged = draft.email.trim().toLowerCase() !== normalizedOriginalEmail;
  const phoneChanged = draft.phone.trim() !== normalizedOriginalPhone;

  const paymentCopy = useMemo(() => {
    if (defaultPaymentMethodLabel?.trim()) {
      return defaultPaymentMethodLabel.trim();
    }

    return "No saved default payment method";
  }, [defaultPaymentMethodLabel]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    setStatusMessage(null);

    if (!draft.displayName.trim()) {
      setValidationError("Public display name is required.");
      return;
    }

    if (draft.email.trim() && !draft.email.includes("@")) {
      setValidationError("Enter a valid email address.");
      return;
    }

    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          displayName: draft.displayName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          cityLocation: draft.cityLocation.trim()
        });
        setStatusMessage("Account updates saved. Email or phone changes may still require verification.");
        return;
      }

      setStatusMessage("No direct account save ran. Use verification for email or phone changes and wallet for payment methods.");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Unable to save account changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/76 px-4 py-5 backdrop-blur-xl sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-quick-edit-title"
      data-testid={`${variant}-account-quick-edit-modal`}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_34px_rgba(163,255,18,0.14)] sm:rounded-[28px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Account</p>
            <h2 id="account-quick-edit-title" className="mt-2 text-3xl font-black tracking-[-0.045em]">
              Edit Account
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{roleLabel} details stay separate from public profile content.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account editor"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/55"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold text-white/72">
            Public display name
            <Input
              aria-label="Public display name"
              value={draft.displayName}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              className="mt-2"
            />
          </label>
          <label className="block text-sm font-bold text-white/72">
            City/location
            <Input
              aria-label="City/location"
              value={draft.cityLocation}
              onChange={(event) => setDraft((current) => ({ ...current, cityLocation: event.target.value }))}
              className="mt-2"
              placeholder="City, state, or preferred area"
            />
          </label>
          <label className="block text-sm font-bold text-white/72">
            Email
            <Input
              aria-label="Email"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              className="mt-2"
            />
            <span className={cn("mt-2 block text-xs leading-5", emailChanged ? "text-amber-100" : "text-white/42")}>
              {emailChanged ? "Email changes require verification before this is marked verified." : emailVerified ? "Email verified." : "Email verification is still available from contact settings."}
            </span>
          </label>
          <label className="block text-sm font-bold text-white/72">
            Phone number
            <Input
              aria-label="Phone number"
              value={draft.phone}
              onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
              className="mt-2"
            />
            <span className={cn("mt-2 block text-xs leading-5", phoneChanged ? "text-amber-100" : "text-white/42")}>
              {phoneChanged ? "Phone changes require verification before this is marked verified." : phoneVerified ? "Phone verified." : "Phone verification is still available from contact settings."}
            </span>
          </label>
        </div>

        <div className="mt-5 rounded-[22px] border border-white/10 bg-black/24 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/22 bg-[#A3FF12]/10 text-[#A3FF12]">
                <CreditCard className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-black text-white">Default payment method</p>
                <p className="mt-1 text-sm leading-5 text-white/56">{paymentCopy}</p>
                <p className="mt-2 text-xs leading-5 text-white/40">BVRB3R never collects raw card numbers in this account modal.</p>
              </div>
            </div>
            <Link
              href={managePaymentHref as never}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/78 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
            >
              Manage Payment Method
            </Link>
          </div>
        </div>

        {validationError ? (
          <div className="mt-4 rounded-[18px] border border-red-400/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            {validationError}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="mt-4 rounded-[18px] border border-[#A3FF12]/24 bg-[#A3FF12]/10 p-4 text-sm font-bold text-[#D7FFAB]">
            {statusMessage}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={isSaving} aria-busy={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
