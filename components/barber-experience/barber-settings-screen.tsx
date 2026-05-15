"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UserCheck,
  WalletCards,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { BarberActivationGate } from "@/components/activation/tier1-activation-gates";
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
import { getStripePayoutReadinessLabel, isStripeConnectReadyForActivation } from "@/lib/fintech/payout-readiness";
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
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype, UserAccount } from "@/types/domain";

const subtypeOptions: Array<{ subtype: BarberSubtype; label: string; description: string }> = [
  { subtype: "freelance", label: "Freelance", description: "Independent chair posture with self-managed availability." },
  { subtype: "commission", label: "Commission", description: "Shop commission model with shared schedule and payout rails." },
  { subtype: "booth_rent", label: "Booth rent", description: "Booth-rent model with independent revenue posture." }
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
type BarberQuickSetupModal = "service" | "availability" | "visibility" | "booking" | "invites" | null;
type AvailabilityLocationMode = "custom" | "shop" | "later";

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
  stripeReturnState = null,
  embedded = false
}: {
  user: UserAccount;
  initialSection?: string;
  stripeReturnState?: "return" | "refresh" | null;
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
  const createServiceMutation = useCreateMarketplaceServiceMutation();
  const statusMutation = useUpdateBarberStatusMutation();
  const activationMutation = useUpdateBarberActivationMutation();
  const activationAvailabilityMutation = useUpdateBarberActivationAvailabilityMutation();
  const bookingLocationMutation = useUpdateBarberBookingLocationMutation();
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitVerificationMutation = useSubmitBarberVerificationMutation();
  const identitySessionMutation = useStartBarberIdentitySessionMutation();
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
  const [quickSetupModal, setQuickSetupModal] = useState<BarberQuickSetupModal>(null);
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
  const payoutsPayload = payoutsQuery.data;
  const overviewPayload = overviewQuery.data;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as SettingsSectionKey | null;
  const barberPhotoUrl = mediaQuery.data?.barberProfile?.profilePhotoUrl ?? mediaQuery.data?.viewer.profilePhotoUrl ?? null;
  const shopName = readinessPayload?.memberships[0]?.shopLabel ?? user.ownedShopName ?? "Shop not set";
  const locationLabel = user.locationIds.length ? user.locationIds.join(", ") : "No location assigned";
  const canonicalVerificationStatus = resolveCanonicalActivationStatus(
    user.appApprovalStatus,
    trustQuery.data?.canonicalOverallStatus,
    verificationProfile?.overallStatus
  );
  const payoutStatus = connectedAccount?.operationalStatus ?? null;
  const stripeEnvironment = readinessPayload?.stripeEnvironment;
  const payoutsReady = isStripeConnectReadyForActivation(connectedAccount, stripeEnvironment);
  const payoutsRequiredForActivation = selectedSubtype !== "freelance";
  const payoutsClearForActivation = !payoutsRequiredForActivation || payoutsReady;
  const payoutReadinessLabel = getStripePayoutReadinessLabel(payoutsReady, stripeEnvironment);
  const readyForPayoutAmount = payoutsPayload?.summary.readyForPayoutAmount ?? readinessPayload?.routingSummary.readyForPayoutAmount;
  const hasPayoutAmount = typeof readyForPayoutAmount === "number";
  const subtypeLabel = subtypeOptions.find((option) => option.subtype === selectedSubtype)?.label ?? "Freelance";
  const showOnboardingAction = Boolean(connectedAccount && connectedAccount.operationalStatus !== "payout_ready");
  const readyForCheckout = overviewPayload?.todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0) ?? [];
  const paidAppointments = overviewPayload?.todayAppointments.filter((appointment) => appointment.financial.capturedAmount > 0 || appointment.financial.tipAmount > 0) ?? [];
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
      async () => (await onboardingMutation.mutateAsync({})).url,
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
                      {refreshMutation.isPending ? "Refreshing..." : "Refresh payout status"}
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
