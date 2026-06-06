"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Fingerprint,
  Headphones,
  LifeBuoy,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  Scissors,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TabletSmartphone,
  UserCheck,
  WalletCards,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { BarberActivationGate } from "@/components/activation/tier1-activation-gates";
import { AccountQuickEditModal, type AccountQuickEditInput, type AccountQuickEditLocationOption } from "@/components/dashboard/account/account-quick-edit-modal";
import {
  MoreActivationGate,
  MoreControlHub,
  MoreIdentityReadinessCard,
  MoreLogoutCard,
  MorePageHeader,
  MoreSectionGroup,
  type MoreSectionGroup as MoreSectionGroupConfig
} from "@/components/dashboard/more/more-components";
import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { KioskSettingsCard } from "@/components/kiosk/kiosk-actions";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionButton, Avatar, GlassCard } from "@/design/components";
import {
  useBarberFintechReadinessQuery,
  useBarberPayoutsQuery,
  useCreateBarberPayoutOnboardingLinkMutation,
  useCreateStripeDashboardLinkMutation,
  useRefreshStripeConnectedAccountMutation,
  useRecordLegalAcceptanceMutation,
  type FintechApiError
} from "@/lib/fintech/client";
import type { BarberPayoutsPayload } from "@/lib/fintech/service";
import { getStripePayoutReadinessLabel, isStripeConnectReadyForActivation } from "@/lib/fintech/payout-readiness";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { formatPublicAddressLocation, formatPublicUsernameLine } from "@/lib/profile/public-identity-summary";
import {
  useCreateVerificationUploadMutation,
  useStartBarberIdentitySessionMutation,
  useSubmitBarberVerificationMutation,
  useVerificationMe,
  useBarberTrustSummary
} from "@/lib/trust/client";
import {
  useBarberTeamInvitesQuery,
  useBarberJoinableShopsQuery,
  useBarberOverviewQuery,
  useRespondBarberTeamInviteMutation,
  useSaveBarberSubtypeMutation,
  useUpdateBarberBookingLocationMutation,
  useUpdateBarberActivationAvailabilityMutation,
  useUpdateBarberActivationMutation,
  useUpdateBarberStatusMutation,
  type BarberApiError
} from "@/lib/operations/barber-client";
import { useCreateMarketplaceServiceMutation, useMarketplaceServiceCatalog } from "@/lib/marketplace/client";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype, UserAccount } from "@/types/domain";

const subtypeOptions: Array<{ subtype: BarberSubtype; label: string; description: string }> = [
  { subtype: "freelance", label: "Freelance", description: "Independent chair posture with self-managed availability." },
  { subtype: "commission", label: "Commission", description: "Shop commission model with shared schedule and payout rails." },
  { subtype: "booth_rent", label: "Booth rent", description: "Booth-rent model with independent revenue posture." }
];

const payoutCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function payoutCurrency(value: number) {
  return payoutCurrencyFormatter.format(value);
}

const sectionIdMap = {
  account: "barber-settings-account",
  availability: "barber-settings-availability",
  business: "barber-settings-business",
  money: "barber-settings-money",
  verification: "barber-settings-verification",
  payouts: "barber-settings-payouts",
  system: "barber-settings-system",
  transactions: "barber-settings-transactions",
  support: "barber-settings-support"
} as const;

type SettingsSectionKey = keyof typeof sectionIdMap;
type Tone = "green" | "amber" | "danger" | "neutral";
type BarberQuickSetupModal = "service" | "availability" | "visibility" | "booking" | "invites" | null;
type BusinessToolKey =
  | "services"
  | "availability"
  | "booking"
  | "kiosk"
  | "notifications"
  | "transactions"
  | "reports"
  | "verification"
  | "legal"
  | "account";
type BusinessPanelKey =
  | "booking-model"
  | "booking-visibility"
  | "booking-location"
  | "booking-rules"
  | "verification-upload"
  | "legal-upload"
  | "account-profile"
  | "account-notifications"
  | "account-security"
  | "account-system";
type AvailabilityTab = "hours" | "blocked";
type TransactionFilter = "all" | "appointments" | "cash" | "card" | "requests";
type AvailabilityLocationMode = "custom" | "shop" | "later";
type SalesTrendRange = "today" | "week" | "month" | "year";
type BarberPayoutTransaction = BarberPayoutsPayload["transactions"][number];
type SalesTrendPoint = {
  label: string;
  cashCents: number;
  cardAppCents: number;
  grossCents: number;
};

const defaultActivationWorkingDays = [1, 2, 3, 4, 5, 6];
const dayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatBarberFacingLocationLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Service location not set";
  }

  if (trimmed.startsWith("independent-barber-")) {
    return "Independent barber";
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "Assigned booking location";
  }

  return trimmed;
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || parts[0] || ""
  };
}

function toLocationOption(location?: { city?: string | null; state?: string | null } | null): AccountQuickEditLocationOption | null {
  const city = location?.city?.trim();
  const state = location?.state?.trim();
  if (!city) {
    return null;
  }

  return {
    city,
    state: state ?? "",
    label: [city, state].filter(Boolean).join(", ")
  };
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatTimeLabel(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  const [rawHour, rawMinute = "00"] = value.split(":");
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) {
    return value;
  }
  const minute = rawMinute.padStart(2, "0").slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function getStatusTone(value?: string | null): Tone {
  const normalized = value?.toLowerCase() ?? "";
  if (["approved", "verified", "active", "live", "ready", "payout_ready", "charges_enabled", "payouts_enabled"].some((status) => normalized.includes(status))) {
    return "green";
  }
  if (["rejected", "failed", "blocked", "suspended", "banned"].some((status) => normalized.includes(status))) {
    return "danger";
  }
  if (["pending", "submitted", "review", "needs", "due", "not_started", "incomplete"].some((status) => normalized.includes(status))) {
    return "amber";
  }
  return "neutral";
}

function formatScopedStatusLabel(scope: string, value?: string | null) {
  const normalized = value?.toLowerCase() ?? "";
  if (["approved", "verified", "active", "ready", "payout_ready"].includes(normalized)) {
    return `${scope} approved`;
  }
  if (!normalized || normalized === "not_required") {
    return `${scope} not started`;
  }

  return `${scope} ${formatStatusLabel(value).toLowerCase()}`;
}

function formatBarberPayoutChipLabel({
  payoutsReady,
  payoutStatus
}: {
  payoutsReady: boolean;
  payoutStatus?: string | null;
}) {
  if (payoutsReady) {
    return "Payouts connected";
  }

  if (!payoutStatus || payoutStatus === "not_ready") {
    return "Payouts setup";
  }

  return `Payouts ${formatStatusLabel(payoutStatus).toLowerCase()}`;
}

function cleanBarberMoreLocationLine(value?: string | null) {
  return value?.split(/(?:•|â€¢)/)[0]?.trim() ?? "";
}

function resolveCanonicalActivationStatus(...statuses: Array<string | null | undefined>) {
  const normalized = statuses.map((status) => status?.trim().toLowerCase()).filter((status): status is string => Boolean(status));
  if (normalized.some((status) => ["suspended", "banned", "deactivated"].includes(status))) {
    return "suspended";
  }
  if (normalized.some((status) => status === "rejected")) {
    return "rejected";
  }
  if (normalized.some((status) => status === "approved" || status === "verified" || status === "active")) {
    return "approved";
  }
  return normalized[0] ?? null;
}

function StatusPill({ children, tone = "green" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-extrabold",
        tone === "green" && "border-[#a3ff12]/25 bg-[#a3ff12]/12 text-[#a3ff12]",
        tone === "amber" && "border-amber-300/28 bg-amber-300/10 text-amber-200",
        tone === "danger" && "border-red-400/28 bg-red-500/10 text-red-200",
        tone === "neutral" && "border-white/10 bg-white/[0.06] text-white/70"
      )}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#a3ff12]">
      {children}
    </p>
  );
}

function CircleIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12] shadow-[0_0_24px_rgba(163,255,18,0.16)]",
        className
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function BusinessControlCard({
  icon: Icon,
  title,
  subtitle,
  toolKey,
  onOpen
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  toolKey: BusinessToolKey;
  onOpen: (tool: BusinessToolKey) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`business-tool-${toolKey}`}
      onClick={() => onOpen(toolKey)}
      className="group flex min-h-[136px] flex-col justify-between rounded-[22px] border border-white/10 bg-white/[0.035] p-5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:-translate-y-0.5 hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12),0_18px_50px_rgba(0,0,0,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#a3ff12]/10 text-[#a3ff12]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ChevronRight className="h-5 w-5 text-white/35 transition group-hover:text-[#a3ff12]" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-lg font-extrabold tracking-[-0.02em] text-white">{title}</h3>
        <p className="mt-2 text-sm leading-5 text-white/56">{subtitle}</p>
      </div>
    </button>
  );
}

function BusinessToolModal({
  title,
  subtitle,
  description,
  onClose,
  children
}: {
  title: string;
  subtitle: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-tool-modal-title"
      data-testid="business-tool-modal"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)] sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>{subtitle}</SectionLabel>
            <h2 id="business-tool-modal-title" className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
              {title}
            </h2>
            {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-[#a3ff12]/35 hover:text-[#a3ff12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
            aria-label="Close business tool"
          >
            <XCircle className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function buildPayoutTimeline(transaction: BarberPayoutTransaction | null) {
  if (!transaction || transaction.transactionType === "pos_cash") {
    return [] as Array<{ label: string; detail: string; tone: Tone }>;
  }

  const routingCalculated = transaction.barberPayoutAmount !== null && transaction.barberPayoutAmount !== undefined;
  const readyForPayout = transaction.payoutReadinessStatus === "ready" || transaction.payoutReadinessStatus === "eligible";
  const released = Boolean(transaction.releasedAt) || transaction.moneyRoutingStatus === "paid_out";
  const failed = transaction.payoutExecutionStatus === "failed";
  const held = transaction.moneyRoutingStatus === "blocked" || transaction.moneyRoutingStatus === "manual_review";
  const timeline: Array<{ label: string; detail: string; tone: Tone }> = [
    {
      label: "Payment collected",
      detail: "Collected through BVRB3R.",
      tone: "green"
    },
    {
      label: routingCalculated ? "Routing calculated" : "Routing pending",
      detail: routingCalculated
        ? `${payoutCurrency(transaction.barberPayoutAmount ?? 0)} barber payout after fees.`
        : "BVRB3R is still calculating payout routing.",
      tone: routingCalculated ? "green" : "neutral"
    },
    {
      label: readyForPayout ? "Ready for payout" : "Payout not ready",
      detail: readyForPayout ? "This payment is eligible for release." : "This payment still needs routing review.",
      tone: readyForPayout ? "green" : "amber"
    }
  ];

  if (released) {
    timeline.push({
      label: "Released to payout account",
      detail: transaction.releasedAt ? `Released ${formatDateTime(transaction.releasedAt)}.` : "Released to the barber payout account.",
      tone: "green"
    });
  } else if (failed) {
    timeline.push({
      label: "Payout failed",
      detail: transaction.payoutFailureReason ?? "BVRB3R needs to retry this release.",
      tone: "danger"
    });
  } else if (held) {
    timeline.push({
      label: "On hold",
      detail: "BVRB3R is reviewing this payout before release.",
      tone: "amber"
    });
  } else {
    timeline.push({
      label: "Waiting for BVRB3R release",
      detail: "Ready payments move after platform release.",
      tone: "neutral"
    });
  }

  return timeline;
}

function TransactionReceiptModal({
  transaction,
  error,
  onClose
}: {
  transaction: BarberPayoutTransaction | null;
  error: string | null;
  onClose: () => void;
}) {
  const isCash = transaction?.transactionType === "pos_cash";
  const isPosSale = transaction?.transactionType === "pos_cash" || transaction?.transactionType === "pos_card";
  const isBoothRentServicePayout = !isCash && transaction?.routingModel === "booth_rent";
  const receiptNumber = transaction?.posSaleId ?? transaction?.paymentId ?? transaction?.appointmentId ?? transaction?.sourceId ?? "Not available";
  const barberPayout = isCash
    ? "Cash collected directly"
    : transaction?.barberPayoutAmount === null || transaction?.barberPayoutAmount === undefined
      ? "Pending routing"
      : payoutCurrency(transaction.barberPayoutAmount);
  const receiptDescription = isCash
    ? "Cash collected directly. No platform payout."
    : isBoothRentServicePayout
      ? "Service payout goes to barber after BVRB3R fee. Booth rent is billed separately."
      : "Collected through BVRB3R. Eligible after routing.";
  const payoutTimeline = buildPayoutTimeline(transaction);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/76 px-4 py-5 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-receipt-title"
      data-testid="transaction-receipt-modal"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)] sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel>Receipt</SectionLabel>
            <h2 id="transaction-receipt-title" className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
              Transaction receipt
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/56">
              {receiptDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-[#a3ff12]/35 hover:text-[#a3ff12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
            aria-label="Close receipt"
          >
            <XCircle className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-[18px] border border-red-400/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        ) : null}

        {transaction ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-[22px] border border-white/8 bg-black/28 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-white">{transaction.customerName}</p>
                  <p className="mt-2 text-sm text-white/56">{transaction.serviceLabel} | {formatDateTime(transaction.occurredAt)}</p>
                  {transaction.customerPhone || transaction.customerEmail ? (
                    <p className="mt-2 text-sm text-white/44">{transaction.customerPhone ?? transaction.customerEmail}</p>
                  ) : null}
                </div>
                <StatusPill tone={isCash ? "amber" : transaction.statusLabel === "Paid" ? "green" : "neutral"}>
                  {transaction.statusLabel}
                </StatusPill>
              </div>
            </div>

            {isBoothRentServicePayout ? (
              <div className="rounded-[18px] border border-[#a3ff12]/18 bg-[#a3ff12]/8 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a3ff12]">Booth rent barber</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white/72">
                  Service payout goes to barber after BVRB3R fee. Booth rent is billed separately.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Payment method", transaction.paymentMethodLabel],
                ["Gross amount", payoutCurrency(transaction.grossAmount)],
                ["Platform fee", payoutCurrency(transaction.platformFeeAmount)],
                ["Barber payout", barberPayout],
                ["Shop split", payoutCurrency(transaction.shopSplitAmount ?? 0)],
                ["Payment status", isCash ? "Cash recorded" : transaction.statusLabel],
                ["Payout readiness", isCash ? "No platform payout" : formatStatusLabel(transaction.payoutReadinessStatus ?? "pending")],
                ["Money routing", isCash ? "No routing required" : formatStatusLabel(transaction.moneyRoutingStatus ?? "pending")],
                [isPosSale ? "POS sale ID" : "Receipt number", receiptNumber]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[16px] border border-white/8 bg-black/24 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40">{label}</p>
                  <p className="mt-2 break-words text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>

            {payoutTimeline.length ? (
              <div className="rounded-[22px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40">Payout timeline</p>
                <div className="mt-4 space-y-3">
                  {payoutTimeline.map((item) => (
                    <div key={item.label} className="flex gap-3">
                      <span className={cn(
                        "mt-1 h-3 w-3 shrink-0 rounded-full border",
                        item.tone === "green"
                          ? "border-[#a3ff12] bg-[#a3ff12]"
                          : item.tone === "danger"
                            ? "border-red-300 bg-red-300"
                            : item.tone === "amber"
                              ? "border-amber-300 bg-amber-300"
                              : "border-white/22 bg-white/10"
                      )} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-black text-white">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-white/52">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BusinessToolPanel({
  title,
  description,
  onBack,
  children
}: {
  title: string;
  description?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-extrabold uppercase tracking-[0.16em] text-white/62 transition hover:border-[#a3ff12]/30 hover:text-[#a3ff12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
      >
        <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />
        Back
      </button>
      <div>
        <h3 className="text-2xl font-black tracking-[-0.04em] text-white">{title}</h3>
        {description ? <p className="mt-2 text-sm leading-6 text-white/56">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function BusinessToolRow({
  icon: Icon,
  title,
  subtitle,
  status,
  onClick,
  rightAction,
  testId
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  onClick?: () => void;
  rightAction?: ReactNode;
  testId?: string;
}) {
  const content = (
    <>
      {Icon ? (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#a3ff12]/18 bg-[#a3ff12]/10 text-[#a3ff12]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-white">{title}</span>
        {subtitle ? <span className="mt-1 block text-xs leading-5 text-white/52">{subtitle}</span> : null}
      </span>
      {status ? <span className="shrink-0">{status}</span> : null}
      {rightAction ?? (onClick ? <ChevronRight className="h-5 w-5 shrink-0 text-white/32" aria-hidden="true" /> : null)}
    </>
  );

  const className = "flex min-h-16 w-full items-center gap-3 rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-left transition hover:border-[#a3ff12]/25 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55";

  return onClick ? (
    <button type="button" data-testid={testId} onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div data-testid={testId} className={className}>
      {content}
    </div>
  );
}

const salesTrendRangeOptions: Array<{ key: SalesTrendRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" }
];

function centsToDollars(cents: number) {
  return cents / 100;
}

function SalesPulseChart({
  points,
  range,
  onRangeChange
}: {
  points: SalesTrendPoint[];
  range: SalesTrendRange;
  onRangeChange: (range: SalesTrendRange) => void;
}) {
  const totals = useMemo(() => points.reduce(
    (sum, point) => ({
      cashCents: sum.cashCents + point.cashCents,
      cardAppCents: sum.cardAppCents + point.cardAppCents,
      grossCents: sum.grossCents + point.grossCents
    }),
    { cashCents: 0, cardAppCents: 0, grossCents: 0 }
  ), [points]);
  const hasSales = points.some((point) => point.grossCents > 0);
  const maxCents = Math.max(100, ...points.flatMap((point) => [point.cashCents, point.cardAppCents, point.grossCents]));
  const chart = {
    width: 680,
    height: 260,
    top: 22,
    right: 28,
    bottom: 42,
    left: 48
  };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const xFor = (index: number) => chart.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => chart.top + plotHeight - (value / maxCents) * plotHeight;
  const pathFor = (key: keyof Pick<SalesTrendPoint, "cashCents" | "cardAppCents" | "grossCents">) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(point[key]).toFixed(2)}`).join(" ");
  const grossAreaPath = points.length
    ? [
      `M ${xFor(0).toFixed(2)} ${chart.top + plotHeight}`,
      ...points.map((point, index) => `L ${xFor(index).toFixed(2)} ${yFor(point.grossCents).toFixed(2)}`),
      `L ${xFor(points.length - 1).toFixed(2)} ${chart.top + plotHeight}`,
      "Z"
    ].join(" ")
    : "";
  const labelStep = points.length > 12 ? Math.ceil(points.length / 6) : 1;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid="sales-pulse-section"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#a3ff12]">Performance</p>
          <h3 className="mt-2 text-xl font-black text-white">Sales Pulse</h3>
          <p className="mt-1 text-sm leading-5 text-white/56">Compare cash, card/app, and gross sales over time.</p>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-full border border-white/10 bg-black/30 p-1">
          {salesTrendRangeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={range === option.key}
              onClick={() => onRangeChange(option.key)}
              className={cn(
                "rounded-full px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/52 transition",
                range === option.key && "bg-[#a3ff12] text-black shadow-[0_0_18px_rgba(163,255,18,0.2)]",
                range !== option.key && "hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-white/8 bg-black/24 px-3 py-2 text-sm font-black text-white/78">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-white/42" aria-hidden="true" />
          Cash: {currency(centsToDollars(totals.cashCents))}
        </div>
        <div className="rounded-[14px] border border-white/8 bg-black/24 px-3 py-2 text-sm font-black text-white/78">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#9fd7ff]" aria-hidden="true" />
          Card/App: {currency(centsToDollars(totals.cardAppCents))}
        </div>
        <div className="rounded-[14px] border border-[#a3ff12]/18 bg-[#a3ff12]/10 px-3 py-2 text-sm font-black text-[#a3ff12]">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a3ff12]" aria-hidden="true" />
          Gross: {currency(centsToDollars(totals.grossCents))}
        </div>
      </div>

      {hasSales ? (
        <div className="mt-4 overflow-x-auto rounded-[18px] border border-white/8 bg-black/34 p-2" data-testid="sales-pulse-chart">
          <svg
            role="img"
            aria-label="Sales Pulse chart"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            className="h-[230px] min-w-[620px] w-full"
          >
            <defs>
              <linearGradient id="sales-pulse-gross-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a3ff12" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#a3ff12" stopOpacity="0" />
              </linearGradient>
              <filter id="sales-pulse-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {gridLines.map((line) => {
              const y = chart.top + plotHeight - line * plotHeight;
              return (
                <g key={line}>
                  <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={chart.left - 10} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.32)" fontSize="10" fontWeight="800">
                    {currency(centsToDollars(maxCents * line))}
                  </text>
                </g>
              );
            })}
            <path d={grossAreaPath} fill="url(#sales-pulse-gross-fill)" />
            <path d={pathFor("cashCents")} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathFor("cardAppCents")} fill="none" stroke="#9fd7ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathFor("grossCents")} fill="none" stroke="#a3ff12" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#sales-pulse-glow)" />
            {points.map((point, index) => (
              index % labelStep === 0 || index === points.length - 1 ? (
                <text key={`${point.label}-${index}`} x={xFor(index)} y={chart.height - 14} textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="10" fontWeight="800">
                  {point.label}
                </text>
              ) : null
            ))}
          </svg>
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-white/10 bg-black/26 px-4 py-10 text-center text-sm font-bold text-white/52" data-testid="sales-pulse-empty">
          No sales recorded for this period yet.
        </div>
      )}
    </section>
  );
}

function getBusinessToolDescription(tool: BusinessToolKey | null) {
  switch (tool) {
    case "transactions":
      return "Completed bookings and payment status stay connected to appointment records.";
    case "reports":
      return "Gross, cash, card/app, booking, and payout posture in one focused view.";
    case "availability":
      return "Working hours and blocked time stay powered by the existing calendar engine.";
    case "booking":
      return "Online booking preferences, business model, and appointment location settings.";
    case "services":
      return "Active services, pricing, duration, and add-service actions.";
    case "verification":
      return "Identity, license, approval, and trust status live in the verification lane.";
    case "legal":
      return "Agreements, payout tax acknowledgments, and verification documents.";
    case "notifications":
      return "Choose how BVRB3R alerts you about bookings, messages, and account events.";
    case "account":
      return "Private account controls, contact information, password, profile, and security.";
    default:
      return undefined;
  }
}

export function BarberSettingsScreen({
  user,
  initialSection,
  stripeReturnState = null,
  embedded = false
}: {
  user: UserAccount;
  initialSection?: string;
  stripeReturnState?: "return" | "refresh" | null;
  embedded?: boolean;
}) {
  const router = useRouter();
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const verificationMeQuery = useVerificationMe(true);
  const readinessQuery = useBarberFintechReadinessQuery(true);
  const payoutsQuery = useBarberPayoutsQuery(true);
  const overviewQuery = useBarberOverviewQuery();
  const teamInvitesQuery = useBarberTeamInvitesQuery();
  const onboardingMutation = useCreateBarberPayoutOnboardingLinkMutation();
  const dashboardMutation = useCreateStripeDashboardLinkMutation();
  const refreshMutation = useRefreshStripeConnectedAccountMutation();
  const recordAcceptanceMutation = useRecordLegalAcceptanceMutation();
  const saveSubtypeMutation = useSaveBarberSubtypeMutation();
  const respondTeamInviteMutation = useRespondBarberTeamInviteMutation();
  const createServiceMutation = useCreateMarketplaceServiceMutation();
  const statusMutation = useUpdateBarberStatusMutation();
  const activationMutation = useUpdateBarberActivationMutation();
  const activationAvailabilityMutation = useUpdateBarberActivationAvailabilityMutation();
  const bookingLocationMutation = useUpdateBarberBookingLocationMutation();
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitVerificationMutation = useSubmitBarberVerificationMutation();
  const identitySessionMutation = useStartBarberIdentitySessionMutation();
  const createMessageThreadMutation = useCreateMessageThreadMutation();
  const serviceCatalogQuery = useMarketplaceServiceCatalog();
  const [selectedSubtype, setSelectedSubtype] = useState<BarberSubtype>(user.barberSubtype ?? "freelance");
  const [verificationCategory, setVerificationCategory] = useState<"identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification">("license_verification");
  const [legalName, setLegalName] = useState(user.name);
  const [fileName, setFileName] = useState("updated-license.pdf");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const stripeReturnSyncRef = useRef(false);
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const [quickSetupModal, setQuickSetupModal] = useState<BarberQuickSetupModal>(null);
  const [activeBusinessTool, setActiveBusinessTool] = useState<BusinessToolKey | null>(null);
  const [activeBusinessPanel, setActiveBusinessPanel] = useState<BusinessPanelKey | null>(null);
  const [availabilityTab, setAvailabilityTab] = useState<AvailabilityTab>("hours");
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("all");
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [salesTrendRange, setSalesTrendRange] = useState<SalesTrendRange>("today");
  const [serviceDraft, setServiceDraft] = useState({
    name: "Haircut",
    price: "35",
    duration: "45",
    active: true
  });
  const [availabilityDraft, setAvailabilityDraft] = useState({
    days: defaultActivationWorkingDays,
    startTime: "12:00",
    endTime: "19:00"
  });
  const [availabilityLocationMode, setAvailabilityLocationMode] = useState<AvailabilityLocationMode>("custom");
  const [serviceLocationDraft, setServiceLocationDraft] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    postalCode: ""
  });
  const [bookingLocationDraft, setBookingLocationDraft] = useState({
    name: "",
    address: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: ""
  });
  const [shopSearch, setShopSearch] = useState("");
  const [selectedJoinShopId, setSelectedJoinShopId] = useState<string | null>(null);
  const shopDirectoryQuery = useBarberJoinableShopsQuery(
    shopSearch,
    quickSetupModal === "availability" && availabilityLocationMode === "shop"
  );

  const notificationPreference = mediaQuery.data?.viewer.notificationPreference;
  const verificationProfile = verificationMeQuery.data?.profiles.find((profile) => profile.role === "barber") ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const readinessPayload = readinessQuery.data;
  const connectedAccount = readinessPayload?.connectedAccount;
  const stripePayoutReadiness = readinessPayload?.stripePayoutReadiness;
  const payoutsPayload = payoutsQuery.data;
  const overviewPayload = overviewQuery.data;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as SettingsSectionKey | null;
  const barberPhotoUrl = mediaQuery.data?.barberProfile?.profilePhotoUrl ?? mediaQuery.data?.viewer.profilePhotoUrl ?? null;
  const locationLabel = user.locationIds.length
    ? user.locationIds.map(formatBarberFacingLocationLabel).join(", ")
    : "Service location not set";
  const canonicalVerificationStatus = resolveCanonicalActivationStatus(
    user.appApprovalStatus,
    trustQuery.data?.canonicalOverallStatus,
    verificationProfile?.overallStatus
  );
  const payoutStatus = connectedAccount?.operationalStatus ?? null;
  const stripeEnvironment = readinessPayload?.stripeEnvironment;
  const payoutsReady = isStripeConnectReadyForActivation(connectedAccount, stripeEnvironment);
  const payoutsConnectedForIdentity = Boolean(connectedAccount?.chargesEnabled && connectedAccount.payoutsEnabled);
  const payoutsRequiredForActivation = selectedSubtype !== "freelance";
  const payoutsClearForActivation = !payoutsRequiredForActivation || payoutsReady;
  const payoutReadinessLabel = getStripePayoutReadinessLabel(payoutsReady, stripeEnvironment);
  const eligiblePayoutAmount =
    payoutsPayload?.summary.eligiblePayoutAmount
    ?? payoutsPayload?.summary.readyForPayoutAmount
    ?? readinessPayload?.routingSummary.readyForPayoutAmount;
  const eligibleRoutingRecords =
    payoutsPayload?.summary.eligibleRoutingRecords
    ?? payoutsPayload?.summary.executableRoutingRecords
    ?? 0;
  const releasedPayoutAmount = payoutsPayload?.summary.executedAmount ?? 0;
  const hasPayoutAmount = typeof eligiblePayoutAmount === "number";
  const subtypeLabel = subtypeOptions.find((option) => option.subtype === selectedSubtype)?.label ?? "Freelance";
  const showOnboardingAction = Boolean(
    stripePayoutReadiness?.requiresOnboarding
    ?? (connectedAccount && connectedAccount.operationalStatus !== "payout_ready")
  );
  const payoutSetupActionLabel = stripePayoutReadiness?.hasAccount ? "Resume Stripe Setup" : "Complete Stripe Setup";
  const payoutSetupStatusLabel = stripePayoutReadiness?.canReceivePayouts
    ? "Payout account ready"
    : stripePayoutReadiness?.displayStatus === "internal_review"
      ? "Payout setup pending BVRB3R review"
      : "Payout setup required";
  const payoutSetupMessage = stripePayoutReadiness?.displayMessage ?? payoutReadinessLabel;
  const readyForCheckout = overviewPayload?.todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0) ?? [];
  const paidAppointments = overviewPayload?.todayAppointments.filter((appointment) => appointment.financial.capturedAmount > 0 || appointment.financial.tipAmount > 0) ?? [];
  const moneyPosture = payoutsPayload?.moneyPosture;
  const cashCollectedToday = moneyPosture?.cashCollectedToday ?? 0;
  const cardAppCollectedToday = moneyPosture?.cardAppCollectedToday ?? overviewPayload?.earnings.grossSales ?? 0;
  const appPayoutEligible = moneyPosture?.appPayoutEligible ?? eligiblePayoutAmount ?? 0;
  const grossTotalToday = moneyPosture?.grossTotalToday ?? cashCollectedToday + cardAppCollectedToday;
  const payoutTransactions = useMemo(
    () => payoutsPayload?.transactions ?? [],
    [payoutsPayload?.transactions]
  );
  const receiptTransaction = useMemo(
    () => payoutTransactions.find((transaction) => transaction.id === receiptTransactionId) ?? null,
    [payoutTransactions, receiptTransactionId]
  );
  const selectedSalesTrend = payoutsPayload?.salesTrend?.[salesTrendRange] ?? [];
  const filteredTransactions = payoutTransactions.filter((transaction) => {
    if (transactionFilter === "appointments") {
      return transaction.transactionType === "appointment";
    }
    if (transactionFilter === "cash") {
      return transaction.transactionType === "pos_cash";
    }
    if (transactionFilter === "requests") {
      return transaction.transactionType === "pos_request";
    }
    if (transactionFilter === "card") {
      return transaction.transactionType !== "pos_cash" && transaction.transactionType !== "pos_request";
    }
    return true;
  });
  const serviceItems = [
    ...(serviceCatalogQuery.data?.editableServices ?? []),
    ...(serviceCatalogQuery.data?.readOnlyServices ?? [])
  ];
  const weeklyHours = dayOptions.map((day) => {
    const schedule = overviewPayload?.workingHours.find((entry) => entry.weekday === day.value);
    return {
      ...day,
      schedule,
      dayLabel: day.label,
      statusLabel: schedule ? `${formatTimeLabel(schedule.startTime)} - ${formatTimeLabel(schedule.endTime)}` : "Closed"
    };
  });
  const pendingShopInvites = teamInvitesQuery.data?.invites ?? [];
  const activationSetup = overviewPayload?.activationSetup;
  const assignedLocationLabels = overviewPayload?.shops.length
    ? overviewPayload.shops.map((shop) => shop.label).join(", ")
    : locationLabel;
  const hasActiveService = [
    ...(serviceCatalogQuery.data?.editableServices ?? []),
    ...(serviceCatalogQuery.data?.readOnlyServices ?? [])
  ].some((item) => item.service.isActive !== false && item.service.isBookable !== false);
  const hasAvailability = Boolean((overviewPayload?.workingHours.length ?? 0) > 0 || activationSetup?.hasAvailabilityDraft);
  const hasServiceLocation = Boolean(activationSetup?.hasServiceLocation);
  const hasAcceptedShopLink = Boolean(
    (readinessPayload?.memberships.length ?? 0) > 0
    || ((overviewPayload?.shops.length ?? 0) > 0 && activationSetup?.locationMode !== "custom")
  );
  const isFreelanceBarber = selectedSubtype === "freelance";
  const hasShopControlledLocation = !isFreelanceBarber && hasAcceptedShopLink;
  const barberPublicUsernameLine = formatPublicUsernameLine(mediaQuery.data?.barberProfile?.publicUsername);
  const structuredBarberLocationLabel = formatPublicAddressLocation({
    address: mediaQuery.data?.barberProfile?.publicAddress,
    city: mediaQuery.data?.barberProfile?.publicCity,
    state: mediaQuery.data?.barberProfile?.publicState,
    zip: mediaQuery.data?.barberProfile?.publicZip,
    fallback: ""
  });
  const canonicalBarberLocationLabel = cleanBarberMoreLocationLine(
    structuredBarberLocationLabel
      || mediaQuery.data?.barberProfile?.serviceAreaLabel
      || "Add service location"
  );
  const barberIdentityLocationLabel = hasShopControlledLocation
    ? cleanBarberMoreLocationLine(assignedLocationLabels)
    : canonicalBarberLocationLabel;
  const barberLocationOptions = [
    toLocationOption(activationSetup?.bookingLocation)
  ].filter((option): option is AccountQuickEditLocationOption => Boolean(option));
  const shopLinkRequired = selectedSubtype === "commission";
  const profileVisibilityState = mediaQuery.data?.barberProfile?.visibilityState ?? null;
  const isProfilePublic = profileVisibilityState === "public" || profileVisibilityState === "featured";
  const isBookingActive = Boolean(overviewPayload?.status.isOnline && overviewPayload.status.liveStatus === "available");
  const isBarberMarketplaceLive =
    canonicalVerificationStatus === "approved"
    && !["suspended", "banned", "deactivated"].includes(user.accountStatus ?? "")
    && hasActiveService
    && hasAvailability
    && (hasServiceLocation || hasAcceptedShopLink)
    && isProfilePublic
    && isBookingActive
    && payoutsClearForActivation;

  const statusItems = [
    {
      label: "Identity",
      value: user.emailVerified || user.phoneVerified ? "Verified" : "Pending",
      icon: Fingerprint,
      tone: user.emailVerified || user.phoneVerified ? "green" : "amber"
    },
    {
      label: "License",
      value: formatStatusLabel(canonicalVerificationStatus),
      icon: FileText,
      tone: getStatusTone(canonicalVerificationStatus)
    },
    {
      label: "Payouts",
      value: payoutsReady ? (stripeEnvironment?.mode === "test" ? "Test connected" : "Connected") : stripeEnvironment?.mode === "test" ? "Test mode" : formatStatusLabel(payoutStatus),
      icon: WalletCards,
      tone: payoutsReady ? "green" : getStatusTone(payoutStatus)
    },
    {
      label: "Profile",
      value: isBarberMarketplaceLive ? "Live" : "Not live",
      icon: UserCheck,
      tone: isBarberMarketplaceLive ? "green" : "amber"
    },
    {
      label: "Booking",
      value: isBookingActive ? "Active" : "Not active",
      icon: CalendarCheck,
      tone: isBookingActive ? "green" : "amber"
    }
  ] satisfies Array<{ label: string; value: string; icon: LucideIcon; tone: Tone }>;

  const businessControls = [
    { key: "services", title: "Services", subtitle: "Manage pricing & offerings", icon: Scissors },
    { key: "availability", title: "Availability", subtitle: "Working hours & blocked time", icon: Clock3 },
    { key: "booking", title: "Booking Settings", subtitle: "Online booking preferences", icon: CalendarDays },
    { key: "kiosk", title: "Kiosk Settings", subtitle: "4-digit PIN, locked device mode, and walk-in booking rules", icon: TabletSmartphone },
    { key: "notifications", title: "Notifications", subtitle: "Alerts & reminders", icon: BellRing },
    { key: "transactions", title: "Transactions", subtitle: "Sales & receipts", icon: ArrowLeftRight },
    { key: "reports", title: "Reports", subtitle: "Performance overview", icon: BarChart3 },
    { key: "verification", title: "Verification", subtitle: "Identity & license status", icon: ShieldCheck },
    { key: "legal", title: "Legal", subtitle: "Agreements & policies", icon: FileText },
    { key: "account", title: "Account Settings", subtitle: "Password, profile & security", icon: Settings2 }
  ] satisfies Array<{ key: BusinessToolKey; title: string; subtitle: string; icon: LucideIcon }>;
  const activeBusinessControl = businessControls.find((item) => item.key === activeBusinessTool) ?? null;
  const moreToneForStatus = (tone: Tone): "green" | "yellow" | "red" | "muted" => {
    if (tone === "amber") {
      return "yellow";
    }
    if (tone === "danger") {
      return "red";
    }
    if (tone === "neutral") {
      return "muted";
    }
    return "green";
  };
  const barberMoreSections: MoreSectionGroupConfig[] = [
    {
      id: "barber-settings-public-profile",
      title: "Public Profile",
      subtitle: "Everything clients see before they book.",
      rows: [
        { title: "Profile Information", subtitle: "Name, headline, bio, and public identity", href: "/dashboard/barber/profile", icon: <UserCheck className="h-5 w-5" /> },
        { title: "Public Photo", subtitle: "Main profile image clients see", href: "/dashboard/barber/profile", icon: <Pencil className="h-5 w-5" /> },
        { title: "Portfolio", subtitle: "Haircut photos and discovery uploads", href: "/dashboard/barber/profile?section=portfolio", icon: <Scissors className="h-5 w-5" /> },
        { title: "Public Username", subtitle: "Your shareable BVRB3R profile link", href: "/dashboard/barber/profile?section=username", icon: <Send className="h-5 w-5" /> }
      ]
    },
    {
      id: "barber-settings-business-setup",
      title: "Business Setup",
      subtitle: "Booking rules, services, hours, and shop relationship controls.",
      rows: [
        { title: "Services", subtitle: "Manage pricing and offerings", href: "#barber-settings-business", icon: <Scissors className="h-5 w-5" /> },
        { title: "Availability", subtitle: "Working hours and blocked time", href: "#barber-settings-business", icon: <Clock3 className="h-5 w-5" /> },
        { title: "Booking Settings", subtitle: "Online booking rules and preferences", href: "#barber-settings-business", icon: <CalendarDays className="h-5 w-5" /> },
        { title: "Kiosk Settings", subtitle: "4-digit PIN, locked device mode, and walk-in booking rules", href: "#barber-settings-business", icon: <TabletSmartphone className="h-5 w-5" /> },
        { title: "Shop Relationship", subtitle: "Freelance, booth rent, or commission connection", href: "#barber-settings-shop-invites", status: pendingShopInvites.length ? `${pendingShopInvites.length} invite${pendingShopInvites.length === 1 ? "" : "s"}` : subtypeLabel, tone: pendingShopInvites.length ? "yellow" : "muted", icon: <Store className="h-5 w-5" /> }
      ]
    },
    {
      id: "barber-settings-payments-banking",
      title: "Payments & Banking",
      subtitle: "Payout account, eligible balance, transactions, and tax posture.",
      rows: [
        { title: "Stripe Connect", subtitle: "Payout account and readiness", href: "#barber-settings-payouts", status: payoutSetupStatusLabel, tone: payoutsReady ? "green" : "yellow", icon: <WalletCards className="h-5 w-5" /> },
        { title: "Payout Status", subtitle: "Eligible balance and payout routing", href: "#barber-settings-payouts", status: payoutCurrency(eligiblePayoutAmount ?? 0), tone: hasPayoutAmount ? "green" : "muted", icon: <CircleDollarSign className="h-5 w-5" /> },
        { title: "Transactions", subtitle: "Sales and receipts", href: "#barber-settings-transactions", icon: <ReceiptText className="h-5 w-5" /> },
        { title: "Tax Information", subtitle: "Tax forms and documents", href: "#barber-settings-payouts", icon: <FileText className="h-5 w-5" /> }
      ]
    },
    {
      id: "barber-settings-compliance",
      title: "Compliance & Security",
      subtitle: "Identity, license, account security, and privacy.",
      rows: [
        { title: "Identity Verification", subtitle: "Identity review and account proofing", href: "#barber-settings-verification", status: formatStatusLabel(canonicalVerificationStatus), tone: moreToneForStatus(getStatusTone(canonicalVerificationStatus)), icon: <Fingerprint className="h-5 w-5" /> },
        { title: "License Verification", subtitle: "License upload and review status", href: "#barber-settings-verification", icon: <ShieldCheck className="h-5 w-5" /> },
        { title: "Account Security", subtitle: "Password, contact, and login settings", href: "#barber-settings-business", icon: <Settings2 className="h-5 w-5" /> },
        { title: "Privacy", subtitle: "Public profile and communication preferences", href: "#barber-settings-business", icon: <SlidersHorizontal className="h-5 w-5" /> }
      ]
    },
    {
      id: "barber-settings-support",
      title: "Support",
      subtitle: "Help resources and direct support threads.",
      rows: [
        { title: "Help Center", subtitle: "Guides and platform help", href: "/contact", icon: <LifeBuoy className="h-5 w-5" /> },
        { title: "Contact Support", subtitle: "Message BVRB3R support", href: "/dashboard/barber/messages?thread=support", icon: <Headphones className="h-5 w-5" /> }
      ]
    }
  ];

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection]);

  useEffect(() => {
    const bookingLocation = activationSetup?.bookingLocation;
    if (!bookingLocation) {
      return;
    }

    setBookingLocationDraft({
      name: bookingLocation.name ?? "",
      address: bookingLocation.address ?? "",
      addressLine2: bookingLocation.addressLine2 ?? "",
      city: bookingLocation.city ?? "",
      state: bookingLocation.state ?? "",
      postalCode: bookingLocation.postalCode ?? ""
    });
  }, [activationSetup?.bookingLocation]);

  async function navigateToStripeUrl(loadUrl: () => Promise<string>, successMessage: string) {
    setFeedback(null);
    try {
      const url = await loadUrl();
      setFeedback({ tone: "success", message: successMessage });
      window.location.assign(url);
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  function closeQuickSetupModal() {
    setQuickSetupModal(null);
  }

  function openBusinessTool(tool: BusinessToolKey) {
    setActiveBusinessTool(tool);
    setActiveBusinessPanel(null);
    if (tool === "availability") {
      setAvailabilityTab("hours");
    }
    if (tool === "transactions") {
      setTransactionFilter("all");
    }
    if (tool === "reports") {
      setSalesTrendRange("today");
    }
  }

  async function handleAccountSave(input: AccountQuickEditInput) {
    const { firstName, lastName } = splitFullName(input.fullName);
    if (!firstName || !lastName) {
      throw new Error("Enter a first and last name.");
    }

    if (!input.phone.trim()) {
      throw new Error("Phone number is required for account contact updates.");
    }

    const response = await fetch("/api/auth/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        phone: input.phone,
        email: input.email || undefined
      })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Unable to save account contact details.");
    }

    setFeedback({ tone: "success", message: "Account details saved. Email or phone changes may still require verification." });
  }

  function handleAccountPaymentAction() {
    setAccountEditorOpen(false);
    window.setTimeout(() => {
      const target = document.getElementById("barber-settings-payouts");
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  }

  function closeBusinessTool() {
    setActiveBusinessTool(null);
    setActiveBusinessPanel(null);
  }

  function toggleActivationDay(day: number) {
    setAvailabilityDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day].sort((left, right) => left - right)
    }));
  }

  async function handleQuickAddService() {
    setFeedback(null);
    const price = Number(serviceDraft.price);
    const durationMin = Number(serviceDraft.duration);
    if (!serviceDraft.name.trim() || !Number.isFinite(price) || price <= 0 || !Number.isFinite(durationMin) || durationMin < 15) {
      setFeedback({ tone: "error", message: "Enter a service name, price, and duration of at least 15 minutes." });
      return;
    }

    if (!serviceDraft.active) {
      setFeedback({ tone: "error", message: "Your first activation service must be active so clients can book it." });
      return;
    }

    try {
      await createServiceMutation.mutateAsync({
        category: "Haircuts",
        name: serviceDraft.name.trim(),
        description: "",
        durationMin,
        bufferMin: 0,
        price,
        deposit: 0,
        fullPrepay: false,
        styleTagIds: []
      });
      await Promise.all([serviceCatalogQuery.refetch(), overviewQuery.refetch()]);
      closeQuickSetupModal();
      setFeedback({ tone: "success", message: "Service added through the canonical marketplace service library." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to add service right now.") });
    }
  }

  async function handleQuickSetAvailability() {
    setFeedback(null);
    if (!availabilityDraft.days.length) {
      setFeedback({ tone: "error", message: "Turn on at least one working day." });
      return;
    }

    if (availabilityLocationMode === "custom") {
      const missingLocation = !serviceLocationDraft.name.trim()
        || !serviceLocationDraft.address.trim()
        || !serviceLocationDraft.city.trim()
        || !serviceLocationDraft.state.trim();
      if (missingLocation) {
        setFeedback({ tone: "error", message: "Add your service location name, address, city, and state." });
        return;
      }
    }

    if (availabilityLocationMode === "shop" && !selectedJoinShopId) {
      setFeedback({ tone: "error", message: "Select a shop or choose another location option before saving." });
      return;
    }

    try {
      await activationAvailabilityMutation.mutateAsync({
        locationMode: availabilityLocationMode,
        shopId: availabilityLocationMode === "shop" ? selectedJoinShopId ?? undefined : undefined,
        serviceLocation: availabilityLocationMode === "custom"
          ? {
              name: serviceLocationDraft.name.trim(),
              address: serviceLocationDraft.address.trim(),
              city: serviceLocationDraft.city.trim(),
              state: serviceLocationDraft.state.trim(),
              postalCode: serviceLocationDraft.postalCode.trim() || undefined
            }
          : undefined,
        workingHours: availabilityDraft.days.map((weekday) => ({
          weekday,
          startTime: availabilityDraft.startTime,
          endTime: availabilityDraft.endTime
        }))
      });
      await Promise.all([overviewQuery.refetch(), shopDirectoryQuery.refetch()]);
      closeQuickSetupModal();
      const message = availabilityLocationMode === "custom"
        ? "Working hours and your independent service location are saved."
        : availabilityLocationMode === "shop"
          ? "Working hours saved and the shop connection request is ready for owner review."
          : "Working hours saved. Add a service location or connect a shop before clients can book.";
      setFeedback({ tone: "success", message });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleQuickTurnPublic() {
    setFeedback(null);
    try {
      await activationMutation.mutateAsync({
        action: "set_visibility",
        visibilityState: "public",
        acceptsInstantBookings: true
      });
      await Promise.all([mediaQuery.refetch(), serviceCatalogQuery.refetch()]);
      closeQuickSetupModal();
      setFeedback({ tone: "success", message: "Profile visibility is public. Services and availability still decide bookability." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to update profile visibility right now.") });
    }
  }

  async function handleQuickGoActive() {
    setFeedback(null);
    try {
      await statusMutation.mutateAsync({
        liveStatus: "available",
        isOnline: true,
        acceptsWalkIns: overviewPayload?.status.acceptsWalkIns ?? true,
        currentShopId: overviewPayload?.status.currentShopId ?? overviewPayload?.shops[0]?.id ?? null
      });
      await overviewQuery.refetch();
      closeQuickSetupModal();
      setFeedback({ tone: "success", message: "Booking status is active through the live barber status rail." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  const refreshPayoutQueries = useCallback(async () => {
    await Promise.allSettled([
      readinessQuery.refetch(),
      payoutsQuery.refetch(),
      overviewQuery.refetch(),
      trustQuery.refetch(),
      verificationMeQuery.refetch()
    ]);
  }, [overviewQuery, payoutsQuery, readinessQuery, trustQuery, verificationMeQuery]);

  const handleRefreshPayoutStatus = useCallback(async (successMessage = "Payout readiness refreshed from the connected account.") => {
    setFeedback(null);
    try {
      await refreshMutation.mutateAsync({});
      await refreshPayoutQueries();
      setFeedback({ tone: "success", message: successMessage });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }, [refreshMutation, refreshPayoutQueries]);

  async function handleMessageTransaction(input: {
    appointmentId: string | null;
    clientProfileId: string | null;
  }) {
    setFeedback(null);
    try {
      const payload = input.appointmentId
        ? await createMessageThreadMutation.mutateAsync({ appointmentId: input.appointmentId })
        : input.clientProfileId
          ? await createMessageThreadMutation.mutateAsync({ threadType: "client_barber", profileId: input.clientProfileId })
          : null;

      if (!payload?.thread?.id) {
        setFeedback({ tone: "info", message: "This transaction does not have a messageable BVRB3R client yet." });
        return;
      }

      router.push(`/dashboard/barber/messages/${payload.thread.id}`);
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to open this client conversation right now.") });
    }
  }

  function handleOpenTransactionReceipt(transaction: BarberPayoutTransaction) {
    const isPosReceipt = transaction.transactionType === "pos_cash" || transaction.transactionType === "pos_card";
    const missingPosSaleId = isPosReceipt && !transaction.posSaleId;
    const missingAppointmentId = transaction.transactionType === "appointment" && !transaction.appointmentId && !transaction.paymentId;
    setReceiptTransactionId(transaction.id);
    setReceiptError(
      missingPosSaleId || missingAppointmentId
        ? "Receipt data could not be loaded for this sale."
        : null
    );
  }

  function handleTransactionSecondaryAction(transaction: BarberPayoutTransaction) {
    if (transaction.transactionType === "pos_request") {
      setFeedback({ tone: "info", message: "Receipt appears after the client approves payment." });
      return;
    }

    handleOpenTransactionReceipt(transaction);
  }

  function closeReceiptModal() {
    setReceiptTransactionId(null);
    setReceiptError(null);
  }

  useEffect(() => {
    if (!stripeReturnState || stripeReturnSyncRef.current) {
      return;
    }

    stripeReturnSyncRef.current = true;

    if (stripeReturnState === "refresh") {
      setFeedback({
        tone: "info",
        message: "Stripe asked for a refreshed onboarding link. Resume payouts when you are ready."
      });
      return;
    }

    void handleRefreshPayoutStatus("Stripe onboarding returned. Payout readiness synced from Stripe.");
  }, [handleRefreshPayoutStatus, stripeReturnState]);

  const activationActionHandlers = {
    "barber-services": () => setQuickSetupModal("service"),
    "barber-availability": () => setQuickSetupModal("availability"),
    "barber-service-location": () => setQuickSetupModal("availability"),
    "barber-visibility": () => setQuickSetupModal("visibility"),
    "barber-booking-status": () => setQuickSetupModal("booking"),
    "barber-payouts": () => void navigateToStripeUrl(
      async () => (await onboardingMutation.mutateAsync()).url,
      connectedAccount?.providerAccountId ? "Stripe onboarding link refreshed." : "Stripe onboarding started."
    ),
    "barber-shop-link": () => {
      if (pendingShopInvites.length) {
        setQuickSetupModal("invites");
        return;
      }

      setAvailabilityLocationMode("shop");
      setQuickSetupModal("availability");
    }
  };

  async function handleAcceptance(agreementType: "platform_terms" | "barber_agreement" | "payout_tax_acknowledgment") {
    setFeedback(null);
    try {
      await recordAcceptanceMutation.mutateAsync({ agreementType });
      setFeedback({ tone: "success", message: `${formatStatusLabel(agreementType)} recorded into payout readiness.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

  async function handleSaveSubtype() {
    setFeedback(null);
    try {
      await saveSubtypeMutation.mutateAsync(selectedSubtype);
      setFeedback({ tone: "success", message: "Business model saved through the existing barber subtype flow." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  function resetBookingLocationDraft() {
    const bookingLocation = activationSetup?.bookingLocation;
    setBookingLocationDraft({
      name: bookingLocation?.name ?? "",
      address: bookingLocation?.address ?? "",
      addressLine2: bookingLocation?.addressLine2 ?? "",
      city: bookingLocation?.city ?? "",
      state: bookingLocation?.state ?? "",
      postalCode: bookingLocation?.postalCode ?? ""
    });
  }

  function useFirstShopAddressDraft() {
    const firstShop = overviewPayload?.shops[0];
    if (!firstShop) {
      setFeedback({ tone: "info", message: "No connected shop address is available yet." });
      return;
    }

    const [name = firstShop.label, address = "", cityState = ""] = firstShop.label.split("•").map((part) => part.trim());
    const [city = "", state = ""] = cityState.split(",").map((part) => part.trim());
    setBookingLocationDraft((current) => ({
      ...current,
      name: name || firstShop.label,
      address,
      city,
      state
    }));
  }

  async function handleSaveBookingLocation() {
    setFeedback(null);
    const missingLocation = !bookingLocationDraft.name.trim()
      || !bookingLocationDraft.address.trim()
      || !bookingLocationDraft.city.trim()
      || !bookingLocationDraft.state.trim();
    if (missingLocation) {
      setFeedback({ tone: "error", message: "Add the location label, street address, city, and state clients should see when booking." });
      return;
    }

    try {
      await bookingLocationMutation.mutateAsync({
        serviceLocation: {
          name: bookingLocationDraft.name.trim(),
          address: bookingLocationDraft.address.trim(),
          addressLine2: bookingLocationDraft.addressLine2.trim() || undefined,
          city: bookingLocationDraft.city.trim(),
          state: bookingLocationDraft.state.trim(),
          postalCode: bookingLocationDraft.postalCode.trim() || undefined
        }
      });
      await Promise.all([overviewQuery.refetch(), serviceCatalogQuery.refetch()]);
      setFeedback({ tone: "success", message: "Booking location saved. Clients will see this address when they book." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleTeamInviteResponse(inviteId: string, status: "accepted" | "declined") {
    setFeedback(null);
    try {
      const result = await respondTeamInviteMutation.mutateAsync({ inviteId, status });
      setFeedback({
        tone: status === "accepted" ? "success" : "info",
        message: status === "accepted"
          ? `You joined ${result.invite.shopLabel}. Owner team, schedule, and shop profile surfaces will update from the canonical team membership.`
          : `Invite from ${result.invite.shopLabel} declined.`
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleNotificationToggle(
    field: "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled",
    value: boolean
  ) {
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "update_viewer_notification_preference",
        inAppEnabled: field === "inAppEnabled" ? value : notificationPreference?.inAppEnabled ?? true,
        smsEnabled: field === "smsEnabled" ? value : notificationPreference?.smsEnabled ?? false,
        emailEnabled: field === "emailEnabled" ? value : notificationPreference?.emailEnabled ?? true,
        pushEnabled: field === "pushEnabled" ? value : notificationPreference?.pushEnabled ?? true
      });
      setFeedback({ tone: "success", message: "Notification settings updated for this barber account." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to update notification settings right now.") });
    }
  }

  async function handleVerificationSubmit() {
    setFeedback(null);
    try {
      await uploadMutation.mutateAsync({
        ownerType: "barber",
        category: verificationCategory,
        fileName,
        contentType: "application/pdf",
        fileSizeBytes: 240_000,
        expiresAt: verificationCategory === "license_verification" && expirationDate ? expirationDate : undefined
      });
      await submitVerificationMutation.mutateAsync({
        category: verificationCategory,
        legalName,
        licenseType: verificationCategory === "license_verification" ? "State barber license" : undefined,
        licenseNumber: verificationCategory === "license_verification" ? licenseNumber : undefined,
        issuingState: verificationCategory === "license_verification" ? issuingState : undefined,
        expirationDate: verificationCategory === "license_verification" ? expirationDate : undefined
      });
      setFeedback({ tone: "success", message: "Verification upload submitted into the canonical trust review lane." });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to submit verification right now.") });
    }
  }

  async function handleIdentityLaunch() {
    setFeedback(null);
    try {
      const result = await identitySessionMutation.mutateAsync();
      if (result.url && typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setFeedback({
        tone: result.degraded ? "info" : "success",
        message: result.degraded
          ? "Identity verification started, but provider sync is degraded. The review lane is still open."
          : "Stripe Identity opened for this barber account."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: readableError(error, "Unable to start identity verification right now.") });
    }
  }

  return (
    <div className="relative space-y-6 overflow-hidden pb-4 text-white" data-testid="barber-settings-screen">
      <div className="pointer-events-none absolute inset-x-[-4rem] top-[-8rem] h-72 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.12),transparent_32%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-[-4rem] bottom-[-8rem] h-72 bg-[radial-gradient(circle_at_bottom_center,rgba(163,255,18,0.07),transparent_34%)]" aria-hidden="true" />

      <div className="relative space-y-6">
        {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        {trustQuery.error ? <FeedbackBanner tone="error" message={readableError(trustQuery.error, "Unable to load barber verification status right now.")} /> : null}
        {readinessQuery.error ? <FeedbackBanner tone="error" message={readableError(readinessQuery.error, "Unable to load payout readiness right now.")} /> : null}
        {payoutsQuery.error ? <FeedbackBanner tone="error" message={readableError(payoutsQuery.error, "Unable to load payout ledger right now.")} /> : null}
        {overviewQuery.error ? <FeedbackBanner tone="error" message={readableError(overviewQuery.error, "Unable to load barber operating details right now.")} /> : null}
        {teamInvitesQuery.error ? <FeedbackBanner tone="error" message={readableError(teamInvitesQuery.error, "Unable to load shop invitations right now.")} /> : null}
        {serviceCatalogQuery.error ? <FeedbackBanner tone="error" message={readableError(serviceCatalogQuery.error, "Unable to load service activation status right now.")} /> : null}
        {stripeEnvironment?.blocksLivePayouts ? (
          <FeedbackBanner tone="info" message={stripeEnvironment.label} />
        ) : null}

        {!embedded ? (
          <MorePageHeader
            title="More"
            subtitle="Manage your account, business setup, payouts, profile, and settings."
          />
        ) : null}

        <MoreIdentityReadinessCard
          variant="barber"
          imageUrl={barberPhotoUrl}
          initials={getInitials(user.name)}
          title={user.name}
          subtitle={user.email}
          roleLabel="BARBER ACCOUNT"
          badges={[
            { label: formatScopedStatusLabel("Account", user.appApprovalStatus), tone: moreToneForStatus(getStatusTone(user.appApprovalStatus)) },
            { label: formatScopedStatusLabel("License", canonicalVerificationStatus), tone: moreToneForStatus(getStatusTone(canonicalVerificationStatus)) },
            { label: formatBarberPayoutChipLabel({ payoutsReady: payoutsConnectedForIdentity, payoutStatus }), tone: payoutsConnectedForIdentity ? "green" : "yellow" }
          ]}
          metaLines={[barberPublicUsernameLine, barberIdentityLocationLabel]}
          primaryAction={{ label: "Edit Account", onClick: () => setAccountEditorOpen(true) }}
          secondaryAction={{ label: "Edit Public Profile", href: "/dashboard/barber/profile" }}
          tiles={statusItems.map((item) => ({
            label: item.label,
            value: item.value,
            tone: moreToneForStatus(item.tone),
            helper: item.label === "Payouts" ? payoutSetupMessage : undefined,
            href: item.label === "Payouts" ? "#barber-settings-payouts" : item.label === "Profile" ? "/dashboard/barber/profile" : "#barber-settings-verification"
          }))}
        />

        <MoreActivationGate
          title="Your barber setup"
          subtitle="Finish these steps so clients can book you and payouts can move correctly."
        >
          <BarberActivationGate
            input={{
              approvalStatus: canonicalVerificationStatus,
              accountStatus: user.accountStatus,
              hasActiveService,
              hasAvailability,
              isProfilePublic,
              isAcceptingBookings: isBookingActive,
              payoutsReady,
              payoutsRequired: payoutsRequiredForActivation,
              hasServiceLocation,
              serviceLocationRequired: true,
              hasShopLink: hasAcceptedShopLink,
              shopLinkRequired,
              hasPendingShopInvite: pendingShopInvites.length > 0
            }}
            actionHandlers={activationActionHandlers}
          />
        </MoreActivationGate>

        {!payoutsReady ? (
          <GlassCard id="barber-settings-payout-refresh" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <CircleIcon icon={WalletCards} className="h-11 w-11 rounded-2xl" />
                <div>
                  <SectionLabel>Payout readiness</SectionLabel>
                  <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">
                    {payoutReadinessLabel}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">
                    Stripe readiness only updates after the connected account confirms charges, payouts, submitted details, and no current requirements.
                  </p>
                </div>
              </div>
              <ActionButton
                type="button"
                variant="secondary"
                className="min-h-11 px-4 text-xs"
                disabled={refreshMutation.isPending}
                onClick={() => void handleRefreshPayoutStatus()}
              >
                {refreshMutation.isPending ? "Refreshing..." : "Refresh payout status"}
              </ActionButton>
            </div>
          </GlassCard>
        ) : null}

        <MoreControlHub
          title="Business Control Hub"
          subtitle="Manage the tools that control your bookings, services, payouts, and public profile."
        rows={[
          { title: "Service Library", subtitle: "Pricing and offerings", href: "#barber-settings-business", icon: <Scissors className="h-5 w-5" /> },
          { title: "Hours", subtitle: "Working time and blocks", href: "#barber-settings-business", icon: <Clock3 className="h-5 w-5" /> },
          { title: "Booking Rules", subtitle: "Online booking preferences", href: "#barber-settings-business", icon: <CalendarDays className="h-5 w-5" /> },
          { title: "Payout Balance", subtitle: "Eligible balance and readiness", href: "#barber-settings-payouts", status: payoutCurrency(eligiblePayoutAmount ?? 0), tone: hasPayoutAmount ? "green" : "muted", icon: <WalletCards className="h-5 w-5" /> },
          { title: "Receipts", subtitle: "Sales and transactions", href: "#barber-settings-transactions", icon: <ReceiptText className="h-5 w-5" /> },
          { title: "Performance", subtitle: "Reports and trends", href: "#barber-settings-business", icon: <BarChart3 className="h-5 w-5" /> },
          { title: "Shop Relationship", subtitle: "Invites and operating model", href: "#barber-settings-shop-invites", status: pendingShopInvites.length ? `${pendingShopInvites.length} pending` : subtypeLabel, tone: pendingShopInvites.length ? "yellow" : "muted", icon: <Store className="h-5 w-5" /> },
          { title: "Alerts", subtitle: "Notifications and reminders", href: "#barber-settings-business", icon: <BellRing className="h-5 w-5" /> }
        ]}
      />

        <GlassCard id="barber-settings-shop-invites" className="scroll-mt-6 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <CircleIcon icon={Store} />
              <div>
                <SectionLabel>Shop Invitations</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Team requests</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">
                  Accepting links your barber account to the shop through the existing team membership system.
                </p>
              </div>
            </div>
            <StatusPill tone={pendingShopInvites.length ? "amber" : "green"}>
              {pendingShopInvites.length ? `${pendingShopInvites.length} pending` : "No pending invites"}
            </StatusPill>
          </div>

          <div className="mt-5 space-y-3">
            {teamInvitesQuery.isLoading ? (
              <div className="rounded-[24px] border border-white/8 bg-black/24 p-5 text-sm font-bold text-white/58">
                Loading shop invitations...
              </div>
            ) : pendingShopInvites.length ? pendingShopInvites.map((invite) => (
              <div key={invite.id} className="rounded-[24px] border border-white/8 bg-black/24 p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-xl font-extrabold tracking-[-0.03em] text-white">{invite.shopLabel}</p>
                    <p className="mt-2 text-sm text-white/54">
                      Invited {formatDateTime(invite.createdAt)}
                    </p>
                    {invite.message ? <p className="mt-3 text-sm leading-6 text-white/68">{invite.message}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <ActionButton
                      type="button"
                      className="min-h-11 px-4 text-xs"
                      disabled={respondTeamInviteMutation.isPending}
                      onClick={() => void handleTeamInviteResponse(invite.id, "accepted")}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Accept
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="secondary"
                      className="min-h-11 px-4 text-xs border-red-400/30 text-red-200 hover:border-red-300/50 hover:text-red-100"
                      disabled={respondTeamInviteMutation.isPending}
                      onClick={() => void handleTeamInviteResponse(invite.id, "declined")}
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      Decline
                    </ActionButton>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/24 p-5 text-sm leading-7 text-white/58">
                No shop invitations are waiting right now.
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard id="barber-settings-payouts" className="scroll-mt-6 p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <CircleIcon icon={CircleDollarSign} />
              <div>
                <SectionLabel>Payouts</SectionLabel>
                {hasPayoutAmount ? (
                  <>
                    <p className="mt-4 text-sm font-semibold text-white/54">Eligible balance</p>
                    <p className="mt-2 text-4xl font-black tracking-[-0.05em] text-[#a3ff12] drop-shadow-[0_0_24px_rgba(163,255,18,0.22)]">
                      {payoutCurrency(eligiblePayoutAmount)}
                    </p>
                    <p className="mt-2 text-sm text-white/48">
                      {eligibleRoutingRecords} payout-ready routing records
                    </p>
                    <p className="mt-1 text-sm text-white/48">
                      Released balance {payoutCurrency(releasedPayoutAmount)}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-white">Set up or review payout status.</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/56">
                      Connect and review payout readiness through the existing Stripe-backed flow. {payoutReadinessLabel}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-[24px] border border-white/8 bg-black/24 p-4 lg:min-w-[260px]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/42">Payout Status</p>
                <div className="mt-3">
                  <StatusPill tone={payoutsReady ? "green" : getStatusTone(payoutStatus)}>
                    {payoutsReady ? payoutReadinessLabel : formatStatusLabel(payoutStatus)}
                  </StatusPill>
                </div>
                <p className="mt-3 text-sm font-black text-white">{payoutSetupStatusLabel}</p>
                <p className="mt-2 text-xs leading-5 text-white/56">{payoutSetupMessage}</p>
                {stripePayoutReadiness && (stripePayoutReadiness.currentlyDue.length || stripePayoutReadiness.pastDue.length) ? (
                  <div className="mt-3 rounded-[18px] border border-amber-300/14 bg-amber-300/8 p-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-100/62">Stripe needs</p>
                    <p className="mt-2 text-xs leading-5 text-amber-50/80">
                      {[...stripePayoutReadiness.pastDue, ...stripePayoutReadiness.currentlyDue].join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {showOnboardingAction ? (
                  <ActionButton
                    type="button"
                    className="min-h-11 px-4 text-xs"
                    disabled={onboardingMutation.isPending}
                    onClick={() => void navigateToStripeUrl(
                      async () => (await onboardingMutation.mutateAsync()).url,
                      connectedAccount?.providerAccountId ? "Stripe onboarding link refreshed." : "Stripe onboarding started."
                    )}
                  >
                    {payoutSetupActionLabel}
                  </ActionButton>
                ) : null}
                {connectedAccount?.providerAccountId ? (
                  <>
                    <ActionButton
                      type="button"
                      variant="secondary"
                      className="min-h-11 px-4 text-xs"
                      disabled={dashboardMutation.isPending}
                      onClick={() => void navigateToStripeUrl(
                        async () => (await dashboardMutation.mutateAsync({})).url,
                        "Opening the Stripe Express dashboard."
                      )}
                    >
                      View Details
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      className="min-h-11 px-4 text-xs"
                      disabled={refreshMutation.isPending}
                      onClick={() => void handleRefreshPayoutStatus()}
                    >
                      {refreshMutation.isPending ? "Refreshing..." : "Refresh payout status"}
                    </ActionButton>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard id="barber-settings-money" className="scroll-mt-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>Money Posture</SectionLabel>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Today at a glance</h2>
              <p className="mt-2 text-sm leading-6 text-white/56">Cash stays separate from BVRB3R-collected card/app payout eligibility.</p>
            </div>
            <CircleIcon icon={WalletCards} className="h-11 w-11 rounded-2xl" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Cash Collected Today</p>
              <p className="mt-3 text-2xl font-black text-white">{currency(cashCollectedToday)}</p>
              <p className="mt-2 text-sm text-white/56">No platform payout.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Card/App Collected Today</p>
              <p className="mt-3 text-2xl font-black text-white">{currency(cardAppCollectedToday)}</p>
              <p className="mt-2 text-sm text-white/56">Collected through BVRB3R.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">App Payout Eligible</p>
              <p className="mt-3 text-2xl font-black text-[#a3ff12]">{currency(appPayoutEligible)}</p>
              <p className="mt-2 text-sm text-white/56">Eligible balance excludes cash.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Gross Total Today</p>
              <p className="mt-3 text-2xl font-black text-white">{currency(grossTotalToday)}</p>
              <p className="mt-2 text-sm text-white/56">Cash + app collected.</p>
            </div>
          </div>
        </GlassCard>

        <section id="barber-settings-business" className="scroll-mt-6 space-y-4">
          <SectionLabel>Manage Your Business</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {businessControls.map((item) => (
              <BusinessControlCard
                key={item.key}
                toolKey={item.key}
                title={item.title}
                subtitle={item.subtitle}
                icon={item.icon}
                onOpen={openBusinessTool}
              />
            ))}
          </div>

          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Account Summary</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Private barber setup</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Contact, operating mode, payout posture, and support stay one tap away.</p>
              </div>
              <CircleIcon icon={Settings2} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Email", user.email],
                ["Phone", user.phone ?? "Not set"],
                ["Operating Mode", subtypeLabel],
                ["Payout Mode", connectedAccount?.payoutsEnabled ? "Ready" : formatStatusLabel(payoutStatus)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">{label}</p>
                  <p className="mt-2 truncate text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {activeBusinessControl ? (
            <BusinessToolModal
              title={activeBusinessControl.title}
              subtitle={activeBusinessControl.subtitle}
              description={getBusinessToolDescription(activeBusinessTool)}
              onClose={closeBusinessTool}
            >
              {false && activeBusinessTool === "services" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {serviceItems.length ? serviceItems.map((item) => (
                      <BusinessToolRow
                        key={item.service.id}
                        icon={Scissors}
                        title={item.service.name}
                        subtitle={`${item.service.isActive === false ? "Inactive" : "Active"} | ${item.service.isBookable === false ? "Not bookable" : "Bookable"}`}
                        status={(
                          <StatusPill tone={item.service.isActive === false || item.service.isBookable === false ? "amber" : "green"}>
                            {item.service.isActive === false || item.service.isBookable === false ? "Needs review" : "Live"}
                          </StatusPill>
                        )}
                      />
                    )) : (
                      <div className="rounded-[20px] border border-dashed border-white/10 bg-black/24 p-4 text-sm leading-6 text-white/58">
                        Add a service so clients can book a cut from your public profile.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/dashboard/barber/checkout?section=services" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-5 text-sm font-extrabold text-[#a3ff12] transition hover:border-[#a3ff12]/60 hover:bg-[#a3ff12]/14">
                      Edit services
                    </Link>
                    <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => setQuickSetupModal("service")}>
                      Add service
                    </Button>
                  </div>
                </div>
              ) : null}

              {activeBusinessTool === "availability" ? (
                <div className="space-y-4">
                  <div className="inline-flex rounded-full border border-white/10 bg-black/30 p-1">
                    {(["hours", "blocked"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setAvailabilityTab(tab)}
                        className={cn(
                          "min-h-10 rounded-full px-4 text-xs font-black uppercase tracking-[0.16em] transition",
                          availabilityTab === tab ? "bg-[#a3ff12] text-black" : "text-white/56 hover:text-white"
                        )}
                      >
                        {tab === "hours" ? "Hours" : "Blocked Time"}
                      </button>
                    ))}
                  </div>
                  {availabilityTab === "hours" ? (
                    <div className="space-y-2" data-testid="availability-hours-tab">
                      {weeklyHours.map((day) => (
                        <div key={day.value} className="grid min-h-12 grid-cols-[92px_1fr_auto] items-center gap-3 rounded-[16px] border border-white/8 bg-black/24 px-4 py-3">
                          <p className="text-sm font-black text-white">{day.dayLabel}</p>
                          <p className={cn("text-sm font-bold", day.schedule ? "text-white/78" : "text-white/38")}>{day.statusLabel}</p>
                          <StatusPill tone={day.schedule ? "green" : "neutral"}>{day.schedule ? "Open" : "Closed"}</StatusPill>
                        </div>
                      ))}
                      <p className="text-xs leading-5 text-white/46">Detailed working-hour saves stay connected to the calendar availability workspace.</p>
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="availability-blocked-tab">
                      <BusinessToolRow
                        icon={Plus}
                        title="Add Block"
                        subtitle="Block vacation, breaks, or unavailable time from the booking engine."
                        rightAction={<Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled>Add next</Button>}
                      />
                      <div className="rounded-[20px] border border-dashed border-white/10 bg-black/24 p-4 text-sm leading-6 text-white/58">
                        No blocked time is shown here yet. The next pass can wire compact block creation without changing the canonical calendar engine.
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeBusinessTool === "booking" && !activeBusinessPanel ? (
                <div className="space-y-2">
                  <BusinessToolRow icon={ShieldCheck} title="Business Model" subtitle="Freelance, commission, or booth rent posture" status={<StatusPill tone="green">{subtypeLabel}</StatusPill>} onClick={() => setActiveBusinessPanel("booking-model")} testId="booking-panel-business-model" />
                  <BusinessToolRow icon={UserCheck} title="Booking Visibility" subtitle="Public profile and accepting-bookings controls" status={<StatusPill tone={isBookingActive ? "green" : "amber"}>{isBookingActive ? "Active" : "Not active"}</StatusPill>} onClick={() => setActiveBusinessPanel("booking-visibility")} />
                  <BusinessToolRow icon={MapPin} title="Booking Location" subtitle="Where clients go for appointments" status={<StatusPill tone={hasServiceLocation ? "green" : "amber"}>{hasServiceLocation ? "Set" : "Missing"}</StatusPill>} onClick={() => setActiveBusinessPanel("booking-location")} />
                  <BusinessToolRow icon={SlidersHorizontal} title="Scheduling Rules" subtitle="Notice, buffers, and booking preferences" status={<StatusPill tone="neutral">Coming next</StatusPill>} onClick={() => setActiveBusinessPanel("booking-rules")} />
                </div>
              ) : null}

              {activeBusinessTool === "booking" && activeBusinessPanel === "booking-visibility" ? (
                <BusinessToolPanel title="Booking Visibility" description="Profile readiness and accepting-bookings controls stay tied to activation." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="space-y-2">
                    <BusinessToolRow title="Public profile" subtitle={isProfilePublic ? "Clients can discover your profile." : "Turn on visibility when setup is ready."} status={<StatusPill tone={isProfilePublic ? "green" : "amber"}>{isProfilePublic ? "Public" : "Hidden"}</StatusPill>} />
                    <BusinessToolRow title="Accepting bookings" subtitle={isBookingActive ? "Booking engine can consider this barber." : "Go active when services and availability are ready."} status={<StatusPill tone={isBookingActive ? "green" : "amber"}>{isBookingActive ? "Active" : "Inactive"}</StatusPill>} />
                    <BusinessToolRow title="Service readiness" subtitle={hasActiveService ? "At least one bookable service is ready." : "Add an active bookable service."} status={<StatusPill tone={hasActiveService ? "green" : "amber"}>{hasActiveService ? "Ready" : "Needs service"}</StatusPill>} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" className="h-11 px-4" disabled={activationMutation.isPending} onClick={() => void handleQuickTurnPublic()}>Turn public</Button>
                    <Button type="button" className="h-11 px-4" disabled={statusMutation.isPending} onClick={() => void handleQuickGoActive()}>Go active</Button>
                  </div>
                </BusinessToolPanel>
              ) : null}

              {activeBusinessTool === "booking" && activeBusinessPanel === "booking-rules" ? (
                <BusinessToolPanel title="Scheduling Rules" description="Scheduling rule persistence is coming next." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/24 p-4 text-sm leading-6 text-white/58">
                    Scheduling rules are coming next. No placeholder preferences are saved yet.
                  </div>
                </BusinessToolPanel>
              ) : null}

              {activeBusinessTool === "kiosk" ? (
                <div className="space-y-3">
                  <KioskSettingsCard
                    scope="barber"
                    targetReference={user.barberId ?? user.id}
                    title="Barber kiosk PIN"
                    subtitle="Set the PIN required to enter or exit locked barber kiosk mode on this device."
                  />
                  <BusinessToolRow
                    icon={TabletSmartphone}
                    title="Enable Kiosk Mode"
                    subtitle="Launch a locked booking screen from Barber Home after setting a 4-digit PIN."
                    status={<StatusPill tone="amber">PIN required</StatusPill>}
                  />
                  <BusinessToolRow
                    icon={ShieldCheck}
                    title="Change 4-digit PIN"
                    subtitle="PIN hashes are stored in kiosk settings; the main account password is never used as the kiosk PIN."
                    status={<StatusPill tone="neutral">Secure hash</StatusPill>}
                  />
                  <BusinessToolRow
                    icon={CalendarDays}
                    title="Booking rules"
                    subtitle="Kiosk bookings use your existing services, availability, payment, and conflict checks."
                    status={<StatusPill tone="green">Canonical</StatusPill>}
                  />
                </div>
              ) : null}

              {activeBusinessTool === "notifications" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Appointments", "Appointment reminders", "Schedule updates"],
                    ["Payments", "Payment alerts", "Payout alerts"],
                    ["Messages", "Client messages", "Support messages"],
                    ["Marketing / App", "App notifications", "Email alerts", "SMS updates", "Push reminders"]
                  ].map(([group, ...items]) => (
                    <div key={group} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                      <p className="text-sm font-black text-white">{group}</p>
                      <div className="mt-3 space-y-2">
                        {items.map((label) => {
                          const key = label === "App notifications" ? "inAppEnabled" : label === "Email alerts" ? "emailEnabled" : label === "SMS updates" ? "smsEnabled" : label === "Push reminders" ? "pushEnabled" : null;
                          const checked = key ? notificationPreference?.[key as keyof NonNullable<typeof notificationPreference>] ?? false : false;
                          return (
                            <label key={label} className="flex min-h-10 items-center justify-between gap-3 rounded-[14px] border border-white/8 bg-black/20 px-3 text-xs font-bold text-white/64">
                              <span>{label}</span>
                              {key ? (
                                <input
                                  type="checkbox"
                                  checked={checked as boolean}
                                  disabled={mediaMutation.isPending}
                                  onChange={(event) => void handleNotificationToggle(key as "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled", event.target.checked)}
                                  className="h-4 w-4 rounded border-white/20 bg-black accent-[#a3ff12]"
                                  aria-label={`Toggle ${label}`}
                                />
                              ) : <StatusPill tone="neutral">Soon</StatusPill>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {activeBusinessTool === "transactions" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(["all", "appointments", "cash", "card", "requests"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setTransactionFilter(filter)}
                        className={cn(
                          "min-h-9 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.16em] transition",
                          transactionFilter === filter ? "border-[#a3ff12] bg-[#a3ff12] text-black" : "border-white/10 bg-black/24 text-white/56 hover:text-white"
                        )}
                      >
                        {filter === "card" ? "Card/App" : formatStatusLabel(filter)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2" data-testid="transactions-ledger-feed">
                    {filteredTransactions.length ? filteredTransactions.map((transaction) => (
                      <div key={transaction.id} data-testid={`transaction-row-${transaction.id}`} className="rounded-[18px] border border-white/8 bg-black/24 p-4">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{transaction.customerName}</p>
                            <p className="mt-1 text-xs font-bold text-white/58">
                              {transaction.paymentMethodLabel} | {currency(transaction.grossAmount)} | {formatDateTime(transaction.occurredAt)}
                            </p>
                            <p className="mt-1 text-xs text-white/48">
                              {transaction.transactionType === "appointment"
                                ? `${transaction.statusLabel} | Tip ${currency(0)}`
                                : `${transaction.statusLabel} | ${transaction.postureLabel}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {transaction.canMessage ? (
                              <Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled={createMessageThreadMutation.isPending} onClick={() => void handleMessageTransaction({ appointmentId: transaction.appointmentId, clientProfileId: transaction.clientProfileId })}>Message</Button>
                            ) : transaction.transactionType === "pos_cash" ? (
                              <Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled>{transaction.customerPhone || transaction.customerEmail ? "Message unavailable" : "Add Customer"}</Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 px-3 text-xs"
                              disabled={transaction.transactionType === "pos_request" && ["Closed duplicate", "Canceled", "Declined", "Expired", "Failed"].includes(transaction.statusLabel)}
                              onClick={() => handleTransactionSecondaryAction(transaction)}
                            >
                              {transaction.transactionType === "pos_request"
                                ? ["Closed duplicate", "Canceled", "Declined", "Expired", "Failed"].includes(transaction.statusLabel) ? "Request closed" : "View request"
                                : "Receipt"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[20px] border border-dashed border-white/10 bg-black/24 p-4 text-sm leading-6 text-white/58">
                        No transactions match this filter yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeBusinessTool === "reports" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Cash Collected Today", currency(cashCollectedToday), "Cash collected directly. No platform payout."],
                      ["Card/App Collected Today", currency(cardAppCollectedToday), "Collected through BVRB3R."],
                      ["App Payout Eligible", currency(appPayoutEligible), "Eligible balance excludes cash."],
                      ["Gross Total Today", currency(grossTotalToday), "Cash + app collected today."]
                    ].map(([label, value, detail]) => (
                      <div key={label} className="rounded-[18px] border border-white/8 bg-black/24 p-4">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40">{label}</p>
                        <p className="mt-3 text-2xl font-black text-white">{value}</p>
                        <p className="mt-2 text-xs leading-5 text-white/50">{detail}</p>
                      </div>
                    ))}
                  </div>
                  <SalesPulseChart
                    points={selectedSalesTrend}
                    range={salesTrendRange}
                    onRangeChange={setSalesTrendRange}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ["Paid appointments", moneyPosture?.paidAppointmentsCount ?? paidAppointments.length],
                      ["Cash sales", moneyPosture?.cashSalesCount ?? 0],
                      ["Card POS sales", moneyPosture?.cardPosSalesCount ?? 0],
                      ["Pending requests", moneyPosture?.pendingPaymentRequestsCount ?? 0],
                      ["Released payout", currency(moneyPosture?.releasedPayoutAmount ?? releasedPayoutAmount)],
                      ["Ready closeout", readyForCheckout.length]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[16px] border border-white/8 bg-black/18 px-3 py-3">
                        <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
                        <p className="mt-2 text-sm font-black text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeBusinessTool === "verification" ? (
                <div className="space-y-2">
                  <BusinessToolRow title="Identity Status" subtitle="Identity review and account proofing." status={<StatusPill tone={user.emailVerified || user.phoneVerified ? "green" : "amber"}>{user.emailVerified || user.phoneVerified ? "Verified" : "Pending"}</StatusPill>} />
                  <BusinessToolRow title="License Status" subtitle="License posture for public trust signals." status={<StatusPill tone={getStatusTone(canonicalVerificationStatus)}>{formatStatusLabel(canonicalVerificationStatus)}</StatusPill>} />
                  <BusinessToolRow title="Approval Status" subtitle="Platform approval for marketplace access." status={<StatusPill tone={getStatusTone(user.appApprovalStatus)}>{formatStatusLabel(user.appApprovalStatus)}</StatusPill>} />
                  <BusinessToolRow title="Trust Review" subtitle={verificationDecision?.gates.badge?.allowed ? "Public trust signals are eligible to show." : verificationDecision?.gates.badge?.reasons?.[0] ?? "Verification posture is still building."} status={<StatusPill tone={verificationDecision?.gates.badge?.allowed ? "green" : "amber"}>{verificationDecision?.gates.badge?.allowed ? "Eligible" : "Review"}</StatusPill>} />
                  <div className="flex flex-wrap gap-3 pt-3">
                    <Button type="button" variant="secondary" className="h-11 px-4" disabled={identitySessionMutation.isPending} onClick={() => void handleIdentityLaunch()}>{identitySessionMutation.isPending ? "Opening identity..." : "Start identity review"}</Button>
                    <Button type="button" className="h-11 px-4" onClick={() => setActiveBusinessPanel("verification-upload")}>Upload License</Button>
                    <Link href="/activation-status" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition hover:border-[#a3ff12]/25 hover:text-[#a3ff12]">Activation status</Link>
                  </div>
                </div>
              ) : null}

              {activeBusinessTool === "legal" && !activeBusinessPanel ? (
                <div className="space-y-2">
                  {(["platform_terms", "barber_agreement", "payout_tax_acknowledgment"] as const).map((agreementType) => {
                    const missing = connectedAccount?.missingAgreements.includes(agreementType) ?? true;
                    return (
                      <BusinessToolRow
                        key={agreementType}
                        icon={FileText}
                        title={formatStatusLabel(agreementType)}
                        subtitle="Agreement status for platform and payout readiness."
                        status={<StatusPill tone={missing ? "amber" : "green"}>{missing ? "Pending" : "Accepted"}</StatusPill>}
                        rightAction={<Button type="button" variant={missing ? "primary" : "secondary"} className="h-9 px-3 text-xs" disabled={recordAcceptanceMutation.isPending && missing} onClick={() => void handleAcceptance(agreementType)}>{missing ? "Accept" : "On file"}</Button>}
                      />
                    );
                  })}
                  <BusinessToolRow icon={ShieldCheck} title="License Documents" subtitle="Upload or update license and verification documents." status={<StatusPill tone="neutral">Documents</StatusPill>} onClick={() => setActiveBusinessPanel("legal-upload")} />
                </div>
              ) : null}

              {activeBusinessTool === "account" && !activeBusinessPanel ? (
                <div className="space-y-2">
                  <BusinessToolRow icon={UserCheck} title="Profile" subtitle="Name, email, phone, and profile photo reference." onClick={() => setActiveBusinessPanel("account-profile")} />
                  <BusinessToolRow icon={BellRing} title="Notifications" subtitle="App, email, SMS, and push settings." onClick={() => setActiveBusinessPanel("account-notifications")} />
                  <BusinessToolRow icon={ShieldCheck} title="Security" subtitle="Password, recovery, sessions, and devices." onClick={() => setActiveBusinessPanel("account-security")} />
                  <BusinessToolRow icon={SlidersHorizontal} title="System Info" subtitle="Role, mode, approval, payout, and assigned locations." onClick={() => setActiveBusinessPanel("account-system")} />
                </div>
              ) : null}

              {activeBusinessTool === "account" && activeBusinessPanel === "account-profile" ? (
                <BusinessToolPanel title="Profile" description="Private profile basics and profile-photo entry points." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                    <Avatar src={barberPhotoUrl} alt={`${user.name} avatar`} initials={getInitials(user.name)} className="h-20 w-20 border border-[#a3ff12]/40" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <BusinessToolRow title="Name" subtitle={user.name} />
                      <BusinessToolRow title="Email" subtitle={user.email} />
                      <BusinessToolRow title="Phone" subtitle={user.phone ?? "Not set"} />
                      <Link href="/dashboard/barber/profile" className="inline-flex min-h-12 items-center justify-center rounded-[18px] border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-4 text-sm font-extrabold text-[#a3ff12]">Edit profile</Link>
                    </div>
                  </div>
                </BusinessToolPanel>
              ) : null}

              {activeBusinessTool === "account" && activeBusinessPanel === "account-notifications" ? (
                <BusinessToolPanel title="Notifications" description="Same notification controls, tucked inside Account Settings." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="grid gap-2">
                    {[
                      { key: "inAppEnabled", label: "App notifications" },
                      { key: "emailEnabled", label: "Email alerts" },
                      { key: "smsEnabled", label: "SMS updates" },
                      { key: "pushEnabled", label: "Push reminders" }
                    ].map((item) => {
                      const checked = notificationPreference?.[item.key as keyof NonNullable<typeof notificationPreference>] ?? false;
                      return (
                        <label key={item.key} className="flex min-h-12 items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-black/24 px-4 text-sm font-bold text-white/74">
                          <span>{item.label}</span>
                          <input type="checkbox" checked={checked as boolean} disabled={mediaMutation.isPending} onChange={(event) => void handleNotificationToggle(item.key as "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled", event.target.checked)} className="h-5 w-5 rounded border-white/20 bg-black accent-[#a3ff12]" aria-label={`Toggle ${item.label}`} />
                        </label>
                      );
                    })}
                  </div>
                </BusinessToolPanel>
              ) : null}

              {activeBusinessTool === "account" && activeBusinessPanel === "account-security" ? (
                <BusinessToolPanel title="Security" description="Security controls will stay lightweight until password/session APIs are added." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="space-y-2">
                    <BusinessToolRow title="Password" subtitle="Use account recovery if password changes are needed." status={<StatusPill tone="neutral">Managed</StatusPill>} />
                    <BusinessToolRow title="Recovery" subtitle="Email and phone recovery are tied to your profile contact details." status={<StatusPill tone="neutral">Ready</StatusPill>} />
                    <BusinessToolRow title="Sessions / Devices" subtitle="Device management is coming next." status={<StatusPill tone="neutral">Soon</StatusPill>} />
                  </div>
                </BusinessToolPanel>
              ) : null}

              {activeBusinessTool === "account" && activeBusinessPanel === "account-system" ? (
                <BusinessToolPanel title="System Info" description="Collapsed operational summary for support and account review." onBack={() => setActiveBusinessPanel(null)}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Role", "Barber"],
                      ["Mode", subtypeLabel],
                      ["Approval", formatStatusLabel(user.appApprovalStatus)],
                      ["Payout", connectedAccount?.payoutsEnabled ? "Ready" : formatStatusLabel(payoutStatus)],
                      ["Chair scope", user.locationIds.length ? `${user.locationIds.length} assigned` : "Not set"],
                      ["Assigned locations", assignedLocationLabels]
                    ].map(([label, value]) => <BusinessToolRow key={label} title={label} subtitle={value} />)}
                  </div>
                </BusinessToolPanel>
              ) : null}
              {activeBusinessTool === "services" ? (
                <GlassCard className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <SectionLabel>Services</SectionLabel>
                      <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Active services</h2>
                      <p className="mt-2 text-sm leading-6 text-white/56">Pricing and offerings stay connected to the marketplace service catalog.</p>
                    </div>
                    <CircleIcon icon={Scissors} className="h-11 w-11 rounded-2xl" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {[...(serviceCatalogQuery.data?.editableServices ?? []), ...(serviceCatalogQuery.data?.readOnlyServices ?? [])].length ? (
                      [...(serviceCatalogQuery.data?.editableServices ?? []), ...(serviceCatalogQuery.data?.readOnlyServices ?? [])].map((item) => (
                        <div key={item.service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/24 p-4">
                          <div>
                            <p className="text-lg font-black text-white">{item.service.name}</p>
                            <p className="mt-1 text-sm text-white/52">
                              {item.service.isActive === false ? "Inactive" : "Active"} {item.service.isBookable === false ? "| Not bookable" : "| Bookable"}
                            </p>
                          </div>
                          <StatusPill tone={item.service.isActive === false || item.service.isBookable === false ? "amber" : "green"}>
                            {item.service.isActive === false || item.service.isBookable === false ? "Needs review" : "Live"}
                          </StatusPill>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/24 p-5 text-sm leading-7 text-white/58">
                        Add a service so clients can book a cut from your public profile.
                      </div>
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/dashboard/barber/checkout?section=services" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-5 text-sm font-extrabold text-[#a3ff12] transition hover:border-[#a3ff12]/60 hover:bg-[#a3ff12]/14">
                      Edit services
                    </Link>
                    <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => setQuickSetupModal("service")}>
                      Add service
                    </Button>
                  </div>
                </GlassCard>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
            {false && (activeBusinessTool === "account" || activeBusinessTool === "notifications") ? (
            <GlassCard id="barber-settings-account" className="scroll-mt-6 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>{activeBusinessTool === "notifications" ? "Notifications" : "Account Settings"}</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">
                    {activeBusinessTool === "notifications" ? "Alerts and reminders" : "Private account controls"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">
                    {activeBusinessTool === "notifications"
                      ? "App, email, SMS, and push preferences stay tied to the existing account flow."
                      : "Name, phone, alerts, and security recovery stay tied to the existing account flow."}
                  </p>
                </div>
                <CircleIcon icon={Settings2} className="h-11 w-11 rounded-2xl" />
              </div>
              {activeBusinessTool === "account" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Email</p>
                  <p className="mt-2 truncate text-sm font-bold text-white">{user.email}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Phone</p>
                  <p className="mt-2 truncate text-sm font-bold text-white">{user.phone ?? "Not set"}</p>
                </div>
              </div>
              ) : null}
              <div className="mt-5 grid gap-3">
                {[
                  { key: "inAppEnabled", label: "App notifications" },
                  { key: "emailEnabled", label: "Email alerts" },
                  { key: "smsEnabled", label: "SMS updates" },
                  { key: "pushEnabled", label: "Push reminders" }
                ].map((item) => {
                  const checked = notificationPreference?.[item.key as keyof NonNullable<typeof notificationPreference>] ?? false;
                  return (
                    <label key={item.key} className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-sm font-bold text-white/74">
                      <span>{item.label}</span>
                      <input
                        type="checkbox"
                        checked={checked as boolean}
                        disabled={mediaMutation.isPending}
                        onChange={(event) => void handleNotificationToggle(item.key as "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled", event.target.checked)}
                        className="h-5 w-5 rounded border-white/20 bg-black accent-[#a3ff12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
                        aria-label={`Toggle ${item.label}`}
                      />
                    </label>
                  );
                })}
              </div>
            </GlassCard>
            ) : null}

            {activeBusinessTool === "booking" && activeBusinessPanel === "booking-model" ? (
            <GlassCard className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Business Model</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{subtypeLabel}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">Subtype still saves through the canonical barber setup endpoint.</p>
                </div>
                <CircleIcon icon={ShieldCheck} className="h-11 w-11 rounded-2xl" />
              </div>
              <div className="mt-5 grid gap-3">
                {subtypeOptions.map((option) => (
                  <button
                    key={option.subtype}
                    type="button"
                    onClick={() => setSelectedSubtype(option.subtype)}
                    className={cn(
                      "rounded-[20px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55",
                      selectedSubtype === option.subtype
                        ? "border-[#a3ff12]/40 bg-[#a3ff12]/12 text-white shadow-[0_0_24px_rgba(163,255,18,0.12)]"
                        : "border-white/8 bg-black/24 text-white/74 hover:border-[#a3ff12]/24 hover:text-white"
                    )}
                  >
                    <p className="font-extrabold">{option.label}</p>
                    <p className="mt-2 text-sm leading-5 text-white/54">{option.description}</p>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <Button type="button" className="h-11 px-5" disabled={saveSubtypeMutation.isPending} onClick={() => void handleSaveSubtype()}>
                  {saveSubtypeMutation.isPending ? "Saving..." : "Save business model"}
                </Button>
              </div>
            </GlassCard>
            ) : null}

            {activeBusinessTool === "booking" && activeBusinessPanel === "booking-location" ? (
            <GlassCard id="barber-settings-booking-location" className="scroll-mt-6 p-5 sm:p-6 xl:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Booking Location</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Where clients go for appointments</h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">Clients see this address when booking.</p>
                </div>
                <CircleIcon icon={MapPin} className="h-11 w-11 rounded-2xl" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="surface-label">Location label / chair name</span>
                  <Input className="mt-2" value={bookingLocationDraft.name} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Phils chair" />
                </label>
                <label className="block">
                  <span className="surface-label">Street address</span>
                  <Input className="mt-2" value={bookingLocationDraft.address} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, address: event.target.value }))} placeholder="2172 University Square Mall" />
                </label>
                <label className="block">
                  <span className="surface-label">Address line 2</span>
                  <Input className="mt-2" value={bookingLocationDraft.addressLine2} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, addressLine2: event.target.value }))} placeholder="Suite or chair detail" />
                </label>
                <label className="block">
                  <span className="surface-label">City</span>
                  <Input className="mt-2" value={bookingLocationDraft.city} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Tampa" />
                </label>
                <label className="block">
                  <span className="surface-label">State</span>
                  <Input className="mt-2" value={bookingLocationDraft.state} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, state: event.target.value }))} placeholder="FL" />
                </label>
                <label className="block">
                  <span className="surface-label">ZIP</span>
                  <Input className="mt-2" value={bookingLocationDraft.postalCode} onChange={(event) => setBookingLocationDraft((current) => ({ ...current, postalCode: event.target.value }))} placeholder="33612" />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" className="h-11 px-5" disabled={bookingLocationMutation.isPending} onClick={() => void handleSaveBookingLocation()}>
                  {bookingLocationMutation.isPending ? "Saving..." : "Save booking location"}
                </Button>
                <Button type="button" variant="secondary" className="h-11 px-5" onClick={resetBookingLocationDraft}>
                  Reset location
                </Button>
                <Button type="button" variant="secondary" className="h-11 px-5" onClick={useFirstShopAddressDraft}>
                  Use shop address
                </Button>
              </div>
            </GlassCard>
            ) : null}

            {false && activeBusinessTool === "verification" ? (
            <GlassCard id="barber-settings-verification" className="scroll-mt-6 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Verification</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{formatStatusLabel(canonicalVerificationStatus)}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">
                    {verificationDecision?.gates.badge?.allowed ? "Public trust signals are eligible to show." : verificationDecision?.gates.badge?.reasons?.[0] ?? "Verification posture is still building."}
                  </p>
                </div>
                <CircleIcon icon={ShieldCheck} className="h-11 w-11 rounded-2xl" />
              </div>
              <div className="mt-5 rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/40">Current requirements</p>
                <div className="mt-3 space-y-2 text-sm text-white/58">
                  {verificationProfile?.currentRequirements.length
                    ? verificationProfile?.currentRequirements.map((item) => <p key={item}>- {item}</p>)
                    : <p>No current requirements are blocking this barber account.</p>}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" className="h-11 px-4" disabled={identitySessionMutation.isPending} onClick={() => void handleIdentityLaunch()}>
                  {identitySessionMutation.isPending ? "Opening identity..." : "Start identity review"}
                </Button>
                <Link href="/activation-status" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition hover:border-[#a3ff12]/25 hover:text-[#a3ff12]">
                  Activation status
                </Link>
              </div>
            </GlassCard>
            ) : null}

            {(activeBusinessTool === "legal" && activeBusinessPanel === "legal-upload") || (activeBusinessTool === "verification" && activeBusinessPanel === "verification-upload") ? (
            <GlassCard id="barber-settings-legal" className="scroll-mt-6 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Legal & Documents</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Agreements and verification upload</h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">Use the same trust and legal acceptance lanes already powering payout readiness.</p>
                </div>
                <CircleIcon icon={FileText} className="h-11 w-11 rounded-2xl" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(["platform_terms", "barber_agreement", "payout_tax_acknowledgment"] as const).map((agreementType) => {
                  const missing = connectedAccount?.missingAgreements.includes(agreementType) ?? true;
                  return (
                    <Button
                      key={agreementType}
                      type="button"
                      variant={missing ? "primary" : "secondary"}
                      className="h-10 px-3 text-xs"
                      disabled={recordAcceptanceMutation.isPending && missing}
                      onClick={() => void handleAcceptance(agreementType)}
                    >
                      {missing ? `Accept ${formatStatusLabel(agreementType)}` : `${formatStatusLabel(agreementType)} on file`}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Verification category</label>
                  <Select value={verificationCategory} onChange={(event) => setVerificationCategory(event.target.value as typeof verificationCategory)}>
                    <option value="license_verification">License verification</option>
                    <option value="identity_verification">Identity verification</option>
                    <option value="payout_verification">Payout verification</option>
                    <option value="shop_affiliation_verification">Shop affiliation</option>
                  </Select>
                </div>
                <Input aria-label="Legal name" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                <Input aria-label="Document name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
                {verificationCategory === "license_verification" ? (
                  <>
                    <Input placeholder="License number" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
                    <Input placeholder="Issuing state" value={issuingState} onChange={(event) => setIssuingState(event.target.value)} />
                    <Input type="date" aria-label="License expiration date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
                  </>
                ) : null}
                <Button type="button" className="h-11 w-full" disabled={uploadMutation.isPending || submitVerificationMutation.isPending} onClick={() => void handleVerificationSubmit()}>
                  {uploadMutation.isPending || submitVerificationMutation.isPending ? "Submitting verification..." : "Upload and submit"}
                </Button>
              </div>
            </GlassCard>
            ) : null}
          </div>

          {false && activeBusinessTool === "account" ? (
          <GlassCard id="barber-settings-system" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>System / Account Info</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Private barber setup</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Operational account details live here instead of the main tabs.</p>
              </div>
              <CircleIcon icon={SlidersHorizontal} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Operating Mode", subtypeLabel],
                ["Role", "Barber"],
                ["Approval Status", formatStatusLabel(user.appApprovalStatus)],
                ["Chair Scope", user.locationIds.length ? `${user.locationIds.length} assigned` : "Not set"],
                ["Assigned Locations", assignedLocationLabels],
                ["Payout Mode", connectedAccount?.payoutsEnabled ? "Ready" : formatStatusLabel(payoutStatus)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">{label}</p>
                  <p className="mt-2 text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </GlassCard>
          ) : null}

          {false && activeBusinessTool === "availability" ? (
          <div id="barber-settings-availability" className="scroll-mt-6">
            <BarberScheduleWorkspace barberName={user.name} surface="availability" />
          </div>
          ) : null}

          {false && activeBusinessTool === "reports" ? (
          <GlassCard id="barber-settings-reports" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Money Posture</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Earnings and payout readiness</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Financial summaries live in More so Checkout can stay focused on sale entry.</p>
              </div>
              <CircleIcon icon={WalletCards} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Cash Collected Today</p>
                <p className="mt-3 text-2xl font-black text-white">{currency(cashCollectedToday)}</p>
                <p className="mt-2 text-sm text-white/56">Cash collected directly. No platform payout.</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Card/App Collected Today</p>
                <p className="mt-3 text-2xl font-black text-white">{currency(cardAppCollectedToday)}</p>
                <p className="mt-2 text-sm text-white/56">Collected through BVRB3R. Eligible after routing.</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">App Payout Eligible</p>
                <p className="mt-3 text-2xl font-black text-[#a3ff12]">{currency(appPayoutEligible)}</p>
                <p className="mt-2 text-sm text-white/56">Eligible balance excludes cash.</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Gross Total Today</p>
                <p className="mt-3 text-2xl font-black text-white">{currency(grossTotalToday)}</p>
                <p className="mt-2 text-sm text-white/56">Cash + app collected today.</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ["Paid appointments", moneyPosture?.paidAppointmentsCount ?? paidAppointments.length],
                ["Cash sales", moneyPosture?.cashSalesCount ?? 0],
                ["Card POS sales", moneyPosture?.cardPosSalesCount ?? 0],
                ["Pending requests", moneyPosture?.pendingPaymentRequestsCount ?? 0],
                ["Released payout", currency(moneyPosture?.releasedPayoutAmount ?? releasedPayoutAmount)],
                ["Ready closeout", readyForCheckout.length]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[16px] border border-white/8 bg-black/18 px-3 py-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/36">{label}</p>
                  <p className="mt-2 text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </GlassCard>
          ) : null}

          {false && activeBusinessTool === "transactions" ? (
          <GlassCard id="barber-settings-transactions" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Transactions</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Paid appointments and receipts</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Cash, app card payments, and POS requests stay separated so the books stay honest.</p>
              </div>
              <CircleIcon icon={ReceiptText} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 space-y-3">
              {payoutTransactions.length ? payoutTransactions.map((transaction) => (
                <div key={transaction.id} data-testid={`transaction-row-${transaction.id}`} className="rounded-[24px] border border-white/8 bg-black/24 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-bold text-white">{transaction.customerName}</p>
                        <span className={cn(
                          "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em]",
                          transaction.transactionType === "pos_cash"
                            ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                            : transaction.transactionType === "pos_request"
                              ? "border-white/10 bg-white/[0.04] text-white/56"
                              : "border-[#a3ff12]/30 bg-[#a3ff12]/10 text-[#a3ff12]"
                        )}>
                          {transaction.paymentMethodLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-white/58">{transaction.serviceLabel} | {formatDateTime(transaction.occurredAt)}</p>
                      {transaction.customerPhone || transaction.customerEmail ? (
                        <p className="mt-2 text-sm text-white/48">{transaction.customerPhone ?? transaction.customerEmail}</p>
                      ) : null}
                      <p className="mt-2 text-sm text-white/52">{transaction.postureLabel}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/30 px-4 py-3 text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Gross</p>
                      <p className="mt-2 text-lg font-black text-white">{currency(transaction.grossAmount)}</p>
                      <p className="mt-1 text-sm text-white/52">{transaction.statusLabel}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-2">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/36">Platform fee</p>
                      <p className="mt-1 text-sm font-black text-white">{currency(transaction.platformFeeAmount)}</p>
                    </div>
                    <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-2">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/36">Payout</p>
                      <p className="mt-1 text-sm font-black text-white">
                        {transaction.transactionType === "pos_cash"
                          ? "Cash collected directly"
                          : transaction.barberPayoutAmount === null
                            ? "Pending routing"
                            : currency(transaction.barberPayoutAmount)}
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-2">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/36">Status</p>
                      <p className="mt-1 text-sm font-black text-white">{transaction.statusLabel}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {transaction.canMessage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 px-3 text-xs"
                        disabled={createMessageThreadMutation.isPending}
                        onClick={() => void handleMessageTransaction({
                          appointmentId: transaction.appointmentId,
                          clientProfileId: transaction.clientProfileId
                        })}
                      >
                        Message client
                      </Button>
                    ) : transaction.transactionType === "pos_cash" ? (
                      <Button type="button" variant="secondary" className="h-10 px-3 text-xs" disabled>
                        {transaction.customerPhone || transaction.customerEmail ? "Message unavailable" : "Add customer"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 px-3 text-xs"
                      disabled={transaction.transactionType === "pos_request" && ["Closed duplicate", "Canceled", "Declined", "Expired", "Failed"].includes(transaction.statusLabel)}
                      onClick={() => handleTransactionSecondaryAction(transaction)}
                    >
                      {transaction.transactionType === "pos_request"
                        ? ["Closed duplicate", "Canceled", "Declined", "Expired", "Failed"].includes(transaction.statusLabel) ? "Request closed" : "View request"
                        : "View receipt"}
                    </Button>
                  </div>
                </div>
              )) : paidAppointments.length ? paidAppointments.map((appointment) => (
                <div key={`more-paid-${appointment.id}`} className="rounded-[24px] border border-white/8 bg-black/24 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{appointment.display.clientName}</p>
                      <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName} | {formatDateTime(appointment.start)}</p>
                      <p className="mt-2 text-sm text-white/52">{appointment.financial.latestStatusLabel} | Tip {currency(appointment.financial.tipAmount)}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/30 px-4 py-3 text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Collected</p>
                      <p className="mt-2 text-lg font-black text-white">{currency(appointment.financial.capturedAmount || appointment.totalAmount)}</p>
                      <p className="mt-1 text-sm text-white/52">{formatStatusLabel(appointment.status)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/24 p-5 text-sm leading-7 text-white/58">
                  Paid tickets, cash sales, and POS payment requests will appear here once checkout closes them.
                </div>
              )}
            </div>
          </GlassCard>
          ) : null}

          {false && activeBusinessTool === "reports" ? (
          <div className="scroll-mt-6">
            <BarberEarningsWorkspace barberName={user.name} />
          </div>
          ) : null}
            </BusinessToolModal>
          ) : null}
        </section>

        {barberMoreSections.filter((group) => group.title !== "Business Setup").map((group) => <MoreSectionGroup key={group.title} group={group} />)}

        <MoreLogoutCard />
      </div>

      <AccountQuickEditModal
        open={accountEditorOpen}
        variant="barber"
        displayName={user.name}
        fullName={user.canonicalFullName ?? user.name}
        email={user.email}
        phone={user.phone}
        cityLocation={barberIdentityLocationLabel}
        defaultPaymentMethodLabel="Managed through payout and checkout settings"
        managePaymentHref="/dashboard/barber/more#barber-settings-payouts"
        locationOptions={barberLocationOptions}
        emailVerified={user.emailVerified}
        phoneVerified={user.phoneVerified}
        onClose={() => setAccountEditorOpen(false)}
        onPaymentAction={handleAccountPaymentAction}
        onSave={handleAccountSave}
      />

      {receiptTransactionId ? (
        <TransactionReceiptModal
          transaction={receiptTransaction}
          error={receiptError ?? (receiptTransaction ? null : "Receipt data could not be loaded for this sale.")}
          onClose={closeReceiptModal}
        />
      ) : null}

      {quickSetupModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)]">
            {quickSetupModal === "service" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Quick setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Add your first service</h2>
                  <p className="mt-2 text-sm text-white/58">This creates a real marketplace service that can appear in booking, checkout, and your public profile.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Haircut", "Haircut + Beard", "Beard Trim", "Kids Cut"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setServiceDraft((current) => ({ ...current, name: preset }))}
                      className="rounded-full border border-[#A3FF12]/30 bg-[#A3FF12]/8 px-3 py-2 text-xs font-extrabold text-[#A3FF12]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-bold text-white/72">
                  Service name
                  <Input value={serviceDraft.name} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-white/72">
                    Price
                    <Input inputMode="decimal" value={serviceDraft.price} onChange={(event) => setServiceDraft((current) => ({ ...current, price: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    Duration
                    <Input inputMode="numeric" value={serviceDraft.duration} onChange={(event) => setServiceDraft((current) => ({ ...current, duration: event.target.value }))} className="mt-2" />
                  </label>
                </div>
                <label className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-white">
                  Active
                  <input
                    type="checkbox"
                    checked={serviceDraft.active}
                    onChange={(event) => setServiceDraft((current) => ({ ...current, active: event.target.checked }))}
                    className="h-5 w-5 accent-[#A3FF12]"
                  />
                </label>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={createServiceMutation.isPending} onClick={() => void handleQuickAddService()}>
                    Save service
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "availability" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Quick setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Set your working hours</h2>
                  <p className="mt-2 text-sm text-white/58">Set your hours first. Then choose where clients can book you.</p>
                </div>
                <SectionLabel>Working days + hours</SectionLabel>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {dayOptions.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleActivationDay(day.value)}
                      className={cn(
                        "min-h-11 rounded-2xl border text-xs font-black",
                        availabilityDraft.days.includes(day.value)
                          ? "border-[#A3FF12]/55 bg-[#A3FF12] text-black"
                          : "border-white/10 bg-white/[0.035] text-white/62"
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-white/72">
                    Start time
                    <Input type="time" value={availabilityDraft.startTime} onChange={(event) => setAvailabilityDraft((current) => ({ ...current, startTime: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    End time
                    <Input type="time" value={availabilityDraft.endTime} onChange={(event) => setAvailabilityDraft((current) => ({ ...current, endTime: event.target.value }))} className="mt-2" />
                  </label>
                </div>
                <div className="space-y-3">
                  <SectionLabel>Where do you take appointments?</SectionLabel>
                  <div className="grid gap-2">
                    {[
                      { value: "custom", label: "Use my own service location", detail: "Suite, private studio, house-call base, or a shop not on BVRB3R yet.", icon: MapPin },
                      { value: "shop", label: "Join a shop on BVRB3R", detail: "Search approved shop accounts and request to join their team.", icon: Store },
                      { value: "later", label: "I'll add a location later", detail: "Save hours now. Location remains a separate marketplace blocker.", icon: Clock3 }
                    ].map((option) => {
                      const Icon = option.icon;
                      const active = availabilityLocationMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setAvailabilityLocationMode(option.value as AvailabilityLocationMode)}
                          className={cn(
                            "flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition",
                            active
                              ? "border-[#A3FF12]/55 bg-[#A3FF12]/10 text-white shadow-[0_0_24px_rgba(163,255,18,0.12)]"
                              : "border-white/10 bg-white/[0.035] text-white/70 hover:border-[#A3FF12]/25"
                          )}
                        >
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#A3FF12]/10 text-[#A3FF12]">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span>
                            <span className="block text-sm font-black text-white">{option.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-white/52">{option.detail}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {availabilityLocationMode === "custom" ? (
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:grid-cols-2">
                      <label className="block text-xs font-bold text-white/66">
                        Location name
                        <Input value={serviceLocationDraft.name} onChange={(event) => setServiceLocationDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2" placeholder="Phil's Studio" />
                      </label>
                      <label className="block text-xs font-bold text-white/66">
                        Address
                        <Input value={serviceLocationDraft.address} onChange={(event) => setServiceLocationDraft((current) => ({ ...current, address: event.target.value }))} className="mt-2" placeholder="123 Main St" />
                      </label>
                      <label className="block text-xs font-bold text-white/66">
                        City
                        <Input value={serviceLocationDraft.city} onChange={(event) => setServiceLocationDraft((current) => ({ ...current, city: event.target.value }))} className="mt-2" placeholder="Charlotte" />
                      </label>
                      <div className="grid grid-cols-[1fr_1fr] gap-3">
                        <label className="block text-xs font-bold text-white/66">
                          State
                          <Input value={serviceLocationDraft.state} onChange={(event) => setServiceLocationDraft((current) => ({ ...current, state: event.target.value }))} className="mt-2" placeholder="NC" />
                        </label>
                        <label className="block text-xs font-bold text-white/66">
                          ZIP
                          <Input value={serviceLocationDraft.postalCode} onChange={(event) => setServiceLocationDraft((current) => ({ ...current, postalCode: event.target.value }))} className="mt-2" placeholder="28202" />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {availabilityLocationMode === "shop" ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                      <label className="block text-xs font-bold text-white/66">
                        Search shops
                        <span className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3">
                          <Search className="h-4 w-4 text-white/45" aria-hidden="true" />
                          <Input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} className="border-0 bg-transparent px-0" placeholder="Shop name, city, or neighborhood" />
                        </span>
                      </label>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {shopDirectoryQuery.data?.shops.map((shop) => (
                          <button
                            key={shop.shopId}
                            type="button"
                            disabled={!shop.canRequest && !shop.alreadyAssigned}
                            onClick={() => setSelectedJoinShopId(shop.shopId)}
                            className={cn(
                              "w-full rounded-2xl border p-3 text-left transition",
                              selectedJoinShopId === shop.shopId
                                ? "border-[#A3FF12]/55 bg-[#A3FF12]/10"
                                : "border-white/10 bg-white/[0.035] hover:border-[#A3FF12]/25",
                              !shop.canRequest && !shop.alreadyAssigned && "opacity-60"
                            )}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span>
                                <span className="block text-sm font-black text-white">{shop.shopLabel}</span>
                                <span className="mt-1 block text-xs text-white/52">{[shop.city, shop.state].filter(Boolean).join(", ") || "Location details pending"}</span>
                              </span>
                              {selectedJoinShopId === shop.shopId ? <CheckCircle2 className="h-5 w-5 text-[#A3FF12]" aria-hidden="true" /> : <Send className="h-4 w-4 text-white/35" aria-hidden="true" />}
                            </span>
                            <span className="mt-3 flex flex-wrap gap-2">
                              {shop.readinessLabels.map((label) => (
                                <StatusPill key={label} tone={label.includes("Approved") || label.includes("Live") ? "green" : label.includes("pending") || label.includes("incomplete") ? "amber" : "neutral"}>
                                  {label}
                                </StatusPill>
                              ))}
                            </span>
                          </button>
                        ))}
                        {shopDirectoryQuery.isLoading ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/56">Searching shops...</div> : null}
                        {!shopDirectoryQuery.isLoading && !shopDirectoryQuery.data?.shops.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/56">No approved shops found for that search.</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {availabilityLocationMode === "later" ? (
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
                      Hours will save now, but your activation checklist will keep showing Service location missing until you add a custom location or connect a shop.
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={activationAvailabilityMutation.isPending} onClick={() => void handleQuickSetAvailability()}>
                    Save hours
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "visibility" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Make your profile visible to clients?</h2>
                  <p className="mt-2 text-sm leading-6 text-white/58">Clients will be able to find your profile once your services and availability are ready.</p>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={activationMutation.isPending} onClick={() => void handleQuickTurnPublic()}>
                    Turn Public
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "booking" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Accept bookings</h2>
                  <p className="mt-2 text-sm leading-6 text-white/58">This moves your live status to Active and lets the booking engine consider you once setup is complete.</p>
                </div>
                <div className="rounded-2xl border border-[#A3FF12]/22 bg-[#A3FF12]/8 p-4">
                  <p className="text-sm font-black text-white">Status preview</p>
                  <p className="mt-1 text-lg font-black text-[#A3FF12]">Active / accepting bookings</p>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={statusMutation.isPending} onClick={() => void handleQuickGoActive()}>
                    Go active
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "invites" ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Shop invitations</h2>
                  <p className="mt-2 text-sm leading-6 text-white/58">Accepting uses the existing team invite API and links you to the shop only after you confirm.</p>
                </div>
                <div className="space-y-3">
                  {pendingShopInvites.length ? pendingShopInvites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <p className="text-lg font-black text-white">{invite.shopLabel}</p>
                      <p className="mt-1 text-sm text-white/58">Pending team invitation</p>
                      <div className="mt-4 flex gap-3">
                        <Button type="button" variant="secondary" className="min-h-11 flex-1 rounded-2xl" disabled={respondTeamInviteMutation.isPending} onClick={() => void handleTeamInviteResponse(invite.id, "declined")}>Decline</Button>
                        <Button type="button" className="min-h-11 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={respondTeamInviteMutation.isPending} onClick={() => void handleTeamInviteResponse(invite.id, "accepted")}>Accept</Button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/62">No pending shop invitations yet.</div>
                  )}
                </div>
                <Button type="button" variant="secondary" className="min-h-12 w-full rounded-2xl" onClick={closeQuickSetupModal}>Close</Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
