"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, CreditCard, MessageSquareText, Plus, X } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketplaceServiceCatalog } from "@/lib/marketplace/client";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberLifecycleMutation,
  useNotifyBarberOpenSlotMutation,
  useBarberOverviewQuery,
  type BarberApiError,
  type BarberOperationalAppointment
} from "@/lib/operations/barber-client";
import { useCreateQueueEntryMutation, useQueueEntryActionMutation } from "@/lib/operations/queue-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type DayCalendarRow = {
  key: string;
  label: string;
  startsAt: string;
  isHourMarker: boolean;
  isCurrentSlot: boolean;
  appointment?: BarberOperationalAppointment;
  durationMinutes?: number;
};

type LifecycleActionKey = "check_in" | "service_start" | "service_complete";

type LifecycleAction = {
  action: LifecycleActionKey;
  label: string;
  pendingLabel: string;
  enabled: boolean;
  successMessage: string;
};

type WalkInDraft = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  serviceId: string;
  paymentMode: "tap_to_pay" | "card_on_file";
};

const MINUTE_ROW_HEIGHT = 2.4;

type CompletionPrompt = {
  startsAt: string;
  locationId?: string | null;
  locationLabel?: string | null;
  source: BarberOperationalAppointment["source"];
};

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatTimelineTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getDurationMinutes(appointment: BarberOperationalAppointment) {
  const start = new Date(appointment.start).getTime();
  const end = new Date(appointment.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 15;
  }

  return Math.max(15, Math.round((end - start) / 60_000));
}

function getClientInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getLifecycleActions(appointment: BarberOperationalAppointment): LifecycleAction[] {
  const canCheckIn = appointment.status === "booked" || appointment.status === "confirmed";
  const canStart = appointment.status === "checked_in";
  const canComplete = appointment.status === "in_service";

  return [
    {
      action: "check_in",
      label: "Check In",
      pendingLabel: "Checking in...",
      enabled: canCheckIn,
      successMessage: "Client checked in. The chair is ready to start."
    },
    {
      action: "service_start",
      label: "Start Service",
      pendingLabel: "Starting...",
      enabled: canStart,
      successMessage: "Service started and the chair is now in progress."
    },
    {
      action: "service_complete",
      label: "Complete Service",
      pendingLabel: "Completing...",
      enabled: canComplete,
      successMessage:
        "Service completed. Wallet credit, tip finalization, receipt, and client app invite now move through the existing rails."
    }
  ];
}

function getScheduleTone(status: BarberOperationalAppointment["status"]) {
  if (status === "checked_in") {
    return {
      cardClass: "border-sky-400/22 bg-sky-500/10",
      metaClass: "border-sky-300/15 bg-sky-400/10 text-sky-100"
    };
  }

  if (status === "in_service") {
    return {
      cardClass: "border-[#7cff00]/28 bg-[#7cff00]/14 shadow-[0_16px_36px_rgba(124,255,0,0.14)]",
      metaClass: "border-[#d7ffab]/20 bg-[#7cff00]/12 text-[#ecffcf]"
    };
  }

  if (status === "completed") {
    return {
      cardClass: "border-white/8 bg-white/[0.03]",
      metaClass: "border-white/10 bg-white/[0.04] text-white/68"
    };
  }

  if (status === "cancelled" || status === "no_show") {
    return {
      cardClass: "border-rose-400/18 bg-rose-500/10",
      metaClass: "border-rose-300/18 bg-rose-400/10 text-rose-100"
    };
  }

  return {
    cardClass: "border-emerald-300/16 bg-emerald-400/10",
    metaClass: "border-emerald-200/16 bg-emerald-300/10 text-emerald-50"
  };
}

function roundDownToQuarterHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(Math.floor(next.getMinutes() / 15) * 15, 0, 0);
  return next;
}

function roundUpToQuarterHour(date: Date) {
  const next = new Date(date);
  const remainder = next.getMinutes() % 15;
  if (remainder !== 0 || next.getSeconds() !== 0 || next.getMilliseconds() !== 0) {
    next.setMinutes(next.getMinutes() + (15 - remainder), 0, 0);
  } else {
    next.setSeconds(0, 0);
  }
  return next;
}

function buildDayCalendarRows(appointments: BarberOperationalAppointment[], businessDate: string) {
  const sortedAppointments = [...appointments].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()
  );
  const now = new Date();
  const isBusinessDateToday = businessDate === getLocalDateKey(now);
  const earliest = sortedAppointments[0]
    ? roundDownToQuarterHour(new Date(sortedAppointments[0].start))
    : new Date(`${businessDate}T08:00:00`);
  const latestAppointment = sortedAppointments[sortedAppointments.length - 1];
  const latest = latestAppointment
    ? roundUpToQuarterHour(new Date(new Date(latestAppointment.end).getTime() + 30 * 60_000))
    : new Date(`${businessDate}T18:00:00`);
  earliest.setHours(Math.max(7, earliest.getHours() - 1), earliest.getMinutes(), 0, 0);
  latest.setHours(Math.min(22, latest.getHours()), latest.getMinutes(), 0, 0);

  const appointmentMap = new Map(sortedAppointments.map((appointment) => [new Date(appointment.start).toISOString(), appointment]));
  const rows: DayCalendarRow[] = [];

  for (
    let cursor = new Date(earliest);
    cursor.getTime() <= latest.getTime();
    cursor = new Date(cursor.getTime() + 15 * 60_000)
  ) {
    const slotIso = cursor.toISOString();
    const appointment = appointmentMap.get(slotIso);
    const coveredByEarlierAppointment = sortedAppointments.some((candidate) => {
      const start = new Date(candidate.start).getTime();
      const end = new Date(candidate.end).getTime();
      const slotTime = cursor.getTime();
      return slotTime > start && slotTime < end;
    });

    if (coveredByEarlierAppointment) {
      continue;
    }

    rows.push({
      key: slotIso,
      label: formatTimelineTime(slotIso),
      startsAt: slotIso,
      isHourMarker: cursor.getMinutes() === 0,
      isCurrentSlot: isBusinessDateToday && now >= cursor && now < new Date(cursor.getTime() + 15 * 60_000),
      appointment,
      durationMinutes: appointment ? getDurationMinutes(appointment) : undefined
    });
  }

  return rows;
}

function getServiceMoneyLabel(appointment: BarberOperationalAppointment) {
  if (appointment.financial.outstandingBalance > 0) {
    return `${currency(appointment.financial.outstandingBalance)} still due`;
  }

  if (appointment.financial.authorizedAmount > 0 && appointment.financial.capturedAmount === 0) {
    return `Deposit secured ${currency(appointment.financial.authorizedAmount)}`;
  }

  return "Paid in full";
}

function findNextOpenSlot(rows: DayCalendarRow[], afterIso: string) {
  const threshold = new Date(afterIso).getTime();
  return rows.find((row) => !row.appointment && new Date(row.startsAt).getTime() >= threshold) ?? null;
}

function isLiveAppointment(appointment: BarberOperationalAppointment, businessDate: string) {
  const now = new Date();
  if (businessDate !== getLocalDateKey(now)) {
    return false;
  }

  const start = new Date(appointment.start).getTime();
  const end = new Date(appointment.end).getTime();
  const current = now.getTime();
  return current >= start && current < end;
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

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid gap-3 md:grid-cols-[86px_minmax(0,1fr)]">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-16 w-full rounded-[24px]" />
        </div>
      ))}
    </div>
  );
}

export function BarberWorkspace({
  barberName,
  barberTitle
}: {
  barberName: string;
  barberTitle: string;
}) {
  const router = useRouter();
  const overviewQuery = useBarberOverviewQuery();
  const lifecycleMutation = useBarberLifecycleMutation();
  const notifyOpenSlotMutation = useNotifyBarberOpenSlotMutation();
  const createThreadMutation = useCreateMessageThreadMutation();
  const createQueueEntryMutation = useCreateQueueEntryMutation();
  const queueActionMutation = useQueueEntryActionMutation();
  const serviceCatalogQuery = useMarketplaceServiceCatalog();
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<BarberOperationalAppointment | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [completionPrompt, setCompletionPrompt] = useState<CompletionPrompt | null>(null);
  const [walkInSlot, setWalkInSlot] = useState<string | null>(null);
  const [walkInDraft, setWalkInDraft] = useState<WalkInDraft>({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    serviceId: "",
    paymentMode: "tap_to_pay"
  });

  const payload = overviewQuery.data;
  const todayAppointments = useMemo(() => payload?.todayAppointments ?? [], [payload?.todayAppointments]);
  const summary = payload?.summary;
  const earnings = payload?.earnings;
  const isInitialLoading = overviewQuery.isLoading && !payload;
  const errorMessage = overviewQuery.error ? getReadableActionError(overviewQuery.error as BarberApiError) : null;
  const businessDate = summary?.businessDate ?? new Date().toISOString().slice(0, 10);
  const calendarRows = useMemo(() => buildDayCalendarRows(todayAppointments, businessDate), [businessDate, todayAppointments]);
  const pendingWalkIn = createQueueEntryMutation.isPending || queueActionMutation.isPending;
  const serviceOptions = useMemo(() => {
    const catalog = serviceCatalogQuery.data;
    if (!catalog) {
      return [];
    }

    const items = [...catalog.editableServices, ...catalog.readOnlyServices];
    const unique = new Map(
      items.map((item) => [
        item.service.id,
        {
          id: item.service.id,
          label: `${item.service.name} - ${item.service.durationMin} min - ${currency(item.service.price)}`
        }
      ])
    );

    return [...unique.values()];
  }, [serviceCatalogQuery.data]);

  async function handleLifecycleAction(appointment: BarberOperationalAppointment, action: LifecycleAction) {
    if (!action.enabled) {
      return;
    }

    setStatusUpdate(null);
    setPendingAppointmentId(appointment.id);

    try {
      await lifecycleMutation.mutateAsync({
        appointmentId: appointment.id,
        expectedRevision: appointment.revision,
        action: action.action
      });
      if (action.action === "service_complete") {
        setSelectedAppointment(null);
        const nextOpenSlot = findNextOpenSlot(calendarRows, appointment.end);
        const isWalkInCompletion = appointment.source === "walk_in";
        const completionMessage = isWalkInCompletion
          ? "Walk-in completed. Receipt, app invite, repeat-client save, and future BVR Points messaging now move through the existing rails."
          : action.successMessage;

        if (nextOpenSlot) {
          setCompletionPrompt({
            startsAt: nextOpenSlot.startsAt,
            locationId: appointment.locationId,
            locationLabel: appointment.display.locationLabel,
            source: appointment.source
          });
          setStatusUpdate({
            tone: "success",
            message: `${completionMessage} ${formatDateTime(nextOpenSlot.startsAt)} is open next.`
          });
        } else {
          setCompletionPrompt(null);
          setStatusUpdate({ tone: "success", message: completionMessage });
        }
      } else {
        setCompletionPrompt(null);
        setStatusUpdate({ tone: "success", message: action.successMessage });
      }
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

  function openWalkInSlot(startsAt: string) {
    setWalkInSlot(startsAt);
    setStatusUpdate(null);
    setWalkInDraft((current) => ({
      ...current,
      serviceId: current.serviceId || serviceOptions[0]?.id || ""
    }));
  }

  async function handleCreateWalkIn() {
    if (!payload?.barberId) {
      setStatusUpdate({ tone: "error", message: "Barber identity is missing for this walk-in action." });
      return;
    }

    const shopId = payload.status.currentShopId ?? payload.shops[0]?.id;
    if (!shopId) {
      setStatusUpdate({ tone: "error", message: "Choose an active chair territory before adding a walk-in." });
      return;
    }

    if (!walkInSlot || !walkInDraft.clientName.trim() || !walkInDraft.clientPhone.trim() || !walkInDraft.serviceId) {
      setStatusUpdate({ tone: "error", message: "Walk-in booking needs a guest name, phone, and service." });
      return;
    }

    setStatusUpdate(null);

    try {
      const created = await createQueueEntryMutation.mutateAsync({
        clientName: walkInDraft.clientName.trim(),
        clientPhone: walkInDraft.clientPhone.trim(),
        clientEmail: walkInDraft.clientEmail.trim() || undefined,
        shopId,
        serviceId: walkInDraft.serviceId,
        preferredBarberId: payload.barberId,
        preferredDate: walkInSlot.slice(0, 10),
        preferredStartTime: walkInSlot.slice(11, 16),
        flexibilityMinutes: 0,
        queueSource: "walk_in",
        notes: `Secure payment handoff ${walkInDraft.paymentMode === "tap_to_pay" ? "tap to pay" : "card on file"}`
      });

      await queueActionMutation.mutateAsync({
        entryId: created.entry.id,
        action: "convert",
        barberId: payload.barberId,
        serviceId: walkInDraft.serviceId,
        appointmentTime: walkInSlot
      });

      setWalkInSlot(null);
      setWalkInDraft({
        clientName: "",
        clientPhone: "",
        clientEmail: "",
        serviceId: serviceOptions[0]?.id ?? "",
        paymentMode: "tap_to_pay"
      });
      setStatusUpdate({
        tone: "success",
        message: "Walk-in booking created from the open slot and added to the live calendar."
      });
      setCompletionPrompt(null);
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleNotifyOpenSlot() {
    if (!completionPrompt) {
      return;
    }

    setStatusUpdate(null);
    try {
      const result = await notifyOpenSlotMutation.mutateAsync({
        startsAt: completionPrompt.startsAt,
        locationId: completionPrompt.locationId,
        locationLabel: completionPrompt.locationLabel
      });
      setStatusUpdate({
        tone: "info",
        message: result.notificationsQueued
          ? `Availability nudges queued for ${result.audienceCount} eligible client${result.audienceCount === 1 ? "" : "s"} through the existing notification rails.`
          : "No eligible availability followers were waiting on this chair opening."
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  const appointmentActions = selectedAppointment ? getLifecycleActions(selectedAppointment) : [];

  return (
    <div className="space-y-4" data-testid="barber-workspace">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isInitialLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Today's bookings"
              value={String(earnings?.todayBookings ?? todayAppointments.length)}
              detail={`${summary?.completedCount ?? 0} completed and ${summary?.cancelledCount ?? 0} cancelled today`}
            />
            <StatCard
              label="Clients rebooked today"
              value={String(earnings?.clientsRebookedToday ?? 0)}
              detail={`${earnings?.upcomingBookings ?? 0} future visit${(earnings?.upcomingBookings ?? 0) === 1 ? "" : "s"} already on the books`}
            />
            <StatCard
              label="Gross sales"
              value={currency(earnings?.grossSales ?? 0)}
              detail={`${currency(earnings?.averageTicket ?? 0)} average ticket`}
            />
            <StatCard
              label="Tips tracked"
              value={currency(earnings?.tips ?? 0)}
              detail={`${earnings?.outstandingCheckoutCount ?? 0} completed service${earnings?.outstandingCheckoutCount === 1 ? "" : "s"} still carrying a balance`}
            />
          </>
        )}
      </section>

      {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
      {completionPrompt ? (
        <Card className="rounded-[28px] border border-[#7cff00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.08),rgba(8,8,8,0.98))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label text-[#d7ffab]">Chair reopened</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {formatDateTime(completionPrompt.startsAt)}
              </p>
              <p className="mt-2 text-sm text-white/60">
                {completionPrompt.source === "walk_in"
                  ? "The walk-in is closed cleanly. If you want to refill the chair, send a calm nudge to clients already following your availability."
                  : "The service is posted. If you want to refill the chair, nudge clients already following your availability or drop in another walk-in."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-11 px-5"
                disabled={notifyOpenSlotMutation.isPending}
                onClick={() => void handleNotifyOpenSlot()}
              >
                {notifyOpenSlotMutation.isPending ? "Notifying..." : "Notify eligible clients"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11 px-5"
                onClick={() => openWalkInSlot(completionPrompt.startsAt)}
              >
                Create walk-in
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/58">
              <CalendarDays className="h-4 w-4 text-[#d7ffab]" />
              Home calendar
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-pill text-[#d7ffab]">BVRB3R Platform</span>
              <span className="status-pill text-white/72">{barberName}</span>
              <span className="status-pill text-white/72">{payload?.status.currentShopLabel ?? "Chair territory loading"}</span>
              <span className="status-pill text-white/72">{barberTitle}</span>
            </div>
            <h3 className="mt-4 text-3xl font-semibold sm:text-4xl" data-display="true">
              Run the day from the chair.
            </h3>
            <p className="mt-3 text-sm text-white/58">
              Precise time slots, fast guest context, and walk-in capture all stay inside the live calendar.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/8 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">{formatLongDate(businessDate)}</p>
            <p className="mt-2 text-sm text-white/76">{payload?.status.currentShopLabel ?? "Chair territory"}</p>
            <p className="mt-1 text-sm text-white/56">{payload?.status.liveStatusLabel ?? "Available"}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isInitialLoading ? (
            <CalendarSkeleton />
          ) : (
            calendarRows.map((row) => {
              const appointment = row.appointment;
              const tone = appointment ? getScheduleTone(appointment.status) : null;
              const durationMinutes = appointment ? row.durationMinutes ?? getDurationMinutes(appointment) : 15;
              const blockHeight = Math.max(58, durationMinutes * MINUTE_ROW_HEIGHT);
              const isCurrentAppointment = appointment ? isLiveAppointment(appointment, businessDate) : false;

              return (
                <div key={row.key} className="grid gap-3 md:grid-cols-[92px_minmax(0,1fr)]">
                  <div className="pt-2 text-right">
                    <p
                      className={`text-[11px] uppercase tracking-[0.18em] ${
                        row.isCurrentSlot ? "text-[#d7ffab]" : row.isHourMarker ? "text-white/52" : "text-white/32"
                      }`}
                    >
                      {row.label}
                    </p>
                    {row.isCurrentSlot ? (
                      <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#7cff00]">Now</p>
                    ) : null}
                  </div>

                  {appointment && tone ? (
                    <button
                      type="button"
                      aria-label={`Open appointment details for ${appointment.display.clientName}`}
                      onClick={() => setSelectedAppointment(appointment)}
                      className={`w-full rounded-[24px] border p-4 text-left transition hover:border-[#7cff00]/24 ${tone.cardClass}`}
                      style={{ minHeight: `${blockHeight}px` }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {isCurrentAppointment ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-[#7cff00]" aria-hidden="true" />
                            ) : null}
                            <p className="text-base font-semibold text-white">{appointment.display.clientName}</p>
                          </div>
                          <p className="mt-1 text-sm text-white/60">{appointment.display.serviceName}</p>
                        </div>
                        <StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
                        <span className={`rounded-full border px-3 py-2 ${tone.metaClass}`}>
                          {formatTimelineTime(appointment.start)}
                        </span>
                        <span className={`rounded-full border px-3 py-2 ${tone.metaClass}`}>
                          {durationMinutes} min
                        </span>
                        <span className={`rounded-full border px-3 py-2 ${tone.metaClass}`}>{appointment.chair}</span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
                        <span>{appointment.display.locationLabel}</span>
                        <span>{getServiceMoneyLabel(appointment)}</span>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Create walk-in booking at ${row.label}`}
                      onClick={() => openWalkInSlot(row.startsAt)}
                      className={`flex min-h-[52px] w-full items-center justify-between rounded-[22px] border border-dashed px-4 py-3 text-left transition ${
                        row.isCurrentSlot
                          ? "border-[#7cff00]/22 bg-[#7cff00]/[0.06] text-white"
                          : "border-white/8 bg-black/18 text-white/58 hover:border-[#7cff00]/18 hover:text-white"
                      }`}
                    >
                      <span className="text-sm">{row.isCurrentSlot ? "Open slot right now" : "Open slot"}</span>
                      <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                        <Plus className="h-4 w-4 text-[#baff69]" />
                        Walk-in
                      </span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {selectedAppointment ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-4 sm:items-center"
          role="presentation"
          onClick={() => setSelectedAppointment(null)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label={`Appointment details for ${selectedAppointment.display.clientName}`}
            className="w-full max-w-2xl rounded-[32px] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="surface-label">Appointment detail</p>
                <h4 className="mt-3 text-2xl font-semibold text-white">{selectedAppointment.display.clientName}</h4>
                <p className="mt-2 text-sm text-white/58">{selectedAppointment.display.serviceName}</p>
              </div>
              <Button variant="secondary" className="h-10 px-3" onClick={() => setSelectedAppointment(null)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="mt-5 flex items-center gap-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
              {selectedAppointment.display.clientProfilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedAppointment.display.clientProfilePhotoUrl}
                  alt={selectedAppointment.display.clientName}
                  className="h-16 w-16 rounded-[20px] border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#7cff00]/18 bg-[#7cff00]/10 text-lg font-semibold text-[#d7ffab]">
                  {getClientInitials(selectedAppointment.display.clientName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedAppointment.status} balanceDue={selectedAppointment.balanceDue} />
                  <span className="status-pill text-white/72">{formatDateTime(selectedAppointment.start)}</span>
                </div>
                <p className="mt-3 text-sm text-white/62">
                  {selectedAppointment.display.locationLabel} | {selectedAppointment.chair}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Price</p>
                <p className="mt-3 text-2xl font-semibold">{currency(selectedAppointment.totalAmount)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Payment state</p>
                <p className="mt-3 text-lg font-semibold">{selectedAppointment.financial.latestStatusLabel}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Tip</p>
                <p className="mt-3 text-2xl font-semibold">{currency(selectedAppointment.financial.tipAmount)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Amount due</p>
                <p className="mt-3 text-2xl font-semibold">{currency(selectedAppointment.financial.outstandingBalance)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Notes</p>
              <p className="mt-3 text-sm leading-6 text-white/66">
                {selectedAppointment.note?.trim() || "No guest notes on this booking."}
              </p>
            </div>

            {selectedAppointment.source === "walk_in" ? (
              <div className="mt-4 rounded-[22px] border border-[#7cff00]/14 bg-[#7cff00]/[0.05] p-4">
                <p className="surface-label text-[#d7ffab]">Walk-in follow-up</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="status-pill text-white/78">Receipt through live payment rails</span>
                  <span className="status-pill text-white/78">Saved into repeat-client history</span>
                  <span className="status-pill text-white/78">App invite after completion</span>
                  <span className="status-pill text-white/78">Future BVR Points after paid app visits</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  Closing this walk-in keeps the guest inside the existing receipt, client-save, invite, and future rewards flows without creating any manual side path.
                </p>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {appointmentActions.map((action) => {
                const isPending =
                  lifecycleMutation.isPending && pendingAppointmentId === selectedAppointment.id && action.enabled;
                return (
                  <Button
                    key={action.action}
                    type="button"
                    className="h-11 px-4"
                    variant={action.enabled ? "primary" : "secondary"}
                    disabled={!action.enabled || isPending}
                    onClick={() => void handleLifecycleAction(selectedAppointment, action)}
                  >
                    {isPending ? action.pendingLabel : action.label}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="secondary"
                className="h-11 px-4"
                disabled={createThreadMutation.isPending}
                onClick={() => void handleMessage(selectedAppointment)}
              >
                <MessageSquareText className="h-4 w-4" />
                {createThreadMutation.isPending ? "Opening..." : "Message client"}
              </Button>
            </div>

            <div className="mt-4">
              <Link
                href="/clients"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/18 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/82 transition hover:border-[#7cff00]/18 hover:text-[#d7ffab] sm:text-[11px] sm:tracking-[0.22em]"
              >
                Open clients
              </Link>
            </div>
          </Card>
        </div>
      ) : null}

      {walkInSlot ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-4 sm:items-center"
          role="presentation"
          onClick={() => setWalkInSlot(null)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label={`Create walk-in booking for ${formatTimelineTime(walkInSlot)}`}
            className="w-full max-w-xl rounded-[32px] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="surface-label">Walk-in booking</p>
                <h4 className="mt-3 text-2xl font-semibold text-white">{formatDateTime(walkInSlot)}</h4>
                <p className="mt-2 text-sm text-white/58">
                  Capture the guest and drop them straight into the live chair calendar.
                </p>
              </div>
              <Button variant="secondary" className="h-10 px-3" onClick={() => setWalkInSlot(null)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="mt-5 grid gap-3">
              <Input
                placeholder="Guest name"
                value={walkInDraft.clientName}
                onChange={(event) => setWalkInDraft((current) => ({ ...current, clientName: event.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Phone"
                  value={walkInDraft.clientPhone}
                  onChange={(event) => setWalkInDraft((current) => ({ ...current, clientPhone: event.target.value }))}
                />
                <Input
                  placeholder="Email"
                  value={walkInDraft.clientEmail}
                  onChange={(event) => setWalkInDraft((current) => ({ ...current, clientEmail: event.target.value }))}
                />
              </div>
              <Select
                value={walkInDraft.serviceId}
                onChange={(event) => setWalkInDraft((current) => ({ ...current, serviceId: event.target.value }))}
              >
                <option value="">Choose service</option>
                {serviceOptions.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.label}
                  </option>
                ))}
              </Select>
              <Select
                value={walkInDraft.paymentMode}
                onChange={(event) =>
                  setWalkInDraft((current) => ({
                    ...current,
                    paymentMode: event.target.value as WalkInDraft["paymentMode"]
                  }))
                }
              >
                <option value="tap_to_pay">Collect card with tap to pay</option>
                <option value="card_on_file">Charge saved card on file</option>
              </Select>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/62">
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-4 w-4 text-[#d7ffab]" />
                <p>
                  Card collection stays on the existing secure Stripe rail. This screen captures the guest and payment
                  handoff, but does not store raw card numbers.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                className="h-11 px-5"
                disabled={pendingWalkIn || !serviceOptions.length}
                onClick={() => void handleCreateWalkIn()}
              >
                {pendingWalkIn ? "Creating..." : "Create walk-in booking"}
              </Button>
              <Button variant="secondary" className="h-11 px-5" onClick={() => setWalkInSlot(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
