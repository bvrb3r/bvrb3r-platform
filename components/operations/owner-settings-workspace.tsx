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
  Settings2,
  ShieldCheck,
  Store,
  TabletSmartphone,
  Users
} from "lucide-react";
import { AccountQuickEditModal, type AccountQuickEditInput, type AccountQuickEditLocationOption } from "@/components/dashboard/account/account-quick-edit-modal";
import {
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
import { KioskSettingsCard } from "@/components/kiosk/kiosk-actions";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { GlassCard } from "@/design/components";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import { useCreateOwnerTeamInviteMutation, useOwnerTeamInviteDirectoryQuery } from "@/lib/operations/barber-client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { formatPublicAddressLocation, formatPublicUsernameLine } from "@/lib/profile/public-identity-summary";
import { uploadMediaAsset } from "@/lib/storage/media";
import { cn } from "@/lib/utils";
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
type OwnerQuickSetupModal = "hours" | "invite" | "visibility" | null;

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

function getOwnerPayoutChipLabel(label: string) {
  if (label === "Connected") {
    return "Payouts connected";
  }
  if (label === "Not connected") {
    return "Payouts not started";
  }

  return `Payouts ${label.toLowerCase()}`;
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
  if (!city || isPendingPublicLocationPart(city)) {
    return null;
  }

  return {
    city,
    state: state && !isPendingPublicLocationPart(state) ? state : "",
    label: [city, state && !isPendingPublicLocationPart(state) ? state : ""].filter(Boolean).join(", ")
  };
}

function isPendingPublicLocationPart(value?: string | null) {
  const normalized = value?.replace(/[,\s-]/g, "").trim().toLowerCase() ?? "";
  return !normalized || normalized === "pending" || normalized === "pendingpending";
}

function isRecoverableShopMediaError(error: unknown) {
  return error instanceof Error && error.message === "Unable to load shop profile media.";
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
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const [savedOwnerName, setSavedOwnerName] = useState<string | null>(null);
  const [savedOwnerEmail, setSavedOwnerEmail] = useState<string | null>(null);
  const [savedOwnerPhone, setSavedOwnerPhone] = useState<string | null>(null);
  const [quickSetupFeedback, setQuickSetupFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
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
  const ownerDisplayName = (savedOwnerName ?? user.name) || "Shop owner";
  const ownerEmail = savedOwnerEmail ?? user.email;
  const ownerPhone = savedOwnerPhone ?? user.phone;
  const ownerLocationOptions = [toLocationOption(primaryShop)]
    .filter((option): option is AccountQuickEditLocationOption => Boolean(option));
  const ownerShopId = primaryShop?.shopId ?? user.ownedShopId ?? user.locationIds[0] ?? null;
  const ownerAccountUsernameLine = "Username not set";
  const ownerAccountLocationLine = "Location not set";
  const shopPublicUsernameLine = formatPublicUsernameLine(primaryShop?.publicUsername);
  const shopPublicLocationLine = formatPublicAddressLocation({
    address: primaryShop?.address,
    city: primaryShop?.city,
    state: primaryShop?.state,
    zip: primaryShop?.zipCode,
    fallback: "Add shop address"
  });
  const ownerCardProfileImageUrl = primaryShop?.profilePhotoUrl ?? profileQuery.data?.viewer.profilePhotoUrl;
  const ownerCardUsernameLine = primaryShop?.publicUsername ? shopPublicUsernameLine : ownerAccountUsernameLine;
  const ownerCardPhone = primaryShop?.phone ?? ownerPhone ?? "Phone not set";
  const ownerCardEmail = (primaryShop as { businessEmail?: string | null } | null)?.businessEmail ?? ownerEmail ?? "Email not set";
  const ownerCardLocationLine = primaryShop && shopPublicLocationLine !== "Add shop address"
    ? shopPublicLocationLine
    : ownerAccountLocationLine;
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
  const ownerPayoutChipLabel = getOwnerPayoutChipLabel(stripeStatus.label);
  const taxStatus = getTaxStatus(fintechShopAccount?.taxReadinessStatus);
  const profileMediaError = profileQuery.error && !shops.length && !isRecoverableShopMediaError(profileQuery.error)
    ? profileQuery.error
    : null;
  const errorMessage = profileMediaError ?? fintechQuery.error;
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

    setSavedOwnerName(input.fullName);
    setSavedOwnerEmail(input.email);
    setSavedOwnerPhone(input.phone);
    setQuickSetupFeedback({ tone: "success", message: "Account details saved. Email or phone changes may still require verification." });
  }

  function handleAccountPaymentAction() {
    setAccountEditorOpen(false);
    window.setTimeout(() => {
      window.location.assign("/dashboard/owner/money?view=fintech");
    }, 0);
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
      title: "Team & Roles",
      subtitle: "Manage team roles & permissions",
      href: "/onboarding/owner/team",
      icon: <Users className="h-5 w-5" />,
      status: membershipCount ? `${membershipCount} linked` : "Not set",
      tone: membershipCount ? "green" : "muted"
    },
    {
      title: "Kiosk Settings",
      subtitle: "4-digit PIN, shop kiosk mode, and eligible active barbers",
      href: "/dashboard/owner/more?section=kiosk",
      icon: <TabletSmartphone className="h-5 w-5" />
    },
    {
      title: "Commission & Fees",
      subtitle: "Shop commission and platform fee rules",
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
      title: "Transactions",
      subtitle: "Shop sales and receipts",
      href: "/dashboard/owner/money",
      icon: <ReceiptText className="h-5 w-5" />
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
    },
    {
      title: "Privacy",
      subtitle: "Shop data and communication preferences",
      href: "/verify-contact",
      icon: <ShieldCheck className="h-5 w-5" />
    },
    {
      title: "Legal",
      subtitle: "Business agreements and policies",
      href: "/contact",
      icon: <FileText className="h-5 w-5" />
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

  const ownerMoreSections: MoreSectionGroupConfig[] = [
    {
      id: "owner-settings-shop-profile",
      title: "SHOP BUSINESS SETTINGS",
      subtitle: "Manage the tools that control your shop profile, team, services, hours, policies, kiosk, and operating model.",
      rows: [
        ...shopProfileRows,
        ...businessSetupRows
      ]
    },
    {
      id: "owner-settings-payments-banking",
      title: "Payments & Banking",
      subtitle: "Money-side setup, payout schedules, transactions, and tax documents.",
      rows: paymentsRows
    },
    {
      id: "owner-settings-compliance",
      title: "Compliance & Security",
      subtitle: "Verification, documents, login security, privacy, and legal posture.",
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
        subtitle="Manage your account, shop setup, payments, policies, and settings."
      />

      <MoreIdentityReadinessCard
        variant="owner"
        imageUrl={ownerCardProfileImageUrl}
        initials={getInitials(ownerDisplayName)}
        title={ownerDisplayName}
        subtitle="Owner account"
        roleLabel="SHOP OWNER ACCOUNT"
        badges={[
          { label: verificationLabel, tone: verificationTone },
          { label: ownerPayoutChipLabel, tone: stripeStatus.tone },
          { label: ownerCardPhone !== "Phone not set" ? "Phone connected" : "Phone needed", tone: ownerCardPhone !== "Phone not set" ? "green" : "yellow" },
          { label: primaryShop ? "Shop profile ready" : "Shop profile incomplete", tone: primaryShop ? "green" : "yellow" }
        ]}
        metaLines={[
          { label: "Username", value: ownerCardUsernameLine },
          { label: "Phone", value: ownerCardPhone },
          { label: "Contact email", value: ownerCardEmail },
          { label: "Location", value: ownerCardLocationLine }
        ]}
        primaryAction={{ label: "Edit Account", onClick: () => setAccountEditorOpen(true) }}
        secondaryAction={ownerShopId ? { label: "Public Profile", href: "/dashboard/owner/public-profile" } : undefined}
        tiles={[]}
      />

      <MoreControlHub
        title="BVRB3R App Settings"
        subtitle="App-level behavior, saved items, activity, and personal preferences."
        rows={[
          { title: "Notifications", subtitle: "Messages and reminders", href: "/dashboard/owner/messages", icon: <MessageCircle className="h-5 w-5" /> },
          { title: "Preferences", subtitle: "App experience, display, and default behavior", href: "/dashboard/owner/more?section=settings", icon: <Settings2 className="h-5 w-5" /> },
          { title: "Activity", subtitle: "App activity and visit history", href: "/dashboard/owner/schedule", icon: <CalendarDays className="h-5 w-5" /> }
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
        {ownerShopId && initialSection === "kiosk" ? (
          <KioskSettingsCard
            scope="shop"
            targetReference={ownerShopId}
            title="Shop kiosk PIN"
            subtitle="Set the PIN required to exit the locked shop kiosk booking surface."
          />
        ) : null}
        {selectedServiceManager ? (
          <div className="pt-1">
            <ServiceCatalogWorkspace role="owner" />
          </div>
        ) : null}
      </section>

      {ownerMoreSections.slice(1).map((group) => <MoreSectionGroup key={group.title} group={group} />)}

      <section id="owner-settings-logout" className="scroll-mt-6">
        <MoreLogoutCard />
      </section>

      <div className="h-3" />

      <AccountQuickEditModal
        open={accountEditorOpen}
        variant="owner"
        displayName={ownerDisplayName}
        publicUsername={ownerAccountUsernameLine}
        fullName={user.canonicalFullName ?? ownerDisplayName}
        email={ownerEmail}
        phone={ownerPhone}
        cityLocation={ownerAccountLocationLine === "Location not set" ? "" : ownerAccountLocationLine}
        defaultPaymentMethodLabel={stripeStatus.label === "Connected" ? "Owner payout setup connected" : "Payment setup managed in Money"}
        managePaymentHref="/dashboard/owner/money?view=fintech"
        locationOptions={ownerLocationOptions}
        emailVerified={user.emailVerified}
        phoneVerified={user.phoneVerified}
        onClose={() => setAccountEditorOpen(false)}
        onPaymentAction={handleAccountPaymentAction}
        onSave={handleAccountSave}
      />

      {quickSetupModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_34px_rgba(163,255,18,0.12)]">
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
