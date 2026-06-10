"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CreditCard, Landmark, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AccountQuickEditVariant = "client" | "barber" | "owner";

export type AccountQuickEditInput = {
  publicUsername: string;
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

type AccountFinancialRail = {
  visible: boolean;
  label: string;
  statusLabel: string;
  helperText: string;
  actionLabel: string;
  actionTarget: string;
  lockedReason?: string;
  eligibilityItems?: string[];
};

type AccountFinancialRails = {
  paymentRail: AccountFinancialRail;
  payoutRail: AccountFinancialRail;
};

const EMPTY_LOCATION_OPTIONS: AccountQuickEditLocationOption[] = [];
const EMPTY_PAYMENT_OPTIONS: AccountQuickEditPaymentOption[] = [];
const RESERVED_PUBLIC_USERNAMES = new Set([
  "admin",
  "support",
  "bvrb3r",
  "payments",
  "help",
  "official",
  "system",
  "architect",
  "owner",
  "barber",
  "client",
  "shop"
]);

function normalizePublicUsernameDraft(publicUsername?: string | null) {
  const trimmed = publicUsername?.trim() ?? "";
  if (!trimmed || /not set/i.test(trimmed)) {
    return "";
  }

  return normalizePublicUsernameValue(trimmed);
}

function normalizePublicUsernameValue(publicUsername: string) {
  return publicUsername.trim().replace(/^@+/, "").toLowerCase();
}

function isValidPublicUsername(publicUsername: string) {
  return /^[a-z0-9._]{3,30}$/.test(publicUsername);
}

export function resolveAccountFinancialRails({
  variant,
  paymentStatusLabel,
  payoutStatusLabel,
  managePaymentHref,
  managePayoutHref,
  creatorPayoutEligible = false,
  creatorPayoutLockedReason
}: {
  variant: AccountQuickEditVariant;
  paymentStatusLabel: string;
  payoutStatusLabel?: string | null;
  managePaymentHref: string;
  managePayoutHref?: string | null;
  creatorPayoutEligible?: boolean;
  creatorPayoutLockedReason?: string | null;
}): AccountFinancialRails {
  const paymentHelperByVariant: Record<AccountQuickEditVariant, string> = {
    client: "Used for bookings, auto-booking, subscriptions, and BVRB3R purchases.",
    barber: "Used for bookings, subscriptions, and BVRB3R business tools.",
    owner: "Used for shop subscriptions, business tools, and promotions."
  };

  const payoutTarget = managePayoutHref?.trim() || managePaymentHref;
  const clientPayoutLocked = variant === "client" && !creatorPayoutEligible;

  return {
    paymentRail: {
      visible: true,
      label: "Default Payment Method",
      statusLabel: paymentStatusLabel,
      helperText: paymentHelperByVariant[variant],
      actionLabel: "Manage Payment Method",
      actionTarget: managePaymentHref
    },
    payoutRail: {
      visible: true,
      label: variant === "client" ? "Creator Payout Method" : "Payout Method",
      statusLabel: clientPayoutLocked ? "Locked" : payoutStatusLabel?.trim() || (variant === "client" ? "Not started" : "Managed through payout and checkout settings"),
      helperText: variant === "client"
        ? clientPayoutLocked
          ? creatorPayoutLockedReason?.trim() || "Unlocks after creator approval, loyalty history, and qualifying auto-book activity."
          : "Used for approved creator and culture payouts."
        : variant === "barber"
          ? "Used for service payouts and eligible earnings."
          : "Used for shop payouts and eligible business earnings.",
      actionLabel: clientPayoutLocked ? "View Requirements" : "Manage Payout Method",
      actionTarget: clientPayoutLocked ? "client-creator-payout-requirements" : payoutTarget,
      lockedReason: clientPayoutLocked
        ? creatorPayoutLockedReason?.trim() || "Creator payout setup is locked until this account meets the creator payout requirements."
        : undefined,
      eligibilityItems: clientPayoutLocked
        ? [
          "Verified account and clean account status",
          "Wallet ready and loyalty history on file",
          "Qualifying auto-book activity",
          "Creator or Culture approval"
        ]
        : undefined
    }
  };
}

export function AccountQuickEditModal({
  open,
  variant,
  displayName,
  publicUsername,
  fullName,
  email,
  phone,
  cityLocation,
  defaultPaymentMethodLabel,
  payoutMethodLabel,
  paymentOptions = EMPTY_PAYMENT_OPTIONS,
  defaultPaymentMethodId,
  managePaymentHref,
  managePayoutHref,
  locationOptions = EMPTY_LOCATION_OPTIONS,
  requireLocationOption = false,
  usernameRequired = variant !== "owner",
  creatorPayoutEligible = false,
  creatorPayoutLockedReason,
  locationLocked = false,
  locationLockedCopy,
  emailVerified = false,
  phoneVerified = false,
  onClose,
  onPaymentAction,
  onPayoutAction,
  onSave
}: {
  open: boolean;
  variant: AccountQuickEditVariant;
  displayName: string;
  publicUsername?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  cityLocation?: string | null;
  defaultPaymentMethodLabel?: string | null;
  payoutMethodLabel?: string | null;
  paymentOptions?: AccountQuickEditPaymentOption[];
  defaultPaymentMethodId?: string | null;
  managePaymentHref: string;
  managePayoutHref?: string | null;
  locationOptions?: AccountQuickEditLocationOption[];
  requireLocationOption?: boolean;
  usernameRequired?: boolean;
  creatorPayoutEligible?: boolean;
  creatorPayoutLockedReason?: string | null;
  locationLocked?: boolean;
  locationLockedCopy?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onClose: () => void;
  onPaymentAction?: (href: string) => void;
  onPayoutAction?: (href: string) => void;
  onSave?: (input: AccountQuickEditInput) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AccountQuickEditInput>(() => ({
    displayName,
    publicUsername: normalizePublicUsernameDraft(publicUsername),
    fullName: fullName ?? displayName,
    email: email ?? "",
    phone: phone ?? "",
    cityLocation: cityLocation ?? "",
    defaultPaymentMethodId: defaultPaymentMethodId ?? paymentOptions.find((method) => method.isDefault)?.id ?? null
  }));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPayoutRequirements, setShowPayoutRequirements] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const isSavingRef = useRef(false);
  const roleDescription = "Private account details and public username basics.";
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
  const shouldShowLocationOptions = filteredLocationOptions.length > 0 && !selectedLocationOption;
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
  const financialRails = useMemo(
    () => resolveAccountFinancialRails({
      variant,
      paymentStatusLabel: paymentCopy,
      payoutStatusLabel: payoutMethodLabel,
      managePaymentHref,
      managePayoutHref,
      creatorPayoutEligible,
      creatorPayoutLockedReason
    }),
    [creatorPayoutEligible, creatorPayoutLockedReason, managePaymentHref, managePayoutHref, paymentCopy, payoutMethodLabel, variant]
  );

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

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
      publicUsername: normalizePublicUsernameDraft(publicUsername),
      fullName: fullName ?? displayName,
      email: email ?? "",
      phone: phone ?? "",
      cityLocation: cityLocation ?? "",
      defaultPaymentMethodId: defaultPaymentMethodId ?? paymentOptions.find((method) => method.isDefault)?.id ?? null
    });
    setValidationError(null);
    setStatusMessage(null);
    setShowPayoutRequirements(false);
  }, [cityLocation, defaultPaymentMethodId, displayName, email, fullName, open, paymentOptions, phone, publicUsername]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingRef.current) {
      return;
    }

    setValidationError(null);
    setStatusMessage(null);

    const normalizedUsername = normalizePublicUsernameValue(draft.publicUsername);

    if (usernameRequired && !normalizedUsername) {
      setValidationError("BVRB3R username is required.");
      return;
    }

    if (normalizedUsername && !isValidPublicUsername(normalizedUsername)) {
      setValidationError("Use 3-30 letters, numbers, dots, or underscores for your BVRB3R username.");
      return;
    }

    if (RESERVED_PUBLIC_USERNAMES.has(normalizedUsername)) {
      setValidationError("This BVRB3R username is reserved. Choose another username.");
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

    if (!locationLocked && requireLocationOption && sortedLocationOptions.length && !selectedLocationOption) {
      setValidationError("Choose a supported barber-market city from the list.");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          publicUsername: normalizedUsername,
          displayName: draft.fullName.trim(),
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          cityLocation: locationLocked ? (cityLocation?.trim() ?? "") : selectedLocationOption?.label ?? draft.cityLocation.trim(),
          defaultPaymentMethodId: draft.defaultPaymentMethodId ?? null
        });
        setStatusMessage("Account updates saved. Email or phone changes may still require verification.");
        onClose();
        return;
      }

      setStatusMessage("No direct account save ran. Use verification for email or phone changes and wallet for payment methods.");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Unable to save account changes.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  function selectLocation(option: AccountQuickEditLocationOption) {
    setValidationError(null);
    setDraft((current) => ({ ...current, cityLocation: option.label }));
  }

  function handlePaymentAction(href: string) {
    if (onPaymentAction) {
      onPaymentAction(href);
      return;
    }

    onClose();
    window.setTimeout(() => {
      window.location.assign(href);
    }, 0);
  }

  function handlePayoutAction(rail: AccountFinancialRail) {
    if (rail.actionTarget === "client-creator-payout-requirements") {
      setShowPayoutRequirements(true);
      return;
    }

    if (onPayoutAction) {
      onPayoutAction(rail.actionTarget);
      return;
    }

    if (onPaymentAction) {
      onPaymentAction(rail.actionTarget);
      return;
    }

    onClose();
    window.setTimeout(() => {
      window.location.assign(rail.actionTarget);
    }, 0);
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-black/76 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-quick-edit-title"
      data-testid={`${variant}-account-quick-edit-modal`}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="relative z-[10000] flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] text-white shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_34px_rgba(163,255,18,0.14)] sm:max-h-[92vh] sm:rounded-[28px]"
        data-testid="account-quick-edit-sheet"
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

        <div className="flex-1 overflow-y-auto px-5 pb-4 sm:px-6" data-testid="account-quick-edit-body">
        <div className="grid gap-4">
          <section className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <label className="block text-sm font-black uppercase tracking-[0.12em] text-[#A3FF12]">
              BVRB3R Username
            </label>
            <div className="mt-2 flex min-h-12 overflow-hidden rounded-2xl border border-white/10 bg-black/35 focus-within:border-[#A3FF12]/45 focus-within:ring-2 focus-within:ring-[#A3FF12]/18">
              <span className="inline-flex min-w-12 items-center justify-center border-r border-white/10 bg-white/[0.04] text-lg font-black text-[#A3FF12]" aria-hidden="true" data-testid="account-username-prefix">@</span>
              <Input
                aria-label="BVRB3R Username"
                value={draft.publicUsername}
                onChange={(event) => setDraft((current) => ({ ...current, publicUsername: normalizePublicUsernameValue(event.target.value) }))}
                className="min-h-12 rounded-none border-0 bg-transparent focus-visible:ring-0"
                placeholder="username"
                aria-describedby="account-username-helper"
              />
            </div>
            <span id="account-username-helper" className="mt-2 block text-xs leading-5 text-white/42">
              Your BVRB3R username is public and appears across booking, profile, search, messages, and kiosk surfaces.
            </span>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Private Identity</p>
            <div className="mt-4 grid gap-4">
              <label className="block text-sm font-bold text-white/72">
                Full Name
                <Input
                  aria-label="Full Name"
                  value={draft.fullName}
                  onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                  className="mt-2"
                />
                <span className="mt-2 block text-xs leading-5 text-white/42">
                  Private. Used for account, booking, kiosk, support, and admin verification.
                </span>
              </label>
              <label className="block text-sm font-bold text-white/72">
                Phone Number
                <Input
                  aria-label="Phone Number"
                  value={draft.phone}
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                  className="mt-2"
                />
                <span className={cn("mt-2 block text-xs leading-5", phoneChanged ? "text-amber-100" : "text-white/42")}>
                  {phoneChanged ? "Phone changes require verification before this is marked verified." : phoneVerified ? "Phone verified. Private. Used for verification, booking updates, kiosk check-in, and support." : "Phone not verified. Private. Used for verification, booking updates, kiosk check-in, and support."}
                </span>
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
                  {emailChanged ? "Email changes require verification before this is marked verified." : emailVerified ? "Email verified. Private. Used for account access, booking receipts, kiosk activation, and support." : "Email not verified. Private. Used for account access, booking receipts, kiosk activation, and support."}
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <label className="block text-sm font-black uppercase tracking-[0.12em] text-[#A3FF12]">
              Location
            </label>
            <Input
              aria-label="Location"
              value={locationLocked ? (cityLocation ?? "") : draft.cityLocation}
              onChange={(event) => setDraft((current) => ({ ...current, cityLocation: event.target.value }))}
              className="mt-2"
              placeholder="City, state, or preferred area"
              aria-describedby="account-location-helper"
              disabled={locationLocked}
              readOnly={locationLocked}
            />
            {shouldShowLocationOptions ? (
              <div className="mt-2 grid gap-2" role="listbox" aria-label="Location suggestions">
                {filteredLocationOptions.map((option) => (
                  <button
                    key={`${option.city}-${option.state}`}
                    type="button"
                    className="min-h-10 rounded-2xl border border-white/8 bg-black/20 px-3 text-left text-xs font-bold text-white/58 transition hover:border-[#A3FF12]/28 hover:text-white"
                    onClick={() => selectLocation(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <span id="account-location-helper" className="mt-2 block text-xs leading-5 text-white/42">
              {locationLocked ? locationLockedCopy ?? "Locked to shop address." : "Choose a city where BVRB3R has active bookable supply."}
            </span>
          </section>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A3FF12]">Wallet & Payouts</p>
          <div className="mt-4 grid gap-3">
            {financialRails.paymentRail.visible ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/18 p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/22 bg-[#A3FF12]/10 text-[#A3FF12]">
                    <CreditCard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">{financialRails.paymentRail.label}</p>
                    <p className="mt-1 text-sm leading-5 text-white/56">{financialRails.paymentRail.statusLabel}</p>
                    <p className="mt-2 text-xs leading-5 text-white/40">{financialRails.paymentRail.helperText}</p>
                    <p className="mt-1 text-xs leading-5 text-white/36">BVRB3R never collects raw card numbers in this account modal.</p>
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
                  onClick={() => handlePaymentAction(financialRails.paymentRail.actionTarget)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/78 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
                >
                  {financialRails.paymentRail.actionLabel}
                </button>
              </div>
            ) : null}

            {financialRails.payoutRail.visible ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/18 p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border",
                    financialRails.payoutRail.lockedReason
                      ? "border-white/12 bg-white/[0.04] text-white/50"
                      : "border-[#A3FF12]/22 bg-[#A3FF12]/10 text-[#A3FF12]"
                  )}>
                    {financialRails.payoutRail.lockedReason ? <LockKeyhole className="h-5 w-5" aria-hidden="true" /> : <Landmark className="h-5 w-5" aria-hidden="true" />}
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">{financialRails.payoutRail.label}</p>
                    <p className="mt-1 text-sm leading-5 text-white/56">{financialRails.payoutRail.statusLabel}</p>
                    <p className="mt-2 text-xs leading-5 text-white/40">{financialRails.payoutRail.helperText}</p>
                    <p className="mt-1 text-xs leading-5 text-white/36">BVRB3R never collects raw bank or card numbers in this account modal.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handlePayoutAction(financialRails.payoutRail)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/78 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
                >
                  {financialRails.payoutRail.actionLabel}
                </button>
              </div>
            ) : null}
          </div>
          {showPayoutRequirements && financialRails.payoutRail.eligibilityItems?.length ? (
            <div className="mt-3 rounded-[18px] border border-[#A3FF12]/20 bg-[#A3FF12]/8 p-4" role="status">
              <p className="text-sm font-black text-white">Creator payout requirements</p>
              <p className="mt-2 text-xs leading-5 text-white/48">This setting is locked. No payout setup was started.</p>
              <ul className="mt-3 grid gap-2 text-xs leading-5 text-white/58">
                {financialRails.payoutRail.eligibilityItems.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
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

        <div className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-white/10 bg-black/95 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:flex-row sm:p-6" data-testid="account-quick-edit-footer">
          <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={isSaving} aria-busy={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );

  return portalRoot ? createPortal(modal, portalRoot) : null;
}
