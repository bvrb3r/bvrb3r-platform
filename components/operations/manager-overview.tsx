"use client";

import { useMemo } from "react";
import { ClipboardCheck, PackageSearch, ShieldCheck, TriangleAlert, UsersRound } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { ShopManagerPanel } from "@/components/operations/shop-manager-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { demoTasks, inventoryItems } from "@/lib/data/demo";
import { useShopDashboardQuery } from "@/lib/operations/barber-client";
import { currency, dateLabel } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-36" />
    </div>
  );
}

function BoardRowSkeleton() {
  return (
    <div className="rounded-[26px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-12 w-full rounded-[20px]" />
        <Skeleton className="h-12 w-full rounded-[20px]" />
        <Skeleton className="h-12 w-full rounded-[20px]" />
      </div>
    </div>
  );
}

function UtilityCardSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-[20px]" />
        <Skeleton className="h-20 w-full rounded-[20px]" />
        <Skeleton className="h-20 w-full rounded-[20px]" />
      </div>
    </div>
  );
}

function formatActivityTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getCompensationLabel(model: string) {
  if (model === "commission") {
    return "Commission barber";
  }

  if (model === "booth_rent") {
    return "Booth-rent barber";
  }

  if (model === "freelance") {
    return "Freelance barber";
  }

  return model.replaceAll("_", " ");
}

function getScheduleDetail(note: string, statusLabel: string, locationLabel: string) {
  const trimmed = note.trim();
  if (trimmed) {
    return trimmed;
  }

  return `${statusLabel} at ${locationLabel}.`;
}

export function ManagerOverview({ locationIds }: { locationIds: string[] }) {
  const shopQuery = useShopDashboardQuery();
  const summary = shopQuery.data?.summary;
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const walkIns = useMemo(() => shopQuery.data?.walkIns ?? [], [shopQuery.data?.walkIns]);
  const workflowEvents = shopQuery.data?.workflowEvents ?? [];
  const floorBarbers = shopQuery.data?.barbers ?? [];
  const businessDate = summary?.latestDate ?? summary?.businessDate ?? new Date().toISOString().slice(0, 10);
  const scopedLocations = useMemo(() => {
    const locations = shopQuery.data?.locations ?? [];
    return locationIds.length ? locations.filter((location) => locationIds.includes(location.id)) : locations;
  }, [shopQuery.data?.locations, locationIds]);
  const dayAppointments = useMemo(
    () => appointments
      .filter((appointment) => appointment.start.slice(0, 10) === businessDate)
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    [appointments, businessDate]
  );
  const noShowCount = dayAppointments.filter((appointment) => appointment.status === "no_show").length;
  const lateWatchCount = dayAppointments.filter((appointment) => appointment.note.toLowerCase().includes("late")).length;
  const completedCount = summary?.completedCount ?? dayAppointments.filter((appointment) => appointment.status === "completed").length;
  const availableBarbers = floorBarbers.filter((entry) => entry.activeAppointmentCount === 0);
  const frontDeskEvents = workflowEvents.filter((event) => event.actorRole === "front_desk").slice(0, 4);
  const operationalTasks = demoTasks.filter((task) => locationIds.includes(task.locationId));
  const relevantInventory = inventoryItems.filter((item) => locationIds.includes(item.locationId));
  const inventoryAlerts = relevantInventory.filter((item) => item.stock <= item.reorderAt);
  const isInitialLoading = shopQuery.isLoading && !shopQuery.data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;

  return (
    <div className="space-y-4" data-testid="manager-overview">
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Shop command center</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Run the floor with confidence</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
                You can see every chair, every queue handoff, and every operational signal needed to keep the shop moving, while owner-only policy and billing controls stay protected.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Live shop dashboard
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">
                Coverage {scopedLocations.map((location) => location.name).join(" | ") || "Assigned location"}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
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
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <p className="surface-label">Needs attention now</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{(summary?.readyForCheckoutCount ?? 0) + walkIns.length + lateWatchCount}</p>
                  <p className="mt-2 text-sm text-white/58">Checkout waits, walk-ins, and late arrivals are the next floor actions.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <p className="surface-label">Route walk-ins to</p>
                  <p className="mt-3 text-lg font-semibold">{availableBarbers.map((entry) => entry.name).join(", ") || "All chairs occupied"}</p>
                  <p className="mt-2 text-sm text-white/58">Available chairs update from live status changes and schedule flow.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <p className="surface-label">Front desk pulse</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{frontDeskEvents.length}</p>
                  <p className="mt-2 text-sm text-white/58">Recent desk actions are mirrored here so the floor stays aligned.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {isInitialLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <StatCard label="Appointments today" value={String(dayAppointments.length)} detail={`${summary?.checkedInCount ?? 0} checked in and ${summary?.inServiceCount ?? 0} in service right now`} />
              <StatCard label="Barbers on shift" value={String(floorBarbers.length)} detail={`${floorBarbers.filter((entry) => entry.liveAppointmentCount > 0).length} chairs currently active on the floor`} />
              <StatCard label="Revenue pulse" value={currency(summary?.revenueToday ?? 0)} detail={`${summary?.readyForCheckoutCount ?? 0} tickets still waiting on checkout capture`} />
            </>
          )}
        </div>
      </section>

      <ShopManagerPanel />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Full shop schedule</p>
              <p className="mt-2 text-sm text-white/58">Scan booked, checked-in, in-service, completed, and cancelled tickets without leaving the floor view.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">{completedCount} completed today</span>
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <BoardRowSkeleton />
                <BoardRowSkeleton />
                <BoardRowSkeleton />
              </>
            ) : dayAppointments.length ? dayAppointments.slice(0, 8).map((appointment) => (
              <div key={appointment.id} className="rounded-[26px] border border-white/8 bg-black/20 p-4 transition hover:-translate-y-0.5 hover:border-[#7CFF00]/16 hover:bg-black/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{appointment.display.clientName}</p>
                    <p className="mt-1 text-sm text-white/52">{appointment.display.barberName} | {appointment.display.serviceName}</p>
                  </div>
                  <StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} />
                </div>
                <div className="mt-4 grid gap-3 text-sm text-white/62 sm:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-3 py-3">{dateLabel(appointment.start)}</div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-3 py-3">{appointment.chair}</div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-3 py-3">{appointment.display.locationLabel}</div>
                </div>
                <p className="mt-3 text-sm text-white/55">{getScheduleDetail(appointment.note, appointment.display.statusLabel, appointment.display.locationLabel)}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[26px] p-6 text-sm leading-7 text-white/58">
                The floor schedule will populate here once appointments are assigned to this shop.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Barber utilization</p>
            <UsersRound className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <UtilityCardSkeleton />
                <UtilityCardSkeleton />
                <UtilityCardSkeleton />
              </>
            ) : floorBarbers.length ? floorBarbers.map((entry) => (
              <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="mt-1 text-sm text-white/52">{getCompensationLabel(entry.compensationModel)}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{entry.utilization}% utilized</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                    <p className="surface-label">Live chairs</p>
                    <p className="mt-2 text-2xl font-semibold" data-display="true">{entry.liveAppointmentCount}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                    <p className="surface-label">Booked later</p>
                    <p className="mt-2 text-2xl font-semibold" data-display="true">{entry.bookedCount}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                    <p className="surface-label">Completed</p>
                    <p className="mt-2 text-2xl font-semibold" data-display="true">{entry.completedCount}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/55">Next seat: {entry.nextAppointmentStart ? dateLabel(entry.nextAppointmentStart) : "Open chair right now"}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                Barber utilization cards will appear here when staff are assigned to this shop.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Queue and desk activity</p>
              <p className="mt-2 text-sm text-white/58">Watch walk-ins, late arrivals, no-shows, and front-desk handoffs in one place.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em]">
              <span className="status-pill text-white/66">{noShowCount} no-shows</span>
              <span className="status-pill text-white/66">{lateWatchCount} late flags</span>
              <span className="status-pill text-white/66">{summary?.queueAverageMinutes ?? 0} min queue avg</span>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {isInitialLoading ? (
                <>
                  <UtilityCardSkeleton />
                  <UtilityCardSkeleton />
                </>
              ) : walkIns.length ? walkIns.map((entry) => (
                <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">#{entry.position} • {entry.clientName}</p>
                    <span className="status-pill text-[#d7ffab]">{entry.display.statusLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-white/55">{entry.requestedService}</p>
                  <p className="mt-3 text-sm text-white/58">{entry.display.locationLabel}</p>
                  <p className="mt-2 text-sm text-white/58">
                    {entry.display.assignedBarberName ? `Assigned to ${entry.display.assignedBarberName}` : "Waiting for barber assignment"} • Wait time {entry.waitMinutes} minutes
                  </p>
                </div>
              )) : (
                <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                  Walk-ins will show here as front desk and floor traffic changes.
                </div>
              )}
            </div>
            <div className="space-y-3">
              {isInitialLoading ? (
                <>
                  <UtilityCardSkeleton />
                  <UtilityCardSkeleton />
                </>
              ) : frontDeskEvents.length ? frontDeskEvents.map((event) => (
                <div key={`${event.appointmentReference}-${event.createdAt}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <p className="font-medium">{event.title}</p>
                  <p className="mt-1 text-sm text-white/55">{event.detail}</p>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[#cfff93]">Front desk | {formatActivityTimestamp(event.createdAt)}</p>
                </div>
              )) : (
                <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                  Front desk activity will appear here as check-ins and checkout handoffs happen.
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Approvals and operational alerts</p>
            <ClipboardCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <UtilityCardSkeleton />
                <UtilityCardSkeleton />
                <UtilityCardSkeleton />
              </>
            ) : (
              <>
                {operationalTasks.map((task) => (
                  <div key={task.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium">{task.title}</p>
                      <span className="status-pill text-[#d7ffab]">{task.priority} priority</span>
                    </div>
                    <p className="mt-1 text-sm text-white/55">Assignee: {task.assignee}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/38">{task.status}</p>
                  </div>
                ))}
                <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4 transition hover:border-[#7CFF00]/28 hover:bg-[#7CFF00]/10">
                  <div className="flex items-center justify-between gap-3">
                    <p className="surface-label text-[#d7ffab]">Inventory watch</p>
                    <PackageSearch className="h-5 w-5 text-[#d7ffab]" />
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-white/72">
                    {(inventoryAlerts.length ? inventoryAlerts : relevantInventory).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/20 px-3 py-3">
                        <span>{item.name}</span>
                        <span className="status-pill text-[#d7ffab]">{item.stock} on hand</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/65">
                  Limited approvals stay here for discounts, service adjustments, and floor notes. Owner account settings, billing, and compensation policy controls remain protected.
                </div>
                <div className="rounded-[24px] border border-amber-400/18 bg-amber-400/10 p-4 text-sm text-amber-100">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4" />
                    {summary?.readyForCheckoutCount ?? 0} completed ticket{(summary?.readyForCheckoutCount ?? 0) === 1 ? "" : "s"} still need a checkout handoff.
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

