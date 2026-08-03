"use client";

import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  Gift,
  Heart,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
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
import { RoadFutureGates } from "@/components/road/road-future-gates";
import { MoreSettingModal } from "@/components/dashboard/more/more-setting-modal";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import type { ShopAddressMapboxFieldProps } from "@/components/marketplace/shop-address-mapbox-field";
import { KioskSettingsCard } from "@/components/kiosk/kiosk-actions";
import { ShopOwnerPlanAccessCard, ShopOwnerUpgradePrompt } from "@/components/owner-experience/shop-owner-plan-access-card";
import { SubscriptionSettingsCard } from "@/components/subscription/subscription-settings-card";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { GlassCard } from "@/design/components";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import type { ShopOwnerPaywallSummary } from "@/lib/entitlements/shop-owner-paywall";
import type { SubscriptionSettingsSummary } from "@/lib/entitlements/subscription-settings";
import { useCreateOwnerTeamInviteMutation, useOwnerTeamInviteDirectoryQuery } from "@/lib/operations/barber-client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { formatPublicAddressLocation, formatPublicUsernameLine } from "@/lib/profile/public-identity-summary";
import { uploadMediaAsset } from "@/lib/storage/media";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { UserAccount } from "@/types/domain";

type SettingTone = "green" | "yellow" | "red" | "muted";

const ShopAddressMapboxField = dynamic<ShopAddressMapboxFieldProps>(
  () => import("@/components/marketplace/shop-address-mapbox-field")
    .then((module) => module.ShopAddressMapboxField),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[24px] border border-dashed border-white/12 bg-black/25 p-5 text-sm text-white/58">
        Loading verified map tools…
      </div>
    )
  }
);

type SettingRow = {
  title: string;
  subtitle: string;
  href?: ComponentProps<typeof Link>["href"];
  onClick?: () => void;
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
  logout: "owner-settings-logout",
  plan: "owner-settings-payments"
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

function formatOwnerReadinessLabel(status?: string | null) {
  switch (status) {
    case "approved":
    case "public":
      return "Visible";
    case "under_review":
      return "Needs Review";
    case "pending":
    case "submitted":
      return "Pending";
    case "rejected":
      return "Blocked";
    case "hidden":
      return "Hidden";
    default:
      return "Needs setup";
  }
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
      return "border-[#C4F24E]/25 bg-[#C4F24E]/10 text-[#C4F24E]";
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
  initialSection,
  ownerPlanSummary,
  subscriptionSummary
}: {
  user: UserAccount;
  initialSection?: string;
  ownerPlanSummary?: ShopOwnerPaywallSummary | null;
  subscriptionSummary?: SubscriptionSettingsSummary | null;
}) {
  const profileQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const fintechQuery = useFintechManagementQuery();
  const [quickSetupModal, setQuickSetupModal] = useState<OwnerQuickSetupModal>(null);
  const [planAccessOpen, setPlanAccessOpen] = useState(false);
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const [savedOwnerName, setSavedOwnerName] = useState<string | null>(null);
  const [savedOwnerEmail, setSavedOwnerEmail] = useState<string | null>(null);
  const [savedOwnerPhone, setSavedOwnerPhone] = useState<string | null>(null);
  const [savedShopPublicUsername, setSavedShopPublicUsername] = useState<string | null>(null);
  const [quickSetupFeedback, setQuickSetupFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [ownerHoursSaving, setOwnerHoursSaving] = useState(false);
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
  const shopPublicUsername = savedShopPublicUsername ?? primaryShop?.publicUsername ?? null;
  const shopPublicUsernameLine = formatPublicUsernameLine(shopPublicUsername);
  const shopPublicLocationLine = formatPublicAddressLocation({
    address: primaryShop?.address,
    city: primaryShop?.city,
    state: primaryShop?.state,
    zip: primaryShop?.zipCode,
    fallback: "Add shop address"
  });
  const ownerCardProfileImageUrl = primaryShop?.profilePhotoUrl ?? profileQuery.data?.viewer.profilePhotoUrl;
  const ownerCardUsernameLine = shopPublicUsername ? shopPublicUsernameLine : ownerAccountUsernameLine;
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

    const currentShopUsername = (shopPublicUsername ?? "").toLowerCase();
    if (primaryShop && input.publicUsername && input.publicUsername !== currentShopUsername) {
      await mediaMutation.mutateAsync({
        action: "set_shop_public_username",
        shopId: primaryShop.shopId,
        username: input.publicUsername
      });
      setSavedShopPublicUsername(input.publicUsername);
    }

    setSavedOwnerName(input.fullName);
    setSavedOwnerEmail(input.email);
    setSavedOwnerPhone(input.phone);
    setQuickSetupFeedback({ tone: "success", message: "Account details saved. Email or phone changes may still require verification." });
  }

  function handleAccountPaymentAction(href: string) {
    setAccountEditorOpen(false);
    window.setTimeout(() => {
      window.location.assign(href);
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
    setOwnerHoursSaving(true);
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
    } finally {
      setOwnerHoursSaving(false);
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

  const businessSetupRows: SettingRow[] = [
    {
      title: "Booth Rent, AutoBooth & Fees",
      subtitle: "Manage Full Booth Rent and AutoBooth Rent terms, pricing rules, caps, and platform fees",
      href: "/dashboard/owner/money?view=fintech",
      icon: <CircleDollarSign className="h-5 w-5" />,
      status: blockedRoutingCount ? "Needs review" : "Read-only",
      tone: blockedRoutingCount ? "yellow" : "green"
    },
    {
      title: "Shop Hours",
      subtitle: "Operating hours, holidays, open/closed status, and team coverage rules",
      onClick: () => setQuickSetupModal("hours"),
      icon: <Clock3 className="h-5 w-5" />
    },
    {
      title: "Shop Policies",
      subtitle: "Shop rules, client policies, barber agreements, cancellation/no-show rules, and shop contracts",
      href: "/onboarding/owner/structure",
      icon: <FileText className="h-5 w-5" />
    },
    {
      title: "Team & Roles",
      subtitle: "Manage team roles, permissions, Full Booth Rent and AutoBooth Rent barbers, and active members",
      href: "/dashboard/owner/team",
      icon: <Users className="h-5 w-5" />,
      status: membershipCount ? `${membershipCount} linked` : "Not set",
      tone: membershipCount ? "green" : "muted"
    },
    {
      title: "Kiosk Settings",
      subtitle: "4-digit PIN, shop kiosk mode, walk-in routing, and eligible active barbers",
      href: "/dashboard/owner/more?section=kiosk",
      icon: <TabletSmartphone className="h-5 w-5" />
    },
    {
      title: "Performance",
      subtitle: "Reports, trends, utilization, bookings, floor service volume, booth rent, team activity, and shop health",
      href: "/dashboard/owner/overview",
      icon: <BarChart3 className="h-5 w-5" />
    }
  ];

  const paymentsRows: SettingRow[] = [
    {
      title: "Wallet / Billing",
      subtitle: "Default payment method for shop subscriptions, tools, ads, and promotions",
      href: "/dashboard/owner/money?section=wallet",
      icon: <CreditCard className="h-5 w-5" />
    },
    {
      title: "Plan Access",
      subtitle: "Review Standard, Pro, and Elite shop tools. Standard is $0; paid plan management is being prepared.",
      onClick: () => setPlanAccessOpen(true),
      icon: <LockKeyhole className="h-5 w-5" />,
      status: ownerPlanSummary?.statusLabel ?? "Needs Review",
      tone: ownerPlanSummary?.statusTone === "green" ? "green" : ownerPlanSummary?.statusTone === "yellow" ? "yellow" : "muted"
    },
    {
      title: "Stripe Connect",
      subtitle: "Manage bank accounts and payouts",
      href: "/dashboard/owner/money?view=fintech",
      icon: <CreditCard className="h-5 w-5" />,
      status: stripeStatus.label,
      tone: stripeStatus.tone
    },
    {
      title: "Owner Payouts",
      subtitle: "Shop payout schedule, rent collection, payout status, release timing, and payout history",
      href: "/dashboard/owner/money?section=payouts",
      icon: <CalendarDays className="h-5 w-5" />,
      status: "View schedule",
      tone: "muted"
    },
    {
      title: "Rewards",
      subtitle: "Points, credits, loyalty progress, referrals, and owner/shop incentives",
      href: "/rewards",
      icon: <Gift className="h-5 w-5" />
    },
    {
      title: "Transactions",
      subtitle: "Shop sales, receipts, spending, subscriptions, refunds, failed payments, credits, and payout movement",
      href: "/dashboard/owner/money",
      icon: <ReceiptText className="h-5 w-5" />
    },
    {
      title: "Tax Information",
      subtitle: "Tax forms and business payout documents",
      href: "/dashboard/owner/money?view=fintech",
      icon: <ReceiptText className="h-5 w-5" />,
      status: taxStatus.label,
      tone: taxStatus.tone
    }
  ];

  const complianceRows: SettingRow[] = [
    {
      title: "Identity Verification",
      subtitle: "Government ID or driver license proving who owns the owner account",
      href: verificationStatus === "approved" ? "/activation-status" : "/onboarding/owner/verification",
      icon: <ShieldCheck className="h-5 w-5" />,
      status: verificationLabel,
      tone: verificationTone
    },
    {
      title: "Business Verification",
      subtitle: "Barber shop license, LLC/business document, EIN/tax details, and required uploads",
      href: "/onboarding/owner/verification",
      icon: <FileCheck2 className="h-5 w-5" />,
      status: verificationStatus === "approved" ? "View documents" : "Needs setup",
      tone: verificationStatus === "approved" ? "green" : "yellow"
    },
    {
      title: "Password & Login",
      subtitle: "Password, sign-in method, email login, phone login, and connected access",
      href: "/dashboard/owner/more?section=logout",
      icon: <KeyRound className="h-5 w-5" />
    },
    {
      title: "Privacy",
      subtitle: "Export, deactivate, deletion grace, shop data, and owner/private visibility",
      href: "/dashboard/account/privacy",
      icon: <ShieldCheck className="h-5 w-5" />
    },
    {
      title: "Culture Safety",
      subtitle: "Reports, blocks, mutes, appeals, and Culture standing",
      href: "/dashboard/culture/safety",
      icon: <ShieldCheck className="h-5 w-5" />
    },
    {
      title: "Account Security",
      subtitle: "Email verification, phone verification, device/session protection, owner access, and account status",
      href: "/verify-contact",
      icon: <KeyRound className="h-5 w-5" />
    },
    {
      title: "Legal",
      subtitle: "Business agreements, shop policies, team agreements, payout terms, platform terms, and compliance terms",
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
    },
    {
      title: "Report a problem",
      subtitle: "Report shop, team, queue, kiosk, settings, safety, or app issues",
      icon: <ShieldCheck className="h-5 w-5" />
    },
    {
      title: "Send feedback",
      subtitle: "Share product feedback or a feature request",
      icon: <FileText className="h-5 w-5" />
    }
  ];

  const ownerMoreSections: MoreSectionGroupConfig[] = [
    {
      id: "owner-settings-progress-reference",
      title: "Progress & Reference",
      subtitle: "Follow your journey, then open the complete BVRB3R system map.",
      roleScope: "owner" as const,
      rows: [
        { title: "The Road", subtitle: "Your real progress, badges, referrals, and next milestone.", href: "/road", icon: <BarChart3 className="h-5 w-5" /> },
        { title: "System Atlas", subtitle: "The 21 mission chains · every door to its exit.", href: "/atlas", icon: <FileText className="h-5 w-5" /> }
      ]
    },
    {
      id: "owner-settings-access-tools",
      title: "Access & Tools",
      subtitle: "Open the shared cards, identity, and business-planning doors.",
      roleScope: "owner" as const,
      rows: [
        { title: "Gift cards", subtitle: "Buy, claim, redeem, and review real shop-scoped gift-card balance.", href: "/gift-cards", icon: <Gift className="h-5 w-5" /> },
        { title: "App ID", subtitle: "Your public-safe verified shop card and QR.", href: "/id", icon: <ShieldCheck className="h-5 w-5" /> },
        { title: "Business Toolkit", subtitle: "Income, pricing, rent, AutoBooth, utilization, and no-show estimates.", href: "/pro/toolkit", icon: <BarChart3 className="h-5 w-5" /> }
      ]
    },
    {
      id: "owner-settings-shop-profile",
      title: "SHOP BUSINESS SETTINGS",
      subtitle: "Manage the tools that control your shop profile, team, services, hours, policies, kiosk, and operating model.",
      roleScope: "owner" as const,
      rows: businessSetupRows
    },
    {
      id: "owner-settings-payments-banking",
      title: "Payments & Banking",
      subtitle: "Money-side setup, payout schedules, transactions, and tax documents.",
      roleScope: "owner" as const,
      rows: paymentsRows
    },
    {
      id: "owner-settings-compliance",
      title: "Compliance & Security",
      subtitle: "Verification, documents, login security, privacy, and legal posture.",
      roleScope: "owner" as const,
      rows: complianceRows
    },
    {
      id: "owner-settings-support",
      title: "Support",
      subtitle: "Help and direct support for shop owner operations.",
      roleScope: "owner" as const,
      rows: supportRows
    }
  ];

  const quickSetupModalSpec = quickSetupModal
    ? {
        key: `owner-quick-setup-${quickSetupModal}`,
        roleScope: "owner" as const,
        sectionKey: "owner-quick-setup",
        title:
          quickSetupModal === "hours"
            ? "Shop Hours"
            : quickSetupModal === "invite"
              ? "Invite barber"
              : "Turn shop public?",
        eyebrow: quickSetupModal === "hours" ? "Shop Business Settings" : quickSetupModal === "invite" ? "Team setup" : "Quick setup",
        helper:
          quickSetupModal === "hours"
            ? "These hours feed the owner schedule and public shop readiness."
            : quickSetupModal === "invite"
              ? "Search real barber accounts and send a canonical team invite."
              : "This confirms public intent only. Approval, profile data, team, and bookable barber readiness still control marketplace visibility.",
        mode: quickSetupModal === "hours" ? "editable" as const : "read_only" as const
      }
    : null;

  return (
    <div className="relative space-y-7 overflow-hidden" data-testid="owner-settings-workspace" data-more-modal-root="owner">
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

      {subscriptionSummary ? (
        <div data-testid="owner-settings-subscription-summary">
          <SubscriptionSettingsCard summary={subscriptionSummary} />
        </div>
      ) : null}

      {ownerPlanSummary ? (
        <div data-testid="owner-settings-plan-access-summary">
          <ShopOwnerPlanAccessCard summary={ownerPlanSummary} showFeatureGroups />
        </div>
      ) : null}

      <MoreControlHub
        title="BVRB3R App Settings"
        subtitle="App-level behavior, saved items, activity, and personal preferences."
        roleScope="owner"
        rows={[
          { title: "Notifications & Alerts", subtitle: "Messages, reminders, shop alerts, payout alerts, and business alerts", href: "/dashboard/owner/messages", icon: <MessageCircle className="h-5 w-5" /> },
          { title: "Preferences", subtitle: "App experience, display, dashboard defaults, and operating behavior", href: "/dashboard/owner/more?section=settings", icon: <Settings2 className="h-5 w-5" /> },
          { title: "Saved / Favorites", subtitle: "Saved barbers, team prospects, shops, clients, styles, services, and platform items", href: "/dashboard/owner/more?section=preferences", icon: <Heart className="h-5 w-5" /> },
          { title: "Activity", subtitle: "App activity, shop activity, team activity, and account history", href: "/dashboard/owner/schedule", icon: <CalendarDays className="h-5 w-5" /> }
        ]}
      />

      <section className="space-y-3">
        <MoreSectionGroup group={ownerMoreSections[0]} />
        <RoadFutureGates role="shop_owner_user" />
        {primaryShop ? (
          <ShopAddressMapboxField
            shopId={primaryShop.shopId}
            currentAddress={shopPublicLocationLine === "Add shop address" ? null : shopPublicLocationLine}
            onSaved={() => {
              setQuickSetupFeedback({ tone: "success", message: "Verified shop address and public map pin saved." });
              void profileQuery.refetch();
            }}
          />
        ) : null}
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
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/10 px-5 text-sm font-extrabold text-[#C4F24E] transition hover:bg-[#C4F24E]/15"
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
        publicUsername={ownerCardUsernameLine}
        fullName={user.canonicalFullName ?? ownerDisplayName}
        email={ownerEmail}
        phone={ownerPhone}
        cityLocation={ownerAccountLocationLine === "Location not set" ? "" : ownerAccountLocationLine}
        defaultPaymentMethodLabel="No saved default payment method"
        payoutMethodLabel={stripeStatus.label === "Connected" ? "Payout setup connected" : "Payout setup not started"}
        managePaymentHref="/dashboard/owner/money?section=wallet"
        managePayoutHref="/dashboard/owner/money?view=fintech"
        locationOptions={ownerLocationOptions}
        emailVerified={user.emailVerified}
        phoneVerified={user.phoneVerified}
        onClose={() => setAccountEditorOpen(false)}
        onPaymentAction={handleAccountPaymentAction}
        onSave={handleAccountSave}
      />

      {ownerPlanSummary ? (
        <MoreSettingModal
          open={planAccessOpen}
          spec={{
            key: "owner-plan-access",
            roleScope: "owner",
            sectionKey: "owner-settings-payments-banking",
            title: "Plan Access",
            eyebrow: "Payments & Banking",
            helper: "Review Standard, Pro, and Elite shop tools. Standard is $0; paid plan management is being prepared.",
            mode: "read_only",
            statusLabel: ownerPlanSummary.statusLabel,
            privacyLevel: "financial",
            dataSources: ["Server entitlement registry", "Server entitlement resolver"],
            syncTargets: ["Owner Home", "Owner Schedule", "Owner Money", "Owner More"],
            validations: ["Server entitlement proof decides paid access", "UI lock is presentation only", "No paid plan action starts here"],
            permissions: ["Signed-in shop owner account"]
          }}
          onClose={() => setPlanAccessOpen(false)}
          primaryLabel="Plan management is being prepared"
          primaryEnabled={false}
          closeLabel="Close plan access"
          maxWidthClassName="max-w-5xl"
        >
          <ShopOwnerUpgradePrompt summary={ownerPlanSummary} />
        </MoreSettingModal>
      ) : null}

      {quickSetupModal ? (
        <MoreSettingModal
          open
          spec={quickSetupModalSpec}
          onClose={closeQuickSetupModal}
          closeLabel="Close owner quick setup"
          maxWidthClassName="max-w-2xl"
          primaryEnabled={quickSetupModal === "hours"}
          footerPrimary={quickSetupModal === "hours" ? (
            <button
              type="button"
              className="min-h-12 rounded-full border border-[#C4F24E]/45 bg-[#C4F24E] px-5 text-sm font-extrabold text-black hover:bg-[#b3e63a] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-[#050505]/34 bvr-on-green"
              disabled={ownerHoursSaving}
              onClick={() => void handleQuickShopHoursSave()}
            >
              {ownerHoursSaving ? "Saving..." : "Save Changes"}
            </button>
          ) : undefined}
        >
            {quickSetupModal === "hours" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Quick setup</p>
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
                          ? "border-[#C4F24E]/55 bg-[#C4F24E] text-black"
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
              </div>
            ) : null}

            {quickSetupModal === "invite" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Team setup</p>
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
                          {formatOwnerReadinessLabel(barber.appApprovalStatus)} / {formatOwnerReadinessLabel(barber.visibilityState)}
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
                        className="min-h-11 rounded-2xl bg-[#C4F24E] text-black hover:bg-[#b3e63a]"
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
                  <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#C4F24E] text-black hover:bg-[#b3e63a]" onClick={() => void handleQuickTurnShopPublic()}>
                    Turn shop public
                  </Button>
                </div>
              </div>
            ) : null}
        </MoreSettingModal>
      ) : null}
    </div>
  );
}
