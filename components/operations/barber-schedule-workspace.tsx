"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Images,
  ListOrdered,
  LockKeyhole,
  MessageSquareText,
  Plus,
  ReceiptText,
  Search,
  TabletSmartphone,
  UsersRound
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { KioskLaunchAction } from "@/components/kiosk/kiosk-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import { RoadHomeWidget } from "@/components/road/road-home-widget";
import {
  commandButtonIconAccentClassName,
  commandButtonIconClassName,
  commandButtonKioskClassName,
  commandButtonPrimaryClassName,
  commandButtonSecondaryClassName
} from "@/components/operations/command-calendar-styles";
import { ActionButton, Avatar, DataStatCard, GlassCard, StatusBadge } from "@/design/components";
import { isAppointmentRevenueEligible, isAvailabilityBlockingAppointmentStatus } from "@/lib/appointments/domain";
import { DEFAULT_BOOKING_TIME_ZONE, buildCanonicalDateAvailability } from "@/lib/booking/availability-slot-engine";
import { shiftBarberScheduleAnchorDate } from "@/lib/barber/domain";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberLifecycleMutation,
  useBarberQueueQuery,
  useBarberScheduleQuery,
  useUpdateBarberScheduleMutation,
  type BarberApiError,
  type BarberBlockedTimeView,
  type BarberExternalAppointmentView,
  type BarberOperationalAppointment,
  type BarberScheduleViewMode,
  type BarberWorkingHoursView
} from "@/lib/operations/barber-client";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortWeekdayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const inputClassName =
  "h-12 rounded-[18px] border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-[#c4f24e]/50 focus:ring-2 focus:ring-[#c4f24e]/15";

type WorkingHoursFormRow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

type OpenSlotView = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
};

type TimelineEntry =
  | {
      type: "appointment";
      id: string;
      startsAt: Date;
      endsAt: Date;
      appointment: BarberOperationalAppointment;
    }
  | {
      type: "external-appointment";
      id: string;
      startsAt: Date;
      endsAt: Date;
      appointment: BarberExternalAppointmentView;
    }
  | {
      type: "open-slot";
      id: string;
      startsAt: Date;
      endsAt: Date;
      slot: OpenSlotView;
    };

type BarberCalendarSource = "all" | "bvrb3r" | "booksy" | "square" | "thecut";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const currencyWithCentsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return getDateKey(new Date());
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function getDateKeyFromIso(iso: string) {
  return getDateKey(new Date(iso));
}

function buildDateTime(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time.length === 5 ? `${time}:00` : time}`);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatTime(iso: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

function formatHour(iso: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric"
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

function formatMonthYear(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(parseDateKey(dateKey));
}

function formatShortDate(iso: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

function formatTimeRange(start: string | Date, end: string | Date) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatMoney(amount: number) {
  return currencyFormatter.format(amount);
}

function formatMoneyWithCents(amount: number) {
  return currencyWithCentsFormatter.format(amount);
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function buildWeekStrip(anchorDateKey: string) {
  const anchor = parseDateKey(anchorDateKey);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      key: getDateKey(day),
      label: shortWeekdayLabels[day.getDay()],
      dayNumber: day.getDate()
    };
  });
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

function getWorkingWindow(
  dateKey: string,
  workingHours: BarberWorkingHoursView[],
  selectedLocationId: string | null
) {
  const weekday = parseDateKey(dateKey).getDay();
  const row = workingHours.find((entry) => entry.weekday === weekday && entry.locationId === selectedLocationId)
    ?? workingHours.find((entry) => entry.weekday === weekday);

  if (!row?.startTime || !row.endTime) {
    return null;
  }

  const startsAt = buildDateTime(dateKey, row.startTime);
  const endsAt = buildDateTime(dateKey, row.endTime);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return null;
  }

  return { startsAt, endsAt, locationLabel: row.locationLabel };
}

function getOverlapWindow(
  startsAt: Date,
  endsAt: Date,
  windowStartsAt: Date,
  windowEndsAt: Date
) {
  const start = new Date(Math.max(startsAt.getTime(), windowStartsAt.getTime()));
  const end = new Date(Math.min(endsAt.getTime(), windowEndsAt.getTime()));

  if (end <= start) {
    return null;
  }

  return { startsAt: start, endsAt: end };
}

function getAppointmentMinutes(appointment: BarberOperationalAppointment) {
  const startsAt = new Date(appointment.start);
  const endsAt = new Date(appointment.end);
  return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
}

function getScheduleTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_BOOKING_TIME_ZONE;
  } catch {
    return DEFAULT_BOOKING_TIME_ZONE;
  }
}

function buildOpenSlots({
  anchorDateKey,
  appointments,
  externalAppointments,
  blockedTimes,
  workingHours,
  selectedLocationId
}: {
  anchorDateKey: string;
  appointments: BarberOperationalAppointment[];
  externalAppointments: BarberExternalAppointmentView[];
  blockedTimes: BarberBlockedTimeView[];
  workingHours: BarberWorkingHoursView[];
  selectedLocationId: string | null;
}) {
  const weekday = parseDateKey(anchorDateKey).getDay();
  const locationWorkingHours = workingHours.filter((entry) => entry.weekday === weekday && entry.locationId === selectedLocationId);
  const fallbackWorkingHours = workingHours.filter((entry) => entry.weekday === weekday);
  const matchingWorkingHours = locationWorkingHours.length ? locationWorkingHours : fallbackWorkingHours;
  const availability = buildCanonicalDateAvailability({
    date: anchorDateKey,
    timezone: getScheduleTimeZone(),
    workingWindows: matchingWorkingHours.map((entry, index) => ({
      startTime: entry.startTime,
      endTime: entry.endTime,
      sourceId: `${entry.locationId}-${index}`
    })),
    busyRanges: [
      ...appointments
        .filter((appointment) => isAvailabilityBlockingAppointmentStatus(appointment.status))
        .map((appointment) => ({
          startsAt: appointment.start,
          endsAt: appointment.end
        })),
      ...externalAppointments
        .filter((appointment) => appointment.status !== "canceled" && appointment.status !== "no_show")
        .map((appointment) => ({
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt
        })),
      ...blockedTimes
        .map((blockedTime) => ({
          startsAt: blockedTime.startsAt,
          endsAt: blockedTime.endsAt
        }))
    ],
    serviceDurationMinutes: 15,
    slotIntervalMinutes: 15,
    minimumOpenWindowMinutes: 15
  });

  return availability.openWindows.map((slot) => ({
    id: slot.id,
    startsAt: new Date(slot.startsAt),
    endsAt: new Date(slot.endsAt),
    durationMinutes: slot.durationMinutes
  }));
}

function getUtilization({
  anchorDateKey,
  appointments,
  externalAppointments,
  blockedTimes,
  workingHours,
  selectedLocationId
}: {
  anchorDateKey: string;
  appointments: BarberOperationalAppointment[];
  externalAppointments: BarberExternalAppointmentView[];
  blockedTimes: BarberBlockedTimeView[];
  workingHours: BarberWorkingHoursView[];
  selectedLocationId: string | null;
}) {
  const workingWindow = getWorkingWindow(anchorDateKey, workingHours, selectedLocationId);

  if (!workingWindow) {
    return null;
  }

  const workingMinutes = Math.round((workingWindow.endsAt.getTime() - workingWindow.startsAt.getTime()) / 60000);
  const appointmentMinutes = appointments
    .filter((appointment) => getDateKeyFromIso(appointment.start) === anchorDateKey)
    .filter((appointment) => isAvailabilityBlockingAppointmentStatus(appointment.status))
    .reduce((sum, appointment) => sum + getAppointmentMinutes(appointment), 0);
  const externalAppointmentMinutes = externalAppointments
    .filter((appointment) => getDateKeyFromIso(appointment.startsAt) === anchorDateKey)
    .filter((appointment) => appointment.status !== "canceled" && appointment.status !== "no_show")
    .reduce(
      (sum, appointment) =>
        sum + Math.max(0, Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000)),
      0
    );
  const blockedMinutes = blockedTimes
    .filter((blockedTime) => getDateKeyFromIso(blockedTime.startsAt) === anchorDateKey)
    .reduce((sum, blockedTime) => {
      const overlap = getOverlapWindow(
        new Date(blockedTime.startsAt),
        new Date(blockedTime.endsAt),
        workingWindow.startsAt,
        workingWindow.endsAt
      );
      if (!overlap) {
        return sum;
      }

      return sum + Math.round((overlap.endsAt.getTime() - overlap.startsAt.getTime()) / 60000);
    }, 0);

  if (workingMinutes <= 0) {
    return null;
  }

  const usedMinutes = Math.min(workingMinutes, appointmentMinutes + externalAppointmentMinutes + blockedMinutes);
  const percent = Math.round((usedMinutes / workingMinutes) * 100);

  return {
    percent,
    openMinutes: Math.max(workingMinutes - usedMinutes, 0)
  };
}

function getStatusTone(status: string): "green" | "neutral" | "danger" {
  if (status === "cancelled" || status === "canceled" || status === "no_show" || status === "refunded") {
    return "danger";
  }

  if (status === "completed") {
    return "neutral";
  }

  return "green";
}

function getTier1StatusLabel(status: string) {
  if (status === "cancelled" || status === "canceled") {
    return "Canceled";
  }
  if (status === "no_show") {
    return "No-show";
  }
  if (status === "checked_in") {
    return "Checked in";
  }
  if (status === "in_service") {
    return "In service";
  }
  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatFullDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(iso));
}

function formatCardLabel(appointment: BarberOperationalAppointment) {
  const brand = appointment.financial.paymentMethodBrand;
  const last4 = appointment.financial.paymentMethodLast4;
  if (brand && last4) {
    return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ${last4}`;
  }
  return "Card on file";
}

function canCompleteAppointment(appointment: BarberOperationalAppointment) {
  return appointment.status === "confirmed" || appointment.status === "checked_in" || appointment.status === "in_service";
}

function isAppointmentPaidForCardCompletion(appointment: BarberOperationalAppointment) {
  return appointment.financial.outstandingBalance <= 0;
}

function canCancelAppointment(appointment: BarberOperationalAppointment) {
  return appointment.status === "confirmed" || appointment.status === "checked_in" || appointment.status === "in_service";
}

function canNoShowAppointment(appointment: BarberOperationalAppointment) {
  return appointment.status === "confirmed" || appointment.status === "checked_in";
}

function ScheduleSkeleton() {
  return (
    <GlassCard className="p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-4 h-11 w-full rounded-2xl" />
    </GlassCard>
  );
}

function AppointmentCard({
  appointment,
  viewMode,
  highlighted,
  onViewDetails,
  onCompleteRequest,
  onCheckout,
  onMessage,
  isCompleting,
  isMessagePending
}: {
  appointment: BarberOperationalAppointment;
  viewMode: BarberScheduleViewMode;
  highlighted: boolean;
  onViewDetails: (appointment: BarberOperationalAppointment) => void;
  onCompleteRequest: (appointment: BarberOperationalAppointment) => void;
  onCheckout: (appointment: BarberOperationalAppointment) => void;
  onMessage: (appointment: BarberOperationalAppointment) => Promise<void>;
  isCompleting: boolean;
  isMessagePending: boolean;
}) {
  const canComplete = canCompleteAppointment(appointment);
  const isPaid = isAppointmentPaidForCardCompletion(appointment);
  const isCompleted = appointment.status === "completed";

  return (
    <GlassCard
      active={highlighted}
      role="button"
      tabIndex={0}
      aria-label={`Open appointment details for ${appointment.display.clientName}`}
      className={cn(
        "cursor-pointer p-4",
        highlighted && "border-l-4 border-l-[#c4f24e] shadow-[0_18px_55px_rgba(196, 242, 78,0.10)]"
      )}
      onClick={() => onViewDetails(appointment)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewDetails(appointment);
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            src={appointment.display.clientProfilePhotoUrl}
            alt={appointment.display.clientName}
            initials={getInitials(appointment.display.clientName)}
            className="h-[54px] w-[54px]"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-[-0.02em] text-white">{appointment.display.clientName}</p>
            <p className="mt-1 truncate text-base font-semibold text-white/90">{appointment.display.serviceName}</p>
            <p className="mt-1 text-sm font-medium text-white/58">
              {viewMode === "day" ? formatTimeRange(appointment.start, appointment.end) : `${formatShortDate(appointment.start)} - ${formatTimeRange(appointment.start, appointment.end)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
          <StatusBadge tone={getStatusTone(appointment.status)}>{appointment.display.statusLabel}</StatusBadge>
          <p className="mt-0 text-base font-extrabold text-white sm:mt-3">{formatMoney(appointment.totalAmount)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/58">
        <span className="status-pill border-[#c4f24e]/24 text-[#e4f9b8]">BVRB3R</span>
        <span className="status-pill text-white/68">{appointment.display.locationLabel}</span>
        <span className="status-pill text-white/68">{appointment.financial.latestStatusLabel}</span>
        {appointment.status === "completed" && isPayoutEligible(appointment) ? <span className="status-pill text-[#e4f9b8]">Payout eligible</span> : null}
        {appointment.note?.trim() ? <span className="status-pill text-[#e4f9b8]">Notes</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        {canComplete && isPaid ? (
          <ActionButton
            type="button"
            className="min-h-10 px-4"
            disabled={isCompleting}
            onClick={(event) => {
              event.stopPropagation();
              onCompleteRequest(appointment);
            }}
          >
            {isCompleting ? "Completing service..." : "Complete service"}
          </ActionButton>
        ) : null}
        {canComplete && !isPaid ? (
          <ActionButton
            type="button"
            className="min-h-10 px-4"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              onCheckout(appointment);
            }}
          >
            Checkout
          </ActionButton>
        ) : null}
        {isCompleted ? <span className="status-pill min-h-10 text-white/68">Completed</span> : null}
        <ActionButton
          type="button"
          className="min-h-10 px-4"
          variant={canComplete && isPaid ? "secondary" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onViewDetails(appointment);
          }}
        >
          View Details
        </ActionButton>
        <ActionButton
          type="button"
          className="min-h-10 px-4"
          variant="secondary"
          disabled={isMessagePending}
          onClick={(event) => {
            event.stopPropagation();
            void onMessage(appointment);
          }}
        >
          <MessageSquareText className="h-4 w-4" />
          {isMessagePending ? "Opening..." : "Message"}
        </ActionButton>
      </div>
    </GlassCard>
  );
}

function ExternalAppointmentCard({
  appointment,
  viewMode
}: {
  appointment: BarberExternalAppointmentView;
  viewMode: BarberScheduleViewMode;
}) {
  const sourceBadge = appointment.sourceProvider === "square" ? "SQUARE APP" : appointment.sourceLabel;
  return (
    <GlassCard
      className="border-l-4 border-l-sky-300/60 p-4"
      data-testid={`external-calendar-entry-${appointment.sourceProvider}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            alt={appointment.clientName}
            initials={getInitials(appointment.clientName)}
            className="h-[54px] w-[54px]"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-[-0.02em] text-white">{appointment.clientName}</p>
            <p className="mt-1 truncate text-base font-semibold text-white/90">{appointment.serviceName}</p>
            <p className="mt-1 text-sm font-medium text-white/58">
              {viewMode === "day"
                ? formatTimeRange(appointment.startsAt, appointment.endsAt)
                : `${formatShortDate(appointment.startsAt)} - ${formatTimeRange(appointment.startsAt, appointment.endsAt)}`}
            </p>
          </div>
        </div>
        <StatusBadge tone={getStatusTone(appointment.status)}>{appointment.statusLabel}</StatusBadge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="status-pill border-sky-300/24 text-sky-100">{sourceBadge}</span>
        <span className="status-pill text-white/68">{appointment.locationLabel}</span>
        <span className="status-pill text-white/68">
          <LockKeyhole className="h-3.5 w-3.5" />
          Read-only source
        </span>
      </div>

      <div className="mt-4 rounded-[16px] border border-sky-300/12 bg-sky-300/[0.04] px-4 py-3 text-sm leading-6 text-white/62">
        {appointment.sourceProvider === "square" ? "Pays on Square. " : ""}
        Calendar details stay isolated to {appointment.sourceLabel}. Payment, checkout, lifecycle and revenue actions are unavailable in BVRB3R.
      </div>
    </GlassCard>
  );
}

function CompleteServiceConfirmation({
  appointment,
  isPending,
  onCancel,
  onConfirm
}: {
  appointment: BarberOperationalAppointment;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/74 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="complete-service-title">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#070707] p-5 text-white shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-6">
        <p className="bvr-section-label text-[#e4f9b8]">Chair action</p>
        <h3 id="complete-service-title" className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-white">
          Complete this service?
        </h3>
        <p className="mt-3 text-sm leading-6 text-white/62">
          This marks the appointment completed through the server. Payment/routing evidence will update from server records; payout release is not triggered here.
        </p>
        <div className="mt-4 rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-base font-extrabold text-white">{appointment.display.clientName}</p>
          <p className="mt-1 text-sm text-white/58">{appointment.display.serviceName} - {formatTimeRange(appointment.start, appointment.end)}</p>
          <p className="mt-2 text-sm font-bold text-[#e4f9b8]">{appointment.financial.latestStatusLabel}</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <ActionButton type="button" variant="secondary" className="min-h-11 px-4" disabled={isPending} onClick={onCancel}>
            Cancel
          </ActionButton>
          <ActionButton type="button" className="min-h-11 px-4" disabled={isPending} onClick={() => void onConfirm()}>
            {isPending ? "Completing service..." : "Complete service"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function OpenSlotCard({ slot, onBookSlot }: { slot: OpenSlotView; onBookSlot: (slot: OpenSlotView) => void }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#c4f24e]/34 bg-[#c4f24e]/[0.025] p-4 shadow-[0_16px_45px_rgba(0,0,0,0.30)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-[rgba(196, 242, 78,0.14)] text-[#c4f24e] shadow-[0_0_22px_rgba(196, 242, 78,0.20)]">
            <Plus className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-white">Open slot</p>
            <p className="mt-1 text-sm font-medium text-white/60">{formatTimeRange(slot.startsAt, slot.endsAt)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
          <p className="text-sm font-semibold text-white/70">{formatDuration(slot.durationMinutes)}</p>
          <p className="mt-1 text-base font-extrabold text-[#c4f24e]">Available</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t border-[#c4f24e]/12 pt-4">
        <ActionButton
          type="button"
          className="min-h-10 px-4"
          onClick={() => onBookSlot(slot)}
        >
          Book this slot
        </ActionButton>
      </div>
    </div>
  );
}

type AppointmentDetailAction = "service_complete" | "cancel" | "no_show";

type AppointmentLocalOverride = {
  status?: BarberOperationalAppointment["status"];
  completedAt?: string;
  updatedAt?: string;
  revision?: number;
  balanceDue?: number;
  display?: Partial<BarberOperationalAppointment["display"]>;
  financial?: Partial<BarberOperationalAppointment["financial"]>;
};

function mergeAppointmentOverride(appointment: BarberOperationalAppointment, override?: AppointmentLocalOverride) {
  if (!override) {
    return appointment;
  }

  return {
    ...appointment,
    ...override,
    display: {
      ...appointment.display,
      ...override.display
    },
    financial: {
      ...appointment.financial,
      ...override.financial
    }
  };
}

function isPayoutEligible(appointment: BarberOperationalAppointment) {
  return appointment.financial.moneyRoutingStatus === "ready_for_payout"
    || appointment.financial.payoutReadinessStatus === "eligible"
    || (appointment.financial.payoutReadinessStatus === "ready" && Boolean(appointment.financial.eligibleAt));
}

function getExpectedPayoutLabel(appointment: BarberOperationalAppointment) {
  return appointment.financial.barberPayoutAmount == null
    ? null
    : `Expected payout ${formatMoneyWithCents(appointment.financial.barberPayoutAmount)}`;
}

function AppointmentDetailsModal({
  appointment,
  view,
  pendingAction,
  onViewChange,
  onClose,
  onAction,
  onMessage,
  onBookNext,
  isMessagePending
}: {
  appointment: BarberOperationalAppointment;
  view: "details" | "transaction";
  pendingAction: AppointmentDetailAction | null;
  onViewChange: (view: "details" | "transaction") => void;
  onClose: () => void;
  onAction: (action: AppointmentDetailAction) => Promise<void>;
  onMessage: (appointment: BarberOperationalAppointment) => Promise<void>;
  onBookNext: (appointment: BarberOperationalAppointment) => void;
  isMessagePending: boolean;
}) {
  const [confirmAction, setConfirmAction] = useState<"cancel" | "no_show" | null>(null);
  const [transactionNotice, setTransactionNotice] = useState<string | null>(null);
  const isPaid = appointment.financial.outstandingBalance <= 0;
  const serviceComplete = appointment.status === "completed";
  const cardLabel = formatCardLabel(appointment);
  const payoutEligible = isPayoutEligible(appointment);
  const expectedPayoutLabel = getExpectedPayoutLabel(appointment);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/72 px-4 py-5 backdrop-blur-sm sm:px-6" role="dialog" aria-modal="true" aria-label={view === "transaction" ? "Transaction Details" : "Appointment Details"}>
      <div className="mx-auto w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#070707] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#c4f24e]/35"
            aria-label={view === "transaction" ? "Back to appointment details" : "Back to Calendar"}
            onClick={() => {
              if (view === "transaction") {
                onViewChange("details");
                return;
              }
              onClose();
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="bvr-section-label">{view === "transaction" ? "Transaction Details" : "Appointment Details"}</p>
            <h3 className="mt-2 truncate text-2xl font-extrabold tracking-[-0.03em] text-white">{appointment.display.clientName}</h3>
          </div>
          <StatusBadge tone={getStatusTone(appointment.status)}>{getTier1StatusLabel(appointment.status)}</StatusBadge>
        </div>

        {view === "transaction" ? (
          <div className="mt-6 space-y-4">
            {transactionNotice ? <FeedbackBanner tone="info" message={transactionNotice} /> : null}
            <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-[#c4f24e]" />
                <div>
                  <p className="text-base font-extrabold text-white">Card Payment</p>
                  <p className="mt-1 text-sm text-white/58">{cardLabel} · Card on file payment</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
                  <p className="surface-label">Receipt</p>
                  <p className="mt-2 text-sm font-semibold text-white">{appointment.financial.receiptNumber ?? `Receipt ${appointment.id.slice(-6).toUpperCase()}`}</p>
                </div>
                <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
                  <p className="surface-label">Paid</p>
                  <p className="mt-2 text-sm font-semibold text-white">{appointment.financial.paidAt ? formatDateTime(appointment.financial.paidAt) : appointment.financial.latestStatusLabel}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
              <p className="surface-label text-[#e4f9b8]">Items</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">{appointment.display.serviceName}</span>
                <span className="font-extrabold text-white">{formatMoneyWithCents(appointment.serviceTotal || appointment.totalAmount)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-sm text-white/62">
                <span>Tip</span>
                <span>{formatMoneyWithCents(appointment.tipAmount)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-base">
                <span className="font-extrabold text-white">Total</span>
                <span className="font-extrabold text-[#c4f24e]">{formatMoneyWithCents(appointment.grandTotal || appointment.totalAmount)}</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ActionButton type="button" variant="secondary" className="min-h-11 px-4" onClick={() => setTransactionNotice("Receipt resend is coming soon.")}>
                <ReceiptText className="h-4 w-4" />
                New Receipt
              </ActionButton>
              <ActionButton type="button" variant="secondary" className="min-h-11 px-4" onClick={() => setTransactionNotice("Refunds are not available from this screen yet.")}>
                <FileText className="h-4 w-4" />
                Issue Refund
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-[22px] border border-[#c4f24e]/20 bg-[#c4f24e]/[0.045] p-4">
              <p className="text-2xl font-extrabold text-white">{formatMoneyWithCents(appointment.grandTotal || appointment.totalAmount)} pre-paid</p>
              <p className="mt-2 text-sm font-semibold text-[#e4f9b8]">{serviceComplete ? "Service complete" : isPaid ? "Service not complete" : appointment.financial.latestStatusLabel}</p>
              {serviceComplete && payoutEligible ? (
                <p className="mt-2 text-sm font-semibold text-white/72">
                  Payout posture is evidence-based{expectedPayoutLabel ? ` - ${expectedPayoutLabel}` : ""}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
                <p className="surface-label">Client</p>
                <p className="mt-2 text-base font-extrabold text-white">{appointment.display.clientName}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
                <p className="surface-label">Date & Time</p>
                <p className="mt-2 text-base font-extrabold text-white">{formatFullDate(appointment.start)}</p>
                <p className="mt-1 text-sm text-white/58">{formatTimeRange(appointment.start, appointment.end)} · {formatDuration(getAppointmentMinutes(appointment))}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
                <p className="surface-label">Services & Items</p>
                <p className="mt-2 text-base font-extrabold text-white">{appointment.display.serviceName}</p>
                <p className="mt-1 text-sm text-white/58">{formatDuration(getAppointmentMinutes(appointment))} · {formatMoneyWithCents(appointment.serviceTotal || appointment.totalAmount)}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
                <p className="surface-label">Location</p>
                <p className="mt-2 text-base font-extrabold text-white">{appointment.display.locationLabel}</p>
                <p className="mt-1 text-sm text-white/58">{appointment.chair}</p>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="surface-label">Payments</p>
                  <p className="mt-2 text-base font-extrabold text-white">{cardLabel}</p>
                  <p className="mt-1 text-sm text-white/58">{formatMoneyWithCents(appointment.financial.capturedAmount || appointment.totalAmount)} paid · {appointment.financial.latestStatusLabel}</p>
                </div>
                <ActionButton type="button" variant="secondary" className="min-h-10 px-4" onClick={() => onViewChange("transaction")}>
                  View Transaction
                </ActionButton>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
              <p className="surface-label">Appointment Notes</p>
              <p className="mt-2 min-h-12 text-sm leading-6 text-white/62">{appointment.note?.trim() || "No notes yet."}</p>
            </div>

            {confirmAction ? (
              <div className="rounded-[22px] border border-rose-300/20 bg-rose-400/[0.06] p-4">
                <p className="text-base font-extrabold text-white">{confirmAction === "cancel" ? "Cancel this appointment?" : "Mark this client as a no-show?"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton type="button" variant="secondary" className="min-h-10 px-4" onClick={() => setConfirmAction(null)}>
                    Keep appointment
                  </ActionButton>
                  <ActionButton
                    type="button"
                    className="min-h-10 px-4"
                    disabled={pendingAction === confirmAction}
                    onClick={() => void onAction(confirmAction)}
                  >
                    {pendingAction === confirmAction
                      ? "Saving..."
                      : confirmAction === "cancel"
                        ? "Cancel appointment"
                        : "Mark no-show"}
                  </ActionButton>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              {canCompleteAppointment(appointment) ? (
                <ActionButton type="button" className="min-h-11 px-4" disabled={pendingAction === "service_complete"} onClick={() => void onAction("service_complete")}>
                  {pendingAction === "service_complete" ? "Completing service..." : "Complete service"}
                </ActionButton>
              ) : null}
              {canCancelAppointment(appointment) ? (
                <ActionButton type="button" variant="secondary" className="min-h-11 px-4" disabled={Boolean(pendingAction)} onClick={() => setConfirmAction("cancel")}>
                  Cancel Appointment
                </ActionButton>
              ) : null}
              {canNoShowAppointment(appointment) ? (
                <ActionButton type="button" variant="secondary" className="min-h-11 px-4" disabled={Boolean(pendingAction)} onClick={() => setConfirmAction("no_show")}>
                  Mark as No-Show
                </ActionButton>
              ) : null}
              <ActionButton type="button" variant="secondary" className="min-h-11 px-4" onClick={() => onBookNext(appointment)}>
                Book Next
              </ActionButton>
              <ActionButton type="button" variant="secondary" className="min-h-11 px-4" disabled={isMessagePending} onClick={() => void onMessage(appointment)}>
                <MessageSquareText className="h-4 w-4" />
                {isMessagePending ? "Opening..." : "Message"}
              </ActionButton>
              <ActionButton type="button" variant="secondary" className="min-h-11 px-4" onClick={onClose}>
                Back to Calendar
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type BarberScheduleWorkspaceSurface = "full" | "calendar" | "availability";

export function BarberScheduleWorkspace({
  barberName,
  surface = "full"
}: {
  barberName: string;
  surface?: BarberScheduleWorkspaceSurface;
}) {
  const router = useRouter();
  const availabilityRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [scheduleView, setScheduleView] = useState<BarberScheduleViewMode>("day");
  const [anchorDate, setAnchorDate] = useState(() => getTodayDateKey());
  const scheduleQuery = useBarberScheduleQuery({
    viewMode: scheduleView,
    anchorDate: anchorDate || undefined
  });
  const queueQuery = useBarberQueueQuery();
  const scheduleMutation = useUpdateBarberScheduleMutation();
  const appointmentActionMutation = useBarberLifecycleMutation();
  const createThreadMutation = useCreateMessageThreadMutation();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [workingHoursForm, setWorkingHoursForm] = useState<WorkingHoursFormRow[]>(() => buildWorkingHoursForm([], null));
  const [blockedStartsAt, setBlockedStartsAt] = useState("");
  const [blockedEndsAt, setBlockedEndsAt] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [pendingDetailAction, setPendingDetailAction] = useState<AppointmentDetailAction | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [completeConfirmationAppointmentId, setCompleteConfirmationAppointmentId] = useState<string | null>(null);
  const [appointmentDetailView, setAppointmentDetailView] = useState<"details" | "transaction">("details");
  const [appointmentOverrides, setAppointmentOverrides] = useState<Record<string, AppointmentLocalOverride>>({});
  const [calendarSource, setCalendarSource] = useState<BarberCalendarSource>("all");
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const showCalendar = surface !== "availability";
  const showAvailability = surface !== "calendar";

  const payload = scheduleQuery.data;
  const locationOptions = useMemo(() => payload?.shops ?? [], [payload?.shops]);
  const timeline = payload?.timeline;
  const selectedDateKey = anchorDate || getTodayDateKey();
  const timelineAppointments = useMemo(
    () => [...(timeline?.appointments ?? payload?.todayAppointments ?? [])]
      .map((appointment) => mergeAppointmentOverride(appointment, appointmentOverrides[appointment.id]))
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    [appointmentOverrides, payload?.todayAppointments, timeline?.appointments]
  );
  const timelineExternalAppointments = useMemo(
    () => [...(timeline?.externalAppointments ?? [])]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    [timeline?.externalAppointments]
  );
  const visibleAppointments = useMemo(
    () => calendarSource !== "all" && calendarSource !== "bvrb3r"
      ? []
      : scheduleView === "day"
        ? timelineAppointments.filter((appointment) => getDateKeyFromIso(appointment.start) === selectedDateKey)
        : timelineAppointments,
    [calendarSource, scheduleView, selectedDateKey, timelineAppointments]
  );
  const visibleExternalAppointments = useMemo(
    () => timelineExternalAppointments
      .filter((appointment) => calendarSource === "all" || appointment.sourceProvider === calendarSource)
      .filter((appointment) => scheduleView !== "day" || getDateKeyFromIso(appointment.startsAt) === selectedDateKey),
    [calendarSource, scheduleView, selectedDateKey, timelineExternalAppointments]
  );
  const selectedDayAppointments = useMemo(
    () => timelineAppointments.filter((appointment) => getDateKeyFromIso(appointment.start) === selectedDateKey),
    [selectedDateKey, timelineAppointments]
  );
  const selectedDayExternalAppointments = useMemo(
    () => timelineExternalAppointments.filter((appointment) => getDateKeyFromIso(appointment.startsAt) === selectedDateKey),
    [selectedDateKey, timelineExternalAppointments]
  );
  const calendarSourceCounts = useMemo(() => ({
    all: timelineAppointments.length + timelineExternalAppointments.length,
    bvrb3r: timelineAppointments.length,
    booksy: timelineExternalAppointments.filter((appointment) => appointment.sourceProvider === "booksy").length,
    square: timelineExternalAppointments.filter((appointment) => appointment.sourceProvider === "square").length,
    thecut: timelineExternalAppointments.filter((appointment) => appointment.sourceProvider === "thecut").length
  }), [timelineAppointments.length, timelineExternalAppointments]);
  const revenueEligibleDayAppointments = useMemo(
    () => selectedDayAppointments.filter((appointment) => isAppointmentRevenueEligible(appointment.status)),
    [selectedDayAppointments]
  );
  const activeExternalDayAppointments = useMemo(
    () => selectedDayExternalAppointments.filter(
      (appointment) => appointment.status !== "canceled" && appointment.status !== "no_show"
    ),
    [selectedDayExternalAppointments]
  );
  const openSlots = useMemo(
    () => scheduleView === "day"
      ? buildOpenSlots({
          anchorDateKey: selectedDateKey,
          appointments: timelineAppointments,
          externalAppointments: timelineExternalAppointments,
          blockedTimes: payload?.blockedTimes ?? [],
          workingHours: payload?.workingHours ?? [],
          selectedLocationId
        })
      : [],
    [payload?.blockedTimes, payload?.workingHours, scheduleView, selectedDateKey, selectedLocationId, timelineAppointments, timelineExternalAppointments]
  );
  const utilization = useMemo(
    () => getUtilization({
      anchorDateKey: selectedDateKey,
      appointments: timelineAppointments,
      externalAppointments: timelineExternalAppointments,
      blockedTimes: payload?.blockedTimes ?? [],
      workingHours: payload?.workingHours ?? [],
      selectedLocationId
    }),
    [payload?.blockedTimes, payload?.workingHours, selectedDateKey, selectedLocationId, timelineAppointments, timelineExternalAppointments]
  );
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const appointmentEntries = visibleAppointments.map((appointment) => ({
      type: "appointment" as const,
      id: appointment.id,
      startsAt: new Date(appointment.start),
      endsAt: new Date(appointment.end),
      appointment
    }));
    const slotEntries = openSlots.map((slot) => ({
      type: "open-slot" as const,
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      slot
    }));
    const externalEntries = visibleExternalAppointments.map((appointment) => ({
      type: "external-appointment" as const,
      id: appointment.id,
      startsAt: new Date(appointment.startsAt),
      endsAt: new Date(appointment.endsAt),
      appointment
    }));

    const sourceVisibleSlots = calendarSource === "all" || calendarSource === "bvrb3r"
      ? slotEntries
      : [];
    return [...appointmentEntries, ...externalEntries, ...sourceVisibleSlots]
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  }, [calendarSource, openSlots, visibleAppointments, visibleExternalAppointments]);
  const weekStrip = useMemo(() => buildWeekStrip(selectedDateKey), [selectedDateKey]);
  const estimatedEarnings = revenueEligibleDayAppointments.reduce((sum, appointment) => sum + appointment.totalAmount, 0);
  const currentOrNextAppointmentId = visibleAppointments.find((appointment) => appointment.status === "checked_in" || appointment.status === "in_service")?.id
    ?? visibleAppointments.find((appointment) => isAppointmentRevenueEligible(appointment.status) && new Date(appointment.start).getTime() >= Date.now())?.id
    ?? revenueEligibleDayAppointments[0]?.id
    ?? null;
  const selectedAppointment = selectedAppointmentId
    ? timelineAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null
    : null;
  const completeConfirmationAppointment = completeConfirmationAppointmentId
    ? timelineAppointments.find((appointment) => appointment.id === completeConfirmationAppointmentId) ?? null
    : null;
  const errorMessage = scheduleQuery.error ? getReadableActionError(scheduleQuery.error as BarberApiError) : null;
  const queueErrorMessage = queueQuery.error ? getReadableActionError(queueQuery.error as BarberApiError) : null;

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
    setAnchorDate(getTodayDateKey());
  }

  function openAvailabilityControls() {
    if (!showAvailability) {
      router.push("/dashboard/barber/more?section=availability");
      return;
    }

    availabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function handleViewDetails(appointment: BarberOperationalAppointment) {
    setSelectedAppointmentId(appointment.id);
    setAppointmentDetailView("details");
  }

  async function runAppointmentAction(appointment: BarberOperationalAppointment, action: AppointmentDetailAction, options: { closeDetailsOnComplete?: boolean; closeConfirmationOnComplete?: boolean } = {}) {
    const successMessage = action === "service_complete"
      ? "Service completed. Payment/routing evidence will update from server records."
      : action === "cancel"
        ? "Appointment canceled."
        : "Appointment marked as no-show.";

    setStatusUpdate(null);
    setPendingAppointmentId(appointment.id);
    setPendingDetailAction(action);

    try {
      const result = await appointmentActionMutation.mutateAsync({
        appointmentId: appointment.id,
        expectedRevision: appointment.revision,
        action,
        reason: action === "cancel"
          ? "Canceled by barber"
          : action === "no_show"
            ? "Marked no-show by barber"
            : undefined
      });
      const completionWarning = action === "service_complete" && result.warning
        ? "Service completed. Payout routing requires review."
        : null;
      const routing = result.routing ?? null;
      const nextStatus = result.appointment.status;
      const financialOverride = routing
        ? {
            payoutReadinessStatus: routing.status === "eligible" ? "eligible" : routing.payoutReadinessStatus ?? null,
            moneyRoutingStatus: routing.moneyRoutingStatus ?? (routing.status === "eligible" ? "ready_for_payout" : routing.status ?? null),
            eligibleAt: routing.eligibleAt ?? null,
            releasedAt: routing.releasedAt ?? null,
            barberPayoutAmount: routing.barberPayoutAmount ?? (routing.barberAmountCents == null ? null : routing.barberAmountCents / 100),
            platformFeeAmount: routing.platformFeeAmount ?? (routing.platformAmountCents == null ? null : routing.platformAmountCents / 100),
            shopSplitAmount: routing.shopSplitAmount ?? (routing.shopAmountCents == null ? null : routing.shopAmountCents / 100)
          }
        : undefined;
      setAppointmentOverrides((current) => ({
        ...current,
        [appointment.id]: {
          status: nextStatus,
          completedAt: result.appointment.completedAt,
          updatedAt: result.appointment.updatedAt,
          revision: result.appointment.revision,
          balanceDue: result.appointment.balanceDue,
          display: {
            statusLabel: getTier1StatusLabel(nextStatus),
            lifecycleDetail: nextStatus === "completed"
              ? "Service completed. Payout posture is evidence-based."
              : appointment.display.lifecycleDetail
          },
          financial: financialOverride
        }
      }));
      let modalClosed = false;
      if (action === "service_complete" && options.closeDetailsOnComplete) {
        setSelectedAppointmentId(null);
        setAppointmentDetailView("details");
        modalClosed = true;
      }
      if (action === "service_complete" && options.closeConfirmationOnComplete) {
        setCompleteConfirmationAppointmentId(null);
      }
      let refetchSucceeded = false;
      try {
        await scheduleQuery.refetch();
        refetchSucceeded = true;
      } catch {}
      console.info(action === "service_complete" ? "[barber-calendar] complete_action_result" : "[barber-calendar] appointment_action_result", {
        action,
        appointmentId: appointment.id,
        ok: true,
        previousStatus: appointment.status,
        nextStatus,
        modalClosed,
        refetchStarted: true,
        refetchSucceeded
      });
      setStatusUpdate(refetchSucceeded
        ? { tone: completionWarning ? "error" : "success", message: completionWarning ?? successMessage }
        : { tone: "error", message: action === "service_complete" ? "Service completed, but calendar refresh failed. Refresh the page." : successMessage });
    } catch (error) {
      const actionErrorMessage = getReadableActionError(error as BarberApiError);
      console.warn(action === "service_complete" ? "[barber-calendar] complete_action_result" : "[barber-calendar] appointment_action_result", {
        action,
        appointmentId: appointment.id,
        barberId: payload?.barberId ?? null,
        failedStep: "appointment_lifecycle_mutation",
        serverMessage: actionErrorMessage,
        ok: false,
        previousStatus: appointment.status,
        nextStatus: null,
        modalClosed: false,
        refetchStarted: false,
        refetchSucceeded: false
      });
      setStatusUpdate({
        tone: "error",
        message: action === "service_complete" ? "Completion failed. Refresh and try again." : actionErrorMessage
      });
    } finally {
      setPendingAppointmentId(null);
      setPendingDetailAction(null);
    }
  }

  async function handleAppointmentDetailAction(action: AppointmentDetailAction) {
    const appointment = selectedAppointment;
    if (!appointment) {
      return;
    }

    await runAppointmentAction(appointment, action, { closeDetailsOnComplete: true });
  }

  async function handleAppointmentCardComplete() {
    const appointment = completeConfirmationAppointment;
    if (!appointment || pendingAppointmentId === appointment.id) {
      return;
    }

    await runAppointmentAction(appointment, "service_complete", { closeConfirmationOnComplete: true });
  }

  async function handleMessage(appointment: BarberOperationalAppointment) {
    setStatusUpdate(null);
    try {
      const thread = await createThreadMutation.mutateAsync({ appointmentId: appointment.id });
      if (thread.thread?.id) {
        router.push(`/dashboard/barber/messages/${thread.thread.id}`);
      }
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  function handleBookOpenSlot(slot: OpenSlotView) {
    if (!payload?.barberId) {
      setStatusUpdate({ tone: "error", message: "Barber account is still loading. Try again in a moment." });
      return;
    }

    const params = new URLSearchParams({
      barberId: payload.barberId,
      appointmentTime: slot.startsAt.toISOString()
    });
    if (selectedLocationId) {
      params.set("locationId", selectedLocationId);
    }

    router.push(`/booking/new?${params.toString()}`);
  }

  function handleCheckoutAppointment(appointment: BarberOperationalAppointment) {
    router.push(`/dashboard/barber/checkout?appointmentId=${encodeURIComponent(appointment.id)}` as Route);
  }

  function handleAddAppointment() {
    const params = new URLSearchParams();
    if (payload?.barberId) {
      params.set("barberId", payload.barberId);
    }
    if (selectedLocationId) {
      params.set("locationId", selectedLocationId);
    }

    const query = params.toString();
    router.push(`/booking/new${query ? `?${query}` : ""}` as Route);
  }

  function handleBookNext() {
    setStatusUpdate({ tone: "success", message: "Book Next is coming soon." });
    setSelectedAppointmentId(null);
    setAppointmentDetailView("details");
  }

  return (
    <div className="space-y-6" data-testid="barber-schedule-workspace">
      {selectedAppointment ? (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          view={appointmentDetailView}
          pendingAction={pendingAppointmentId === selectedAppointment.id ? pendingDetailAction : null}
          onViewChange={setAppointmentDetailView}
          onClose={() => {
            setSelectedAppointmentId(null);
            setAppointmentDetailView("details");
          }}
          onAction={handleAppointmentDetailAction}
          onMessage={handleMessage}
          onBookNext={handleBookNext}
          isMessagePending={createThreadMutation.isPending}
        />
      ) : null}
      {completeConfirmationAppointment ? (
        <CompleteServiceConfirmation
          appointment={completeConfirmationAppointment}
          isPending={pendingAppointmentId === completeConfirmationAppointment.id && pendingDetailAction === "service_complete"}
          onCancel={() => setCompleteConfirmationAppointmentId(null)}
          onConfirm={handleAppointmentCardComplete}
        />
      ) : null}
      {!showCalendar && statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
      {!showCalendar && errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      {showCalendar ? (
        <>
      <GlassCard className="relative overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196, 242, 78,0.10),transparent_30%),radial-gradient(circle_at_bottom_center,rgba(196, 242, 78,0.06),transparent_28%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="bvr-section-label">Chair Command Calendar</p>
              <h2 className="mt-3 text-[2.35rem] font-black leading-none tracking-[-0.045em] text-white sm:text-5xl">
                Chair Command Calendar
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Your booked clients, open slots, and availability controls in one operating view.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[38rem] xl:grid-cols-4">
              <button
                type="button"
                className={commandButtonPrimaryClassName}
                onClick={handleAddAppointment}
              >
                <Plus className={commandButtonIconClassName} />
                Add Appointment
              </button>
              <button
                type="button"
                className={commandButtonSecondaryClassName}
                onClick={() => router.push("/dashboard/barber/culture" as Route)}
              >
                <Images className={commandButtonIconAccentClassName} />
                Open Culture
              </button>
              <KioskLaunchAction
                href={`/kiosk/barber/${encodeURIComponent(payload?.barberId ?? barberName)}` as Route}
                scope="barber"
                targetReference={payload?.barberId ?? barberName}
                settingsHref="/dashboard/barber/more?section=kiosk"
                className={commandButtonKioskClassName}
              >
                <TabletSmartphone className={commandButtonIconClassName} />
                Kiosk Mode
              </KioskLaunchAction>
              <button
                type="button"
                className={commandButtonSecondaryClassName}
                onClick={openAvailabilityControls}
              >
                <Clock3 className={commandButtonIconAccentClassName} />
                Block Time
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Focus calendar date"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white transition hover:border-[#c4f24e]/35 hover:shadow-[0_0_24px_rgba(196, 242, 78,0.12)]"
                onClick={() => dateInputRef.current?.focus()}
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Jump to today"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white transition hover:border-[#c4f24e]/35 hover:text-[#c4f24e]"
                onClick={jumpToToday}
              >
                <CalendarDays className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              className="inline-flex min-w-0 items-center justify-center gap-1 text-center text-xl font-extrabold tracking-[-0.02em] text-white sm:text-2xl"
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              <span className="truncate">{formatMonthYear(selectedDateKey)}</span>
              <ChevronDown className="h-5 w-5 shrink-0" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-[8px] border border-[#c4f24e]/24 bg-[#c4f24e]/10 px-4 text-sm font-extrabold text-[#c4f24e] transition hover:border-[#c4f24e]/40 hover:bg-[rgba(196, 242, 78,0.14)]"
              onClick={jumpToToday}
            >
              Today
            </button>
          </div>

          <input
            ref={dateInputRef}
            type="date"
            value={selectedDateKey}
            onChange={(event) => setAnchorDate(event.target.value)}
            className="sr-only"
            aria-label="Select calendar date"
          />

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekStrip.map((day) => {
              const isSelected = day.key === selectedDateKey;
              return (
                <button
                  key={day.key}
                  type="button"
                  className={cn(
                    "flex min-h-[64px] flex-col items-center justify-center rounded-[14px] border border-transparent px-1.5 transition sm:min-h-[76px] sm:rounded-[18px] sm:px-2",
                    isSelected
                      ? "border-[#c4f24e] bg-[rgba(196, 242, 78,0.06)] text-[#c4f24e] shadow-[0_0_24px_rgba(196, 242, 78,0.12)]"
                      : "text-white hover:border-white/10 hover:bg-white/[0.03]"
                  )}
                  onClick={() => setAnchorDate(day.key)}
                >
                  <span className={cn("text-xs font-bold tracking-[0.05em]", isSelected ? "text-[#c4f24e]" : "text-white/48")}>{day.label}</span>
                  <span className={cn("mt-2 text-xl font-bold leading-none sm:text-2xl", isSelected && "text-2xl font-black sm:text-3xl")}>{day.dayNumber}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DataStatCard
              className="min-h-[112px] rounded-[18px]"
              label="Appointments"
              value={revenueEligibleDayAppointments.length + activeExternalDayAppointments.length}
              detail="Active across all sources"
              icon={<CalendarCheck2 className="h-4 w-4" />}
            />
            <DataStatCard
              className="min-h-[112px] rounded-[18px]"
              label="Est. Earnings"
              value={formatMoney(estimatedEarnings)}
              detail="Today"
              icon={<CircleDollarSign className="h-4 w-4" />}
            />
            <DataStatCard
              className="min-h-[112px] rounded-[18px]"
              label="Open Slots"
              value={scheduleView === "day" ? openSlots.length : "--"}
              detail={scheduleView === "day" ? "Remaining" : "Day view"}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <DataStatCard
              className="min-h-[112px] rounded-[18px]"
              label="Day Utilization"
              value={utilization ? `${utilization.percent}%` : "--"}
              detail={<span className={utilization && utilization.percent >= 80 ? "font-bold text-[#c4f24e]" : undefined}>{utilization ? (utilization.percent >= 80 ? "Great" : `${formatDuration(utilization.openMinutes)} open`) : "Set hours"}</span>}
              icon={<UsersRound className="h-4 w-4" />}
            />
          </div>

          <div className="grid h-14 grid-cols-2 rounded-[18px] border border-white/8 bg-white/[0.025] p-1">
            {([
              ["day", "Day"],
              ["week", "Week"]
            ] as const).map(([viewMode, label]) => (
              <button
                key={viewMode}
                type="button"
                className={cn(
                  "rounded-[14px] text-sm font-extrabold transition",
                  scheduleView === viewMode
                    ? "bg-[linear-gradient(135deg,#c4f24e,#8fbf2e)] text-[#050505] shadow-[0_0_30px_rgba(196, 242, 78,0.24)]"
                    : "text-white/72 hover:text-white"
                )}
                onClick={() => setScheduleView(viewMode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="surface-label">Calendar source</p>
              <span className="text-xs text-white/46">External sources are read-only</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Calendar source">
              {([
                ["all", "All"],
                ["bvrb3r", "BVRB3R"],
                ["booksy", "Booksy"],
                ["square", "Square"],
                ["thecut", "theCut"]
              ] as const).map(([source, label]) => (
                <button
                  key={source}
                  type="button"
                  aria-pressed={calendarSource === source}
                  className={cn(
                    "status-pill min-h-10 shrink-0 transition",
                    calendarSource === source
                      ? "border-[#c4f24e]/40 bg-[#c4f24e]/12 text-[#e4f9b8]"
                      : "text-white/62 hover:border-white/18 hover:text-white"
                  )}
                  onClick={() => setCalendarSource(source)}
                >
                  {label} {calendarSourceCounts[source]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white/82">{timeline?.rangeLabel ?? formatShortDate(parseDateKey(selectedDateKey))}</p>
              <p className="mt-1 text-sm text-white/50">{payload?.status.currentShopLabel ?? "Assigned location"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge>{payload?.status.liveStatusLabel ?? "Loading"}</StatusBadge>
              <button
                type="button"
                className="status-pill min-h-10 text-white/72 transition hover:border-[#c4f24e]/24 hover:text-white"
                onClick={() => shiftTimeline(-1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="status-pill min-h-10 text-white/72 transition hover:border-[#c4f24e]/24 hover:text-white"
                onClick={() => shiftTimeline(1)}
              >
                Next
              </button>
            </div>
          </div>

          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
          {queueErrorMessage ? <FeedbackBanner tone="error" message={queueErrorMessage} /> : null}
        </div>
      </GlassCard>

      <GlassCard className="rounded-[28px] p-5 sm:p-6" data-testid="barber-unified-queue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="bvr-section-label">Unified queue</p>
            <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-white">Your chair line, one server truth</h3>
            <p className="mt-2 text-sm leading-6 text-white/58">
              Booked guests and walk-ins stay ordered by the canonical queue. Source and payment ownership remain isolated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-[#c4f24e]" />
            <span className="status-pill text-[#e4f9b8]">
              {queueQuery.data?.entries.length ?? 0} live
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {queueQuery.isLoading && !queueQuery.data ? (
            <>
              <ScheduleSkeleton />
              <ScheduleSkeleton />
            </>
          ) : queueQuery.data?.entries.length ? queueQuery.data.entries.map((entry) => (
            <div key={entry.id} className="rounded-[20px] border border-white/8 bg-black/22 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-extrabold text-white">{entry.clientName}</p>
                    <span className={cn(
                      "status-pill",
                      entry.sourceProvider === "bvrb3r" ? "text-[#e4f9b8]" : "border-sky-300/24 text-sky-100"
                    )}>
                      {entry.sourceProvider === "thecut"
                        ? "theCut"
                        : entry.sourceProvider === "bvrb3r"
                          ? "BVRB3R"
                          : entry.sourceProvider === "square"
                            ? "SQUARE APP"
                          : entry.sourceProvider.slice(0, 1).toUpperCase() + entry.sourceProvider.slice(1)}
                    </span>
                    <span className="status-pill text-white/62">{entry.entryType === "walkin" ? "Walk-in" : "Booked"}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/62">{entry.serviceName} · {entry.shopLabel}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/42">
                    {entry.paymentOwner === "external:square"
                      ? "Pays on Square"
                      : entry.paymentOwner.startsWith("external:")
                        ? "External payment owner"
                        : entry.paymentOwner.replaceAll("_", " ")}
                    {entry.assignmentLocked ? " · Barber locked" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {entry.position ? <span className="status-pill text-white/72">Position {entry.position}</span> : null}
                  {entry.estimatedWaitMinutes != null ? <span className="status-pill text-white/72">~{entry.estimatedWaitMinutes} min</span> : null}
                  <StatusBadge tone={getStatusTone(entry.status)}>{entry.statusLabel}</StatusBadge>
                </div>
              </div>
            </div>
          )) : (
            <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">
              No booked guest or walk-in is waiting for your chair.
            </div>
          )}
        </div>
      </GlassCard>

      <RoadHomeWidget compact={Boolean(currentOrNextAppointmentId)} />

      <GlassCard className="rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="bvr-section-label">Daily timeline</p>
            <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-white">Hour-by-hour chair control</h3>
          </div>
          <span className="status-pill text-[#e4f9b8]">
            {visibleAppointments.length + visibleExternalAppointments.length} appointment{visibleAppointments.length + visibleExternalAppointments.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="relative mt-6 space-y-3">
          <div className="absolute bottom-4 left-[4.45rem] top-4 hidden w-px bg-[linear-gradient(to_bottom,rgba(196, 242, 78,0.80),rgba(196, 242, 78,0.18))] sm:block" />

          {scheduleQuery.isLoading && !payload ? (
            <>
              <ScheduleSkeleton />
              <ScheduleSkeleton />
              <ScheduleSkeleton />
            </>
          ) : timelineEntries.length ? timelineEntries.map((entry) => (
            <div key={`${entry.type}-${entry.id}`} className="relative grid gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
              <div className="hidden justify-end pt-4 text-base font-semibold text-white/82 sm:flex">
                {scheduleView === "day" ? formatHour(entry.startsAt) : formatShortDate(entry.startsAt)}
              </div>
              <span className="absolute left-[4.22rem] top-7 hidden h-2 w-2 rounded-full bg-white/55 sm:block" />
              {entry.type === "appointment" ? (
                <AppointmentCard
                  appointment={entry.appointment}
                  viewMode={scheduleView}
                  highlighted={entry.appointment.id === currentOrNextAppointmentId}
                  onViewDetails={handleViewDetails}
                  onCompleteRequest={(appointment) => setCompleteConfirmationAppointmentId(appointment.id)}
                  onCheckout={handleCheckoutAppointment}
                  onMessage={handleMessage}
                  isCompleting={pendingAppointmentId === entry.appointment.id && pendingDetailAction === "service_complete"}
                  isMessagePending={createThreadMutation.isPending}
                />
              ) : entry.type === "external-appointment" ? (
                <ExternalAppointmentCard appointment={entry.appointment} viewMode={scheduleView} />
              ) : (
                <OpenSlotCard slot={entry.slot} onBookSlot={handleBookOpenSlot} />
              )}
            </div>
          )) : (
            <GlobalSafetyState
              state="empty_schedule"
              detail="No appointments or open slots are scheduled. Update availability to open the chair."
              actionLabel="Update availability"
              onAction={openAvailabilityControls}
            />
          )}

          <div className="relative grid gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
            <div className="hidden justify-end pt-5 text-base font-semibold text-white/82 sm:flex">Break</div>
            <span className="absolute left-[4.22rem] top-7 hidden h-2 w-2 rounded-full bg-white/55 sm:block" />
            <button
              type="button"
              className="flex min-h-[68px] items-center justify-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.025] px-5 text-base font-extrabold text-[#c4f24e] transition hover:border-[#c4f24e]/32 hover:bg-[rgba(196, 242, 78,0.07)]"
              onClick={openAvailabilityControls}
            >
              <Plus className="h-5 w-5" />
              Add block time or break
            </button>
          </div>
        </div>
      </GlassCard>
        </>
      ) : null}

      {showAvailability ? (
      <div ref={availabilityRef}>
        <GlassCard className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="bvr-section-label">Availability control</p>
              <h3 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-white">Working hours and blocked time</h3>
              <p className="mt-2 text-sm leading-6 text-white/58">Use canonical schedule controls. No appointment truth is overwritten here.</p>
            </div>
            <Clock3 className="h-5 w-5 text-[#c4f24e]" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[26px] border border-white/8 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label text-[#e4f9b8]">Working hours</p>
                  <p className="mt-2 text-sm text-white/58">Save one assigned shop schedule at a time.</p>
                </div>
                <span className="status-pill text-white/62">{payload?.businessDate ?? "Live date"}</span>
              </div>

              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-[0.18em] text-white/42" htmlFor="barber-schedule-location">Shop</label>
                <select
                  id="barber-schedule-location"
                  className={cn(inputClassName, "mt-2 w-full")}
                  value={selectedLocationId ?? ""}
                  onChange={(event) => setSelectedLocationId(event.target.value || null)}
                >
                  <option value="" disabled>Select a shop</option>
                  {locationOptions.map((location) => (
                    <option key={location.id} value={location.id}>{location.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {scheduleQuery.isLoading && !payload ? (
                  <>
                    <ScheduleSkeleton />
                    <ScheduleSkeleton />
                  </>
                ) : workingHoursForm.map((row) => (
                  <div key={row.weekday} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                    <p className="text-sm font-semibold text-white">{weekdayLabels[row.weekday]}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="time"
                        aria-label={`${weekdayLabels[row.weekday]} start time`}
                        value={row.startTime}
                        onChange={(event) => {
                          const next = [...workingHoursForm];
                          next[row.weekday] = { ...next[row.weekday], startTime: event.target.value };
                          setWorkingHoursForm(next);
                        }}
                        className={inputClassName}
                      />
                      <input
                        type="time"
                        aria-label={`${weekdayLabels[row.weekday]} end time`}
                        value={row.endTime}
                        onChange={(event) => {
                          const next = [...workingHoursForm];
                          next[row.weekday] = { ...next[row.weekday], endTime: event.target.value };
                          setWorkingHoursForm(next);
                        }}
                        className={inputClassName}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton type="button" disabled={scheduleMutation.isPending || !selectedLocationId} onClick={() => void handleSaveWorkingHours()}>
                  {scheduleMutation.isPending ? "Saving..." : "Save working hours"}
                </ActionButton>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/8 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="surface-label text-[#e4f9b8]">Blocked time</p>
                  <p className="mt-2 text-sm text-white/58">Add time-off, breaks, or blackout windows.</p>
                </div>
                <Plus className="h-5 w-5 text-[#c4f24e]" />
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  type="datetime-local"
                  aria-label="Blocked time start"
                  value={blockedStartsAt}
                  onChange={(event) => setBlockedStartsAt(event.target.value)}
                  className={inputClassName}
                />
                <input
                  type="datetime-local"
                  aria-label="Blocked time end"
                  value={blockedEndsAt}
                  onChange={(event) => setBlockedEndsAt(event.target.value)}
                  className={inputClassName}
                />
                <input
                  type="text"
                  value={blockedReason}
                  onChange={(event) => setBlockedReason(event.target.value)}
                  placeholder="Reason (optional)"
                  className={inputClassName}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={scheduleMutation.isPending || !selectedLocationId}
                  onClick={() => void handleAddBlockedPeriod()}
                >
                  {scheduleMutation.isPending ? "Saving..." : "Add blocked time"}
                </ActionButton>
              </div>

              <div className="mt-5 space-y-3">
                {(payload?.blockedTimes ?? []).length ? (payload?.blockedTimes ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-[20px] border border-white/8 bg-black/24 p-4">
                    <p className="text-sm font-semibold text-white">{formatDateTime(entry.startsAt)} - {formatDateTime(entry.endsAt)}</p>
                    <p className="mt-2 text-sm text-white/58">{entry.reason ?? "Time blocked from new bookings."}</p>
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/24 p-4 text-sm text-white/58">
                    No blocked periods are active yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
      ) : null}
    </div>
  );
}
