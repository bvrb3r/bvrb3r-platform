"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
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
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UserCheck,
  WalletCards,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionButton, Avatar, GlassCard } from "@/design/components";
import {
  useBarberFintechReadinessQuery,
  useBarberPayoutsQuery,
  useCreateStripeDashboardLinkMutation,
  useCreateStripeOnboardingLinkMutation,
  useRefreshStripeConnectedAccountMutation,
  useRecordLegalAcceptanceMutation,
  type FintechApiError
} from "@/lib/fintech/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import {
  useCreateVerificationUploadMutation,
  useStartBarberIdentitySessionMutation,
  useSubmitBarberVerificationMutation,
  useVerificationMe,
  useBarberTrustSummary
} from "@/lib/trust/client";
import {
  useBarberTeamInvitesQuery,
  useBarberOverviewQuery,
  useRespondBarberTeamInviteMutation,
  useSaveBarberSubtypeMutation,
  type BarberApiError
} from "@/lib/operations/barber-client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype, UserAccount } from "@/types/domain";

const subtypeOptions: Array<{ subtype: BarberSubtype; label: string; description: string }> = [
  { subtype: "freelance", label: "Freelance", description: "Independent chair posture with self-managed availability." },
  { subtype: "commission", label: "Commission", description: "Shop commission model with shared schedule and payout rails." },
  { subtype: "blueprint", label: "Booth rent / Blueprint", description: "Booth-rent model with independent revenue posture." }
];

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
type LinkHref = ComponentProps<typeof Link>["href"];

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
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

function HeaderIconLink({ href, label, icon: Icon }: { href: LinkHref; label: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:text-[#a3ff12] hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/60"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}

function BusinessControlCard({
  href,
  icon: Icon,
  title,
  subtitle
}: {
  href: LinkHref;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
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
    </Link>
  );
}

function QuickActionLink({ href, icon: Icon, children }: { href: LinkHref; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#a3ff12]/35 bg-[#a3ff12]/8 px-5 text-sm font-extrabold text-[#a3ff12] transition hover:border-[#a3ff12]/60 hover:bg-[#a3ff12]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

export function BarberSettingsScreen({
  user,
  initialSection,
  embedded = false
}: {
  user: UserAccount;
  initialSection?: string;
  embedded?: boolean;
}) {
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const verificationMeQuery = useVerificationMe(true);
  const readinessQuery = useBarberFintechReadinessQuery(true);
  const payoutsQuery = useBarberPayoutsQuery(true);
  const overviewQuery = useBarberOverviewQuery();
  const teamInvitesQuery = useBarberTeamInvitesQuery();
  const onboardingMutation = useCreateStripeOnboardingLinkMutation();
  const dashboardMutation = useCreateStripeDashboardLinkMutation();
  const refreshMutation = useRefreshStripeConnectedAccountMutation();
  const recordAcceptanceMutation = useRecordLegalAcceptanceMutation();
  const saveSubtypeMutation = useSaveBarberSubtypeMutation();
  const respondTeamInviteMutation = useRespondBarberTeamInviteMutation();
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitVerificationMutation = useSubmitBarberVerificationMutation();
  const identitySessionMutation = useStartBarberIdentitySessionMutation();
  const [selectedSubtype, setSelectedSubtype] = useState<BarberSubtype>(user.barberSubtype ?? "freelance");
  const [verificationCategory, setVerificationCategory] = useState<"identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification">("license_verification");
  const [legalName, setLegalName] = useState(user.name);
  const [fileName, setFileName] = useState("updated-license.pdf");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const notificationPreference = mediaQuery.data?.viewer.notificationPreference;
  const verificationProfile = verificationMeQuery.data?.profiles.find((profile) => profile.role === "barber") ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const readinessPayload = readinessQuery.data;
  const connectedAccount = readinessPayload?.connectedAccount;
  const payoutsPayload = payoutsQuery.data;
  const overviewPayload = overviewQuery.data;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as SettingsSectionKey | null;
  const barberPhotoUrl = mediaQuery.data?.barberProfile?.profilePhotoUrl ?? mediaQuery.data?.viewer.profilePhotoUrl ?? null;
  const shopName = readinessPayload?.memberships[0]?.shopLabel ?? user.ownedShopName ?? "Shop not set";
  const locationLabel = user.locationIds.length ? user.locationIds.join(", ") : "No location assigned";
  const canonicalVerificationStatus = verificationProfile?.overallStatus ?? trustQuery.data?.canonicalOverallStatus ?? user.appApprovalStatus ?? null;
  const payoutStatus = connectedAccount?.operationalStatus ?? null;
  const readyForPayoutAmount = payoutsPayload?.summary.readyForPayoutAmount ?? readinessPayload?.routingSummary.readyForPayoutAmount;
  const hasPayoutAmount = typeof readyForPayoutAmount === "number";
  const subtypeLabel = subtypeOptions.find((option) => option.subtype === selectedSubtype)?.label ?? "Freelance";
  const showOnboardingAction = Boolean(connectedAccount && connectedAccount.operationalStatus !== "payout_ready");
  const readyForCheckout = overviewPayload?.todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0) ?? [];
  const paidAppointments = overviewPayload?.todayAppointments.filter((appointment) => appointment.financial.capturedAmount > 0 || appointment.financial.tipAmount > 0) ?? [];
  const pendingShopInvites = teamInvitesQuery.data?.invites ?? [];
  const assignedLocationLabels = overviewPayload?.shops.length
    ? overviewPayload.shops.map((shop) => shop.label).join(", ")
    : locationLabel;

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
      value: connectedAccount?.payoutsEnabled ? "Ready" : formatStatusLabel(payoutStatus),
      icon: WalletCards,
      tone: connectedAccount?.payoutsEnabled ? "green" : getStatusTone(payoutStatus)
    },
    {
      label: "Profile",
      value: user.appApprovalStatus === "approved" ? "Live" : formatStatusLabel(user.appApprovalStatus),
      icon: UserCheck,
      tone: user.appApprovalStatus === "approved" ? "green" : getStatusTone(user.appApprovalStatus)
    },
    {
      label: "Booking",
      value: user.appApprovalStatus === "approved" ? "Active" : "Pending",
      icon: CalendarCheck,
      tone: user.appApprovalStatus === "approved" ? "green" : "amber"
    }
  ] satisfies Array<{ label: string; value: string; icon: LucideIcon; tone: Tone }>;

  const businessControls = [
    { title: "Services", subtitle: "Manage pricing & offerings", href: "/dashboard/barber/checkout?section=services", icon: Scissors },
    { title: "Availability", subtitle: "Working hours & blocked time", href: "#barber-settings-availability", icon: Clock3 },
    { title: "Booking Settings", subtitle: "Online booking preferences", href: "/dashboard/barber/calendar", icon: CalendarDays },
    { title: "Notifications", subtitle: "Alerts & reminders", href: "#barber-settings-account", icon: BellRing },
    { title: "Transactions", subtitle: "Sales & receipts", href: "#barber-settings-transactions", icon: ArrowLeftRight },
    { title: "Reports", subtitle: "Performance overview", href: "#barber-settings-money", icon: BarChart3 },
    { title: "Verification", subtitle: "Identity & license status", href: "#barber-settings-verification", icon: ShieldCheck },
    { title: "Legal", subtitle: "Agreements & policies", href: "#barber-settings-legal", icon: FileText },
    { title: "Account Settings", subtitle: "Password, profile & security", href: "#barber-settings-account", icon: Settings2 }
  ] satisfies Array<{ title: string; subtitle: string; href: LinkHref; icon: LucideIcon }>;

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

  async function handleRefreshPayoutStatus() {
    setFeedback(null);
    try {
      await refreshMutation.mutateAsync({});
      setFeedback({ tone: "success", message: "Payout readiness refreshed from the connected account." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as FintechApiError) });
    }
  }

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

        {!embedded ? (
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[42px] font-black leading-none tracking-[-0.045em] text-white sm:text-5xl">More</h1>
              <p className="mt-3 text-base font-medium text-white/62 sm:text-[17px]">
                Manage your account, payouts & settings
              </p>
            </div>
            <div className="flex items-center gap-3">
              <HeaderIconLink href="#barber-settings-business" label="Manage business settings" icon={SlidersHorizontal} />
              <HeaderIconLink href="#barber-settings-support" label="Get help" icon={CircleHelp} />
            </div>
          </header>
        ) : null}

        <GlassCard active className="p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <div className="relative h-28 w-28 sm:h-32 sm:w-32">
              <Avatar
                src={barberPhotoUrl}
                alt={`${user.name} avatar`}
                initials={getInitials(user.name)}
                className="h-full w-full border-2 border-[#a3ff12]/70 shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_20px_60px_rgba(0,0,0,0.50)]"
              />
              <Link
                href="/dashboard/barber/profile"
                aria-label="Edit barber profile photo"
                className="absolute bottom-1 right-1 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#a3ff12] bg-[#a3ff12]/12 text-[#a3ff12] shadow-[0_0_24px_rgba(163,255,18,0.24)] transition hover:bg-[#a3ff12]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/60"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">{user.name}</h2>
                <ShieldCheck className="h-7 w-7 text-[#a3ff12] drop-shadow-[0_0_10px_rgba(163,255,18,0.35)]" aria-hidden="true" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone={getStatusTone(canonicalVerificationStatus)}>
                  {verificationDecision?.gates.badge?.allowed ? "Verified Barber" : formatStatusLabel(canonicalVerificationStatus)}
                </StatusPill>
                <StatusPill tone={getStatusTone(user.appApprovalStatus)}>
                  {formatStatusLabel(user.appApprovalStatus)}
                </StatusPill>
              </div>
              <p className="mt-4 text-base font-semibold text-white/78">{subtypeLabel}</p>
              <p className="mt-2 text-sm text-white/54">{shopName}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-white/48">
                <MapPin className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                {locationLabel}
              </p>
            </div>

            <Link
              href="/dashboard/barber/profile"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-5 text-sm font-extrabold text-[#a3ff12] transition hover:border-[#a3ff12]/60 hover:bg-[#a3ff12]/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3ff12]/55"
            >
              View Profile
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {statusItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={cn(
                    "rounded-[20px] border border-white/8 bg-black/25 p-4",
                    index > 0 && "xl:border-l-white/12"
                  )}
                >
                  <Icon className="h-5 w-5 text-[#a3ff12]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-extrabold text-white">{item.label}</p>
                  <p className={cn("mt-1 text-sm font-bold", item.tone === "green" ? "text-[#a3ff12]" : item.tone === "amber" ? "text-amber-200" : item.tone === "danger" ? "text-red-200" : "text-white/56")}>
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        </GlassCard>

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
                    <p className="mt-4 text-sm font-semibold text-white/54">Available Balance</p>
                    <p className="mt-2 text-4xl font-black tracking-[-0.05em] text-[#a3ff12] drop-shadow-[0_0_24px_rgba(163,255,18,0.22)]">
                      {currency(readyForPayoutAmount)}
                    </p>
                    <p className="mt-2 text-sm text-white/48">
                      {payoutsPayload?.summary.executableRoutingRecords ?? 0} payout-ready routing records
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-white">Set up or review payout status.</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/56">
                      Connect and review payout readiness through the existing Stripe-backed flow.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-[24px] border border-white/8 bg-black/24 p-4 lg:min-w-[260px]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/42">Payout Status</p>
                <div className="mt-3">
                  <StatusPill tone={connectedAccount?.payoutsEnabled ? "green" : getStatusTone(payoutStatus)}>
                    {connectedAccount?.payoutsEnabled ? "Ready" : formatStatusLabel(payoutStatus)}
                  </StatusPill>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {showOnboardingAction ? (
                  <ActionButton
                    type="button"
                    className="min-h-11 px-4 text-xs"
                    disabled={onboardingMutation.isPending}
                    onClick={() => void navigateToStripeUrl(
                      async () => (await onboardingMutation.mutateAsync({})).url,
                      connectedAccount?.providerAccountId ? "Stripe onboarding link refreshed." : "Stripe onboarding started."
                    )}
                  >
                    {connectedAccount?.providerAccountId ? "Resume onboarding" : "Manage payouts"}
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
                      Refresh
                    </ActionButton>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </GlassCard>

        <section id="barber-settings-business" className="scroll-mt-6 space-y-4">
          <SectionLabel>Manage Your Business</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {businessControls.map((item) => (
              <BusinessControlCard key={item.title} {...item} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <GlassCard id="barber-settings-account" className="scroll-mt-6 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Account Settings</SectionLabel>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Private account controls</h2>
                  <p className="mt-2 text-sm leading-6 text-white/56">Name, phone, alerts, and security recovery stay tied to the existing account flow.</p>
                </div>
                <CircleIcon icon={Settings2} className="h-11 w-11 rounded-2xl" />
              </div>
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
                    ? verificationProfile.currentRequirements.map((item) => <p key={item}>- {item}</p>)
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
          </div>

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

          <div id="barber-settings-availability" className="scroll-mt-6">
            <BarberScheduleWorkspace barberName={user.name} surface="availability" />
          </div>

          <GlassCard id="barber-settings-money" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Money Posture</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Earnings and payout readiness</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Financial summaries live in More so Checkout can stay focused on sale entry.</p>
              </div>
              <CircleIcon icon={WalletCards} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Ready now</p>
                <p className="mt-3 text-2xl font-black text-white">{readyForCheckout.length}</p>
                <p className="mt-2 text-sm text-white/56">Waiting closeout.</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Paid today</p>
                <p className="mt-3 text-2xl font-black text-white">{paidAppointments.length}</p>
                <p className="mt-2 text-sm text-white/56">Captured or tipped.</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/40">Gross today</p>
                <p className="mt-3 text-2xl font-black text-[#a3ff12]">{currency(overviewPayload?.earnings.grossSales ?? 0)}</p>
                <p className="mt-2 text-sm text-white/56">{connectedAccount?.payoutsEnabled ? "Payouts ready." : "Review payout status."}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard id="barber-settings-transactions" className="scroll-mt-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Transactions</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Paid appointments and receipts</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">Completed bookings and payment status stay connected to appointment records.</p>
              </div>
              <CircleIcon icon={ReceiptText} className="h-11 w-11 rounded-2xl" />
            </div>
            <div className="mt-5 space-y-3">
              {paidAppointments.length ? paidAppointments.map((appointment) => (
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
                  Paid tickets will appear here once checkout closes them.
                </div>
              )}
            </div>
          </GlassCard>

          <div className="scroll-mt-6">
            <BarberEarningsWorkspace barberName={user.name} />
          </div>
        </section>

        <section className="space-y-4">
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="flex flex-wrap gap-3">
            <QuickActionLink href="/dashboard/barber/checkout?section=services" icon={Plus}>Add Service</QuickActionLink>
            <QuickActionLink href="#barber-settings-availability" icon={Clock3}>Update Availability</QuickActionLink>
            <QuickActionLink href="/dashboard/barber/messages" icon={LifeBuoy}>Contact Support</QuickActionLink>
          </div>
        </section>

        <GlassCard id="barber-settings-support" className="scroll-mt-6 p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <CircleIcon icon={Headphones} />
              <div>
                <SectionLabel>Support</SectionLabel>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Get help with account, payouts, bookings, or verification.</h2>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
              <Link href="/dashboard/barber/messages" className="flex min-h-14 items-center justify-between gap-4 rounded-[18px] border border-white/10 bg-black/24 px-4 font-extrabold text-white transition hover:border-[#a3ff12]/30 hover:text-[#a3ff12]">
                Message Support
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/contact" className="flex min-h-14 items-center justify-between gap-4 rounded-[18px] border border-white/10 bg-black/24 px-4 font-extrabold text-white transition hover:border-[#a3ff12]/30 hover:text-[#a3ff12]">
                Help Center
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <LogoutButton
            compact
            className="[&>button]:min-h-14 [&>button]:w-full [&>button]:justify-center [&>button]:rounded-[18px] [&>button]:border [&>button]:border-red-400/25 [&>button]:bg-red-500/8 [&>button]:px-4 [&>button]:text-[#ff4d4d] [&>button]:hover:bg-red-500/12"
          />
        </GlassCard>
      </div>
    </div>
  );
}
