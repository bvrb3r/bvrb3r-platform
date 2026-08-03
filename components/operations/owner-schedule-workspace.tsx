"use client";

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  DollarSign,
  SlidersHorizontal,
  Store,
  Users
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, FilterChip, GlassCard } from "@/design/components";
import {
  useShopDashboardQuery,
  type ShopDashboardAppointment,
  type ShopDashboardBarberSummary
} from "@/lib/operations/barber-client";
import { sortOwnerDashboardAppointments } from "@/lib/operations/metrics";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type OpenWindowView = {
  barberId: string;
  barberName: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
};

type SlotFilter = "all" | "booked" | "walk-in" | "blocked" | "open";
type ViewMode = "day" | "chair";

type BarberColumn = {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  chairLabel: string | null;
  active: boolean;
};

type ScheduleCell =
  | { kind: "booked" | "walk-in" | "blocked"; appointment: ShopDashboardAppointment; title: string; subtitle: string }
  | { kind: "available"; window: OpenWindowView; title: string; subtitle: string }
  | { kind: "empty"; title: string; subtitle: string };

const legendItems: Array<{ label: string; tone: "booked" | "walk-in" | "blocked" | "available" }> = [
  { label: "Booked", tone: "booked" },
  { label: "Walk-in", tone: "walk-in" },
  { label: "Blocked", tone: "blocked" },
  { label: "Available", tone: "available" }
];

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function getFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

function getDefaultDate(data?: ReturnType<typeof useShopDashboardQuery>["data"]) {
  const summaryDate = data?.summary?.businessDate ?? data?.summary?.latestDate;
  if (summaryDate) {
    return summaryDate;
  }

  const latestAppointment = [...(data?.appointments ?? [])].sort((left, right) => right.start.localeCompare(left.start))[0];
  return latestAppointment ? dateKey(latestAppointment.start) : getTodayKey();
}

function buildWeekStrip(selectedDate: string) {
  const selected = new Date(`${selectedDate}T12:00:00.000Z`);
  const start = new Date(selected);
  start.setUTCDate(selected.getUTCDate() - selected.getUTCDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date).toUpperCase(),
      day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date)
    };
  });
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatTimeRange(startIso: string, endIso: string) {
  return `${formatTime(startIso)} - ${formatTime(endIso)}`;
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(date);
}

function getHour(iso: string) {
  return new Date(iso).getHours();
}

function appointmentOverlapsHour(appointment: ShopDashboardAppointment, hour: number) {
  const start = new Date(appointment.start);
  const end = new Date(appointment.end);
  const hourStart = new Date(start);
  hourStart.setHours(hour, 0, 0, 0);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hour + 1);

  return start < hourEnd && end > hourStart;
}

function windowOverlapsHour(window: OpenWindowView, hour: number) {
  const start = new Date(window.startsAt);
  const end = new Date(window.endsAt);
  const hourStart = new Date(start);
  hourStart.setHours(hour, 0, 0, 0);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hour + 1);

  return start < hourEnd && end > hourStart;
}

function buildOpenWindows(barbers: ShopDashboardBarberSummary[], appointments: ShopDashboardAppointment[]) {
  const windows: OpenWindowView[] = [];

  for (const barber of barbers) {
    const barberAppointments = appointments
      .filter((appointment) => appointment.barberId === barber.id && appointment.status !== "cancelled" && appointment.status !== "no_show")
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

    for (let index = 0; index < barberAppointments.length - 1; index += 1) {
      const current = barberAppointments[index];
      const next = barberAppointments[index + 1];
      const gapMinutes = Math.round((new Date(next.start).getTime() - new Date(current.end).getTime()) / 60000);

      if (gapMinutes >= 30) {
        windows.push({
          barberId: barber.id,
          barberName: barber.name,
          startsAt: current.end,
          endsAt: next.start,
          minutes: gapMinutes
        });
      }
    }
  }

  return windows.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function getScheduleHours(appointments: ShopDashboardAppointment[], windows: OpenWindowView[]) {
  const starts = [
    ...appointments.map((appointment) => getHour(appointment.start)),
    ...windows.map((window) => getHour(window.startsAt))
  ];
  const ends = [
    ...appointments.map((appointment) => {
      const end = new Date(appointment.end);
      return end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
    }),
    ...windows.map((window) => {
      const end = new Date(window.endsAt);
      return end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
    })
  ];

  if (!starts.length || !ends.length) {
    return [];
  }

  const startHour = Math.max(0, Math.min(...starts));
  const endHour = Math.min(24, Math.max(...ends, startHour + 1));

  return Array.from({ length: Math.max(endHour - startHour, 1) }, (_, index) => startHour + index);
}

function getAppointmentKind(appointment: ShopDashboardAppointment): "booked" | "walk-in" | "blocked" {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return "blocked";
  }

  return appointment.source === "walk_in" || appointment.bookingSource === "walk_in" ? "walk-in" : "booked";
}

function getCellForHour({
  barber,
  hour,
  appointments,
  openWindows
}: {
  barber: BarberColumn;
  hour: number;
  appointments: ShopDashboardAppointment[];
  openWindows: OpenWindowView[];
}): ScheduleCell {
  const appointment = appointments
    .filter((entry) => entry.barberId === barber.id)
    .find((entry) => appointmentOverlapsHour(entry, hour) && getHour(entry.start) === hour);

  if (appointment) {
    const kind = getAppointmentKind(appointment);
    const title = kind === "walk-in"
      ? "Walk-in"
      : kind === "blocked"
        ? appointment.status === "no_show" ? "No-show" : "Cancelled"
        : appointment.display.clientName || appointment.display.serviceName;

    return {
      kind,
      appointment,
      title,
      subtitle: kind === "booked"
        ? `${appointment.display.serviceName} - ${formatTimeRange(appointment.start, appointment.end)}`
        : formatTimeRange(appointment.start, appointment.end)
    };
  }

  const openWindow = openWindows.find((window) => window.barberId === barber.id && windowOverlapsHour(window, hour));
  if (openWindow) {
    return {
      kind: "available",
      window: openWindow,
      title: "Available",
      subtitle: formatTimeRange(openWindow.startsAt, openWindow.endsAt)
    };
  }

  return {
    kind: "empty",
    title: "-",
    subtitle: "No schedule data"
  };
}

function isCellVisible(cell: ScheduleCell, filter: SlotFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return cell.kind === "available";
  }

  return cell.kind === filter;
}

function MetricSkeleton() {
  return (
    <GlassCard className="min-h-[8.75rem] p-5">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="mt-6 h-8 w-20" />
      <Skeleton className="mt-3 h-4 w-24" />
    </GlassCard>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  href,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  href?: ComponentProps<typeof Link>["href"];
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex items-center gap-2 text-sm font-extrabold text-[#C4F24E]">
        {icon}
        {label}
      </span>
      <span className="mt-5 block text-3xl font-black tracking-[-0.055em] text-white">{value}</span>
      <span className="mt-2 block text-base font-semibold text-white/60">{detail}</span>
    </>
  );

  const className = "min-h-[8.75rem] rounded-[22px] border border-white/9 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)] transition hover:-translate-y-0.5 hover:border-[#C4F24E]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5 text-base font-semibold text-white/62">
      {legendItems.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span
            className={cn(
              "h-3 w-3 rounded-full",
              item.tone === "booked" && "bg-[#C4F24E]",
              item.tone === "walk-in" && "bg-blue-400",
              item.tone === "blocked" && "bg-amber-300",
              item.tone === "available" && "bg-white/42"
            )}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ScheduleCellButton({
  cell,
  filter,
  onSelectAppointment
}: {
  cell: ScheduleCell;
  filter: SlotFilter;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const visible = isCellVisible(cell, filter);
  const className = cn(
    "flex min-h-[4.75rem] w-36 flex-col justify-center rounded-[12px] border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70",
    !visible && "opacity-25",
    cell.kind === "booked" && "border-[#C4F24E]/30 bg-[#C4F24E]/35 text-white shadow-[0_0_20px_rgba(196, 242, 78,0.08)]",
    cell.kind === "walk-in" && "border-blue-300/35 bg-blue-500/35 text-white",
    cell.kind === "blocked" && "border-amber-300/35 bg-amber-400/42 text-white",
    cell.kind === "available" && "border-white/8 bg-white/[0.11] text-white/74 hover:border-[#C4F24E]/25 hover:text-white",
    cell.kind === "empty" && "border-white/6 bg-white/[0.035] text-white/32"
  );

  if (cell.kind === "booked" || cell.kind === "walk-in" || cell.kind === "blocked") {
    return (
      <button type="button" onClick={() => onSelectAppointment(cell.appointment.id)} className={className}>
        <span className="font-extrabold">{cell.title}</span>
        <span className="mt-1 text-xs font-semibold opacity-75">{cell.subtitle}</span>
      </button>
    );
  }

  if (cell.kind === "available") {
    return (
      <Link href="/dashboard/owner/schedule?filter=open-slots" className={className}>
        <span className="font-extrabold">{cell.title}</span>
        <span className="mt-1 text-xs font-semibold opacity-75">{cell.subtitle}</span>
      </Link>
    );
  }

  return (
    <div className={className} aria-label="No schedule data for this chair and hour">
      <span className="font-extrabold">{cell.title}</span>
      <span className="mt-1 text-xs font-semibold opacity-65">{cell.subtitle}</span>
    </div>
  );
}

export function OwnerScheduleWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const defaultDate = getDefaultDate(shopQuery.data);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const isInitialLoading = shopQuery.isLoading && !shopQuery.data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const activeBarbers = useMemo(() => shopQuery.data?.activeBarbers ?? [], [shopQuery.data?.activeBarbers]);
  const summaryDate = shopQuery.data?.summary?.businessDate ?? shopQuery.data?.summary?.latestDate;
  const weekDays = useMemo(() => buildWeekStrip(selectedDate), [selectedDate]);

  const dayAppointments = useMemo(
    () => sortOwnerDashboardAppointments(appointments, selectedDate),
    [appointments, selectedDate]
  );
  const openWindows = useMemo(() => buildOpenWindows(barbers, dayAppointments), [barbers, dayAppointments]);
  const scheduleHours = useMemo(() => getScheduleHours(dayAppointments, openWindows), [dayAppointments, openWindows]);
  const activeBarberIds = useMemo(() => new Set(activeBarbers.map((barber) => barber.id)), [activeBarbers]);
  const selectedAppointment = dayAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null;

  const barberColumns = useMemo<BarberColumn[]>(() => {
    return barbers.map((barber) => {
      const barberAppointments = dayAppointments.filter((appointment) => appointment.barberId === barber.id);
      const chairLabel = barberAppointments.find((appointment) => appointment.chair)?.chair ?? null;

      return {
        id: barber.id,
        name: barber.name,
        firstName: getFirstName(barber.name),
        initials: getInitials(barber.name),
        chairLabel,
        active: activeBarberIds.has(barber.id) || barberAppointments.some((appointment) => appointment.status === "checked_in" || appointment.status === "in_service")
      };
    });
  }, [activeBarberIds, barbers, dayAppointments]);

  const bookingCount = dayAppointments.filter((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show").length;
  const dayRevenue = summaryDate === selectedDate ? shopQuery.data?.summary.revenueToday ?? null : null;
  const averageUtilization = barbers.length
    ? Math.round(barbers.reduce((total, barber) => total + barber.utilization, 0) / barbers.length)
    : null;
  const openSlotCount = openWindows.length;
  const totalOpenMinutes = openWindows.reduce((total, window) => total + window.minutes, 0);
  const hasScheduleData = Boolean(scheduleHours.length && barberColumns.length);

  return (
    <div className="space-y-7" data-testid="owner-schedule-workspace">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl" data-display="true">
            Schedule
          </h1>
          <p className="mt-3 text-lg font-medium text-white/68">All chairs & bookings</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            Shop-wide coverage for the day: team schedule, open chair capacity, and booking density without changing calendar logic.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <details className="group relative">
            <summary
              aria-label="Open schedule filters"
              className="inline-flex h-14 w-14 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#C4F24E]/35 hover:text-[#C4F24E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70"
            >
              <SlidersHorizontal className="h-6 w-6" />
            </summary>
            <GlassCard className="absolute right-0 z-20 mt-3 w-72 p-4">
              <p className="px-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#C4F24E]">Schedule filters</p>
              <div className="mt-3 grid gap-2">
                {[
                  ["All", "all"],
                  ["Booked", "booked"],
                  ["Walk-ins", "walk-in"],
                  ["Blocked", "blocked"],
                  ["Available slots", "open"]
                ].map(([label, value]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSlotFilter(value as SlotFilter)}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-[14px] border px-3 py-2 text-sm font-bold transition",
                      slotFilter === value
                        ? "border-[#C4F24E]/45 bg-[#C4F24E] text-black"
                        : "border-white/10 bg-black/20 text-white/72 hover:border-[#C4F24E]/25 hover:text-white"
                    )}
                  >
                    {label}
                    {slotFilter === value ? <span className="h-2 w-2 rounded-full bg-black" /> : null}
                  </button>
                ))}
              </div>
            </GlassCard>
          </details>

          <button
            type="button"
            onClick={() => {
              setSelectedDate(getTodayKey());
              setSlotFilter("all");
            }}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-6 text-base font-extrabold text-white transition hover:border-[#C4F24E]/35 hover:text-[#C4F24E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70"
          >
            Today
          </button>
        </div>
      </header>

      {errorMessage ? (
        <GlassCard className="border-red-400/20 bg-red-500/8 p-5 text-sm font-semibold text-red-100">
          <FeedbackBanner tone="error" message={errorMessage} />
        </GlassCard>
      ) : null}

      <GlassCard className="grid gap-4 p-5 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Shop schedule pulse</p>
          <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">Today and week context for every chair.</p>
          <p className="mt-2 text-sm leading-6 text-white/56">When the team is connected, this becomes the operating board for coverage, walk-ins, and open capacity.</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Open capacity</p>
          <p className="mt-3 text-2xl font-black text-white">{openSlotCount}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">{totalOpenMinutes ? `${totalOpenMinutes} minutes available` : "No open slots detected"}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Team coverage</p>
          <p className="mt-3 text-2xl font-black text-white">{activeBarbers.length}/{barbers.length || 0}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Active barbers in scope.</p>
        </div>
      </GlassCard>

      <section className="grid grid-cols-7 gap-2 sm:gap-4" aria-label="Schedule date strip">
        {weekDays.map((day) => {
          const selected = day.key === selectedDate;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => {
                setSelectedDate(day.key);
                setSelectedAppointmentId(null);
              }}
              className={cn(
                "min-h-[5.875rem] rounded-[20px] border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70",
                selected
                  ? "border-[#C4F24E]/80 bg-[#C4F24E]/8 text-[#C4F24E] shadow-[0_0_24px_rgba(196, 242, 78,0.12)]"
                  : "border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.025]"
              )}
            >
              <span className="block text-xs font-extrabold tracking-[0.08em] text-white/52 sm:text-sm">{day.weekday}</span>
              <span className={cn("mt-2 block text-2xl font-black tracking-[-0.04em] sm:text-3xl", selected ? "text-[#C4F24E]" : "text-white")}>
                {day.day}
              </span>
            </button>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            <MetricCard
              icon={<CalendarDays className="h-5 w-5" />}
              label="Bookings"
              value={bookingCount}
              detail="Today"
              onClick={() => setSlotFilter("booked")}
            />
            <MetricCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Floor Service Volume"
              value={dayRevenue === null ? "-" : currency(dayRevenue)}
              detail="Barber money · not shop revenue"
              href={`/dashboard/owner/money?date=${selectedDate}`}
            />
            <MetricCard
              icon={<Clock3 className="h-5 w-5" />}
              label="Open Slots"
              value={openSlotCount}
              detail="Today"
              onClick={() => setSlotFilter("open")}
            />
            <MetricCard
              icon={<BarChart3 className="h-5 w-5" />}
              label="Utilization"
              value={averageUtilization === null ? "-" : `${averageUtilization}%`}
              detail="Today"
              onClick={() => setViewMode("chair")}
            />
            <MetricCard
              icon={<Store className="h-5 w-5" />}
              label="Shop Hours"
              value="-"
              detail="Unavailable"
              href="/dashboard/owner/more?section=shop-hours"
            />
          </>
        )}
      </section>

      <section className="grid min-h-14 grid-cols-2 rounded-[18px] border border-white/10 bg-white/[0.025] p-1">
        <FilterChip active={viewMode === "day"} onClick={() => setViewMode("day")} className="h-12 rounded-[14px] text-base">
          Day
        </FilterChip>
        <FilterChip active={viewMode === "chair"} onClick={() => setViewMode("chair")} className="h-12 rounded-[14px] text-base">
          Chair View
        </FilterChip>
      </section>

      <StatusLegend />

      <section className="space-y-4">
        {isInitialLoading ? (
          <GlassCard className="p-5">
            <Skeleton className="h-[32rem] w-full rounded-[24px]" />
          </GlassCard>
        ) : !barberColumns.length ? (
          <GlobalSafetyState
            state="empty_schedule"
            headline="Build your floor."
            detail="Invite barbers to connect your shop team, then configure shop chairs to build the schedule."
            actionLabel="Invite your first barber"
            actionHref="/dashboard/owner/team"
          />
        ) : !hasScheduleData ? (
          <GlobalSafetyState
            state="empty_schedule"
            detail="Set shop hours and barber availability to track chair usage."
            actionLabel="Set shop hours"
            actionHref="/dashboard/owner/more?section=shop-hours"
          />
        ) : (
          <GlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <div className="min-w-max p-4">
                <div className="grid gap-1" style={{ gridTemplateColumns: `4.5rem 7rem repeat(${barberColumns.length}, 9rem)` }}>
                  <div />
                  <div />
                  <div className="pb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-white/52" style={{ gridColumn: `span ${barberColumns.length}` }}>
                    Barbers / Chairs
                  </div>

                  <div />
                  <div className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.035] px-3 text-center">
                    <Users className="h-8 w-8 text-[#C4F24E]" />
                    <span className="mt-3 text-lg font-extrabold text-white">All Chairs</span>
                  </div>
                  {barberColumns.map((barber) => (
                    <Link
                      key={barber.id}
                      href={`/dashboard/owner/schedule?barberId=${encodeURIComponent(barber.id)}`}
                      className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.035] px-3 text-center transition hover:border-[#C4F24E]/30"
                    >
                      <Avatar
                        alt={barber.name}
                        initials={barber.initials}
                        className={cn(
                          "h-14 w-14 border-2",
                          barber.active ? "border-[#C4F24E]/80 shadow-[0_0_18px_rgba(196, 242, 78,0.18)]" : "border-white/15"
                        )}
                      />
                      <span className="mt-3 text-lg font-extrabold text-white">{barber.firstName}</span>
                      <span className="text-base font-medium text-white/58">{barber.chairLabel ?? "Chair not set"}</span>
                    </Link>
                  ))}

                  {scheduleHours.map((hour) => {
                    const hourCells = barberColumns.map((barber) => getCellForHour({
                      barber,
                      hour,
                      appointments: dayAppointments,
                      openWindows
                    }));
                    const activeChairCount = hourCells.filter((cell) => cell.kind === "booked" || cell.kind === "walk-in" || cell.kind === "blocked").length;

                    return (
                      <div key={hour} className="contents">
                        <div className="flex min-h-[4.75rem] items-start pt-3 text-lg font-semibold text-white/74">
                          {formatHourLabel(hour)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSlotFilter("all")}
                          className="flex min-h-[4.75rem] items-center justify-center rounded-[12px] border border-white/8 bg-black/26 text-xl font-black text-[#C4F24E] transition hover:border-[#C4F24E]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70"
                          aria-label={`${activeChairCount} of ${barberColumns.length} chairs active at ${formatHourLabel(hour)}`}
                        >
                          {activeChairCount}/{barberColumns.length}
                        </button>
                        {hourCells.map((cell, index) => (
                          <ScheduleCellButton
                            key={`${hour}-${barberColumns[index].id}`}
                            cell={cell}
                            filter={slotFilter}
                            onSelectAppointment={setSelectedAppointmentId}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {selectedAppointment ? (
          <GlassCard active className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar alt={selectedAppointment.display.clientName} initials={getInitials(selectedAppointment.display.clientName)} className="h-14 w-14 border-2 border-[#C4F24E]/70" />
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-white">{selectedAppointment.display.clientName}</p>
                <p className="mt-1 text-sm font-semibold text-white/62">
                  {selectedAppointment.display.barberName} - {selectedAppointment.display.serviceName} - {formatTimeRange(selectedAppointment.start, selectedAppointment.end)}
                </p>
                <p className="mt-2 text-sm text-white/52">{selectedAppointment.note || "No client notes were attached to this appointment."}</p>
              </div>
            </div>
            <Link href={`/dashboard/owner/money?appointmentId=${encodeURIComponent(selectedAppointment.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C4F24E]/40 px-5 text-sm font-extrabold text-[#C4F24E] transition hover:bg-[#C4F24E]/10">
              View Ticket
            </Link>
          </GlassCard>
        ) : null}
      </section>

      <Link href="/dashboard/owner/schedule?filter=open-slots" className="group block pb-4" onClick={() => setSlotFilter("open")}>
        <GlassCard className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#C4F24E]/22 bg-[#C4F24E]/10 text-[#C4F24E] shadow-[0_0_24px_rgba(196, 242, 78,0.16)]">
            <Clock3 className="h-8 w-8" />
          </span>
          <span>
            <span className="block text-2xl font-extrabold tracking-[-0.04em] text-white">Open Slots Summary</span>
            <span className="mt-1 block text-base font-medium text-white/58">
              {openSlotCount > 0
                ? `${openSlotCount} open slots across all chairs today${totalOpenMinutes ? ` - ${totalOpenMinutes} minutes` : ""}`
                : "No open slots today. Your available chair time is fully used."}
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-lg font-extrabold text-[#C4F24E]">
            View Open Slots
            <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </span>
        </GlassCard>
      </Link>
    </div>
  );
}
