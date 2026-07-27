"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Building2, Clock3, ShieldCheck, Users, WalletCards } from "lucide-react";
import { isScheduledAppointmentStatus } from "@/lib/appointments/domain";
import { normalizeCompensationModel } from "@/lib/auth/roles";
import { useShopDashboardQuery, type ShopDashboardBarberSummary } from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/types/domain";

type ViewerRole = Extract<Role, "manager" | "front_desk">;

type TeamBarberCard = {
  id: string;
  name: string;
  compensationModel: string;
  statusLabel: string;
  statusDetail: string;
  bookedCount: number;
  liveAppointmentCount: number;
  completedCount: number;
  utilization: number;
  nextAppointmentStart: string | null;
};

function getWorkspaceCopy(role: ViewerRole) {
  switch (role) {
    case "manager":
      return "Track coverage, chair pressure, and same-day production from the canonical shop schedule without drifting into owner-only controls.";
    case "front_desk":
      return "Keep the barber roster, open chairs, and next desk actions visible so arrivals can be routed cleanly.";
    default:
      return "Team visibility stays role-aware here.";
  }
}

function formatTime(value: string | null) {
  if (!value) {
    return "Open now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatCompensationLabel(value: string) {
  // Normalize first so retired pre-doctrine values render as Freelance
  // instead of leaking their raw stored string.
  switch (normalizeCompensationModel(value)) {
    case "booth_rent":
      return "Booth rent";
    case "autobooth_rent":
      return "AutoBooth Rent";
    default:
      return "Freelance";
  }
}

function getBarberStatus(barber: ShopDashboardBarberSummary) {
  if (barber.liveAppointmentCount > 0) {
    return {
      label: "Cutting now",
      detail: `${barber.liveAppointmentCount} live service${barber.liveAppointmentCount === 1 ? "" : "s"} in motion`
    };
  }

  if (barber.activeAppointmentCount > 0) {
    return {
      label: "With guest",
      detail: `${barber.activeAppointmentCount} checked-in or upcoming appointment${barber.activeAppointmentCount === 1 ? "" : "s"}`
    };
  }

  if (barber.nextAppointmentStart) {
    return {
      label: "Booked later",
      detail: `Next guest at ${formatTime(barber.nextAppointmentStart)}`
    };
  }

  return {
    label: "Open chair",
    detail: "No active chair pressure right now"
  };
}

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-28" />
    </div>
  );
}

export function TeamWorkspace({
  viewerRole,
  locationIds
}: {
  viewerRole: ViewerRole;
  locationIds: string[];
}) {
  const shopQuery = useShopDashboardQuery();
  const data = shopQuery.data;
  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const walkIns = useMemo(() => data?.walkIns ?? [], [data?.walkIns]);
  const workflowEvents = useMemo(() => data?.workflowEvents ?? [], [data?.workflowEvents]);
  const barbers = useMemo(() => data?.barbers ?? [], [data?.barbers]);
  const summary = data?.summary;
  const businessDate = summary?.latestDate ?? summary?.businessDate ?? new Date().toISOString().slice(0, 10);
  const isInitialLoading = shopQuery.isLoading && !data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;

  const scopedLocations = useMemo(() => {
    const locations = data?.locations ?? [];
    if (!locationIds.length) {
      return locations;
    }

    return locations.filter((location) => locationIds.includes(location.id));
  }, [data?.locations, locationIds]);

  const activeLocationLabels = scopedLocations.length
    ? scopedLocations.map((location) => location.name)
    : locationIds.length
      ? locationIds
      : ["Assigned shop scope"];

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.start.slice(0, 10) === businessDate),
    [appointments, businessDate]
  );

  const bookedToday = summary?.bookedToday ?? dayAppointments.filter((appointment) => isScheduledAppointmentStatus(appointment.status)).length;
  const checkedInToday = summary?.checkedInCount ?? dayAppointments.filter((appointment) => appointment.status === "checked_in").length;
  const inServiceToday = summary?.inServiceCount ?? dayAppointments.filter((appointment) => appointment.status === "in_service").length;
  const liveServiceLoad = checkedInToday + inServiceToday;
  const completedToday = summary?.completedCount ?? dayAppointments.filter((appointment) => appointment.status === "completed").length;
  const totalTodayRevenue = summary?.revenueToday
    ?? dayAppointments
      .filter((appointment) => appointment.status === "completed")
      .reduce((sum, appointment) => sum + (appointment.grandTotal ?? appointment.totalAmount), 0);
  const openChairCount = barbers.filter((barber) => barber.activeAppointmentCount === 0 && barber.liveAppointmentCount === 0).length;
  const readyForCheckoutCount = summary?.readyForCheckoutCount ?? dayAppointments.filter((appointment) => appointment.status === "completed" && appointment.balanceDue > 0).length;

  const team = useMemo<TeamBarberCard[]>(() => {
    return barbers
      .map((barber) => {
        const status = getBarberStatus(barber);
        return {
          id: barber.id,
          name: barber.name,
          compensationModel: barber.compensationModel,
          statusLabel: status.label,
          statusDetail: status.detail,
          bookedCount: barber.bookedCount + barber.activeAppointmentCount,
          liveAppointmentCount: barber.liveAppointmentCount,
          completedCount: barber.completedCount,
          utilization: barber.utilization,
          nextAppointmentStart: barber.nextAppointmentStart
        };
      })
      .sort((left, right) =>
        right.liveAppointmentCount - left.liveAppointmentCount
        || right.bookedCount - left.bookedCount
        || right.completedCount - left.completedCount
        || left.name.localeCompare(right.name)
      );
  }, [barbers]);

  const followUpItems = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; tone?: "accent" | "default" }> = [];

    if (readyForCheckoutCount > 0) {
      items.push({
        id: "ready-for-checkout",
        title: `${readyForCheckoutCount} ticket${readyForCheckoutCount === 1 ? "" : "s"} need checkout`,
        detail: "Completed services are waiting on the desk handoff before money is fully closed out.",
        tone: "accent"
      });
    }

    if (walkIns.length > 0) {
      items.push({
        id: "walk-ins",
        title: `${walkIns.length} walk-in${walkIns.length === 1 ? "" : "s"} in queue`,
        detail: "Desk traffic is live right now. Use the open-chair roster to route arrivals cleanly."
      });
    }

    if (openChairCount > 0) {
      items.push({
        id: "open-chairs",
        title: `${openChairCount} open chair${openChairCount === 1 ? "" : "s"}`,
        detail: "There is real same-day capacity available if another guest shows up."
      });
    }

    for (const event of workflowEvents.slice(0, 3)) {
      items.push({
        id: `${event.appointmentReference}-${event.createdAt}`,
        title: event.title,
        detail: event.detail
      });
    }

    return items.slice(0, 4);
  }, [openChairCount, readyForCheckoutCount, walkIns.length, workflowEvents]);

  return (
    <div className="space-y-4" data-testid="team-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Team command layer</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Barbers, coverage, and floor pressure in one lane.</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">{getWorkspaceCopy(viewerRole)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
                <Building2 className="h-4 w-4" />
                {activeLocationLabels.join(" | ")}
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{team.length} visible barber profile{team.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Active barbers</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{team.length}</p>
                  <p className="mt-2 text-sm text-white/58">Real barber roster currently in this shop scope.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Revenue pulse</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(totalTodayRevenue)}</p>
                  <p className="mt-2 text-sm text-white/58">Completed same-day revenue already posted to canonical shop truth.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open chairs</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{openChairCount}</p>
                  <p className="mt-2 text-sm text-white/58">Barbers without live chair pressure right now.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Schedule load</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{bookedToday}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Booked tickets still moving through today&apos;s lane.</p>
              </div>
              <Clock3 className="h-5 w-5 text-[#d9f985]" />
            </div>
          </Card>
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Live service load</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{liveServiceLoad}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Checked-in or in-service appointments right now.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#d9f985]" />
            </div>
          </Card>
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Completed services</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{completedToday}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Work already closed across the team today.</p>
              </div>
              <WalletCards className="h-5 w-5 text-[#d9f985]" />
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Team roster</p>
              <p className="mt-2 text-sm text-white/58">A real roster view of who is on the floor, what model they work under, and where the next chair pressure sits.</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">Role-aware roster</span>
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : team.length ? (
              team.map((barber) => (
                <div key={barber.id} className="rounded-[26px] border border-white/8 bg-black/20 p-5 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{barber.name}</p>
                      <p className="mt-1 text-sm text-white/55">{formatCompensationLabel(barber.compensationModel)}</p>
                    </div>
                    <span className="status-pill text-[#e4f9b8]">{barber.statusLabel}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/60">{barber.statusDetail}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                      <p className="surface-label">Booked</p>
                      <p className="mt-2 text-base font-semibold">{barber.bookedCount}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                      <p className="surface-label">Live</p>
                      <p className="mt-2 text-base font-semibold">{barber.liveAppointmentCount}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                      <p className="surface-label">Completed</p>
                      <p className="mt-2 text-base font-semibold">{barber.completedCount}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                      <p className="surface-label">Next up</p>
                      <p className="mt-2 text-base font-semibold">{formatTime(barber.nextAppointmentStart)}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-white/55">{barber.utilization}% utilization in the current shop schedule.</p>
                </div>
              ))
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                No real barbers are linked to this shop scope yet.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Follow-up and desk pressure</p>
            <Users className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : followUpItems.length ? (
              followUpItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[24px] border p-4 text-sm leading-7 ${
                    item.tone === "accent"
                      ? "border-[#C4F24E]/16 bg-[#C4F24E]/8 text-white"
                      : "border-white/8 bg-black/20 text-white/62"
                  }`}
                >
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="mt-2">{item.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                No live team issues are waiting right now.
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/appointments"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e0f6a0]/40 bg-[linear-gradient(135deg,#c4f24e_0%,#d4f97a_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(196, 242, 78,0.24)] transition hover:-translate-y-0.5 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open full schedule
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
