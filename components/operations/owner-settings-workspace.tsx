"use client";

import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  HelpCircle,
  KeyRound,
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
import {
  MoreActivationGate,
  MoreControlHub,
  MoreIdentityReadinessCard,
  MoreLogoutCard,
  MorePageHeader,
  MoreSectionGroup,
  type MoreSectionGroup as MoreSectionGroupConfig
} from "@/components/dashboard/more/more-components";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
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

type SettingTone = "green" | "yellow" | "red" | "muted";

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
      return "yellow";
    default:
      return "muted";
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
    return { label: formatConnectedStatus(operationalStatus), tone: "yellow" as const };
  }

  return { label: "Not connected", tone: "muted" as const };
}

function getTaxStatus(status?: string) {
  switch (status) {
    case "verified":
      return { label: "Verified", tone: "green" as const };
    case "submitted":
      return { label: "Submitted", tone: "yellow" as const };
    case "pending":
      return { label: "Pending", tone: "yellow" as const };
    default:
      return { label: "Not connected", tone: "muted" as const };
  }
}

function statusClasses(tone: SettingTone = "muted") {
  switch (tone) {
    case "green":
      return "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]";
    case "yellow":
      return "border-amber-300/25 bg-amber-300/10 text-amber-300";
    case "red":
      return "border-red-400/25 bg-red-500/10 text-red-300";
    case "muted":
      return "border-white/10 bg-white/[0.04] text-white/58";
  }
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
    brandLine: "",
    address: "",
    neighborhood: "",
    city: "",
    state: "",
    phone: user.phone ?? "",
    profilePhotoUrl: ""
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
  const shopAddress = (
    primaryShop?.address
    ?? [primaryShop?.neighborhood, primaryShop?.city, primaryShop?.state].filter(Boolean).join(", ")
  ) || "Address not added yet";
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

  useEffect(() => {
    if (!primaryShop) {
      return;
    }

    setShopProfileDraft((current) => ({
      ...current,
      shopName: primaryShop.name ?? primaryShop.label ?? current.shopName,
      brandLine: primaryShop.brandLine ?? current.brandLine,
      address: primaryShop.address ?? current.address,
      neighborhood: primaryShop.neighborhood ?? current.neighborhood,
      city: primaryShop.city ?? current.city,
      state: primaryShop.state ?? current.state,
      phone: primaryShop.phone ?? current.phone,
      profilePhotoUrl: primaryShop.profilePhotoUrl ?? current.profilePhotoUrl
    }));
  }, [primaryShop]);

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
      const response = await fetch("/api/owner/shop/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        shopId: ownerShopId,
        name: shopProfileDraft.shopName,
        brandLine: shopProfileDraft.brandLine,
        phone: shopProfileDraft.phone,
        address: shopProfileDraft.address,
        neighborhood: shopProfileDraft.neighborhood,
        city: shopProfileDraft.city,
        state: shopProfileDraft.state,
        profilePhotoUrl: shopProfileDraft.profilePhotoUrl
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to save shop profile.");
      }
      await Promise.all([profileQuery.refetch(), fintechQuery.refetch()]);
      closeQuickSetupModal();
      setQuickSetupFeedback({ tone: "success", message: "Shop profile saved to the canonical public shop record." });
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
      href: "/dashboard/owner/more?section=branding",
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
      href: "/dashboard/owner/more?section=services",
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
      tone: membershipCount ? "green" : "muted"
    },
    {
      title: "Commission & Fees",
      subtitle: "Set shop commission & platform fees",
      href: "/dashboard/owner/money?view=fintech",
      icon: <CircleDollarSign className="h-5 w-5" />,
      status: blockedRoutingCount ? "Needs review" : "Protected",
      tone: blockedRoutingCount ? "yellow" : "green"
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
      tone: "muted"
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
      tone: verificationStatus === "approved" ? "green" : "yellow"
    },
    {
      title: "Security & Access",
      subtitle: "Password, 2FA & login settings",
      href: "/dashboard/owner/more?section=logout",
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

  const ownerMoreSections: MoreSectionGroupConfig[] = [
    {
      id: "owner-settings-shop-profile",
      title: "Shop Profile",
      subtitle: "Public shop information, branding, hours, and policies.",
      rows: shopProfileRows
    },
    {
      id: "owner-settings-business-setup",
      title: "Business Setup",
      subtitle: "Services, payout setup, team permissions, and commission controls.",
      rows: businessSetupRows
    },
    {
      id: "owner-settings-payments",
      title: "Payments & Banking",
      subtitle: "Bank accounts, payout schedule, and tax information.",
      rows: paymentsRows
    },
    {
      id: "owner-settings-compliance",
      title: "Compliance & Security",
      subtitle: "Verification, business documents, and secure access.",
      rows: complianceRows
    },
    {
      id: "owner-settings-support",
      title: "Support",
      subtitle: "Help and direct support for shop owner operations.",
      rows: supportRows
    }
  ];

  return (
    <div className="space-y-7" data-testid="owner-settings-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}
      {quickSetupFeedback ? <FeedbackBanner tone={quickSetupFeedback.tone} message={quickSetupFeedback.message} /> : null}

      <MorePageHeader
        title="More"
        subtitle="Manage your account, shop setup, verification, payments, policies, compliance, and help."
      />

      <MoreIdentityReadinessCard
        variant="owner"
        imageUrl={isInitialLoading ? null : primaryShop?.profilePhotoUrl}
        initials={shopInitials}
        title={isInitialLoading ? "Loading shop profile" : shopName}
        subtitle={shopAddress}
        roleLabel="Shop owner account"
        badges={[
          { label: verificationLabel, tone: verificationTone },
          { label: stripeStatus.label, tone: stripeStatus.tone },
          { label: membershipCount ? `${membershipCount} linked` : "No team yet", tone: membershipCount ? "green" : "muted" }
        ]}
        metaLines={[
          user.name ? `Owner: ${user.name}` : "Owner account",
          "Owner Home remains the team and public profile command center."
        ]}
        primaryAction={ownerShopId ? { label: "View Shop", href: `/kiosk/${ownerShopId}` } : undefined}
        secondaryAction={{ label: "Edit Public Shop Info", onClick: () => setQuickSetupModal("profile") }}
        tiles={[
          { label: "Shop Profile", value: ownerShopId && shopName !== "Shop profile incomplete" ? "Live" : "Needs setup", helper: "Public shop identity.", tone: ownerShopId ? "green" : "yellow", href: "#owner-settings-shop-profile" },
          { label: "Verification", value: verificationLabel, helper: "Shop approval status.", tone: verificationTone, href: "#owner-settings-compliance" },
          { label: "Payouts", value: stripeStatus.label, helper: `Ready amount ${currency(readyForPayoutAmount)}`, tone: stripeStatus.tone, href: "#owner-settings-payments" },
          { label: "Team", value: membershipCount ? `${membershipCount} linked` : "No team yet", helper: "Barbers connected to this shop.", tone: membershipCount ? "green" : "muted", href: "/dashboard/owner" },
          { label: "Booking", value: hasBookableLinkedBarber ? "Active" : "Setup needed", helper: needsAttentionCount ? `${needsAttentionCount} attention item${needsAttentionCount === 1 ? "" : "s"}` : "Shop profile readiness.", tone: hasBookableLinkedBarber ? "green" : "yellow", href: "/dashboard/owner/schedule" }
        ]}
      />

      <MoreActivationGate
        title="Your shop setup"
        subtitle="Finish these steps so your shop profile, team, bookings, and payouts are ready."
      >
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
      </MoreActivationGate>

      <MoreControlHub
        title="Business Control Hub"
        subtitle="Setup is grouped by decision, not paperwork."
        rows={[
          { title: "Banking Status", subtitle: "Stripe and payout readiness.", href: "/dashboard/owner/money?view=fintech", status: stripeStatus.label, tone: stripeStatus.tone, icon: <WalletCards className="h-5 w-5" /> },
          { title: "Team Permissions", subtitle: "Manage team roles and permissions.", href: "/dashboard/owner", status: membershipCount ? `${membershipCount} linked` : "Not set", tone: membershipCount ? "green" : "muted", icon: <Users className="h-5 w-5" /> },
          { title: "Public Profile", subtitle: "Shop profile, branding, hours, and policies.", href: "#owner-settings-shop-profile", icon: <Store className="h-5 w-5" /> },
          { title: "Shop Readiness", subtitle: "Verification, documents, and compliance.", href: "#owner-settings-compliance", status: verificationLabel, tone: verificationTone, icon: <ShieldCheck className="h-5 w-5" /> }
        ]}
      />

      <section className="space-y-3">
        <MoreSectionGroup group={ownerMoreSections[0]} />
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
        <MoreSectionGroup group={ownerMoreSections[1]} />
        {selectedServiceManager ? (
          <div className="pt-1">
            <ServiceCatalogWorkspace role="owner" />
          </div>
        ) : null}
      </section>

      {ownerMoreSections.slice(2).map((group) => <MoreSectionGroup key={group.title} group={group} />)}

      <section id="owner-settings-logout" className="scroll-mt-6">
        <MoreLogoutCard />
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
                <label className="block text-sm font-bold text-white/72">
                  Brand line / bio
                  <Input value={shopProfileDraft.brandLine} onChange={(event) => setShopProfileDraft((current) => ({ ...current, brandLine: event.target.value }))} className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  Public logo URL
                  <Input value={shopProfileDraft.profilePhotoUrl} onChange={(event) => setShopProfileDraft((current) => ({ ...current, profilePhotoUrl: event.target.value }))} className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  Address
                  <Input value={shopProfileDraft.address} onChange={(event) => setShopProfileDraft((current) => ({ ...current, address: event.target.value }))} className="mt-2" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-white/72">
                    Neighborhood
                    <Input value={shopProfileDraft.neighborhood} onChange={(event) => setShopProfileDraft((current) => ({ ...current, neighborhood: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    City
                    <Input value={shopProfileDraft.city} onChange={(event) => setShopProfileDraft((current) => ({ ...current, city: event.target.value }))} className="mt-2" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-white/72">
                    State
                    <Input value={shopProfileDraft.state} onChange={(event) => setShopProfileDraft((current) => ({ ...current, state: event.target.value }))} className="mt-2" />
                  </label>
                  <label className="block text-sm font-bold text-white/72">
                    Phone
                    <Input value={shopProfileDraft.phone} onChange={(event) => setShopProfileDraft((current) => ({ ...current, phone: event.target.value }))} className="mt-2" />
                  </label>
                </div>
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(barber.readinessLabels ?? []).map((label) => (
                            <span
                              key={label}
                              className={cn(
                                "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-extrabold",
                                statusClasses(label.includes("Approved") || label.includes("Bookable") || label.includes("team") ? "green" : label.includes("incomplete") || label.includes("invited") || label.includes("Not approved") ? "yellow" : "muted")
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="min-h-11 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]"
                        disabled={!barber.canInvite || createInviteMutation.isPending}
                        onClick={() => void handleQuickInviteBarber(barber.barberId)}
                      >
                        {barber.inviteStatus === "invited" || barber.inviteStatus === "requested" ? "Pending" : barber.alreadyAssigned ? "Assigned" : "Send invite"}
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
