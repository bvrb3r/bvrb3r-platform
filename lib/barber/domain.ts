export type BarberLiveStatus = "offline" | "available" | "busy" | "on_break" | "away";
export type BarberScheduleViewMode = "day" | "week" | "month";

export type BarberStatusInput = {
  liveStatus: BarberLiveStatus;
  isOnline?: boolean;
  acceptsWalkIns?: boolean;
  currentShopId?: string | null;
};

export type BarberWorkingHoursInputRow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error("Time values must use HH:MM format.");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error("Time values must be valid 24-hour times.");
  }

  return hours * 60 + minutes;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftIsoDate(value: string, days: number) {
  const next = toUtcDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

function shiftIsoMonth(value: string, months: number) {
  const next = toUtcDate(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return toIsoDate(next);
}

function formatScheduleDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options
  }).format(toUtcDate(value));
}

export function normalizeBarberScheduleViewMode(value?: string | null): BarberScheduleViewMode {
  if (value === "week" || value === "month") {
    return value;
  }

  return "day";
}

export function resolveBarberScheduleAnchorDate(anchorDate: string | null | undefined, fallbackDate: string) {
  return anchorDate && isIsoDate(anchorDate) ? anchorDate : fallbackDate;
}

export function shiftBarberScheduleAnchorDate(
  viewMode: BarberScheduleViewMode,
  anchorDate: string,
  direction: -1 | 1
) {
  if (viewMode === "week") {
    return shiftIsoDate(anchorDate, direction * 7);
  }

  if (viewMode === "month") {
    return shiftIsoMonth(anchorDate, direction);
  }

  return shiftIsoDate(anchorDate, direction);
}

export function buildBarberScheduleRange(viewMode: BarberScheduleViewMode, anchorDate: string) {
  if (viewMode === "week") {
    const weekday = toUtcDate(anchorDate).getUTCDay();
    const rangeStart = shiftIsoDate(anchorDate, -weekday);
    const rangeEnd = shiftIsoDate(rangeStart, 6);

    return {
      viewMode,
      anchorDate,
      rangeStart,
      rangeEnd,
      rangeLabel: `${formatScheduleDate(rangeStart, { month: "short", day: "numeric" })} - ${formatScheduleDate(rangeEnd, { month: "short", day: "numeric", year: "numeric" })}`
    };
  }

  if (viewMode === "month") {
    const rangeStart = `${anchorDate.slice(0, 8)}01`;
    const rangeEndDate = toUtcDate(rangeStart);
    rangeEndDate.setUTCMonth(rangeEndDate.getUTCMonth() + 1, 0);
    const rangeEnd = toIsoDate(rangeEndDate);

    return {
      viewMode,
      anchorDate,
      rangeStart,
      rangeEnd,
      rangeLabel: formatScheduleDate(rangeStart, { month: "long", year: "numeric" })
    };
  }

  return {
    viewMode,
    anchorDate,
    rangeStart: anchorDate,
    rangeEnd: anchorDate,
    rangeLabel: formatScheduleDate(anchorDate, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
  };
}

export function filterAppointmentsForBarberScheduleRange<T extends { start: string }>(
  appointments: T[],
  range: { rangeStart: string; rangeEnd: string; }
) {
  return appointments
    .filter((appointment) => {
      const appointmentDate = appointment.start.slice(0, 10);
      return appointmentDate >= range.rangeStart && appointmentDate <= range.rangeEnd;
    })
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
}

export function legacyStatusFromLiveStatus(status: BarberLiveStatus) {
  if (status === "available") {
    return "available" as const;
  }

  if (status === "busy") {
    return "busy" as const;
  }

  return "offline" as const;
}

export function formatLiveStatusLabel(status: BarberLiveStatus) {
  if (status === "on_break") {
    return "On break";
  }

  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function buildBarberStatusNote(status: BarberLiveStatus, acceptsWalkIns: boolean) {
  switch (status) {
    case "busy":
      return "Chair is active right now.";
    case "on_break":
      return "Temporarily away from the chair.";
    case "away":
      return "Marked away from the floor.";
    case "offline":
      return "Offline for discovery and walk-ins.";
    default:
      return acceptsWalkIns
        ? "Open for booked guests and walk-ins."
        : "Open for booked guests only.";
  }
}

export function normalizeBarberStatusInput(input: BarberStatusInput) {
  const requestedOnline = input.isOnline ?? input.liveStatus !== "offline";
  const isOnline = requestedOnline && input.liveStatus !== "offline";
  const liveStatus = isOnline ? input.liveStatus : "offline";
  const acceptsWalkIns = isOnline ? Boolean(input.acceptsWalkIns) : false;

  return {
    liveStatus,
    isOnline,
    acceptsWalkIns,
    currentShopId: input.currentShopId?.trim() || null
  };
}

export function normalizeWorkingHoursRows(rows: BarberWorkingHoursInputRow[]) {
  const normalized = rows.map((row) => ({
    weekday: row.weekday,
    startTime: row.startTime.trim(),
    endTime: row.endTime.trim()
  }));

  for (const row of normalized) {
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) {
      throw new Error("Working hour weekdays must be between 0 and 6.");
    }

    const startMinutes = timeToMinutes(row.startTime);
    const endMinutes = timeToMinutes(row.endTime);
    if (startMinutes >= endMinutes) {
      throw new Error("Working hours must end after they start.");
    }
  }

  const sorted = [...normalized].sort((left, right) => (
    left.weekday - right.weekday
    || timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
  ));

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.weekday !== current.weekday) {
      continue;
    }

    if (timeToMinutes(current.startTime) < timeToMinutes(previous.endTime)) {
      throw new Error("Working hours cannot overlap on the same day.");
    }
  }

  return sorted;
}
