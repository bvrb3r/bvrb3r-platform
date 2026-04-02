"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Scissors, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  useShopDashboardQuery,
  type ShopDashboardAppointment,
  type ShopDashboardBarberSummary
} from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type OpenWindowView = {
  barberId: string;
  barberName: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
};

function formatTimeRange(startIso: string, endIso: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startIso))} - ${formatter.format(new Date(endIso))}`;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function buildOpenWindows(barbers: ShopDashboardBarberSummary[], appointments: ShopDashboardAppointment[]) {
  const windows: OpenWindowView[] = [];

  for (const barber of barbers) {
    const barberAppointments = appointments
      .filter((appointment) => appointment.barberId === barber.id && appointment.status !== "cancelled")
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

    if (!barberAppointments.length) {
      continue;
    }

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

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-32" />
    </div>
  );
}

export function OwnerScheduleWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const isInitialLoading = shopQuery.isLoading && !shopQuery.data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);

  const todayAppointments = useMemo(
    () => [...appointments].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    [appointments]
  );
  const openWindows = useMemo(() => buildOpenWindows(barbers, todayAppointments), [barbers, todayAppointments]);
  const selectedAppointment = todayAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? todayAppointments[0] ?? null;
  const cuttingNowCount = todayAppointments.filter((appointment) => appointment.status === "in_service").length;
  const cancelledCount = todayAppointments.filter((appointment) => appointment.status === "cancelled" || appointment.status === "no_show").length;

  return (
    <div className="space-y-4" data-testid="owner-schedule-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Schedule board</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">See every chair, every gap, and every revenue window.</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
                The owner schedule stays tied to canonical booking truth. Use it to spot cancellations, no-shows, idle chairs, and who is cutting right now.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <CalendarDays className="h-4 w-4" />
                {barbers.length} barbers scheduled
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{openWindows.length} open windows detected</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Booked today</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{todayAppointments.length}</p>
                  <p className="mt-2 text-sm text-white/58">Appointments visible across the shop schedule.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Cutting now</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{cuttingNowCount}</p>
                  <p className="mt-2 text-sm text-white/58">Services already in motion on the floor.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open windows</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{openWindows.length}</p>
                  <p className="mt-2 text-sm text-white/58">Gaps wide enough to capture additional revenue.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Cancelled / no-show</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{cancelledCount}</p>
                  <p className="mt-2 text-sm text-white/58">Lost demand the owner can react to quickly.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Selected appointment</p>
              <UserRound className="h-5 w-5 text-[#baff69]" />
            </div>
            {isInitialLoading ? (
              <div className="mt-4 space-y-3">
                <MetricSkeleton />
                <MetricSkeleton />
              </div>
            ) : selectedAppointment ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[24px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{selectedAppointment.display.clientName}</p>
                      <p className="mt-1 text-sm text-white/60">{selectedAppointment.display.barberName} • {selectedAppointment.display.serviceName}</p>
                    </div>
                    <StatusBadge status={selectedAppointment.status} balanceDue={selectedAppointment.balanceDue} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Time</p>
                    <p className="mt-3 text-2xl font-semibold">{formatTimeRange(selectedAppointment.start, selectedAppointment.end)}</p>
                    <p className="mt-2 text-sm text-white/58">{selectedAppointment.display.locationLabel}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Ticket</p>
                    <p className="mt-3 text-2xl font-semibold">{currency(selectedAppointment.totalAmount)}</p>
                    <p className="mt-2 text-sm text-white/58">{currency(selectedAppointment.balanceDue)} still open • {currency(selectedAppointment.tipAmount)} tip</p>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Notes</p>
                  <p className="mt-3 text-sm leading-7 text-white/62">{selectedAppointment.note || "No client notes were attached to this appointment."}</p>
                </div>
              </div>
            ) : (
              <div className="empty-state-panel mt-4 rounded-[24px] p-5 text-sm leading-7 text-white/58">
                Appointment details appear here once bookings exist in the current shop scope.
              </div>
            )}
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Open revenue windows</p>
              <Clock3 className="h-5 w-5 text-[#baff69]" />
            </div>
            <div className="mt-4 space-y-3">
              {isInitialLoading ? (
                <>
                  <MetricSkeleton />
                  <MetricSkeleton />
                </>
              ) : openWindows.length ? (
                openWindows.slice(0, 6).map((window) => (
                  <div key={`${window.barberId}-${window.startsAt}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-white">{window.barberName}</p>
                      <span className="status-pill text-[#d7ffab]">{window.minutes} min open</span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">{formatTimeRange(window.startsAt, window.endsAt)}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                  No major open windows are visible right now. The floor looks tightly booked.
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">Shop calendar by barber</p>
            <p className="mt-2 text-sm text-white/58">Scan each chair lane by barber, tap any appointment to inspect it, and spot idle periods without opening a second schedule tool.</p>
          </div>
          <Scissors className="h-5 w-5 text-[#baff69]" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {isInitialLoading ? (
            <>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-56 w-full rounded-[24px]" /></div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-56 w-full rounded-[24px]" /></div>
            </>
          ) : barbers.length ? (
            barbers.map((barber) => {
              const barberAppointments = todayAppointments.filter((appointment) => appointment.barberId === barber.id);
              return (
                <div key={barber.id} className="rounded-[28px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{barber.name}</p>
                      <p className="mt-1 text-sm text-white/55">{barber.completedCount} completed • {barber.bookedCount} booked • {barber.utilization}% utilization</p>
                    </div>
                    <span className="status-pill text-[#d7ffab]">
                      {barber.liveAppointmentCount > 0 ? "Cutting now" : barber.nextAppointmentStart ? `Next ${formatTime(barber.nextAppointmentStart)}` : "Open chair"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {barberAppointments.length ? (
                      barberAppointments.map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => setSelectedAppointmentId(appointment.id)}
                          className={`w-full rounded-[22px] border p-4 text-left transition ${
                            appointment.id === selectedAppointment?.id
                              ? "border-[#7CFF00]/18 bg-[#7CFF00]/8"
                              : "border-white/8 bg-black/18 hover:border-[#7CFF00]/16 hover:bg-black/26"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{appointment.display.clientName}</p>
                              <p className="mt-1 text-sm text-white/55">{appointment.display.serviceName}</p>
                            </div>
                            <StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} />
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-white/58 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2">{formatTimeRange(appointment.start, appointment.end)}</div>
                            <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2">{appointment.chair}</div>
                            <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2">{currency(appointment.totalAmount)}</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                        No appointments on this barber&apos;s lane right now.
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
              The shop schedule will appear here once the first bookings are attached to this owner scope.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
