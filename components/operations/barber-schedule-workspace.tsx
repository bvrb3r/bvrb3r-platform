"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, MessageSquareText } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { shiftBarberScheduleAnchorDate } from "@/lib/barber/domain";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberLifecycleMutation,
  useBarberScheduleQuery,
  useUpdateBarberScheduleMutation,
  type BarberApiError,
  type BarberOperationalAppointment,
  type BarberScheduleViewMode,
  type BarberWorkingHoursView
} from "@/lib/operations/barber-client";
import { getReadableActionError } from "@/lib/utils/feedback";

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type WorkingHoursFormRow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function buildWorkingHoursForm(rows: BarberWorkingHoursView[], locationId: string | null) {
  const map = new Map(rows.filter((row) => row.locationId === locationId).map((row) => [row.weekday, row]));
  return weekdayLabels.map((_, weekday) => {
    const row = map.get(weekday);
    return {
      weekday,
      startTime: row?.startTime ?? "",
      endTime: row?.endTime ?? ""
    } satisfies WorkingHoursFormRow;
  });
}

function getLifecycleAction(appointment: BarberOperationalAppointment) {
  if (appointment.status === "booked" || appointment.status === "confirmed") {
    return {
      action: "check_in" as const,
      label: "Check In",
      pendingLabel: "Checking in...",
      successMessage: "Client checked in and moved into the live chair flow."
    };
  }

  if (appointment.status === "checked_in") {
    return {
      action: "service_start" as const,
      label: "Start Service",
      pendingLabel: "Starting...",
      successMessage: "Service is now marked in progress."
    };
  }

  if (appointment.status === "in_service") {
    return {
      action: "service_complete" as const,
      label: "Complete Service",
      pendingLabel: "Completing...",
      successMessage: "Service completed and posted to earnings and shop reporting."
    };
  }

  return null;
}

function ScheduleSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-4 h-11 w-full rounded-2xl" />
    </div>
  );
}

function AppointmentCard({
  appointment,
  viewMode,
  onLifecycleAction,
  onMessage,
  isLifecyclePending,
  isMessagePending
}: {
  appointment: BarberOperationalAppointment;
  viewMode: BarberScheduleViewMode;
  onLifecycleAction: (appointment: BarberOperationalAppointment) => Promise<void>;
  onMessage: (appointment: BarberOperationalAppointment) => Promise<void>;
  isLifecyclePending: boolean;
  isMessagePending: boolean;
}) {
  const lifecycleAction = getLifecycleAction(appointment);

  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{appointment.display.clientName}</p>
          <p className="mt-1 text-sm text-white/55">
            {appointment.display.serviceName} - {viewMode === "day" ? formatTime(appointment.start) : formatDateTime(appointment.start)}
          </p>
        </div>
        <StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} />
      </div>

      <p className="mt-3 text-sm text-white/60">{appointment.display.locationLabel}</p>
      <p className="mt-2 text-sm text-white/56">{appointment.display.lifecycleDetail}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
          <p className="surface-label">Payment state</p>
          <p className="mt-2 text-sm font-medium">{appointment.financial.latestStatusLabel}</p>
          <p className="mt-1 text-sm text-white/55">Tip {appointment.financial.tipAmount > 0 ? `$${appointment.financial.tipAmount.toFixed(2)}` : "not recorded yet"}</p>
        </div>
        <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
          <p className="surface-label">Balance</p>
          <p className="mt-2 text-sm font-medium">${appointment.financial.outstandingBalance.toFixed(2)}</p>
          <p className="mt-1 text-sm text-white/55">
            {appointment.financial.outstandingBalance > 0 ? "Still needs checkout follow-up" : "No remaining balance"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {lifecycleAction ? (
          <Button className="h-11 px-4" disabled={isLifecyclePending} onClick={() => void onLifecycleAction(appointment)}>
            {isLifecyclePending ? lifecycleAction.pendingLabel : lifecycleAction.label}
          </Button>
        ) : (
          <span className="status-pill text-white/62">{appointment.display.lifecycleDetail}</span>
        )}
        <Button className="h-11 px-4" variant="secondary" disabled={isMessagePending} onClick={() => void onMessage(appointment)}>
          <MessageSquareText className="h-4 w-4" />
          {isMessagePending ? "Opening..." : "Message client"}
        </Button>
      </div>
    </div>
  );
}

export function BarberScheduleWorkspace({ barberName }: { barberName: string }) {
  const router = useRouter();
  const [scheduleView, setScheduleView] = useState<BarberScheduleViewMode>("day");
  const [anchorDate, setAnchorDate] = useState("");
  const scheduleQuery = useBarberScheduleQuery({
    viewMode: scheduleView,
    anchorDate: anchorDate || undefined
  });
  const scheduleMutation = useUpdateBarberScheduleMutation();
  const lifecycleMutation = useBarberLifecycleMutation();
  const createThreadMutation = useCreateMessageThreadMutation();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [workingHoursForm, setWorkingHoursForm] = useState<WorkingHoursFormRow[]>(() => buildWorkingHoursForm([], null));
  const [blockedStartsAt, setBlockedStartsAt] = useState("");
  const [blockedEndsAt, setBlockedEndsAt] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const payload = scheduleQuery.data;
  const locationOptions = useMemo(() => payload?.shops ?? [], [payload?.shops]);
  const timeline = payload?.timeline;
  const timelineAppointments = timeline?.appointments ?? payload?.todayAppointments ?? [];
  const errorMessage = scheduleQuery.error ? getReadableActionError(scheduleQuery.error as BarberApiError) : null;

  useEffect(() => {
    if (!anchorDate && payload?.timeline.anchorDate) {
      setAnchorDate(payload.timeline.anchorDate);
    }
  }, [anchorDate, payload?.timeline.anchorDate]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    const nextLocationId = selectedLocationId && locationOptions.some((entry) => entry.id === selectedLocationId)
      ? selectedLocationId
      : payload.status.currentShopId
        ?? locationOptions[0]?.id
        ?? payload.workingHours[0]?.locationId
        ?? null;

    if (nextLocationId !== selectedLocationId) {
      setSelectedLocationId(nextLocationId);
    }

    setWorkingHoursForm(buildWorkingHoursForm(payload.workingHours, nextLocationId));
  }, [payload, locationOptions, selectedLocationId]);

  function shiftTimeline(direction: -1 | 1) {
    const nextAnchorDate = anchorDate || timeline?.anchorDate || payload?.businessDate;
    if (!nextAnchorDate) {
      return;
    }

    setAnchorDate(shiftBarberScheduleAnchorDate(scheduleView, nextAnchorDate, direction));
  }

  function jumpToToday() {
    setAnchorDate(payload?.businessDate ?? new Date().toISOString().slice(0, 10));
  }

  async function handleSaveWorkingHours() {
    if (!selectedLocationId) {
      setStatusUpdate({ tone: "error", message: "Choose a shop before saving working hours." });
      return;
    }

    if (workingHoursForm.some((row) => (row.startTime && !row.endTime) || (!row.startTime && row.endTime))) {
      setStatusUpdate({ tone: "error", message: "Each active work day needs both a start and end time." });
      return;
    }

    setStatusUpdate(null);
    try {
      await scheduleMutation.mutateAsync({
        locationId: selectedLocationId,
        workingHours: workingHoursForm
          .filter((row) => row.startTime && row.endTime)
          .map((row) => ({
            weekday: row.weekday,
            startTime: row.startTime,
            endTime: row.endTime
          }))
      });
      setStatusUpdate({ tone: "success", message: "Working hours saved and next available time refreshed." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleAddBlockedPeriod() {
    if (!selectedLocationId) {
      setStatusUpdate({ tone: "error", message: "Choose a shop before adding blocked time." });
      return;
    }

    if (!blockedStartsAt || !blockedEndsAt) {
      setStatusUpdate({ tone: "error", message: "Blocked time needs both a start and end." });
      return;
    }

    setStatusUpdate(null);
    try {
      await scheduleMutation.mutateAsync({
        locationId: selectedLocationId,
        blockedPeriod: {
          startsAt: new Date(blockedStartsAt).toISOString(),
          endsAt: new Date(blockedEndsAt).toISOString(),
          reason: blockedReason.trim() || undefined
        }
      });
      setBlockedStartsAt("");
      setBlockedEndsAt("");
      setBlockedReason("");
      setStatusUpdate({ tone: "success", message: "Blocked time saved and next available time recalculated." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleLifecycleAction(appointment: BarberOperationalAppointment) {
    const nextAction = getLifecycleAction(appointment);
    if (!nextAction) {
      return;
    }

    setStatusUpdate(null);
    setPendingAppointmentId(appointment.id);

    try {
      await lifecycleMutation.mutateAsync({
        appointmentId: appointment.id,
        expectedRevision: appointment.revision,
        action: nextAction.action
      });
      setStatusUpdate({ tone: "success", message: nextAction.successMessage });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    } finally {
      setPendingAppointmentId(null);
    }
  }

  async function handleMessage(appointment: BarberOperationalAppointment) {
    setStatusUpdate(null);
    try {
      const thread = await createThreadMutation.mutateAsync({ appointmentId: appointment.id });
      if (thread.thread?.id) {
        router.push(`/workspace/messages/${thread.thread.id}`);
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="barber-schedule-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Chair schedule</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{barberName}</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
              Manage your working hours, time-off blocks, and same-day appointment flow without stepping outside the real booking lifecycle.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/18 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
              <CalendarDays className="h-4 w-4" />
              Timeline and availability
            </div>
            <p className="mt-4 text-sm text-white/58">
              Current live status: {payload?.status.liveStatusLabel ?? "Loading"}{payload?.status.currentShopLabel ? ` at ${payload.status.currentShopLabel}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Working hours</p>
              <p className="mt-2 text-sm text-white/58">Save the weekly schedule for one assigned shop at a time.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">{payload?.businessDate ?? "Live date"}</span>
          </div>

          <div className="mt-4">
            <label className="text-[11px] uppercase tracking-[0.18em] text-white/42" htmlFor="barber-schedule-location">Shop</label>
            <select
              id="barber-schedule-location"
              className="mt-2 h-12 w-full rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
              value={selectedLocationId ?? ""}
              onChange={(event) => setSelectedLocationId(event.target.value || null)}
            >
              <option value="" disabled>Select a shop</option>
              {locationOptions.map((location) => (
                <option key={location.id} value={location.id}>{location.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {scheduleQuery.isLoading && !payload ? (
              <>
                <ScheduleSkeleton />
                <ScheduleSkeleton />
              </>
            ) : workingHoursForm.map((row) => (
              <div key={row.weekday} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm font-medium text-white">{weekdayLabels[row.weekday]}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    type="time"
                    value={row.startTime}
                    onChange={(event) => {
                      const next = [...workingHoursForm];
                      next[row.weekday] = { ...next[row.weekday], startTime: event.target.value };
                      setWorkingHoursForm(next);
                    }}
                    className="h-11 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
                  />
                  <input
                    type="time"
                    value={row.endTime}
                    onChange={(event) => {
                      const next = [...workingHoursForm];
                      next[row.weekday] = { ...next[row.weekday], endTime: event.target.value };
                      setWorkingHoursForm(next);
                    }}
                    className="h-11 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button className="h-11 px-4" disabled={scheduleMutation.isPending || !selectedLocationId} onClick={() => void handleSaveWorkingHours()}>
              {scheduleMutation.isPending ? "Saving..." : "Save working hours"}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Blocked time</p>
              <p className="mt-2 text-sm text-white/58">Add real time-off or blackout windows without touching existing appointment truth.</p>
            </div>
            <Clock3 className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 grid gap-3">
            <input
              type="datetime-local"
              value={blockedStartsAt}
              onChange={(event) => setBlockedStartsAt(event.target.value)}
              className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
            />
            <input
              type="datetime-local"
              value={blockedEndsAt}
              onChange={(event) => setBlockedEndsAt(event.target.value)}
              className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
            />
            <input
              type="text"
              value={blockedReason}
              onChange={(event) => setBlockedReason(event.target.value)}
              placeholder="Reason (optional)"
              className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button className="h-11 px-4" variant="secondary" disabled={scheduleMutation.isPending || !selectedLocationId} onClick={() => void handleAddBlockedPeriod()}>
              {scheduleMutation.isPending ? "Saving..." : "Add blocked time"}
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {(payload?.blockedTimes ?? []).length ? payload!.blockedTimes.map((entry) => (
              <div key={entry.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm font-medium text-white">{formatDateTime(entry.startsAt)} - {formatDateTime(entry.endsAt)}</p>
                <p className="mt-2 text-sm text-white/58">{entry.reason ?? "Time blocked from new bookings."}</p>
              </div>
            )) : (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                No blocked periods are active yet.
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Schedule timeline</p>
            <p className="mt-2 text-sm text-white/58">Switch between day, week, and month ranges so future bookings stay visible without leaving the barber schedule.</p>
          </div>
          <span className="status-pill text-[#d7ffab]">{timelineAppointments.length} appointment{timelineAppointments.length === 1 ? "" : "s"} in range</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["day", "week", "month"] as const).map((viewMode) => (
            <Button
              key={viewMode}
              type="button"
              variant={scheduleView === viewMode ? "primary" : "secondary"}
              className="h-10 px-4"
              onClick={() => setScheduleView(viewMode)}
            >
              {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
            </Button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => shiftTimeline(-1)}>
            Previous
          </Button>
          <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => jumpToToday()}>
            Today
          </Button>
          <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => shiftTimeline(1)}>
            Next
          </Button>
          <input
            type="date"
            value={anchorDate || timeline?.anchorDate || payload?.businessDate || ""}
            onChange={(event) => setAnchorDate(event.target.value)}
            className="h-10 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
          />
        </div>

        <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
          <p className="surface-label">Showing</p>
          <p className="mt-2 text-white/82">{timeline?.rangeLabel ?? "Loading schedule range..."}</p>
        </div>

        <div className="mt-5 space-y-3">
          {scheduleQuery.isLoading && !payload ? (
            <>
              <ScheduleSkeleton />
              <ScheduleSkeleton />
              <ScheduleSkeleton />
            </>
          ) : timelineAppointments.length ? timelineAppointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              viewMode={scheduleView}
              onLifecycleAction={handleLifecycleAction}
              onMessage={handleMessage}
              isLifecyclePending={lifecycleMutation.isPending && pendingAppointmentId === appointment.id}
              isMessagePending={createThreadMutation.isPending}
            />
          )) : (
            <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
              No barber appointments are assigned in this {scheduleView} range yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
