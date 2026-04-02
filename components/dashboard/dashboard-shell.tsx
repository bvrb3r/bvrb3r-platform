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
import { Card } from "@/components/ui/card";
import { getDefaultRouteForUser, getUserRoleLabel } from "@/lib/auth/demo-auth";
import { auditLogs, demoAppointments, demoBarbers, demoClients, demoLocations, demoWalkIns, ownerKpis } from "@/lib/data/demo";
import { cn, currency, dateLabel } from "@/lib/utils";
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

function getNavigation(user: UserAccount): NavItem[] {
  switch (user.role) {
    case "owner":
      return [
        { href: "/dashboard/owner", activeHref: "/dashboard/owner", label: "Dashboard", icon: LayoutDashboard },
        { href: "/team", activeHref: "/team", label: "Team", icon: Users },
        { href: "/appointments", activeHref: "/appointments", label: "Schedule", icon: CalendarDays },
        { href: { pathname: "/reports", query: { view: "money" } }, activeHref: "/reports?view=money", label: "Money", icon: WalletCards },
        { href: { pathname: "/reports", query: { view: "growth" } }, activeHref: "/reports?view=growth", label: "Growth", icon: Sparkles },
        { href: "/settings", activeHref: "/settings", label: "Settings", icon: ShieldCheck }
      ];
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
      return [
        { href: "/dashboard/barber", activeHref: "/dashboard/barber", label: "Home", icon: CalendarDays },
        { href: "/command", activeHref: "/command", label: "Command", icon: LayoutDashboard },
        { href: "/earnings", activeHref: "/earnings", label: "Earnings", icon: WalletCards },
        { href: "/clients", activeHref: "/clients", label: "Clients", icon: Users },
        { href: "/workspace/profile", activeHref: "/workspace/profile", label: "Profile", icon: UserRound }
      ];
    case "client":
      return [
        { href: "/dashboard/client", activeHref: "/dashboard/client", label: "Home", mobileLabel: "Home", icon: LayoutDashboard },
        { href: "/search", activeHref: "/search", label: "Search", icon: Sparkles },
        { href: "/bookings", activeHref: "/bookings", label: "Bookings", icon: CalendarDays },
        { href: "/activity", activeHref: "/activity", label: "Rewards", icon: ClipboardList },
        { href: "/profile", activeHref: "/profile", label: "Profile", icon: UserRound }
      ];
    default:
      return [{ href: getDefaultRouteForUser(user), activeHref: getDefaultRouteForUser(user), label: "Dashboard", icon: LayoutDashboard }];
  }
}

function getPrimaryFocusLabel(role: Role) {
  switch (role) {
    case "owner":
      return "Owner command";
    case "manager":
      return "Operations overview";
    case "front_desk":
      return "Check-in workflow";
    case "commission_barber":
    case "booth_rent_barber":
      return "Chair calendar";
    case "client":
      return "Client home";
    default:
      return "Workspace";
  }
}

function getPrimaryActionTitle(role: Role) {
  switch (role) {
    case "owner":
      return "See the floor, trust the money, and drive the next growth move from one clean owner lane.";
    case "manager":
      return "Keep schedule, queue, and attendance moving without opening owner-only controls.";
    case "front_desk":
      return "Move arrivals from the door to the right chair without friction.";
    case "commission_barber":
    case "booth_rent_barber":
      return "Home runs the calendar, Command controls the chair, and Earnings keeps money clear.";
    case "client":
      return "Search, book, and manage visits without stepping into shop ops.";
    default:
      return "Stay oriented and move on the next action fast.";
  }
}

function getBoundaryCopy(role: Role) {
  switch (role) {
    case "owner":
      return "Owner mode keeps all-shop visibility, protected money controls, team posture, and growth actions together without exposing raw operator clutter.";
    case "manager":
      return "Manager mode keeps the floor visible while ownership financial controls, payout rules, and transfer rights stay protected.";
    case "front_desk":
      return "Front desk mode stays focused on queue movement, guest support, check-in flow, and handoff clarity.";
    case "commission_barber":
      return "Commission barber mode keeps Home on the schedule, Command on chair control, and Earnings on real money only.";
    case "booth_rent_barber":
      return "Booth-rent mode keeps Home on the calendar, Command on live chair control, and Earnings on independent money clarity.";
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
      return "Owner visibility is live";
    case "manager":
      return "4 floor alerts pending";
    case "front_desk":
      return "5 queue actions pending";
    case "commission_barber":
    case "booth_rent_barber":
      return "2 chair updates pending";
    case "client":
      return "1 booking reminder pending";
    default:
      return "3 alerts pending";
  }
}

function getUtilityCards(user: UserAccount): UtilityCard[] {
  switch (user.role) {
    case "owner":
      return [
        { label: "Revenue today", value: ownerKpis[0]?.value ?? "$0", detail: ownerKpis[0]?.delta ?? "Executive pulse", icon: WalletCards },
        { label: "Assigned barbers", value: String(demoBarbers.filter((barber) => barber.locationIds.some((locationId) => user.locationIds.includes(locationId))).length), detail: "Across active locations", icon: Users },
        { label: "Open issues", value: String(auditLogs.filter((item) => item.severity !== "info").length), detail: "Needs ownership review", icon: ShieldCheck }
      ];
    case "manager": {
      const appointments = demoAppointments.filter((appointment) => user.locationIds.includes(appointment.locationId));
      const walkIns = demoWalkIns.filter((entry) => user.locationIds.includes(entry.locationId));
      const activeBarbers = demoBarbers.filter((barber) => barber.locationIds.some((locationId) => user.locationIds.includes(locationId)));

      return [
        { label: "Bookings today", value: String(appointments.length), detail: "Scheduled service flow", icon: CalendarDays },
        { label: "Walk-ins", value: String(walkIns.length), detail: "Queue pressure right now", icon: Clock3 },
        { label: "Barbers online", value: String(activeBarbers.length), detail: "Coverage across the floor", icon: Users }
      ];
    }
    case "front_desk": {
      const waiting = demoWalkIns.filter((entry) => user.locationIds.includes(entry.locationId) && entry.status === "waiting").length;
      const checkedIn = demoAppointments.filter((appointment) => user.locationIds.includes(appointment.locationId) && appointment.status === "checked_in").length;
      const nextArrival = demoAppointments
        .filter((appointment) => user.locationIds.includes(appointment.locationId) && appointment.status === "booked")
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0];

      return [
        { label: "Waiting guests", value: String(waiting), detail: "Need check-in or assignment", icon: Clock3 },
        { label: "Checked in", value: String(checkedIn), detail: "Already in the shop", icon: CalendarDays },
        { label: "Next arrival", value: nextArrival ? dateLabel(nextArrival.start) : "Open", detail: nextArrival ? nextArrival.chair : "No arrival pressure", icon: Sparkles }
      ];
    }
    case "commission_barber":
    case "booth_rent_barber": {
      const barber = demoBarbers.find((entry) => entry.id === user.barberId);
      const nextAppointment = demoAppointments
        .filter((appointment) => appointment.barberId === user.barberId && ["booked", "checked_in", "in_service"].includes(appointment.status))
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0];
      const nextClient = demoClients.find((client) => client.id === nextAppointment?.clientId);

      return [
        { label: "Next guest", value: nextClient?.name ?? "Open chair", detail: nextAppointment ? dateLabel(nextAppointment.start) : "No one waiting yet", icon: CalendarDays },
        { label: "Today earned", value: currency(barber?.todayEarnings ?? 0), detail: barber?.compensationModel === "booth_rent" ? "Independent chair revenue" : "Commission-ready revenue", icon: WalletCards },
        { label: "Chair rating", value: barber ? barber.rating.toFixed(1) : "4.8", detail: barber ? `${barber.reviewCount} total reviews` : "Marketplace trust", icon: ShieldCheck }
      ];
    }
    case "client":
      return [
        { label: "Upcoming", value: "1", detail: "Next visit saved", icon: CalendarDays },
        { label: "Favorites", value: "3", detail: "Trusted barbers nearby", icon: Users },
        { label: "Rewards", value: "220", detail: "Client loyalty points", icon: Sparkles }
      ];
    default:
      return [{ label: "Workspace", value: "Ready", detail: "Role-aware view", icon: Sparkles }];
  }
}

function getNotificationsHref(role: Role): ComponentProps<typeof Link>["href"] {
  switch (role) {
    case "owner":
      return { pathname: "/reports", query: { view: "money" } };
    case "manager":
    case "front_desk":
      return "/queue";
    case "commission_barber":
    case "booth_rent_barber":
      return "/appointments";
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
  return role === "client" ? "/profile" : "/workspace/profile";
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
  const visibleLocations = demoLocations.filter((location) => user.locationIds.includes(location.id));
  const utilityCards = getUtilityCards(user);
  const notificationsHref = getNotificationsHref(user.role);
  const messagesHref = getMessagesHref(user.role);
  const profileHref = getProfileHref(user.role);

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5 lg:pb-5">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[290px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="hidden h-fit rounded-[34px] bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(8,8,8,0.98))] p-4 lg:sticky lg:top-4 lg:block">
          <div className="rounded-[28px] border border-[#7CFF00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(124,255,0,0.04))] p-5">
            <p className="surface-label text-[#cfff93]">The BVRB3R Shop(TM)</p>
            <h1 className="mt-3 text-3xl font-semibold" data-display="true">BVRB3R Platform</h1>
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
                {nav.length} lanes
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
                  <p className="mt-1 truncate text-sm font-medium text-white/74">{activeRole} workspace</p>
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
                    {nav.length} launch lanes
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/56">{getBoundaryCopy(user.role)}</p>
                </div>
              </div>
            </div>
          </Card>
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





