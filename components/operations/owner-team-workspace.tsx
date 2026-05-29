"use client";

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Mail,
  MoreVertical,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Users,
  X
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, FilterChip, GlassCard, SearchBar } from "@/design/components";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import {
  useCreateOwnerTeamInviteMutation,
  useOwnerTeamInviteDirectoryQuery,
  useShopDashboardQuery,
  type ShopDashboardAppointment,
  type ShopDashboardBarberSummary
} from "@/lib/operations/barber-client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type StatusKind = "active" | "idle" | "offline" | "pending";
type TeamFilter = "all" | "active" | "idle" | "offline";
type SortKey = "top" | "revenue" | "bookings" | "utilization" | "rating" | "status";

type TeamBarberView = {
  id: string;
  name: string;
  initials: string;
  roleLabel: string;
  statusKind: StatusKind;
  statusLabel: string;
  statusDetail: string;
  todayBookings: number | null;
  todayPostedAmount: number | null;
  utilization: number | null;
  rating: number | null;
  nextAppointmentStart: string | null;
  currentShopLabel: string | null;
  payoutStatus: string;
  payoutReadinessStatus: string;
  payoutBlockReason: string | null;
  searchText: string;
};

type MetricCardProps = {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  tone?: "green" | "amber" | "neutral";
  onClick?: () => void;
};

const filterOptions: Array<{ key: TeamFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "idle", label: "Idle" },
  { key: "offline", label: "Offline" }
];

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "top", label: "Top Performers" },
  { key: "revenue", label: "Revenue" },
  { key: "bookings", label: "Bookings" },
  { key: "utilization", label: "Utilization" },
  { key: "rating", label: "Rating" },
  { key: "status", label: "Status" }
];

function formatTime(iso: string | null) {
  if (!iso) {
    return "No booking queued";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRoutingLabel(value: string) {
  switch (value) {
    case "booth_rent":
      return "Booth rent";
    case "commission":
      return "Commission";
    case "freelance":
      return "Freelance";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function getOptionalNumericField(source: object, keys: string[]) {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getCompletedAppointmentRevenue(appointment: ShopDashboardAppointment) {
  if (appointment.status !== "completed") {
    return 0;
  }

  return appointment.totalAmount + appointment.tipAmount;
}

function getStatusKind({
  barber,
  isActive,
  onboardingStatus,
  payoutReadinessStatus,
  payoutBlockReason
}: {
  barber: ShopDashboardBarberSummary;
  isActive: boolean;
  onboardingStatus?: string;
  payoutReadinessStatus: string;
  payoutBlockReason: string | null;
}): StatusKind {
  const verificationReason = `${onboardingStatus ?? ""} ${payoutReadinessStatus} ${payoutBlockReason ?? ""}`.toLowerCase();
  if (
    onboardingStatus === "invited"
    || onboardingStatus === "pending"
    || onboardingStatus === "submitted"
    || verificationReason.includes("verification")
  ) {
    return "pending";
  }

  if (isActive || barber.liveAppointmentCount > 0 || barber.activeAppointmentCount > 0) {
    return "active";
  }

  if (barber.utilization > 0 || barber.bookedCount > 0 || barber.completedCount > 0 || barber.nextAppointmentStart) {
    return "idle";
  }

  return "offline";
}

function getStatusCopy(kind: StatusKind) {
  switch (kind) {
    case "active":
      return "Active";
    case "idle":
      return "Idle";
    case "offline":
      return "Offline";
    case "pending":
      return "Pending Verification";
  }
}

function getStatusDetail(kind: StatusKind, barber: ShopDashboardBarberSummary, reason: string | null) {
  switch (kind) {
    case "active":
      return barber.liveAppointmentCount > 0
        ? `${barber.liveAppointmentCount} live service${barber.liveAppointmentCount === 1 ? "" : "s"} in motion`
        : "Working or available in today's shop lane.";
    case "idle":
      return barber.nextAppointmentStart ? `Next booking at ${formatTime(barber.nextAppointmentStart)}.` : "Available capacity needs owner attention.";
    case "offline":
      return "Not active on the floor right now.";
    case "pending":
      return reason ?? "Verification or payout readiness is still pending.";
  }
}

function getStatusClasses(kind: StatusKind) {
  switch (kind) {
    case "active":
      return "bg-[#A3FF12] text-[#A3FF12]";
    case "idle":
      return "bg-amber-300 text-amber-300";
    case "offline":
      return "bg-white/45 text-white/58";
    case "pending":
      return "bg-sky-400 text-sky-300";
  }
}

function getUtilizationTone(value: number | null, statusKind: StatusKind) {
  if (statusKind === "pending" || value === null) {
    return "neutral";
  }

  if (value >= 65) {
    return "green";
  }

  if (value >= 40) {
    return "amber";
  }

  return "neutral";
}

function getSortValue(barber: TeamBarberView, sortKey: SortKey) {
  switch (sortKey) {
    case "revenue":
      return barber.todayPostedAmount ?? -1;
    case "bookings":
      return barber.todayBookings ?? -1;
    case "utilization":
      return barber.utilization ?? -1;
    case "rating":
      return barber.rating ?? -1;
    case "status":
      return ["active", "idle", "pending", "offline"].indexOf(barber.statusKind);
    case "top":
      return (barber.todayPostedAmount ?? 0) + (barber.todayBookings ?? 0) * 100 + (barber.utilization ?? 0);
  }
}

function MetricSkeleton() {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
      <Skeleton className="mx-auto h-10 w-10 rounded-full" />
      <Skeleton className="mx-auto mt-7 h-8 w-14" />
      <Skeleton className="mx-auto mt-3 h-4 w-24" />
    </div>
  );
}

function MetricCard({ icon, value, label, tone = "green", onClick }: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[11rem] rounded-[22px] border border-white/9 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)] transition hover:-translate-y-0.5 hover:border-[#A3FF12]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70"
    >
      <span
        className={cn(
          "mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] border shadow-[0_0_20px_rgba(163,255,18,0.16)]",
          tone === "green" && "border-[#A3FF12]/25 bg-[#A3FF12]/12 text-[#A3FF12]",
          tone === "amber" && "border-amber-300/25 bg-amber-300/10 text-amber-300",
          tone === "neutral" && "border-white/12 bg-white/[0.04] text-white/65"
        )}
      >
        {icon}
      </span>
      <span className="mt-6 block text-4xl font-black tracking-[-0.055em] text-white">{value}</span>
      <span className="mt-2 block text-base font-semibold text-white/70">{label}</span>
    </button>
  );
}

function SectionEmptyState({
  title,
  detail,
  action
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <GlassCard className="p-6">
      <p className="text-xl font-extrabold text-white">{title}</p>
      <p className="mt-2 text-sm text-white/58">{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </GlassCard>
  );
}

function TeamActionLink({
  href,
  children
}: {
  href: ComponentProps<typeof Link>["href"];
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[14px] px-3 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white/[0.05] hover:text-[#A3FF12]"
    >
      {children}
    </Link>
  );
}

export function OwnerTeamWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const fintechQuery = useFintechManagementQuery();
  const [searchValue, setSearchValue] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TeamFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("top");
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const inviteDirectoryQuery = useOwnerTeamInviteDirectoryQuery(inviteSearch, inviteModalOpen);
  const createInviteMutation = useCreateOwnerTeamInviteMutation();

  const isInitialLoading =
    (shopQuery.isLoading && !shopQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data);

  const errorMessage = shopQuery.error ?? fintechQuery.error;
  const inviteErrorMessage = inviteDirectoryQuery.error ? getReadableActionError(inviteDirectoryQuery.error) : null;

  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const activeBarbers = useMemo(() => shopQuery.data?.activeBarbers ?? [], [shopQuery.data?.activeBarbers]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const memberships = useMemo(() => fintechQuery.data?.memberships ?? [], [fintechQuery.data?.memberships]);
  const barberAccounts = useMemo(() => fintechQuery.data?.barbers ?? [], [fintechQuery.data?.barbers]);

  const team = useMemo(() => {
    const activeBarberIds = new Set(activeBarbers.map((barber) => barber.id));

    return barbers.map((barber): TeamBarberView => {
      const membership = memberships.find((entry) => entry.barberId === barber.id);
      const account = barberAccounts.find((entry) => entry.barberId === barber.id);
      const payoutReadinessStatus = account?.payoutReadinessStatus ?? "not_ready";
      const payoutBlockReason = membership?.payoutBlockReason ?? account?.missingSteps?.[0] ?? account?.disabledReason ?? null;
      const statusKind = getStatusKind({
        barber,
        isActive: activeBarberIds.has(barber.id),
        onboardingStatus: account?.onboardingStatus,
        payoutReadinessStatus,
        payoutBlockReason
      });
      const todayPostedAmount = appointments
        .filter((appointment) => appointment.barberId === barber.id)
        .reduce((sum, appointment) => sum + getCompletedAppointmentRevenue(appointment), 0);
      const rating = getOptionalNumericField(barber, ["averageRating", "rating", "reviewRating"]);
      const todayBookings = barber.bookedCount + barber.activeAppointmentCount + barber.liveAppointmentCount + barber.completedCount;
      const roleLabel = formatRoutingLabel(membership?.routingModel ?? barber.compensationModel);
      const statusLabel = getStatusCopy(statusKind);
      const currentShopLabel = membership?.shopLabel ?? account?.shopLabel ?? null;

      return {
        id: barber.id,
        name: barber.name,
        initials: getInitials(barber.name),
        roleLabel,
        statusKind,
        statusLabel,
        statusDetail: getStatusDetail(statusKind, barber, payoutBlockReason),
        todayBookings: statusKind === "pending" ? null : todayBookings,
        todayPostedAmount: statusKind === "pending" ? null : todayPostedAmount,
        utilization: statusKind === "pending" ? null : barber.utilization,
        rating,
        nextAppointmentStart: barber.nextAppointmentStart,
        payoutStatus: formatStatusLabel(account?.operationalStatus ?? "not_ready"),
        payoutReadinessStatus: formatStatusLabel(payoutReadinessStatus),
        payoutBlockReason,
        currentShopLabel,
        searchText: `${barber.name} ${roleLabel} ${statusLabel} ${currentShopLabel ?? ""}`.toLowerCase()
      };
    });
  }, [activeBarbers, appointments, barberAccounts, barbers, memberships]);

  const filteredTeam = useMemo(() => {
    const search = searchValue.trim().toLowerCase();

    return team
      .filter((barber) => {
        if (activeFilter !== "all" && barber.statusKind !== activeFilter) {
          return false;
        }

        return search ? barber.searchText.includes(search) : true;
      })
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);

        if (sortKey === "status") {
          return leftValue - rightValue || left.name.localeCompare(right.name);
        }

        return rightValue - leftValue || left.name.localeCompare(right.name);
      });
  }, [activeFilter, searchValue, sortKey, team]);

  const selectedBarber = team.find((barber) => barber.id === selectedBarberId) ?? null;
  const ratings = team.map((barber) => barber.rating).filter((rating): rating is number => rating !== null);
  const averageRating = ratings.length
    ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
    : "-";
  const activeCount = team.filter((barber) => barber.statusKind === "active").length;
  const idleCount = team.filter((barber) => barber.statusKind === "idle").length;
  const offlineCount = team.filter((barber) => barber.statusKind === "offline").length;
  const activeSortLabel = sortOptions.find((option) => option.key === sortKey)?.label ?? "Top Performers";

  async function handleCreateInvite(barberId: string) {
    setInviteFeedback(null);
    try {
      const response = await createInviteMutation.mutateAsync({
        barberId,
        shopId: inviteDirectoryQuery.data?.shop.id
      });
      setInviteFeedback({
        tone: "success",
        message: `Invite sent to ${response.invite.barberName}. They can accept or decline it from their Barber More tab.`
      });
    } catch (error) {
      setInviteFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  return (
    <div className="space-y-7" data-testid="owner-team-workspace">
      <header className="flex items-start justify-between gap-5">
        <div>
          <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl" data-display="true">
            Team
          </h1>
          <p className="mt-3 text-lg font-medium text-white/68">Manage your barbers & team performance</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            Phase 2 relationship controls will live here. Today, this tab keeps team readiness, payouts, and shop membership status easy to scan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteModalOpen(true)}
          className="inline-flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-full border border-[#A3FF12]/45 bg-[linear-gradient(135deg,#A3FF12_0%,#7DCE00_100%)] px-5 text-sm font-black text-black shadow-[0_16px_42px_rgba(163,255,18,0.3)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 sm:px-7 sm:text-base"
        >
          <Plus className="h-5 w-5" />
          Invite Barber
        </button>
      </header>

      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}
      {inviteFeedback && !inviteModalOpen ? <FeedbackBanner tone={inviteFeedback.tone} message={inviteFeedback.message} /> : null}

      <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <SearchBar
          aria-label="Search barbers"
          placeholder="Search barbers..."
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="min-h-[4.25rem] rounded-[22px] px-5 text-lg"
        />
        <details className="group relative">
          <summary className="inline-flex min-h-[4.25rem] w-full cursor-pointer list-none items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.035] px-5 text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 sm:w-[4.875rem]" aria-label="Open team filters">
            <Filter className="h-6 w-6" />
          </summary>
          <GlassCard className="absolute right-0 z-20 mt-3 w-72 p-4">
            <p className="px-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#A3FF12]">Status</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {filterOptions.map((option) => (
                <button
                  key={`sheet-${option.key}`}
                  type="button"
                  onClick={() => setActiveFilter(option.key)}
                  className={cn(
                    "rounded-[14px] border px-3 py-3 text-sm font-bold transition",
                    activeFilter === option.key
                      ? "border-[#A3FF12]/45 bg-[#A3FF12] text-black"
                      : "border-white/10 bg-black/20 text-white/72 hover:border-[#A3FF12]/25 hover:text-white"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-5 px-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#A3FF12]">Sort by</p>
            <div className="mt-3 space-y-1">
              {sortOptions.map((option) => (
                <button
                  key={`sheet-sort-${option.key}`}
                  type="button"
                  onClick={() => setSortKey(option.key)}
                  className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white/[0.05] hover:text-white"
                >
                  {option.label}
                  {sortKey === option.key ? <span className="h-2 w-2 rounded-full bg-[#A3FF12]" /> : null}
                </button>
              ))}
            </div>
          </GlassCard>
        </details>
      </section>

      <section className="flex flex-wrap gap-3">
        {filterOptions.map((option) => (
          <FilterChip
            key={option.key}
            active={activeFilter === option.key}
            onClick={() => setActiveFilter(option.key)}
            className="h-12 px-6 text-base"
          >
            {option.label}
          </FilterChip>
        ))}
        <details className="group relative">
          <summary className="inline-flex h-12 min-w-[13.75rem] cursor-pointer list-none items-center justify-between gap-3 rounded-full border border-white/10 bg-white/[0.035] px-6 text-base font-bold text-white/78 transition hover:border-[#A3FF12]/28 hover:text-white">
            {activeSortLabel}
            <ChevronDown className="h-5 w-5" />
          </summary>
          <GlassCard className="absolute left-0 z-20 mt-3 w-64 p-3">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSortKey(option.key)}
                className="flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white"
              >
                {option.label}
                {sortKey === option.key ? <span className="h-2 w-2 rounded-full bg-[#A3FF12]" /> : null}
              </button>
            ))}
          </GlassCard>
        </details>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {isInitialLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <MetricCard icon={<Users className="h-6 w-6" />} value={team.length} label="Total Barbers" onClick={() => setActiveFilter("all")} />
            <MetricCard icon={<span className="h-6 w-6 rounded-full bg-[#A3FF12]" />} value={activeCount} label="Active" onClick={() => setActiveFilter("active")} />
            <MetricCard icon={<Clock3 className="h-6 w-6" />} value={idleCount} label="Idle" tone="amber" onClick={() => setActiveFilter("idle")} />
            <MetricCard icon={<span className="h-6 w-6 rounded-full bg-white/50" />} value={offlineCount} label="Offline" tone="neutral" onClick={() => setActiveFilter("offline")} />
            <MetricCard icon={<Star className="h-6 w-6 fill-current" />} value={averageRating} label="Avg Rating" onClick={() => setSortKey("rating")} />
          </>
        )}
      </section>

      <GlassCard className="grid gap-4 p-5 md:grid-cols-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Relationship posture</p>
          <p className="mt-3 text-lg font-extrabold text-white">Commission / Booth Rent / Freelance</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Labels come from existing membership and compensation data. New Phase 2A controls are not active yet.</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Needs setup</p>
          <p className="mt-3 text-2xl font-black text-amber-300">{team.filter((barber) => barber.statusKind === "pending").length}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Verification, payout, or invite readiness.</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Connected team</p>
          <p className="mt-3 text-2xl font-black text-white">{team.length}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Visible in the owner scope today.</p>
        </div>
      </GlassCard>

      <section id="team-roster" className="space-y-3">
        <div className="hidden grid-cols-[minmax(13rem,1.5fr)_0.8fr_0.7fr_0.85fr_0.9fr_0.6fr_2.25rem] gap-4 px-4 text-xs font-black uppercase tracking-[0.12em] text-white/46 md:grid">
          <span>Barber</span>
          <span>Status</span>
          <span className="text-center">Today Bookings</span>
          <span className="text-center">Today Revenue</span>
          <span>Utilization</span>
          <span>Rating</span>
          <span />
        </div>

        {isInitialLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-[22px]" />
            <Skeleton className="h-24 rounded-[22px]" />
            <Skeleton className="h-24 rounded-[22px]" />
          </div>
        ) : !team.length ? (
          <SectionEmptyState
            title="No barbers assigned yet."
            detail="Invite barbers to connect your shop team."
            action={
              <button
                type="button"
                onClick={() => setInviteModalOpen(true)}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#A3FF12]/40 px-5 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/10"
              >
                Invite Barber
              </button>
            }
          />
        ) : !filteredTeam.length ? (
          <SectionEmptyState title="No barbers match this filter." detail="Try another status or search term." />
        ) : (
          filteredTeam.map((barber) => {
            const statusClasses = getStatusClasses(barber.statusKind);
            const utilizationTone = getUtilizationTone(barber.utilization, barber.statusKind);
            const isSelected = selectedBarber?.id === barber.id;

            return (
              <GlassCard key={barber.id} active={isSelected} className="p-0">
                <div className="grid gap-4 p-4 md:grid-cols-[minmax(13rem,1.5fr)_0.8fr_0.7fr_0.85fr_0.9fr_0.6fr_2.25rem] md:items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedBarberId(isSelected ? null : barber.id)}
                    className="flex min-w-0 items-center gap-4 rounded-[16px] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70"
                  >
                    <Avatar
                      alt={barber.name}
                      initials={barber.initials}
                      className={cn(
                        "h-16 w-16 border-2 text-base",
                        barber.statusKind === "active" && "border-[#A3FF12]/80 shadow-[0_0_18px_rgba(163,255,18,0.18)]",
                        barber.statusKind === "idle" && "border-amber-300/65",
                        barber.statusKind === "offline" && "border-white/18",
                        barber.statusKind === "pending" && "border-sky-400/70"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xl font-extrabold tracking-[-0.035em] text-white">{barber.name}</span>
                      <span className="mt-1 block truncate text-base font-medium text-white/62">{barber.roleLabel}</span>
                    </span>
                  </button>

                  <Link
                    href={barber.statusKind === "pending" ? "/dashboard/owner/settings?section=verification" : "/dashboard/owner/team"}
                    className={cn("inline-flex items-center gap-2 text-base font-extrabold", statusClasses.split(" ")[1])}
                  >
                    <span className={cn("h-3 w-3 rounded-full shadow-[0_0_12px_currentColor]", statusClasses.split(" ")[0])} />
                    {barber.statusLabel}
                  </Link>

                  <Link href={`/dashboard/owner/schedule?barberId=${encodeURIComponent(barber.id)}`} className="rounded-[14px] px-2 py-2 text-left text-xl font-bold text-white transition hover:bg-white/[0.04] md:text-center">
                    {barber.todayBookings ?? "-"}
                  </Link>

                  <Link href={`/dashboard/owner/money?barberId=${encodeURIComponent(barber.id)}`} className="rounded-[14px] px-2 py-2 text-left text-xl font-bold text-white transition hover:bg-white/[0.04] md:text-center">
                    {barber.todayPostedAmount === null ? "-" : currency(barber.todayPostedAmount)}
                  </Link>

                  <Link href={`/dashboard/owner/schedule?barberId=${encodeURIComponent(barber.id)}&view=utilization`} className="rounded-[14px] px-2 py-2 transition hover:bg-white/[0.04]">
                    <span className="block text-xl font-bold text-white">{barber.utilization === null ? "-" : `${barber.utilization}%`}</span>
                    <span className="mt-2 block h-2.5 overflow-hidden rounded-full bg-white/14">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          utilizationTone === "green" && "bg-[#A3FF12]",
                          utilizationTone === "amber" && "bg-amber-300",
                          utilizationTone === "neutral" && "bg-white/45"
                        )}
                        style={{ width: `${barber.utilization ?? 0}%` }}
                      />
                    </span>
                  </Link>

                  <Link href={`/dashboard/owner/team?barber=${encodeURIComponent(barber.id)}`} className="inline-flex items-center gap-2 rounded-[14px] px-2 py-2 text-xl font-bold text-white transition hover:bg-white/[0.04]">
                    {barber.rating === null ? (
                      "-"
                    ) : (
                      <>
                        <Star className="h-5 w-5 fill-amber-300 text-amber-300" />
                        {barber.rating.toFixed(1)}
                      </>
                    )}
                  </Link>

                  <details className="relative justify-self-start md:justify-self-end">
                    <summary className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/62 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]" aria-label={`Open actions for ${barber.name}`}>
                      <MoreVertical className="h-5 w-5" />
                    </summary>
                    <GlassCard className="absolute right-0 z-20 mt-2 w-56 p-2">
                      <TeamActionLink href={`/dashboard/owner/schedule?barberId=${encodeURIComponent(barber.id)}`}>
                        View Schedule
                      </TeamActionLink>
                      <TeamActionLink href={`/dashboard/owner/money?barberId=${encodeURIComponent(barber.id)}`}>
                        View Transactions
                      </TeamActionLink>
                      <TeamActionLink href={`/workspace/messages?threadWith=${encodeURIComponent(barber.id)}`}>
                        Message Barber
                      </TeamActionLink>
                      <TeamActionLink href={`/dashboard/owner/settings?section=compensation&barberId=${encodeURIComponent(barber.id)}`}>
                        Edit Role / Permissions
                      </TeamActionLink>
                    </GlassCard>
                  </details>
                </div>

                {isSelected ? (
                  <div className="border-t border-white/8 px-4 pb-4">
                    <div className="grid gap-3 rounded-[20px] border border-white/8 bg-black/24 p-4 text-sm text-white/62 md:grid-cols-[1fr_1fr_auto] md:items-center">
                      <div>
                        <p className="font-bold text-white">{barber.statusDetail}</p>
                        <p className="mt-1">Next up: {formatTime(barber.nextAppointmentStart)}</p>
                      </div>
                      <div>
                        <p className="font-bold text-white">Account health: {barber.payoutStatus}</p>
                        <p className="mt-1">{barber.payoutBlockReason ?? `Payout readiness ${barber.payoutReadinessStatus}.`}</p>
                      </div>
                      <Link href={`/dashboard/owner/money?barberId=${encodeURIComponent(barber.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#A3FF12]/40 px-4 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/10">
                        Inspect
                      </Link>
                    </div>
                  </div>
                ) : null}
              </GlassCard>
            );
          })
        )}
      </section>

      <Link href="/dashboard/owner/money" className="group block">
        <GlassCard className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[#A3FF12]/22 bg-[#A3FF12]/12 text-[#A3FF12] shadow-[0_0_24px_rgba(163,255,18,0.16)]">
            <BriefcaseBusiness className="h-7 w-7" />
          </span>
          <span>
            <span className="block text-2xl font-extrabold tracking-[-0.04em] text-white">Team Insights</span>
            <span className="mt-1 block text-base font-medium text-white/58">View performance trends & analytics</span>
          </span>
          <span className="inline-flex items-center gap-2 text-lg font-extrabold text-[#A3FF12]">
            View Insights
            <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </span>
        </GlassCard>
      </Link>

      {inviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/78 px-4 py-5 backdrop-blur-xl sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="owner-team-invite-title">
          <GlassCard className="max-h-[88vh] w-full max-w-3xl overflow-hidden p-0">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5 sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">Team invite</p>
                <h2 id="owner-team-invite-title" className="mt-2 text-3xl font-black tracking-[-0.045em] text-white">Invite a barber</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Search real barber accounts and send a canonical shop invite. Barbers join the team only after accepting.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close invite barber dialog"
                onClick={() => setInviteModalOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(88vh-9rem)] overflow-y-auto p-5 sm:p-6">
              {inviteFeedback ? <FeedbackBanner tone={inviteFeedback.tone} message={inviteFeedback.message} /> : null}
              {inviteErrorMessage ? <FeedbackBanner tone="error" message={inviteErrorMessage} /> : null}

              <SearchBar
                aria-label="Search app barbers to invite"
                placeholder="Search by name, email, username, or city"
                value={inviteSearch}
                onChange={(event) => setInviteSearch(event.target.value)}
                className="min-h-[4rem] rounded-[22px] px-5 text-base"
              />

              {inviteDirectoryQuery.data?.shop ? (
                <div className="mt-4 rounded-[20px] border border-[#A3FF12]/18 bg-[#A3FF12]/8 p-4 text-sm text-white/70">
                  Invites will be sent for <span className="font-extrabold text-white">{inviteDirectoryQuery.data.shop.label}</span>.
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                {inviteDirectoryQuery.isLoading ? (
                  <>
                    <Skeleton className="h-24 rounded-[22px]" />
                    <Skeleton className="h-24 rounded-[22px]" />
                    <Skeleton className="h-24 rounded-[22px]" />
                  </>
                ) : inviteDirectoryQuery.data?.barbers.length ? inviteDirectoryQuery.data.barbers.map((barber) => {
                  const statusText = barber.alreadyAssigned
                    ? "Assigned"
                    : barber.inviteStatus === "pending"
                      ? "Invite pending"
                      : barber.canInvite
                        ? "Ready to invite"
                        : formatStatusLabel(barber.inviteStatus ?? "Unavailable");
                  const statusTone = barber.alreadyAssigned || barber.inviteStatus === "accepted" ? "text-[#A3FF12]" : barber.inviteStatus === "pending" ? "text-amber-200" : "text-white/58";

                  return (
                    <div key={barber.barberId} className="grid gap-4 rounded-[24px] border border-white/8 bg-black/28 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="truncate text-xl font-extrabold tracking-[-0.03em] text-white">{barber.name}</p>
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-extrabold", statusTone)}>
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {statusText}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/56">
                          {barber.email ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-[#A3FF12]" aria-hidden="true" />
                              {barber.email}
                            </span>
                          ) : null}
                          {barber.username ? <span>@{barber.username}</span> : null}
                          {barber.serviceAreaLabel ? <span>{barber.serviceAreaLabel}</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.13em] text-white/42">
                          <span>App {formatStatusLabel(barber.appApprovalStatus)}</span>
                          <span>Shop {formatStatusLabel(barber.shopApprovalStatus)}</span>
                          <span>{formatStatusLabel(barber.compensationModel)}</span>
                          <span>{barber.acceptsInstantBookings ? "Instant booking on" : "Instant booking off"}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(barber.readinessLabels ?? []).map((label) => (
                            <span
                              key={label}
                              className={cn(
                                "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-extrabold",
                                label.includes("Bookable") || label.includes("Approved") || label.includes("team")
                                  ? "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]"
                                  : label.includes("incomplete") || label.includes("invited") || label.includes("Not approved")
                                    ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                                    : "border-white/10 bg-white/[0.05] text-white/62"
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {barber.username ? (
                          <Link
                            href={`/barber/${encodeURIComponent(barber.username)}`}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-extrabold text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
                          >
                            View Profile
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={!barber.canInvite || createInviteMutation.isPending}
                          onClick={() => void handleCreateInvite(barber.barberId)}
                          className={cn(
                            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70",
                            barber.canInvite
                              ? "border border-[#A3FF12]/42 bg-[#A3FF12] text-black shadow-[0_14px_32px_rgba(163,255,18,0.22)] hover:-translate-y-0.5"
                              : "cursor-not-allowed border border-white/8 bg-white/[0.035] text-white/38"
                          )}
                        >
                          <Send className="h-4 w-4" />
                          {barber.inviteStatus === "pending" ? "Pending" : barber.alreadyAssigned ? "Assigned" : "Send Invite"}
                        </button>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/28 p-6">
                    <p className="text-xl font-extrabold text-white">No matching barbers found.</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">Try a different name, email, username, or service area.</p>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
