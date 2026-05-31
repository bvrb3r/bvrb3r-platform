"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AccountQuickEditVariant = "client" | "barber" | "owner";

export type AccountQuickEditInput = {
  displayName: string;
  fullName: string;
  email: string;
  phone: string;
  cityLocation: string;
  defaultPaymentMethodId?: string | null;
};

export type AccountQuickEditLocationOption = {
  label: string;
  city: string;
  state: string;
};

export type AccountQuickEditPaymentOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

const EMPTY_LOCATION_OPTIONS: AccountQuickEditLocationOption[] = [];
const EMPTY_PAYMENT_OPTIONS: AccountQuickEditPaymentOption[] = [];

export function AccountQuickEditModal({
  open,
  variant,
  displayName,
  fullName,
  email,
  phone,
  cityLocation,
  defaultPaymentMethodLabel,
  paymentOptions = EMPTY_PAYMENT_OPTIONS,
  defaultPaymentMethodId,
  managePaymentHref,
  locationOptions = EMPTY_LOCATION_OPTIONS,
  requireLocationOption = false,
  emailVerified = false,
  phoneVerified = false,
  onClose,
  onPaymentAction,
  onSave
}: {
  open: boolean;
  variant: AccountQuickEditVariant;
  displayName: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  cityLocation?: string | null;
  defaultPaymentMethodLabel?: string | null;
  paymentOptions?: AccountQuickEditPaymentOption[];
  defaultPaymentMethodId?: string | null;
  managePaymentHref: string;
  locationOptions?: AccountQuickEditLocationOption[];
  requireLocationOption?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onClose: () => void;
  onPaymentAction?: (href: string) => void;
  onSave?: (input: AccountQuickEditInput) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AccountQuickEditInput>(() => ({
    displayName,
    fullName: fullName ?? displayName,
    email: email ?? "",
    phone: phone ?? "",
    cityLocation: cityLocation ?? "",
    defaultPaymentMethodId: defaultPaymentMethodId ?? paymentOptions.find((method) => method.isDefault)?.id ?? null
  }));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const roleDescription = variant === "owner"
    ? "Private owner details stay separate from the public shop profile."
    : variant === "barber"
      ? "Account details stay separate from services, portfolio, and public barber profile content."
      : "Account details stay separate from your Culture public profile.";
  const normalizedOriginalEmail = (email ?? "").trim().toLowerCase();
  const normalizedOriginalPhone = (phone ?? "").trim();
  const emailChanged = draft.email.trim().toLowerCase() !== normalizedOriginalEmail;
  const phoneChanged = draft.phone.trim() !== normalizedOriginalPhone;
  const sortedLocationOptions = useMemo(
    () => [...locationOptions].sort((left, right) => left.label.localeCompare(right.label)),
    [locationOptions]
  );
  const filteredLocationOptions = useMemo(() => {
    const query = draft.cityLocation.trim().toLowerCase();
    if (!query) {
      return sortedLocationOptions.slice(0, 6);
    }

    return sortedLocationOptions.filter((option) => option.label.toLowerCase().includes(query)).slice(0, 6);
  }, [draft.cityLocation, sortedLocationOptions]);
  const selectedLocationOption = sortedLocationOptions.find((option) => option.label.toLowerCase() === draft.cityLocation.trim().toLowerCase()) ?? null;
  const selectedPaymentOption = paymentOptions.find((method) => method.id === draft.defaultPaymentMethodId) ?? null;

  const paymentCopy = useMemo(() => {
    if (selectedPaymentOption) {
      return selectedPaymentOption.label;
    }

    if (defaultPaymentMethodLabel?.trim()) {
      return defaultPaymentMethodLabel.trim();
    }

    return "No saved default payment method";
  }, [defaultPaymentMethodLabel, selectedPaymentOption]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft({
      displayName,
      fullName: fullName ?? displayName,
      email: email ?? "",
      phone: phone ?? "",
      cityLocation: cityLocation ?? "",
      defaultPaymentMethodId: defaultPaymentMethodId ?? paymentOptions.find((method) => method.isDefault)?.id ?? null
    });
    setValidationError(null);
    setStatusMessage(null);
  }, [cityLocation, defaultPaymentMethodId, displayName, email, fullName, open, paymentOptions, phone]);

  if (!open) {
    return null;
  }

  const paymentTitle = variant === "client" ? "Default payment method" : "Default payment method & Payout";
  const paymentActionLabel = variant === "client" ? "Manage Payment Method" : "Click here";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    setStatusMessage(null);

    if (!draft.displayName.trim()) {
      setValidationError("Public display name is required.");
      return;
    }

    if (!draft.fullName.trim()) {
      setValidationError("Full name is required.");
      return;
    }

    if (draft.email.trim() && !draft.email.includes("@")) {
      setValidationError("Enter a valid email address.");
      return;
    }

    if (requireLocationOption && sortedLocationOptions.length && !selectedLocationOption) {
      setValidationError("Choose a supported barber-market city from the list.");
      return;
    }

    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          displayName: draft.displayName.trim(),
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          cityLocation: selectedLocationOption?.label ?? draft.cityLocation.trim(),
          defaultPaymentMethodId: draft.defaultPaymentMethodId ?? null
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

  function selectLocation(option: AccountQuickEditLocationOption) {
    setValidationError(null);
    setDraft((current) => ({ ...current, cityLocation: option.label }));
  }

  function handlePaymentAction() {
    if (onPaymentAction) {
      onPaymentAction(managePaymentHref);
      return;
    }

    onClose();
    window.setTimeout(() => {
      window.location.assign(managePaymentHref);
    }, 0);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-black/76 px-4 py-5 backdrop-blur-xl sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-quick-edit-title"
      data-testid={`${variant}-account-quick-edit-modal`}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] text-white shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_34px_rgba(163,255,18,0.14)] sm:max-h-[92vh] sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3 sm:p-6 sm:pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Account</p>
            <h2 id="account-quick-edit-title" className="mt-2 text-3xl font-black tracking-[-0.045em]">
              Edit Account
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{roleDescription}</p>
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

        <div className="flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
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
              aria-describedby="account-location-helper"
            />
            {filteredLocationOptions.length ? (
              <div className="mt-2 grid gap-2" role="listbox" aria-label="Location suggestions">
                {filteredLocationOptions.map((option) => (
                  <button
                    key={`${option.city}-${option.state}`}
                    type="button"
                    className={cn(
                      "min-h-10 rounded-2xl border px-3 text-left text-xs font-bold transition",
                      selectedLocationOption?.label === option.label
                        ? "border-[#A3FF12]/45 bg-[#A3FF12]/10 text-[#E7FFC6]"
                        : "border-white/8 bg-black/20 text-white/58 hover:border-[#A3FF12]/28 hover:text-white"
                    )}
                    onClick={() => selectLocation(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <span id="account-location-helper" className="mt-2 block text-xs leading-5 text-white/42">
              {requireLocationOption ? "Choose a city where BVRB3R has active bookable supply." : "Start typing to use known app city/state suggestions."}
            </span>
          </label>
          <label className="block text-sm font-bold text-white/72">
            Full name
            <Input
              aria-label="Full name"
              value={draft.fullName}
              onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
              className="mt-2"
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
                <p className="text-sm font-black text-white">{paymentTitle}</p>
                <p className="mt-1 text-sm leading-5 text-white/56">{paymentCopy}</p>
                <p className="mt-2 text-xs leading-5 text-white/40">BVRB3R never collects raw card numbers in this account modal.</p>
              </div>
            </div>
            {variant === "client" && paymentOptions.length > 1 ? (
              <label className="w-full text-xs font-black uppercase tracking-[0.14em] text-white/44 sm:w-56">
                Saved default
                <select
                  aria-label="Default payment method"
                  value={draft.defaultPaymentMethodId ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, defaultPaymentMethodId: event.target.value || null }))}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-[#A3FF12]/45 focus:ring-2 focus:ring-[#A3FF12]/18"
                >
                  {paymentOptions.map((method) => (
                    <option key={method.id} value={method.id}>{method.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={handlePaymentAction}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/78 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
            >
              {paymentActionLabel}
            </button>
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

        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-white/10 bg-black/88 p-5 backdrop-blur-xl sm:flex-row sm:p-6">
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
