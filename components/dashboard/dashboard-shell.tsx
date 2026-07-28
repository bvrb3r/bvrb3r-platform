import Link from "next/link";
import type { ComponentProps } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BARBER_PRIMARY_NAV_ITEMS } from "@/components/barber-experience/barber-tab-config";
import { CLIENT_PRIMARY_NAV_ITEMS, CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { DashboardHeaderActions } from "@/components/dashboard/dashboard-header-actions";
import type { DashboardHeaderNotificationItem } from "@/components/dashboard/dashboard-header-actions";
import { OWNER_PRIMARY_NAV_ITEMS } from "@/components/owner-experience/owner-tab-config";
import { Card } from "@/components/ui/card";
import { getDefaultRouteForUser, getUserRoleLabel } from "@/lib/auth/demo-auth";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { Role, UserAccount } from "@/types/domain";
import { RETIRED_REVENUE_SHARE_ACCOUNT_ROLE } from "@/lib/doctrine/legacy-data-aliases";

type NavItem = {
  href: ComponentProps<typeof Link>["href"];
  activeHref: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
};

type UtilityCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

type ApprovalBanner = {
  eyebrow: string;
  title: string;
  detail: string;
  href: ComponentProps<typeof Link>["href"];
  ctaLabel: string;
};

function getNavigation(user: UserAccount): NavItem[] {
  switch (user.role) {
    case "shop_owner_user":
    case "owner":
      return OWNER_PRIMARY_NAV_ITEMS;
    case "manager":
      return [
        { href: "/dashboard/manager", activeHref: "/dashboard/manager", label: "Dashboard", icon: LayoutDashboard },
        { href: "/appointments", activeHref: "/appointments", label: "Schedule", icon: CalendarDays },
        { href: "/team", activeHref: "/team", label: "Team", icon: Users },
        { href: "/queue", activeHref: "/queue", label: "Queue", icon: Clock3 },
        { href: "/workspace/profile", activeHref: "/workspace/profile", label: "Profile", icon: UserRound }
      ];
    case "front_desk":
      return [
        { href: "/dashboard/front-desk", activeHref: "/dashboard/front-desk", label: "Check-in", icon: LayoutDashboard },
        { href: "/queue", activeHref: "/queue", label: "Waitlist", icon: Clock3 },
        { href: "/appointments", activeHref: "/appointments", label: "Schedule", icon: CalendarDays },
        { href: "/team", activeHref: "/team", label: "Barbers", icon: Users },
        { href: "/workspace/profile", activeHref: "/workspace/profile", label: "Profile", icon: UserRound }
      ];
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return BARBER_PRIMARY_NAV_ITEMS;
    case "client_user":
    case "client":
      return CLIENT_PRIMARY_NAV_ITEMS.map((item) => ({
        href: item.href,
        activeHref: item.href,
        label: item.label,
        mobileLabel: item.label,
        icon: item.icon
      }));
    default:
      return [{ href: getDefaultRouteForUser(user), activeHref: getDefaultRouteForUser(user), label: "Dashboard", icon: LayoutDashboard }];
  }
}

function isBarberRole(role: Role) {
  return isBarberAccountRole(role);
}

function getPrimaryFocusLabel(role: Role) {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "Owner home";
    case "manager":
      return "Operations overview";
    case "front_desk":
      return "Check-in workflow";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "Barber tools";
    case "client_user":
    case "client":
      return "Client home";
    default:
      return "Workspace";
  }
}

function getPrimaryActionTitle(role: Role) {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "Home brings shop health, team controls, public shop profile, and next owner actions together.";
    case "manager":
      return "Keep schedule, queue, and attendance moving without opening owner-only controls.";
    case "front_desk":
      return "Move arrivals from the door to the right chair without friction.";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "Home, Checkout, Profile, Messages, and More stay focused by job.";
    case "client_user":
    case "client":
      return "Home keeps booking fast, Search handles discovery, Culture holds the feed shell, Messages keeps conversations close, and More holds account controls.";
    default:
      return "Stay oriented and move on the next action fast.";
  }
}

function getBoundaryCopy(role: Role) {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "Home, Schedule, Money, Messages, and More keep shop control clean.";
    case "manager":
      return "Manager mode keeps the floor visible while ownership financial controls, payout rules, and transfer rights stay protected.";
    case "front_desk":
      return "Front desk mode stays focused on queue movement, guest support, check-in flow, and handoff clarity.";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
      return "Barber tools stay separated so schedule, payment, profile, messages, and setup stay easy to scan.";
    case "booth_rent_barber":
      return "Barber tools stay separated so schedule, payment, profile, messages, and setup stay easy to scan.";
    case "client_user":
    case "client":
      return "Client mode keeps Home, Search, Culture, Messages, and More separated cleanly so booking, discovery, conversation, receipts, and account controls stay obvious.";
    default:
      return "Relevant tools only.";
  }
}

function getLocationScopeLabel(role: Role) {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "Business footprint";
    case "manager":
      return "Assigned shop";
    case "front_desk":
      return "Desk coverage";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "Assigned locations";
    case "client_user":
    case "client":
      return "Preferred shop";
    default:
      return "Location scope";
  }
}

function getAlertLabel(role: Role) {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "Owner account ready";
    case "manager":
      return "No manager alerts yet";
    case "front_desk":
      return "No queue alerts yet";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "No alerts yet";
    case "client_user":
    case "client":
      return "No booking reminders yet";
    default:
      return "No alerts yet";
  }
}

function getNavigationCountLabel(role: Role, count: number) {
  if (isShopOwnerRole(role) || isBarberAccountRole(role) || isClientRole(role)) {
    return `${count} tabs`;
  }

  return `${count} lanes`;
}

function getHeroNavigationCountLabel(role: Role, count: number) {
  if (isShopOwnerRole(role)) {
    return `${count} owner tabs`;
  }

  if (isBarberAccountRole(role)) {
    return `${count} barber tabs`;
  }

  if (isClientRole(role)) {
    return `${count} client tabs`;
  }

  return `${count} launch lanes`;
}

function getUtilityCards(user: UserAccount): UtilityCard[] {
  switch (user.role) {
    case "shop_owner_user":
    case "owner":
      return [
        { label: "Owner tabs", value: user.appApprovalStatus?.replaceAll("_", " ") ?? "ready", detail: "Five owner tabs tied to this authenticated shop account.", icon: ShieldCheck },
        { label: "Shop scope", value: user.ownedShopId ? "1" : "0", detail: user.ownedShopId ? "One shop linked to this account" : "Create or attach a shop lane", icon: MapPinned },
        { label: "Controls", value: "Live", detail: "Revenue, team, schedule, and setup stay separated by tab.", icon: WalletCards }
      ];
    case "manager":
      return [
        { label: "Manager lane", value: "Live", detail: "Schedule, team, and floor operations stay in one place.", icon: CalendarDays },
        { label: "Shop scope", value: String(user.locationIds.length), detail: "Assigned locations on this session", icon: MapPinned },
        { label: "Operator tools", value: "Ready", detail: "Owner-only financial controls stay protected.", icon: Users }
      ];
    case "front_desk":
      return [
        { label: "Front desk lane", value: "Live", detail: "Queue, arrivals, and handoff tools are ready.", icon: Clock3 },
        { label: "Shop scope", value: String(user.locationIds.length), detail: "Assigned locations on this session", icon: MapPinned },
        { label: "Operator tools", value: "Ready", detail: "Public intake and operator tools stay separated.", icon: Bell }
      ];
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return [
        { label: "Barber account", value: user.barberSubtype?.replaceAll("_", " ") ?? "ready", detail: "Private account details stay in More.", icon: CalendarDays },
        { label: "Approval status", value: user.appApprovalStatus?.replaceAll("_", " ") ?? "ready", detail: user.shopApprovalStatus && user.shopApprovalStatus !== "not_required" ? `Shop approval ${user.shopApprovalStatus.replaceAll("_", " ")}` : "No extra shop approval required", icon: ShieldCheck },
        { label: "Assigned locations", value: String(user.locationIds.length), detail: "Location and payout setup stay in More.", icon: WalletCards }
      ];
    case "client_user":
    case "client":
      return [
        { label: "Client tabs", value: "5", detail: "Home, Search, Culture, Messages, and More stay tied to this authenticated client account only.", icon: CalendarDays },
        { label: "Discovery", value: "Live", detail: "Barber and shop recommendations build from real activity, not seeded client data.", icon: Sparkles },
        { label: "More", value: "Connected", detail: "Wallet, rewards, referrals, receipts, preferences, and settings stay inside More instead of crowding the dock.", icon: UserRound }
      ];
    default:
      return [{ label: "Workspace", value: "Ready", detail: "Role-aware view", icon: Sparkles }];
  }
}

function getNotificationsHref(role: Role): ComponentProps<typeof Link>["href"] {
  switch (role) {
    case "shop_owner_user":
    case "owner":
      return "/dashboard/owner/money";
    case "manager":
    case "front_desk":
      return "/queue";
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "/dashboard/barber";
    case "client_user":
    case "client":
      return CLIENT_PRIMARY_TAB_HREFS.activity;
    default:
      return "/dashboard";
  }
}

function getMessagesHref(role: Role): ComponentProps<typeof Link>["href"] {
  switch (role) {
    case "client_user":
    case "client":
      return CLIENT_PRIMARY_TAB_HREFS.messages;
    case "barber_user":
    case "barber":
    case "freelance_barber":
    case RETIRED_REVENUE_SHARE_ACCOUNT_ROLE:
    case "booth_rent_barber":
      return "/dashboard/barber/messages";
    case "shop_owner_user":
    case "owner":
      return "/dashboard/owner/messages";
    case "manager":
    case "front_desk":
      return "/workspace/messages";
    default:
      return "/workspace/profile";
  }
}

function getProfileHref(role: Role): ComponentProps<typeof Link>["href"] {
  if (isShopOwnerRole(role)) {
      return "/dashboard/owner/more";
  }

  if (isClientRole(role)) {
    return CLIENT_PRIMARY_TAB_HREFS.more;
  }

  if (isBarberAccountRole(role)) {
    return "/dashboard/barber/more";
  }

  return "/workspace/profile";
}

function getHeaderActionRole(role: Role) {
  if (isClientRole(role)) {
    return "client" as const;
  }

  if (isShopOwnerRole(role)) {
    return "owner" as const;
  }

  if (isBarberAccountRole(role)) {
    return "barber" as const;
  }

  return "architect" as const;
}

function getWorkspaceSubtitle(user: UserAccount, roleLabel: string) {
  if (isClientRole(user.role)) {
    return "Search, book, and manage visits";
  }

  if (isShopOwnerRole(user.role)) {
    return "Owner account";
  }

  if (isBarberAccountRole(user.role)) {
    return "Professional account";
  }

  if (roleLabel.toLowerCase().includes("architect") || roleLabel.toLowerCase().includes("platform")) {
    return "Platform control";
  }

  return `${roleLabel} workspace`;
}

function getHeaderNotifications(
  user: UserAccount,
  approvalBanner: ApprovalBanner | null,
  extraItems: DashboardHeaderNotificationItem[] = []
): {
  notificationItems: DashboardHeaderNotificationItem[];
  notificationTone: "yellow" | "red";
} {
  const items: DashboardHeaderNotificationItem[] = [...extraItems];

  if (approvalBanner) {
    const isCritical = user.appApprovalStatus === "rejected" || user.shopApprovalStatus === "rejected";
    items.push({
      id: "approval-status",
      category: "VERIFICATION",
      severity: isCritical ? "critical" : "warning",
      title: approvalBanner.title,
      body: approvalBanner.detail,
      action: {
        label: approvalBanner.ctaLabel,
        href: approvalBanner.href
      }
    });
  }

  return {
    notificationItems: items,
    notificationTone: items.some((item) => item.severity === "critical") ? "red" : "yellow"
  };
}

function formatApprovalStatus(status?: UserAccount["appApprovalStatus"]) {
  switch (status) {
    case "approved":
      return "approved";
    case "under_review":
      return "under review";
    case "rejected":
      return "needs attention";
    case "pending":
      return "pending";
    default:
      return null;
  }
}

function getApprovalBanner(user: UserAccount): ApprovalBanner | null {
  if (isClientRole(user.role)) {
    return null;
  }

  if (isShopOwnerRole(user.role)) {
    const status = formatApprovalStatus(user.appApprovalStatus);
    if (!status || user.appApprovalStatus === "approved") {
      return null;
    }

    return {
      eyebrow: "Owner approval",
      title: `Owner lane is ${status}.`,
      detail: "Your dashboard is live, but public business activation and payout readiness stay controlled until BVRB3R approval and verification clear.",
      href: "/activation-status",
      ctaLabel: "Open activation status"
    };
  }

  if (isBarberAccountRole(user.role)) {
    const appStatus = formatApprovalStatus(user.appApprovalStatus);
    const shopStatus = user.shopApprovalStatus && user.shopApprovalStatus !== "not_required"
      ? formatApprovalStatus(user.shopApprovalStatus)
      : null;
    if ((!appStatus || user.appApprovalStatus === "approved") && (!shopStatus || user.shopApprovalStatus === "approved")) {
      return null;
    }

    const subtypeLabel = user.barberSubtype === "autobooth_rent"
      ? "AutoBooth Rent barber"
      : user.barberSubtype === "booth_rent"
        ? "Full Booth Rent barber"
        : "Freelance barber";
    const detailParts = [
      `${subtypeLabel} lane is open for setup.`,
      appStatus && user.appApprovalStatus !== "approved" ? `BVRB3R approval is ${appStatus}.` : null,
      shopStatus && user.shopApprovalStatus !== "approved" ? `Shop approval is ${shopStatus}.` : null,
      "Discovery, live bookings, and payouts stay blocked until approval and verification clear."
    ].filter(Boolean);

    return {
      eyebrow: "Barber approval",
      title: "This barber account is not publicly live yet.",
      detail: detailParts.join(" "),
      href: "/activation-status",
      ctaLabel: "Open activation status"
    };
  }

  return null;
}

export function DashboardShell({
  user,
  title,
  subtitle,
  activeHref,
  hidePageHeader = false,
  hideShellContext = false,
  headerNotificationItems = [],
  children
}: {
  user: UserAccount;
  title: string;
  subtitle: string;
  activeHref?: string;
  hidePageHeader?: boolean;
  hideShellContext?: boolean;
  headerNotificationItems?: DashboardHeaderNotificationItem[];
  children: React.ReactNode;
}) {
  const nav = getNavigation(user);
  const activeRole = getUserRoleLabel(user);
  const workspaceSubtitle = getWorkspaceSubtitle(user, activeRole);
  const visibleLocations = user.locationIds.map((locationId) => ({
    id: locationId,
    name: user.role === "owner" && user.ownedShopId === locationId && user.ownedShopName
      ? user.ownedShopName
      : locationId,
    city: user.role === "owner" && user.ownedShopId === locationId ? "Owner shop" : "Assigned",
    neighborhood: "",
    state: "",
    phone: "",
    hours: "",
    chairs: 0,
    taxRate: 0
  }));
  const utilityCards = getUtilityCards(user);
  const notificationsHref = getNotificationsHref(user.role);
  const messagesHref = getMessagesHref(user.role);
  const profileHref = getProfileHref(user.role);
  const approvalBanner = getApprovalBanner(user);
  const headerNotifications = getHeaderNotifications(user, approvalBanner, headerNotificationItems);
  const accountAttentionCount = approvalBanner ? 1 : 0;
  const accountAttentionTone = user.appApprovalStatus === "rejected" || user.shopApprovalStatus === "rejected" ? "red" : "yellow";
  const isBarberDashboard = isBarberRole(user.role);
  const showShellContext = !isBarberDashboard && !hideShellContext;

  return (
    <div className="bvr-screen app-screen safe-top-pad overflow-x-clip px-3 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] sm:px-4 sm:py-4 lg:px-5 lg:py-5 lg:pb-5">
      <div className="mx-auto grid max-w-[88rem] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="hidden h-fit rounded-[34px] bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(8,8,8,0.98))] p-4 lg:sticky lg:top-4 lg:block">
          <div className="rounded-[28px] border border-[#C4F24E]/16 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.12),rgba(196, 242, 78,0.04))] p-5">
            <p className="surface-label text-[#e0f6a0]">Platform</p>
            <h1 className="mt-3 text-3xl font-semibold" data-display="true" data-testid="shell-business-name">BVRB3R</h1>
            <p className="mt-4 text-sm text-white/64" data-testid="shell-identity-name">{workspaceSubtitle}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/40" data-testid="shell-identity-title">Unified dashboard</p>
          </div>

          {showShellContext ? (
            <div className="mt-5 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(8,8,8,0.96))] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full border border-[#C4F24E]/18 bg-[#C4F24E]/10 p-2 text-[#e4f9b8]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="surface-label">{getPrimaryFocusLabel(user.role)}</p>
                  <p className="mt-3 text-sm leading-6 text-white/82">{getPrimaryActionTitle(user.role)}</p>
                  <p className="mt-3 text-sm leading-6 text-white/54">{getBoundaryCopy(user.role)}</p>
                </div>
              </div>
            </div>
          ) : null}

          {showShellContext ? (
            <div className="mt-5 grid gap-3">
              {utilityCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="surface-label">{card.label}</p>
                        <p className="mt-3 text-2xl font-semibold" data-display="true">{card.value}</p>
                        <p className="mt-2 text-sm leading-6 text-white/58">{card.detail}</p>
                      </div>
                      <Icon className="mt-1 h-5 w-5 text-[#d9f985]" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="surface-label">Navigation</p>
              <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/46">
                {getNavigationCountLabel(user.role, nav.length)}
              </span>
            </div>
            <div className="space-y-2">
              {nav.map((item) => {
                const Icon = item.icon;
                const isActive = item.activeHref === activeHref;

                return (
                  <Link
                    key={item.activeHref}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center justify-between rounded-[22px] border px-4 py-3 text-[11px] uppercase tracking-[0.22em] transition hover:-translate-y-0.5",
                      isActive
                        ? "border-[#C4F24E]/28 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.16),rgba(16,16,16,0.94))] text-white shadow-[0_18px_40px_rgba(196, 242, 78,0.08)]"
                        : "border-white/6 bg-black/20 text-white/72 hover:border-[#C4F24E]/20 hover:bg-[#121212] hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={cn("h-4 w-4 transition", isActive ? "text-[#e4f9b8]" : "text-[#d9f985] group-hover:scale-105")} />
                      {item.label}
                    </span>
                    {isActive ? <ArrowUpRight className="h-4 w-4 text-[#e4f9b8]" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/12 transition group-hover:bg-[#c4f24e]" />}
                  </Link>
                );
              })}
            </div>
          </div>

          {showShellContext ? (
            <div className="mt-6 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(26,26,26,0.9),rgba(10,10,10,0.96))] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="surface-label">{getLocationScopeLabel(user.role)}</p>
                <MapPinned className="h-4 w-4 text-[#d9f985]" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-white/78">
                {visibleLocations.length ? visibleLocations.map((location) => (
                  <div key={location.id} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/6 bg-black/25 px-3 py-3">
                    <span>{location.name}</span>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-[#e0f6a0]">{location.city}</span>
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/25 px-3 py-3 text-white/52">
                    No assigned locations yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-4">
            <div className="flex items-center justify-between gap-3">
              <Link href={nav[0]?.href ?? getDefaultRouteForUser(user)} className="flex min-w-0 items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#C4F24E]/20 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.18),rgba(15,15,15,0.96))] text-sm font-semibold tracking-[0.22em] text-[#e4f9b8] shadow-[0_16px_34px_rgba(196, 242, 78,0.14)]">
                  BV
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.26em] text-[#e0f6a0]">BVRB3R</p>
                  <p className="mt-1 truncate text-sm font-medium text-white/74" data-testid="shell-mobile-business-name">{workspaceSubtitle}</p>
                </div>
              </Link>
              <DashboardHeaderActions
                role={getHeaderActionRole(user.role)}
                notificationsHref={notificationsHref}
                messagesHref={messagesHref}
                moreHref={profileHref}
                notificationUnreadCount={headerNotifications.notificationItems.length}
                notificationTone={headerNotifications.notificationTone}
                notificationItems={headerNotifications.notificationItems}
                accountAttentionCount={accountAttentionCount}
                accountAttentionTone={accountAttentionTone}
              />
            </div>

          </Card>

          {!hidePageHeader ? (
            <Card className="rounded-[34px] bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(8,8,8,0.98))] p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  {showShellContext ? (
                    <div className="editorial-kicker">
                      <span className="accent-rule" />
                      {getPrimaryFocusLabel(user.role)}
                    </div>
                  ) : null}
                  <h2 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{title}</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">{subtitle}</p>
                </div>
                {showShellContext ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[30rem] lg:self-start xl:w-auto">
                    <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                      <p className="surface-label">Operating as</p>
                      <p className="mt-3 text-lg font-medium">{activeRole}</p>
                      <p className="mt-2 text-sm text-white/56">{getAlertLabel(user.role)}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/68">
                        <Bell className="h-4 w-4 text-[#d9f985]" />
                        {getHeroNavigationCountLabel(user.role, nav.length)}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/56">{getBoundaryCopy(user.role)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
          {showShellContext && approvalBanner ? (
            <Card className="rounded-[30px] border border-[#e0f6a0]/18 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.08),rgba(10,10,10,0.98))] p-5 sm:p-6">
              <p className="surface-label text-[#e4f9b8]">{approvalBanner.eyebrow}</p>
              <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-2xl font-semibold text-white">{approvalBanner.title}</p>
                  <p className="mt-3 text-sm leading-7 text-white/66">{approvalBanner.detail}</p>
                </div>
                <Link
                  href={approvalBanner.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e0f6a0]/34 bg-[#c4f24e]/10 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e8ffc2] transition hover:border-[#e0f6a0]/52 hover:bg-[#c4f24e]/16"
                >
                  {approvalBanner.ctaLabel}
                </Link>
              </div>
            </Card>
          ) : null}
          {children}
        </div>
      </div>

      <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-40 sm:inset-x-3 lg:hidden">
        <div className="mobile-dock mx-auto max-w-[88rem] rounded-[28px] border border-white/10 px-3 py-3 shadow-[0_22px_44px_rgba(0,0,0,0.42)]">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {nav.map((item) => {
              const Icon = item.icon;
              const isActive = item.activeHref === activeHref;
              return (
                <Link
                  key={`mobile-dock-${item.activeHref}`}
                  href={item.href}
                  aria-label={`Open mobile dock ${item.label}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 min-w-[4.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-[22px] border px-2.5 py-3 text-center transition sm:min-w-[5.5rem] sm:px-3",
                    isActive
                      ? "border-[#C4F24E]/26 bg-[#C4F24E]/10 text-white"
                      : "border-white/8 bg-black/18 text-white/66 hover:border-[#C4F24E]/20 hover:text-white"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-[#e4f9b8]" : "text-[#d9f985]")} />
                  <span aria-hidden="true" className="max-w-full truncate text-[10px] font-semibold uppercase leading-none tracking-[0.14em] sm:tracking-[0.18em]">{item.mobileLabel ?? item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}





