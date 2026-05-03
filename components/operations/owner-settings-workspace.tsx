"use client";

import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  HelpCircle,
  KeyRound,
  LogOut,
  MapPin,
  MessageCircle,
  Paintbrush,
  ReceiptText,
  Search,
  Scissors,
  ShieldCheck,
  Store,
  Users,
  WalletCards
} from "lucide-react";
import { OwnerActivationGate } from "@/components/activation/tier1-activation-gates";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { GlassCard } from "@/design/components";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import { useCreateOwnerTeamInviteMutation, useOwnerTeamInviteDirectoryQuery } from "@/lib/operations/barber-client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { UserAccount } from "@/types/domain";

type SettingTone = "green" | "amber" | "red" | "neutral";

type SettingRow = {
  title: string;
  subtitle: string;
  href: ComponentProps<typeof Link>["href"];
  icon: ReactNode;
  status?: string;
  tone?: SettingTone;
};

const sectionIdMap = {
  profile: "owner-settings-shop-profile",
  branding: "owner-settings-shop-profile",
  hours: "owner-settings-shop-profile",
  policies: "owner-settings-shop-profile",
  services: "owner-settings-business-setup",
  payouts: "owner-settings-payments",
  stripe: "owner-settings-payments",
  taxes: "owner-settings-payments",
  compensation: "owner-settings-business-setup",
  roles: "owner-settings-business-setup",
  verification: "owner-settings-compliance",
  documents: "owner-settings-compliance",
  security: "owner-settings-compliance",
  support: "owner-settings-support",
  logout: "owner-settings-logout"
} as const;

type OwnerSettingsSectionKey = keyof typeof sectionIdMap;
type OwnerQuickSetupModal = "profile" | "hours" | "invite" | "visibility" | null;

const defaultOwnerWorkingDays = [1, 2, 3, 4, 5, 6];
const ownerDayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function toStorageSafeSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
}

function formatApprovalStatus(status?: UserAccount["appApprovalStatus"]) {
  switch (status) {
    case "approved":
      return "Verified";
    case "under_review":
      return "Needs Review";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    case "not_required":
      return "Not required";
    default:
      return "Pending";
  }
}

function getStatusTone(status?: UserAccount["appApprovalStatus"]): SettingTone {
  switch (status) {
    case "approved":
      return "green";
    case "rejected":
      return "red";
    case "under_review":
    case "pending":
      return "amber";
    default:
      return "neutral";
  }
}

function formatConnectedStatus(status?: string) {
  return status?.replaceAll("_", " ") || "Not connected";
}

function getStripeStatus({
  operationalStatus,
  payoutsEnabled,
  chargesEnabled,
  disabledReason,
  requirementsCurrentlyDue
}: {
  operationalStatus?: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  disabledReason?: string | null;
  requirementsCurrentlyDue?: string[];
}) {
  if (disabledReason || requirementsCurrentlyDue?.length || operationalStatus === "restricted") {
    return { label: "Restricted", tone: "red" as const };
  }

  if (payoutsEnabled && chargesEnabled) {
    return { label: "Connected", tone: "green" as const };
  }

  if (operationalStatus && operationalStatus !== "not_ready") {
    return { label: formatConnectedStatus(operationalStatus), tone: "amber" as const };
  }

  return { label: "Not connected", tone: "neutral" as const };
}

function getTaxStatus(status?: string) {
  switch (status) {
    case "verified":
      return { label: "Verified", tone: "green" as const };
    case "submitted":
      return { label: "Submitted", tone: "amber" as const };
    case "pending":
      return { label: "Pending", tone: "amber" as const };
    default:
      return { label: "Not connected", tone: "neutral" as const };
  }
}

function statusClasses(tone: SettingTone = "neutral") {
  switch (tone) {
    case "green":
      return "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]";
    case "amber":
      return "border-amber-300/25 bg-amber-300/10 text-amber-300";
    case "red":
      return "border-red-400/25 bg-red-500/10 text-red-300";
    case "neutral":
      return "border-white/10 bg-white/[0.04] text-white/58";
  }
}

function SectionTitle({ children, id }: { children: ReactNode; id: string }) {
  return (
    <div id={id} className="scroll-mt-6">
      <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">{children}</h2>
    </div>
  );
}

function SettingsGroup({ rows }: { rows: SettingRow[] }) {
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="divide-y divide-white/8">
        {rows.map((row) => (
          <Link
            key={row.title}
            href={row.href}
            className="group grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition hover:bg-[#A3FF12]/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 sm:px-6"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#A3FF12]/22 bg-[#A3FF12]/10 text-[#A3FF12] shadow-[0_0_22px_rgba(163,255,18,0.12)]">
              {row.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-extrabold tracking-[-0.03em] text-white">{row.title}</span>
              <span className="mt-1 block text-sm leading-5 text-white/56">{row.subtitle}</span>
            </span>
            <span className="flex items-center gap-3">
              {row.status ? (
                <span className={cn("hidden rounded-full border px-3 py-1.5 text-xs font-extrabold sm:inline-flex", statusClasses(row.tone))}>
                  {row.status}
                </span>
              ) : null}
              <ChevronRight className="h-5 w-5 text-white/42 transition group-hover:translate-x-0.5 group-hover:text-[#A3FF12]" />
            </span>
          </Link>
        ))}
      </div>
    </GlassCard>
  );
}

function IdentitySkeleton() {
  return (
    <GlassCard className="p-6">
      <div className="flex gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-72" />
          <Skeleton className="mt-4 h-7 w-36 rounded-full" />
        </div>
      </div>
    </GlassCard>
  );
}

export function OwnerSettingsWorkspace({
  user,
  initialSection
}: {
  user: UserAccount;
  initialSection?: string;
}) {
  const profileQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const fintechQuery = useFintechManagementQuery();
  const [quickSetupModal, setQuickSetupModal] = useState<OwnerQuickSetupModal>(null);
  const [quickSetupFeedback, setQuickSetupFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [shopProfileDraft, setShopProfileDraft] = useState({
    shopName: user.ownedShopName ?? "",
    city: "",
    phone: user.phone ?? "",
    publicDescription: ""
  });
  const [shopHoursDraft, setShopHoursDraft] = useState({
    days: defaultOwnerWorkingDays,
    startTime: "12:00",
    endTime: "19:00"
  });
  const [inviteSearch, setInviteSearch] = useState("");
  const inviteDirectoryQuery = useOwnerTeamInviteDirectoryQuery(inviteSearch, quickSetupModal === "invite");
  const createInviteMutation = useCreateOwnerTeamInviteMutation();

  const shops = profileQuery.data?.shops ?? [];
  const primaryShop = shops[0] ?? null;
  const ownerShopId = primaryShop?.shopId ?? user.ownedShopId ?? user.locationIds[0] ?? null;
  const shopName = primaryShop?.label ?? user.ownedShopName ?? "Shop profile incomplete";
  const shopAddress = "Address not added yet";
  const shopInitials = getInitials(shopName);
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as OwnerSettingsSectionKey | null;
  const selectedServiceManager = initialSection === "services";
  const selectedBrandingManager = initialSection === "branding";
  const fintechShopAccount = useMemo(() => {
    const accounts = fintechQuery.data?.shops ?? [];
    if (!accounts.length) {
      return null;
    }

    if (ownerShopId) {
      return accounts.find((account) => account.shopId === ownerShopId) ?? accounts[0];
    }

    return accounts[0];
  }, [fintechQuery.data?.shops, ownerShopId]);
  const membershipCount = fintechQuery.data?.memberships.length ?? 0;
  const hasBookableLinkedBarber = (fintechQuery.data?.barbers ?? []).some((account) => account.chargesEnabled && account.payoutsEnabled);
  const readyForPayoutAmount = fintechQuery.data?.summary.readyForPayoutAmount ?? 0;
  const needsAttentionCount = fintechQuery.data?.summary.needsAttentionAccounts ?? 0;
  const blockedRoutingCount = fintechQuery.data?.summary.blockedRoutingRecords ?? 0;
  const verificationStatus = user.shopApprovalStatus && user.shopApprovalStatus !== "not_required"
    ? user.shopApprovalStatus
    : user.appApprovalStatus;
  const verificationLabel = formatApprovalStatus(verificationStatus);
  const verificationTone = getStatusTone(verificationStatus);
  const stripeStatus = getStripeStatus({
    operationalStatus: fintechShopAccount?.operationalStatus,
    payoutsEnabled: fintechShopAccount?.payoutsEnabled,
    chargesEnabled: fintechShopAccount?.chargesEnabled,
    disabledReason: fintechShopAccount?.disabledReason,
    requirementsCurrentlyDue: fintechShopAccount?.requirementsCurrentlyDue
  });
  const taxStatus = getTaxStatus(fintechShopAccount?.taxReadinessStatus);
  const errorMessage = profileQuery.error ?? fintechQuery.error;
  const isInitialLoading =
    (profileQuery.isLoading && !profileQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data);

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleShopPhotoUpload(shopId: string, file: File) {
    const uploaded = await uploadWithPath(`profiles/shops/${toStorageSafeSegment(shopId)}/profile`, file);
    await mediaMutation.mutateAsync({
      action: "set_shop_photo",
      shopId,
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl
    });
  }

  async function handleShopGalleryUpload(shopId: string, file: File, options: { caption: string; featured: boolean }) {
    const uploaded = await uploadWithPath(`profiles/shops/${toStorageSafeSegment(shopId)}/gallery`, file);
    await mediaMutation.mutateAsync({
      action: "add_shop_gallery_image",
      shopId,
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl,
      caption: options.caption,
      featured: options.featured
    });
  }

  function closeQuickSetupModal() {
    setQuickSetupModal(null);
  }

  function toggleOwnerActivationDay(day: number) {
    setShopHoursDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day].sort((left, right) => left - right)
    }));
  }

  async function postOwnerActivation(payload: Record<string, unknown>) {
    const response = await fetch("/api/owner/activation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Unable to save shop activation details.");
    }
  }

  async function handleQuickShopProfileSave() {
    setQuickSetupFeedback(null);
    try {
      await postOwnerActivation({
        action: "update_shop_profile",
        shopId: ownerShopId,
        ...shopProfileDraft
      });
      await Promise.all([profileQuery.refetch(), fintechQuery.refetch()]);
      closeQuickSetupModal();
      setQuickSetupFeedback({ tone: "success", message: "Shop profile saved through the existing shop profile records." });
    } catch (error) {
      setQuickSetupFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to save shop profile." });
    }
  }

  async function handleQuickShopHoursSave() {
    setQuickSetupFeedback(null);
    try {
      await postOwnerActivation({
        action: "update_shop_hours",
        shopId: ownerShopId,
        hours: shopHoursDraft.days.map((weekday) => ({
          weekday,
          startTime: shopHoursDraft.startTime,
          endTime: shopHoursDraft.endTime
        }))
      });
      await Promise.all([profileQuery.refetch(), fintechQuery.refetch()]);
      closeQuickSetupModal();
      setQuickSetupFeedback({ tone: "success", message: "Shop hours saved to the canonical shop schedule source." });
    } catch (error) {
      setQuickSetupFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to save shop hours." });
    }
  }

  async function handleQuickInviteBarber(barberId: string) {
    setQuickSetupFeedback(null);
    try {
      await createInviteMutation.mutateAsync({
        barberId,
        shopId: ownerShopId ?? undefined,
        message: "Join my BVRB3R shop team."
      });
      await fintechQuery.refetch();
      setQuickSetupFeedback({ tone: "success", message: "Team invite sent through the canonical shop invite system." });
    } catch (error) {
      setQuickSetupFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to send barber invite." });
    }
  }

  async function handleQuickTurnShopPublic() {
    setQuickSetupFeedback(null);
    try {
      await postOwnerActivation({
        action: "set_shop_visibility",
        shopId: ownerShopId,
        publicProfileEnabled: true
      });
      closeQuickSetupModal();
      setQuickSetupFeedback({ tone: "success", message: "Shop public visibility confirmed. Approval, team, and bookable barber readiness still decide marketplace live state." });
    } catch (error) {
      setQuickSetupFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to update shop visibility." });
    }
  }

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedSection]);

  const shopProfileRows: SettingRow[] = [
    {
      title: "Shop Information",
      subtitle: "Name, address, contact & business details",
      href: "/onboarding/owner/shop",
      icon: <Store className="h-5 w-5" />
    },
    {
      title: "Branding",
      subtitle: "Logo, cover photo & shop theme",
      href: "/dashboard/owner/settings?section=branding",
      icon: <Paintbrush className="h-5 w-5" />
    },
    {
      title: "Shop Hours",
      subtitle: "Operating hours & holidays",
      href: "/onboarding/owner/structure",
      icon: <Clock3 className="h-5 w-5" />
    },
    {
      title: "Shop Policies",
      subtitle: "Cancellation, no-show & reschedule rules",
      href: "/onboarding/owner/structure",
      icon: <FileText className="h-5 w-5" />
    }
  ];

  const businessSetupRows: SettingRow[] = [
    {
      title: "Services",
      subtitle: "Manage services & pricing",
      href: "/dashboard/owner/settings?section=services",
      icon: <Scissors className="h-5 w-5" />
    },
    {
      title: "Payout Setup",
      subtitle: "Stripe Connect & payouts",
      href: "/dashboard/owner/money?view=fintech",
      icon: <WalletCards className="h-5 w-5" />,
      status: stripeStatus.label,
      tone: stripeStatus.tone
    },
    {
      title: "Team & Roles",
      subtitle: "Manage team roles & permissions",
      href: "/onboarding/owner/team",
      icon: <Users className="h-5 w-5" />,
      status: membershipCount ? `${membershipCount} linked` : "Not set",
      tone: membershipCount ? "green" : "neutral"
    },
    {
      title: "Commission & Fees",
      subtitle: "Set shop commission & platform fees",
      href: "/dashboard/owner/money?view=fintech",
      icon: <CircleDollarSign className="h-5 w-5" />,
      status: blockedRoutingCount ? "Needs review" : "Protected",
      tone: blockedRoutingCount ? "amber" : "green"
    }
  ];

  const paymentsRows: SettingRow[] = [
    {
      title: "Stripe Connect",
      subtitle: "Manage bank accounts & payouts",
      href: "/dashboard/owner/money?view=fintech",
      icon: <CreditCard className="h-5 w-5" />,
      status: stripeStatus.label,
      tone: stripeStatus.tone
    },
    {
      title: "Payout Schedule",
      subtitle: "Review payout schedule in Money",
      href: "/dashboard/owner/money?section=payouts",
      icon: <CalendarDays className="h-5 w-5" />,
      status: "View schedule",
      tone: "neutral"
    },
    {
      title: "Tax Information",
      subtitle: "Manage tax forms & documents",
      href: "/dashboard/owner/money?view=fintech",
      icon: <ReceiptText className="h-5 w-5" />,
      status: taxStatus.label,
      tone: taxStatus.tone
    }
  ];

  const complianceRows: SettingRow[] = [
    {
      title: "Verification Status",
      subtitle: "Shop verification & compliance",
      href: verificationStatus === "approved" ? "/activation-status" : "/onboarding/owner/verification",
      icon: <ShieldCheck className="h-5 w-5" />,
      status: verificationLabel,
      tone: verificationTone
    },
    {
      title: "Business Documents",
      subtitle: "Manage licenses & documents",
      href: "/onboarding/owner/verification",
      icon: <FileCheck2 className="h-5 w-5" />,
      status: verificationStatus === "approved" ? "View documents" : "Needs setup",
      tone: verificationStatus === "approved" ? "green" : "amber"
    },
    {
      title: "Security & Access",
      subtitle: "Password, 2FA & login settings",
      href: "/dashboard/owner/settings?section=logout",
      icon: <KeyRound className="h-5 w-5" />
    }
  ];

  const supportRows: SettingRow[] = [
    {
      title: "Help Center",
      subtitle: "Guides, FAQs & resources",
      href: "/contact",
      icon: <HelpCircle className="h-5 w-5" />
    },
    {
      title: "Contact Support",
      subtitle: "Get help from our team",
      href: "/workspace/messages",
      icon: <MessageCircle className="h-5 w-5" />
    }
  ];

  const ownerGateActionHandlers = {
    "owner-profile": () => setQuickSetupModal("profile"),
    "owner-address": () => setQuickSetupModal("profile"),
    "owner-hours": () => setQuickSetupModal("hours"),
    "owner-payouts": () => window.location.assign("/dashboard/owner/money?view=fintech"),
    "owner-invite": () => setQuickSetupModal("invite"),
    "owner-accepted-barber": () => {
      if (membershipCount > 0) {
        setQuickSetupModal("invite");
        return;
      }

      window.location.assign("/dashboard/owner/team");
    },
    "owner-bookable-barber": () => window.location.assign("/dashboard/owner/team"),
    "owner-public-profile": () => setQuickSetupModal("visibility")
  };

  return (
    <div className="space-y-7" data-testid="owner-settings-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}
      {quickSetupFeedback ? <FeedbackBanner tone={quickSetupFeedback.tone} message={quickSetupFeedback.message} /> : null}

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl">Settings</h1>
          <p className="mt-3 text-lg font-medium text-white/62">Manage your shop & business controls</p>
        </div>
      </header>

      {isInitialLoading ? (
        <IdentitySkeleton />
      ) : (
        <GlassCard className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              {primaryShop?.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryShop.profilePhotoUrl}
                  alt={shopName}
                  className="h-20 w-20 rounded-full border-2 border-[#A3FF12]/70 object-cover shadow-[0_0_30px_rgba(163,255,18,0.18)]"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-[#A3FF12]/70 bg-[#A3FF12]/10 text-2xl font-black tracking-[-0.03em] text-[#A3FF12] shadow-[0_0_30px_rgba(163,255,18,0.18)]">
                  {shopInitials}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">{shopName}</h2>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold", statusClasses(verificationTone))}>
                    <BadgeCheck className="h-4 w-4" />
                    {verificationLabel}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm text-white/55">
                  <MapPin className="h-4 w-4 text-[#A3FF12]" />
                  {shopAddress}
                </p>
              </div>
            </div>

            {ownerShopId ? (
              <Link
                href={`/kiosk/${ownerShopId}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-5 text-sm font-extrabold text-white transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12]"
              >
                <Eye className="h-4 w-4" />
                View Shop
              </Link>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/25 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/42">Payout readiness</p>
              <p className="mt-3 text-lg font-extrabold text-white">{stripeStatus.label}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/25 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/42">Ready amount</p>
              <p className="mt-3 text-lg font-extrabold text-[#A3FF12]">{currency(readyForPayoutAmount)}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/25 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/42">Attention</p>
              <p className={cn("mt-3 text-lg font-extrabold", needsAttentionCount ? "text-amber-300" : "text-[#A3FF12]")}>
                {needsAttentionCount ? `${needsAttentionCount} needs review` : "Clear"}
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <OwnerActivationGate
        input={{
          approvalStatus: verificationStatus,
          accountStatus: user.accountStatus,
          hasShopProfile: Boolean(ownerShopId && shopName !== "Shop profile incomplete"),
          hasAddress: user.locationIds.length > 0,
          hasShopHours: user.locationIds.length > 0,
          payoutsReady: Boolean(fintechShopAccount?.chargesEnabled && fintechShopAccount.payoutsEnabled),
          hasInvitedBarber: membershipCount > 0,
          hasAcceptedBarber: membershipCount > 0,
          hasBookableBarber: hasBookableLinkedBarber,
          publicProfileEnabled: true
        }}
        actionHandlers={ownerGateActionHandlers}
      />

      <section className="space-y-3">
        <SectionTitle id="owner-settings-shop-profile">Shop Profile</SectionTitle>
        <SettingsGroup rows={shopProfileRows} />
        {selectedBrandingManager ? (
          shops.length ? (
            <div className="grid gap-4 pt-1 xl:grid-cols-[0.88fr_1.12fr]">
              {shops.map((shop) => (
                <div key={shop.shopId} className="contents">
                  <ProfilePhotoManagerCard
                    title={`${shop.label} branding`}
                    subtitle="Logo and profile media stay on the existing shop media rail."
                    imageUrl={shop.profilePhotoUrl}
                    fallbackLabel={getInitials(shop.label)}
                    uploadLabel="Upload logo"
                    onUpload={(file) => handleShopPhotoUpload(shop.shopId, file)}
                    onRemove={async () => {
                      await mediaMutation.mutateAsync({
                        action: "remove_shop_photo",
                        shopId: shop.shopId
                      });
                    }}
                    isBusy={mediaMutation.isPending}
                  />
                  <GalleryManagerCard
                    title={`${shop.label} gallery`}
                    subtitle="Cover and interior images feed the client-facing shop presentation."
                    assets={shop.gallery}
                    uploadLabel="Add shop image"
                    emptyCopy="No shop gallery images uploaded yet."
                    onUpload={(file, options) => handleShopGalleryUpload(shop.shopId, file, options)}
                    onRemove={async (assetId) => {
                      await mediaMutation.mutateAsync({
                        action: "remove_shop_gallery_image",
                        shopId: shop.shopId,
                        assetId
                      });
                    }}
                    isBusy={mediaMutation.isPending}
                  />
                </div>
              ))}
            </div>
          ) : (
            <GlassCard className="p-5">
              <p className="text-lg font-extrabold text-white">Shop profile incomplete.</p>
              <p className="mt-2 text-sm text-white/58">Add your shop name, address, and contact details before branding media can be attached.</p>
              <Link
                href="/onboarding/owner/shop"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#A3FF12]/30 bg-[#A3FF12]/10 px-5 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/15"
              >
                Add shop details
              </Link>
            </GlassCard>
          )
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionTitle id="owner-settings-business-setup">Business Setup</SectionTitle>
        <SettingsGroup rows={businessSetupRows} />
        {selectedServiceManager ? (
          <div className="pt-1">
            <ServiceCatalogWorkspace role="owner" />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionTitle id="owner-settings-payments">Payments & Banking</SectionTitle>
        <SettingsGroup rows={paymentsRows} />
      </section>

      <section className="space-y-3">
        <SectionTitle id="owner-settings-compliance">Compliance & Security</SectionTitle>
        <SettingsGroup rows={complianceRows} />
      </section>

      <section className="space-y-3">
        <SectionTitle id="owner-settings-support">Support</SectionTitle>
        <SettingsGroup rows={supportRows} />
      </section>

      <section id="owner-settings-logout" className="scroll-mt-6">
        <GlassCard className="border-red-500/20 bg-red-500/[0.025] p-4">
          <div className="mb-3 flex items-center justify-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-red-300">
            <LogOut className="h-5 w-5" />
            Account session
          </div>
          <LogoutButton className="[&_button]:min-h-[60px] [&_button]:justify-center [&_button]:rounded-[18px] [&_button]:border [&_button]:border-red-500/35 [&_button]:bg-red-500/[0.04] [&_button]:text-lg [&_button]:font-black [&_button]:text-red-300 [&_button]:shadow-none [&_button]:hover:bg-red-500/10 [&_button_svg]:text-red-300" />
        </GlassCard>
      </section>

      <div className="h-3" />

      {quickSetupModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)]">
            {quickSetupModal === "profile" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Quick setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Edit shop profile</h2>
                  <p className="mt-2 text-sm text-white/58">This updates the same shop profile source used by public shop surfaces.</p>
                </div>
                <label className="block text-sm font-bold text-white/72">
                  Shop name
                  <Input value={shopProfileDraft.shopName} onChange={(event) => setShopProfileDraft((current) => ({ ...current, shopName: event.target.value }))} className="mt-2" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-white/72">
                    City
                    <Input value={shopProfileDraft.city} onChange={(event) => setShopProfileDraft((current) => ({ ...current, city: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    Phone
                    <Input value={shopProfileDraft.phone} onChange={(event) => setShopProfileDraft((current) => ({ ...current, phone: event.target.value }))} className="mt-2" />
                  </label>
                </div>
                <label className="block text-sm font-bold text-white/72">
                  Public description
                  <Input value={shopProfileDraft.publicDescription} onChange={(event) => setShopProfileDraft((current) => ({ ...current, publicDescription: event.target.value }))} className="mt-2" />
                </label>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" onClick={() => void handleQuickShopProfileSave()}>
                    Save profile
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "hours" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Quick setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Set shop hours</h2>
                  <p className="mt-2 text-sm text-white/58">These hours feed the owner schedule and public shop readiness.</p>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {ownerDayOptions.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleOwnerActivationDay(day.value)}
                      className={cn(
                        "min-h-11 rounded-2xl border text-xs font-black",
                        shopHoursDraft.days.includes(day.value)
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
                    <Input type="time" value={shopHoursDraft.startTime} onChange={(event) => setShopHoursDraft((current) => ({ ...current, startTime: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    End time
                    <Input type="time" value={shopHoursDraft.endTime} onChange={(event) => setShopHoursDraft((current) => ({ ...current, endTime: event.target.value }))} className="mt-2" />
                  </label>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" onClick={() => void handleQuickShopHoursSave()}>
                    Save hours
                  </Button>
                </div>
              </div>
            ) : null}

            {quickSetupModal === "invite" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Team setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Invite barber</h2>
                  <p className="mt-2 text-sm text-white/58">Search real barber accounts and send a canonical team invite.</p>
                </div>
                <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-white">
                  <Search className="h-5 w-5 text-white/52" />
                  <input
                    value={inviteSearch}
                    onChange={(event) => setInviteSearch(event.target.value)}
                    placeholder="Search by name, email, username, or city"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-white/38"
                  />
                </label>
                <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
                  {inviteDirectoryQuery.isLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">Searching barbers...</div>
                  ) : null}
                  {inviteDirectoryQuery.data?.barbers.map((barber) => (
                    <div key={barber.barberId} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="text-lg font-black text-white">{barber.name}</p>
                        <p className="mt-1 text-sm text-white/56">{barber.email || barber.username || "No public contact"}</p>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-white/42">
                          {barber.appApprovalStatus} / {barber.visibilityState ?? "hidden"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="min-h-11 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]"
                        disabled={!barber.canInvite || createInviteMutation.isPending}
                        onClick={() => void handleQuickInviteBarber(barber.barberId)}
                      >
                        {barber.inviteStatus === "pending" ? "Pending" : barber.alreadyAssigned ? "Assigned" : "Send invite"}
                      </Button>
                    </div>
                  ))}
                  {!inviteDirectoryQuery.isLoading && !inviteDirectoryQuery.data?.barbers.length ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">No barbers match this search.</div>
                  ) : null}
                </div>
                <Button type="button" variant="secondary" className="min-h-12 w-full rounded-2xl" onClick={closeQuickSetupModal}>Close</Button>
              </div>
            ) : null}

            {quickSetupModal === "visibility" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.04em]">Turn shop public?</h2>
                  <p className="mt-2 text-sm leading-6 text-white/58">This confirms public intent only. Approval, profile data, team, and bookable barber readiness still control marketplace visibility.</p>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl" onClick={closeQuickSetupModal}>Cancel</Button>
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" onClick={() => void handleQuickTurnShopPublic()}>
                    Turn shop public
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
