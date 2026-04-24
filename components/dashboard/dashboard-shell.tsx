import Link from "next/link";
import type { ComponentProps } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  MapPinned,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BARBER_PRIMARY_NAV_ITEMS } from "@/components/barber-experience/barber-tab-config";
import { OWNER_PRIMARY_NAV_ITEMS } from "@/components/owner-experience/owner-tab-config";
import { Card } from "@/components/ui/card";
import { getDefaultRouteForUser, getUserRoleLabel } from "@/lib/auth/demo-auth";
import { cn } from "@/lib/utils";
import type { Role, UserAccount } from "@/types/domain";

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
    case "commission_barber":
    case "booth_rent_barber":
      return BARBER_PRIMARY_NAV_ITEMS;
    case "client":
      return [
        { href: "/dashboard/client", activeHref: "/dashboard/client", label: "Home", mobileLabel: "Home", icon: LayoutDashboard },
        { href: "/search", activeHref: "/search", label: "Search", icon: Sparkles },
        { href: "/bookings", activeHref: "/bookings", label: "Bookings", icon: CalendarDays },
        { href: "/activity", activeHref: "/activity", label: "Rewards", icon: ClipboardList },
        { href: "/profile", activeHref: "/profile", label: "Profile", icon: UserRound },
        { href: "/settings", activeHref: "/settings", label: "Settings", icon: ShieldCheck }
      ];
    default:
      return [{ href: getDefaultRouteForUser(user), activeHref: getDefaultRouteForUser(user), label: "Dashboard", icon: LayoutDashboard }];
  }
}

function getPrimaryFocusLabel(role: Role) {
  switch (role) {
    case "owner":
      return "Owner home";
    case "manager":
      return "Operations overview";
    case "front_desk":
      return "Check-in workflow";
    case "commission_barber":
    case "booth_rent_barber":
      return "Barber operating lane";
    case "client":
      return "Client home";
    default:
      return "Workspace";
  }
}

function getPrimaryActionTitle(role: Role) {
  switch (role) {
    case "owner":
      return "Home keeps today revenue, bookings, chair utilization, alerts, and quick actions clear while Team, Schedule, Money, and Settings stay one tap away.";
    case "manager":
      return "Keep schedule, queue, and attendance moving without opening owner-only controls.";
    case "front_desk":
      return "Move arrivals from the door to the right chair without friction.";
    case "commission_barber":
    case "booth_rent_barber":
      return "Home keeps today obvious, Calendar controls time, Checkout keeps service money clear, and Profile plus Settings split public identity from private setup.";
    case "client":
      return "Search, book, and manage visits without stepping into shop ops.";
    default:
      return "Stay oriented and move on the next action fast.";
  }
}

function getBoundaryCopy(role: Role) {
  switch (role) {
    case "owner":
      return "The five owner tabs keep Home, Team, Schedule, Money, and Settings separated cleanly so shop control stays simple without inventing parallel systems.";
    case "manager":
      return "Manager mode keeps the floor visible while ownership financial controls, payout rules, and transfer rights stay protected.";
    case "front_desk":
      return "Front desk mode stays focused on queue movement, guest support, check-in flow, and handoff clarity.";
    case "commission_barber":
      return "Commission barber mode keeps Home on today, Calendar on time control, Checkout on real money, Profile on public reputation, and Settings on private setup.";
    case "booth_rent_barber":
      return "Booth-rent mode keeps Home on today, Calendar on live availability, Checkout on independent money clarity, Profile on discovery identity, and Settings on compliance.";
    case "client":
      return "Client mode keeps booking, favorites, rewards, and appointment activity visible without any shop-internal clutter.";
    default:
      return "Relevant tools only.";
  }
}

function getLocationScopeLabel(role: Role) {
  switch (role) {
    case "owner":
      return "Business footprint";
    case "manager":
      return "Assigned shop";
    case "front_desk":
      return "Desk coverage";
    case "commission_barber":
    case "booth_rent_barber":
      return "Chair territory";
    case "client":
      return "Preferred shop";
    default:
      return "Location scope";
  }
}

function getAlertLabel(role: Role) {
  switch (role) {
    case "owner":
      return "Owner account ready";
    case "manager":
      return "No manager alerts yet";
    case "front_desk":
      return "No queue alerts yet";
    case "commission_barber":
    case "booth_rent_barber":
      return "No chair alerts yet";
    case "client":
      return "No booking reminders yet";
    default:
      return "No alerts yet";
  }
}

function getNavigationCountLabel(role: Role, count: number) {
  if (role === "owner" || role === "commission_barber" || role === "booth_rent_barber") {
    return `${count} tabs`;
  }

  return `${count} lanes`;
}

function getHeroNavigationCountLabel(role: Role, count: number) {
  if (role === "owner") {
    return `${count} owner tabs`;
  }

  if (role === "commission_barber" || role === "booth_rent_barber") {
    return `${count} barber tabs`;
  }

  return `${count} launch lanes`;
}

function getUtilityCards(user: UserAccount): UtilityCard[] {
  switch (user.role) {
    case "owner":
      return [
        { label: "Owner tabs", value: user.appApprovalStatus?.replaceAll("_", " ") ?? "ready", detail: "Home, Team, Schedule, Money, and Settings all stay tied to this authenticated owner account.", icon: ShieldCheck },
        { label: "Shop scope", value: user.ownedShopId ? "1" : "0", detail: user.ownedShopId ? "One shop linked to this account" : "Create or attach a shop lane", icon: MapPinned },
        { label: "Controls", value: "Live", detail: "Revenue, team, schedule, and private setup stay separated by tab.", icon: WalletCards }
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
    case "commission_barber":
    case "booth_rent_barber":
      return [
        { label: "Barber lane", value: user.barberSubtype?.replaceAll("_", " ") ?? "ready", detail: "Home, Calendar, Checkout, Profile, and Settings all stay tied to this authenticated barber account.", icon: CalendarDays },
        { label: "Approval", value: user.appApprovalStatus?.replaceAll("_", " ") ?? "ready", detail: user.shopApprovalStatus && user.shopApprovalStatus !== "not_required" ? `Shop approval ${user.shopApprovalStatus.replaceAll("_", " ")}` : "No extra shop approval required", icon: ShieldCheck },
        { label: "Chair scope", value: String(user.locationIds.length), detail: "Assigned locations, payout posture, and availability scope on this session", icon: WalletCards }
      ];
    case "client":
      return [
        { label: "Client lane", value: "Ready", detail: "This account starts clean with no seeded rewards or booking history.", icon: CalendarDays },
        { label: "Preferences", value: "Fresh", detail: "Favorites, points, and history will build from real activity.", icon: Sparkles },
        { label: "Profile", value: "Connected", detail: "Your dashboard now follows the authenticated account only.", icon: UserRound }
      ];
    default:
      return [{ label: "Workspace", value: "Ready", detail: "Role-aware view", icon: Sparkles }];
  }
}

function getNotificationsHref(role: Role): ComponentProps<typeof Link>["href"] {
  switch (role) {
    case "owner":
      return "/dashboard/owner/money";
    case "manager":
    case "front_desk":
      return "/queue";
    case "commission_barber":
    case "booth_rent_barber":
      return "/dashboard/barber/calendar";
    case "client":
      return "/activity";
    default:
      return "/dashboard";
  }
}

function getMessagesHref(role: Role): ComponentProps<typeof Link>["href"] {
  switch (role) {
    case "client":
      return "/messages";
    case "owner":
    case "manager":
    case "front_desk":
    case "commission_barber":
    case "booth_rent_barber":
      return "/workspace/messages";
    default:
      return "/workspace/profile";
  }
}

function getProfileHref(role: Role): ComponentProps<typeof Link>["href"] {
  if (role === "owner") {
    return "/dashboard/owner/settings";
  }

  if (role === "client") {
    return "/profile";
  }

  if (role === "commission_barber" || role === "booth_rent_barber") {
    return "/dashboard/barber/profile";
  }

  return "/workspace/profile";
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
  if (user.role === "client") {
    return null;
  }

  if (user.role === "owner") {
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

  if (user.role === "commission_barber" || user.role === "booth_rent_barber") {
    const appStatus = formatApprovalStatus(user.appApprovalStatus);
    const shopStatus = user.shopApprovalStatus && user.shopApprovalStatus !== "not_required"
      ? formatApprovalStatus(user.shopApprovalStatus)
      : null;
    if ((!appStatus || user.appApprovalStatus === "approved") && (!shopStatus || user.shopApprovalStatus === "approved")) {
      return null;
    }

    const subtypeLabel = user.barberSubtype === "commission"
      ? "Commission barber"
      : user.barberSubtype === "blueprint"
        ? "Blueprint barber"
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
  children
}: {
  user: UserAccount;
  title: string;
  subtitle: string;
  activeHref?: string;
  children: React.ReactNode;
}) {
  const nav = getNavigation(user);
  const activeRole = getUserRoleLabel(user);
  const ownerShopName = user.role === "owner" ? user.ownedShopName?.trim() || null : null;
  const primaryShellIdentity = ownerShopName ?? "BVRB3R Platform";
  const mobileWorkspaceLabel = ownerShopName ?? `${activeRole} workspace`;
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

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5 lg:pb-5">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[290px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="hidden h-fit rounded-[34px] bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(8,8,8,0.98))] p-4 lg:sticky lg:top-4 lg:block">
          <div className="rounded-[28px] border border-[#7CFF00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(124,255,0,0.04))] p-5">
            <p className="surface-label text-[#cfff93]">The BVRB3R Shop(TM)</p>
            <h1 className="mt-3 text-3xl font-semibold" data-display="true" data-testid="shell-business-name">{primaryShellIdentity}</h1>
            <p className="mt-4 text-sm text-white/60" data-testid="shell-identity-name">{user.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/40" data-testid="shell-identity-title">{user.title}</p>
            <div className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#cfff93]" data-testid="shell-identity-role">
              Active role: {activeRole}
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(8,8,8,0.96))] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full border border-[#7CFF00]/18 bg-[#7CFF00]/10 p-2 text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="surface-label">{getPrimaryFocusLabel(user.role)}</p>
                <p className="mt-3 text-sm leading-6 text-white/82">{getPrimaryActionTitle(user.role)}</p>
                <p className="mt-3 text-sm leading-6 text-white/54">{getBoundaryCopy(user.role)}</p>
              </div>
            </div>
          </div>

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
                    <Icon className="mt-1 h-5 w-5 text-[#baff69]" />
                  </div>
                </div>
              );
            })}
          </div>

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
                        ? "border-[#7CFF00]/28 bg-[linear-gradient(135deg,rgba(124,255,0,0.16),rgba(16,16,16,0.94))] text-white shadow-[0_18px_40px_rgba(124,255,0,0.08)]"
                        : "border-white/6 bg-black/20 text-white/72 hover:border-[#7CFF00]/20 hover:bg-[#121212] hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={cn("h-4 w-4 transition", isActive ? "text-[#d7ffab]" : "text-[#baff69] group-hover:scale-105")} />
                      {item.label}
                    </span>
                    {isActive ? <ArrowUpRight className="h-4 w-4 text-[#d7ffab]" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/12 transition group-hover:bg-[#7cff00]" />}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(26,26,26,0.9),rgba(10,10,10,0.96))] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">{getLocationScopeLabel(user.role)}</p>
              <MapPinned className="h-4 w-4 text-[#baff69]" />
            </div>
            <div className="mt-4 space-y-3 text-sm text-white/78">
              {visibleLocations.length ? visibleLocations.map((location) => (
                <div key={location.id} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/6 bg-black/25 px-3 py-3">
                  <span>{location.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[#cfff93]">{location.city}</span>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/25 px-3 py-3 text-white/52">
                  No assigned locations yet.
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-4 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href={nav[0]?.href ?? getDefaultRouteForUser(user)} className="flex min-w-0 items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#7CFF00]/20 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(15,15,15,0.96))] text-sm font-semibold tracking-[0.22em] text-[#d7ffab] shadow-[0_16px_34px_rgba(124,255,0,0.14)]">
                  BV
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.26em] text-[#cfff93]">BVRB3R</p>
                  <p className="mt-1 truncate text-sm font-medium text-white/74" data-testid="shell-mobile-business-name">{mobileWorkspaceLabel}</p>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link href={notificationsHref} aria-label="Open notifications" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
                  <Bell className="h-5 w-5" />
                </Link>
                <Link href={messagesHref} aria-label="Open messages or support" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
                  <MessageSquareText className="h-5 w-5" />
                </Link>
                <Link href={profileHref} aria-label="Open profile" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
                  <UserRound className="h-5 w-5" />
                </Link>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white/68" data-testid="shell-mobile-identity-name">{user.name}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/40" data-testid="shell-mobile-identity-title">{user.title}</p>
              </div>
              <div className="rounded-[20px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 px-3 py-3 text-right">
                <p className="surface-label text-[#d7ffab]">Active role</p>
                <p className="mt-2 text-sm font-medium text-white" data-testid="shell-mobile-identity-role">{activeRole}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">{getPrimaryFocusLabel(user.role)}</p>
              <p className="mt-3 text-lg font-semibold leading-7 text-white">{getPrimaryActionTitle(user.role)}</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{getBoundaryCopy(user.role)}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {utilityCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={`mobile-${card.label}`} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="surface-label">{card.label}</p>
                        <p className="mt-3 text-xl font-semibold text-white">{card.value}</p>
                        <p className="mt-2 text-sm leading-6 text-white/56">{card.detail}</p>
                      </div>
                      <Icon className="mt-1 h-4 w-4 text-[#baff69]" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-white/48">
              {visibleLocations.length ? visibleLocations.map((location) => (
                <span key={`mobile-location-${location.id}`} className="status-pill text-white/72">{location.name}</span>
              )) : <span className="status-pill text-white/52">No assigned locations yet</span>}
            </div>
          </Card>

          <Card className="rounded-[34px] bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(8,8,8,0.98))] p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="editorial-kicker">
                  <span className="accent-rule" />
                  {getPrimaryFocusLabel(user.role)}
                </div>
                <h2 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{title}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">{subtitle}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[30rem] lg:self-start xl:w-auto">
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Operating as</p>
                  <p className="mt-3 text-lg font-medium">{activeRole}</p>
                  <p className="mt-2 text-sm text-white/56">{getAlertLabel(user.role)}</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/68">
                    <Bell className="h-4 w-4 text-[#baff69]" />
                    {getHeroNavigationCountLabel(user.role, nav.length)}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/56">{getBoundaryCopy(user.role)}</p>
                </div>
              </div>
            </div>
          </Card>
          {approvalBanner ? (
            <Card className="rounded-[30px] border border-[#cfff93]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.08),rgba(10,10,10,0.98))] p-5 sm:p-6">
              <p className="surface-label text-[#d7ffab]">{approvalBanner.eyebrow}</p>
              <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-2xl font-semibold text-white">{approvalBanner.title}</p>
                  <p className="mt-3 text-sm leading-7 text-white/66">{approvalBanner.detail}</p>
                </div>
                <Link
                  href={approvalBanner.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/34 bg-[#7cff00]/10 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e8ffc2] transition hover:border-[#cfff93]/52 hover:bg-[#7cff00]/16"
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
        <div className="mobile-dock mx-auto max-w-7xl rounded-[28px] border border-white/10 px-3 py-3 shadow-[0_22px_44px_rgba(0,0,0,0.42)]">
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
                    "flex min-w-[4.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-[22px] border px-2.5 py-3 text-center transition sm:min-w-[5.5rem] sm:px-3",
                    isActive
                      ? "border-[#7CFF00]/26 bg-[#7CFF00]/10 text-white"
                      : "border-white/8 bg-black/18 text-white/66 hover:border-[#7CFF00]/20 hover:text-white"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-[#d7ffab]" : "text-[#baff69]")} />
                  <span aria-hidden="true" className="text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.18em]">{item.mobileLabel ?? item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}





