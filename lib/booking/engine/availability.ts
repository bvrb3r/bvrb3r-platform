import {
  addDaysToDateKey,
  buildCanonicalDateAvailability,
  getDateKeyInTimeZone,
  getWeekdayForDateKey,
  normalizeBookingTimeZone,
  type AvailabilityBusyRange,
  type AvailabilityWorkingWindow
} from "@/lib/booking/availability-slot-engine";

/**
 * Bookable availability.
 *
 * The slot mathematics — timezone resolution, DST-correct wall-clock to UTC
 * conversion, open-window carving, interval stepping — already exists in
 * `lib/booking/availability-slot-engine.ts` and is not reimplemented here. This
 * module is the booking-engine layer on top of it, and it adds the four things
 * that make availability *bookable* rather than merely open:
 *
 *   1. Live holds count as busy. A slot someone is mid-checkout on is not free,
 *      or two people are sent to the same chair-minute by design.
 *   2. Reserved time is duration + cleanup buffer. The buffer is the barber's
 *      turnaround; offering a slot that ignores it books over the sweep-up.
 *   3. Lead time and horizon bound the window. "Bookable" has a floor (not in
 *      three minutes) and a ceiling (not in three years).
 *   4. Every empty result carries a reason. "No times" and "no times *because
 *      this barber does not work Tuesdays*" are different answers, and only the
 *      second one lets a person do something next.
 *
 * Everything in this file is pure. The database read lives in `index.ts`, so the
 * rules that decide what a person may book are testable without a database —
 * including the DST boundaries that are exactly the case nobody can reproduce
 * on demand in an integration test.
 */

export const DEFAULT_LEAD_TIME_MINUTES = 15;
export const DEFAULT_BOOKING_HORIZON_DAYS = 60;
export const DEFAULT_SLOT_INTERVAL_MINUTES = 15;
export const MAX_AVAILABILITY_DAYS = 30;

export type BookingAvailabilityPolicy = {
  timezone: string;
  leadTimeMinutes: number;
  bookingHorizonDays: number;
  slotIntervalMinutes: number;
  acceptsOnlineBooking: boolean;
};

export const DEFAULT_BOOKING_POLICY: BookingAvailabilityPolicy = {
  timezone: "America/New_York",
  leadTimeMinutes: DEFAULT_LEAD_TIME_MINUTES,
  bookingHorizonDays: DEFAULT_BOOKING_HORIZON_DAYS,
  slotIntervalMinutes: DEFAULT_SLOT_INTERVAL_MINUTES,
  acceptsOnlineBooking: true
};

/**
 * A missing policy row is not a misconfiguration — most barbers never touch
 * these. Out-of-range values are clamped rather than rejected, because refusing
 * to show any availability over a bad stored integer punishes the client for the
 * shop's data.
 */
export function resolveBookingPolicy(row: Partial<{
  booking_timezone: string | null;
  lead_time_minutes: number | null;
  booking_horizon_days: number | null;
  slot_interval_minutes: number | null;
  accepts_online_booking: boolean | null;
}> | null | undefined): BookingAvailabilityPolicy {
  return {
    timezone: normalizeBookingTimeZone(row?.booking_timezone ?? DEFAULT_BOOKING_POLICY.timezone),
    leadTimeMinutes: clamp(row?.lead_time_minutes, 0, 10_080, DEFAULT_LEAD_TIME_MINUTES),
    bookingHorizonDays: clamp(row?.booking_horizon_days, 1, 365, DEFAULT_BOOKING_HORIZON_DAYS),
    slotIntervalMinutes: clamp(row?.slot_interval_minutes, 5, 120, DEFAULT_SLOT_INTERVAL_MINUTES),
    acceptsOnlineBooking: row?.accepts_online_booking ?? true
  };
}

function clamp(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export type BookableServiceShape = {
  id: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  currency: string;
  active: boolean;
  bookable: boolean;
};

export type WorkingHoursRule = {
  weekday: number;
  startTime: string;
  endTime: string;
  sourceId?: string;
};

export type AvailabilityUnavailableReason =
  | "barber_not_accepting_bookings"
  | "service_not_bookable"
  | "no_working_window"
  | "fully_blocked_or_past"
  | "service_duration_exceeds_open_window"
  | "outside_booking_horizon";

export type BookableSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
  date: string;
};

export type BookingAvailabilityResult = {
  timezone: string;
  serviceId: string;
  serviceName: string;
  reservedMinutes: number;
  slots: BookableSlot[];
  days: Array<{
    date: string;
    slotCount: number;
    unavailableReason: AvailabilityUnavailableReason | null;
  }>;
  unavailableReason: AvailabilityUnavailableReason | null;
};

export type BookingAvailabilityInput = {
  service: BookableServiceShape;
  policy: BookingAvailabilityPolicy;
  workingHours: WorkingHoursRule[];
  /** Confirmed appointments, live holds and blocked time, already merged. */
  busyRanges: AvailabilityBusyRange[];
  startDate?: string | null;
  days?: number;
  now?: Date;
};

/**
 * The window a slot must occupy: the service itself plus the cleanup buffer that
 * follows it. Holds and appointments reserve the same span, so availability and
 * the overlap constraints agree on what "busy" means.
 */
export function reservedMinutesForService(service: Pick<BookableServiceShape, "durationMin" | "bufferMin">) {
  return Math.max(0, service.durationMin) + Math.max(0, service.bufferMin);
}

export function buildBookingAvailability(input: BookingAvailabilityInput): BookingAvailabilityResult {
  const timezone = normalizeBookingTimeZone(input.policy.timezone);
  const now = input.now ?? new Date();
  const reservedMinutes = reservedMinutesForService(input.service);

  const empty = (reason: AvailabilityUnavailableReason): BookingAvailabilityResult => ({
    timezone,
    serviceId: input.service.id,
    serviceName: input.service.name,
    reservedMinutes,
    slots: [],
    days: [],
    unavailableReason: reason
  });

  // Both of these are honest closed doors rather than empty calendars, and both
  // are decided from stored truth — never from anything the request asserted.
  if (!input.policy.acceptsOnlineBooking) {
    return empty("barber_not_accepting_bookings");
  }

  if (!input.service.active || !input.service.bookable || reservedMinutes <= 0) {
    return empty("service_not_bookable");
  }

  const todayKey = getDateKeyInTimeZone(now, timezone);
  const requestedStart = normalizeDateKey(input.startDate) ?? todayKey;
  // Asking for a date already behind the shop's own clock is not an error; it
  // resolves forward to today, because the caller wants the next opening.
  const startKey = requestedStart < todayKey ? todayKey : requestedStart;

  const horizonKey = addDaysToDateKey(todayKey, input.policy.bookingHorizonDays);
  if (startKey > horizonKey) {
    return empty("outside_booking_horizon");
  }

  const requestedDays = clamp(input.days, 1, MAX_AVAILABILITY_DAYS, 7);
  const rulesByWeekday = groupWorkingHours(input.workingHours);
  const earliestAt = new Date(now.getTime() + input.policy.leadTimeMinutes * 60_000).toISOString();

  const days: BookingAvailabilityResult["days"] = [];
  const slots: BookableSlot[] = [];

  for (let offset = 0; offset < requestedDays; offset += 1) {
    const dateKey = addDaysToDateKey(startKey, offset);
    if (dateKey > horizonKey) {
      break;
    }

    const weekday = getWeekdayForDateKey(dateKey);
    const windows = weekday === null ? [] : rulesByWeekday.get(weekday) ?? [];

    const dayAvailability = buildCanonicalDateAvailability({
      date: dateKey,
      timezone,
      workingWindows: windows,
      busyRanges: input.busyRanges,
      serviceDurationMinutes: reservedMinutes,
      slotIntervalMinutes: input.policy.slotIntervalMinutes,
      // Deliberately 1, not `reservedMinutes`. Discarding open windows shorter
      // than the service would collapse "this service is longer than the
      // barber's whole shift" into "fully blocked", and those are different
      // answers. The slot generator already refuses to place a service that
      // does not fit, so nothing unbookable escapes.
      minimumOpenWindowMinutes: 1,
      currentTime: now,
      sameDayLeadMinutes: input.policy.leadTimeMinutes,
      earliestAt
    });

    for (const slot of dayAvailability.bookableSlots) {
      slots.push({ ...slot, date: dateKey });
    }

    days.push({
      date: dateKey,
      slotCount: dayAvailability.bookableSlots.length,
      unavailableReason: dayAvailability.unavailableReason
    });
  }

  return {
    timezone,
    serviceId: input.service.id,
    serviceName: input.service.name,
    reservedMinutes,
    slots,
    days,
    // A range with no openings reports the reason from the first day that had
    // one, so the caller gets a specific answer instead of a shrug.
    unavailableReason: slots.length ? null : days.find((day) => day.unavailableReason)?.unavailableReason ?? "fully_blocked_or_past"
  };
}

function normalizeDateKey(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function groupWorkingHours(rules: WorkingHoursRule[]) {
  const grouped = new Map<number, AvailabilityWorkingWindow[]>();

  for (const rule of rules) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
      continue;
    }

    const windows = grouped.get(rule.weekday) ?? [];
    windows.push({ startTime: rule.startTime, endTime: rule.endTime, sourceId: rule.sourceId });
    grouped.set(rule.weekday, windows);
  }

  return grouped;
}

/**
 * Merges everything that makes a chair-minute unavailable into one list.
 *
 * Holds are filtered by liveness here rather than by status alone: expiry in the
 * database is lazy, so a row can still read `active` for a moment after its TTL
 * elapsed. Counting one of those as busy would hide a slot that is genuinely
 * free.
 */
export function mergeBusyRanges(input: {
  appointments: Array<{ starts_at: string; ends_at: string; status?: string | null }>;
  holds: Array<{ starts_at: string; ends_at: string; status?: string | null; expires_at: string }>;
  blockedTimes: Array<{ starts_at: string; ends_at: string }>;
  now?: Date;
}): AvailabilityBusyRange[] {
  const now = input.now ?? new Date();
  const ranges: AvailabilityBusyRange[] = [];

  for (const appointment of input.appointments) {
    if (appointment.status === "cancelled" || appointment.status === "no_show") {
      continue;
    }
    ranges.push({ startsAt: appointment.starts_at, endsAt: appointment.ends_at });
  }

  for (const hold of input.holds) {
    if (hold.status && hold.status !== "active") {
      continue;
    }
    if (new Date(hold.expires_at).getTime() <= now.getTime()) {
      continue;
    }
    ranges.push({ startsAt: hold.starts_at, endsAt: hold.ends_at });
  }

  for (const blocked of input.blockedTimes) {
    ranges.push({ startsAt: blocked.starts_at, endsAt: blocked.ends_at });
  }

  return ranges;
}
