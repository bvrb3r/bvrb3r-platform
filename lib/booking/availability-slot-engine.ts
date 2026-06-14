export const DEFAULT_BOOKING_TIME_ZONE = "America/New_York";

export type AvailabilityBusyRange = {
  startsAt: string;
  endsAt: string;
};

export type AvailabilityWorkingWindow = {
  startTime: string;
  endTime: string;
  sourceId?: string;
};

export type AvailabilityOpenWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

export type AvailabilityBookableSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

export type CanonicalDateAvailability = {
  date: string;
  timezone: string;
  openWindows: AvailabilityOpenWindow[];
  bookableSlots: AvailabilityBookableSlot[];
  unavailableReason: "no_working_window" | "fully_blocked_or_past" | "service_duration_exceeds_open_window" | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function normalizeBookingTimeZone(value?: string | null) {
  const timezone = value || DEFAULT_BOOKING_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_BOOKING_TIME_ZONE;
  }
}

function parseDateKey(value: string) {
  const match = value.match(dateKeyPattern);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function parseTime(value: string) {
  const match = value.match(timePattern);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0)
  };
}

function getTimeZoneParts(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function getDateKeyInTimeZone(date: Date, timezone = DEFAULT_BOOKING_TIME_ZONE) {
  const parts = getTimeZoneParts(date, normalizeBookingTimeZone(timezone));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getWeekdayForDateKey(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return null;
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function normalizeAvailabilityDateKey(value?: string | null) {
  return value && dateKeyPattern.test(value) ? value : null;
}

export function zonedDateTimeToUtc(dateKey: string, time: string, timezone = DEFAULT_BOOKING_TIME_ZONE) {
  const safeTimeZone = normalizeBookingTimeZone(timezone);
  const date = parseDateKey(dateKey);
  const timeParts = parseTime(time);
  if (!date || !timeParts) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
    0
  ));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, safeTimeZone);
  let result = new Date(utcGuess.getTime() - firstOffset);
  const correctedOffset = getTimeZoneOffsetMs(result, safeTimeZone);
  if (correctedOffset !== firstOffset) {
    result = new Date(utcGuess.getTime() - correctedOffset);
  }

  return result;
}

function getDurationMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function overlaps(start: Date, end: Date, range: { startsAt: Date; endsAt: Date }) {
  return start.getTime() < range.endsAt.getTime() && end.getTime() > range.startsAt.getTime();
}

function getOverlapWindow(start: Date, end: Date, range: { startsAt: Date; endsAt: Date }) {
  const startsAt = new Date(Math.max(start.getTime(), range.startsAt.getTime()));
  const endsAt = new Date(Math.min(end.getTime(), range.endsAt.getTime()));
  return endsAt > startsAt ? { startsAt, endsAt } : null;
}

function ceilToInterval(date: Date, intervalMinutes: number) {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}

function formatSlotLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function buildCanonicalDateAvailability(input: {
  date: string;
  timezone?: string;
  workingWindows: AvailabilityWorkingWindow[];
  busyRanges: AvailabilityBusyRange[];
  serviceDurationMinutes?: number;
  slotIntervalMinutes?: number;
  minimumOpenWindowMinutes?: number;
  currentTime?: Date;
  sameDayLeadMinutes?: number;
  earliestAt?: string | null;
}): CanonicalDateAvailability {
  const timezone = normalizeBookingTimeZone(input.timezone);
  const slotIntervalMinutes = input.slotIntervalMinutes ?? 30;
  const serviceDurationMinutes = input.serviceDurationMinutes ?? 0;
  const minimumOpenWindowMinutes = input.minimumOpenWindowMinutes ?? Math.max(serviceDurationMinutes, 15);
  const currentTime = input.currentTime ?? new Date();
  const earliestDate = input.earliestAt ? new Date(input.earliestAt) : null;
  const earliestThresholdMs = earliestDate && !Number.isNaN(earliestDate.getTime())
    ? Math.max(currentTime.getTime() + (input.sameDayLeadMinutes ?? 15) * 60_000, earliestDate.getTime())
    : currentTime.getTime() + (input.sameDayLeadMinutes ?? 15) * 60_000;
  const busyRanges = input.busyRanges
    .map((range) => ({
      startsAt: new Date(range.startsAt),
      endsAt: new Date(range.endsAt)
    }))
    .filter((range) => !Number.isNaN(range.startsAt.getTime()) && !Number.isNaN(range.endsAt.getTime()) && range.endsAt > range.startsAt)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const openWindows: AvailabilityOpenWindow[] = [];

  for (const [index, window] of input.workingWindows.entries()) {
    const windowStart = zonedDateTimeToUtc(input.date, window.startTime, timezone);
    const windowEnd = zonedDateTimeToUtc(input.date, window.endTime, timezone);
    if (!windowStart || !windowEnd || windowEnd <= windowStart) {
      continue;
    }

    let cursor = new Date(Math.max(windowStart.getTime(), earliestThresholdMs));
    const overlappingBusyRanges = busyRanges
      .map((range) => getOverlapWindow(range.startsAt, range.endsAt, { startsAt: cursor, endsAt: windowEnd }))
      .filter((range): range is { startsAt: Date; endsAt: Date } => Boolean(range))
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

    for (const busyRange of overlappingBusyRanges) {
      if (busyRange.startsAt > cursor) {
        const durationMinutes = getDurationMinutes(cursor, busyRange.startsAt);
        if (durationMinutes >= minimumOpenWindowMinutes) {
          openWindows.push({
            id: `${input.date}-${window.sourceId ?? index}-${cursor.toISOString()}-${busyRange.startsAt.toISOString()}`,
            startsAt: cursor.toISOString(),
            endsAt: busyRange.startsAt.toISOString(),
            durationMinutes
          });
        }
      }

      if (busyRange.endsAt > cursor) {
        cursor = busyRange.endsAt;
      }
    }

    if (windowEnd > cursor) {
      const durationMinutes = getDurationMinutes(cursor, windowEnd);
      if (durationMinutes >= minimumOpenWindowMinutes) {
        openWindows.push({
          id: `${input.date}-${window.sourceId ?? index}-${cursor.toISOString()}-${windowEnd.toISOString()}`,
          startsAt: cursor.toISOString(),
          endsAt: windowEnd.toISOString(),
          durationMinutes
        });
      }
    }
  }

  const bookableSlots = openWindows.flatMap((window) => {
    if (!serviceDurationMinutes) {
      return [];
    }

    const slots: AvailabilityBookableSlot[] = [];
    let cursor = ceilToInterval(new Date(window.startsAt), slotIntervalMinutes);
    const windowEnd = new Date(window.endsAt);

    while (cursor.getTime() + serviceDurationMinutes * 60_000 <= windowEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + serviceDurationMinutes * 60_000);
      if (!busyRanges.some((range) => overlaps(cursor, slotEnd, range))) {
        slots.push({
          startsAt: cursor.toISOString(),
          endsAt: slotEnd.toISOString(),
          label: formatSlotLabel(cursor, timezone)
        });
      }
      cursor = new Date(cursor.getTime() + slotIntervalMinutes * 60_000);
    }

    return slots;
  });

  const unavailableReason = input.workingWindows.length === 0
    ? "no_working_window"
    : openWindows.length === 0
      ? "fully_blocked_or_past"
      : serviceDurationMinutes && bookableSlots.length === 0
        ? "service_duration_exceeds_open_window"
        : null;

  return {
    date: input.date,
    timezone,
    openWindows,
    bookableSlots,
    unavailableReason
  };
}
