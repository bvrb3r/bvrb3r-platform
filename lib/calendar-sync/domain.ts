import { createHash } from "node:crypto";

export const SQUARE_APPOINTMENTS_READ_SCOPE = "APPOINTMENTS_READ" as const;
export const SQUARE_CALENDAR_SCOPES = [SQUARE_APPOINTMENTS_READ_SCOPE] as const;

export const GOOGLE_BVRB3R_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created" as const;
export const GOOGLE_FREE_BUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy" as const;
export const GOOGLE_CALENDAR_SCOPES = [
  GOOGLE_BVRB3R_CALENDAR_SCOPE,
  GOOGLE_FREE_BUSY_SCOPE
] as const;

export const CALENDAR_SYNC_POLL_MINUTES = 5;
export const CALENDAR_BUSY_CACHE_MINUTES = 15;
export const CALENDAR_LOOP_TAG_PREFIX = "bvrb3r:";

export type CalendarProvider = "square" | "apple" | "google";
export type OAuthCalendarProvider = Extract<CalendarProvider, "square" | "google">;

export class CalendarSyncError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = "calendar_sync_failed"
  ) {
    super(message);
    this.name = "CalendarSyncError";
  }
}

function canonicalScopes(scopes: readonly string[]) {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean))).sort();
}

export function assertSquareReadOnlyScopes(scopes: readonly string[]) {
  const actual = canonicalScopes(scopes);
  const expected = [...SQUARE_CALENDAR_SCOPES].sort();
  if (actual.length !== expected.length || actual.some((scope, index) => scope !== expected[index])) {
    throw new CalendarSyncError(
      "Square authorization must grant Appointments read access only.",
      403,
      "square_scope_rejected"
    );
  }
  return [...SQUARE_CALENDAR_SCOPES];
}

export function assertGoogleCalendarScopes(scopes: readonly string[]) {
  const actual = canonicalScopes(scopes);
  const expected = [...GOOGLE_CALENDAR_SCOPES].sort();
  if (actual.length !== expected.length || actual.some((scope, index) => scope !== expected[index])) {
    throw new CalendarSyncError(
      "Google authorization must be limited to the BVRB3R-created calendar and free/busy access.",
      403,
      "google_scope_rejected"
    );
  }
  return [...GOOGLE_CALENDAR_SCOPES];
}

export function hashCalendarCapability(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildCalendarLoopTag(appointmentId: string) {
  return `${CALENDAR_LOOP_TAG_PREFIX}appointment:${appointmentId}`;
}

export function isBvrb3rCalendarLoopTag(value: string | null | undefined) {
  return Boolean(value?.startsWith(CALENDAR_LOOP_TAG_PREFIX));
}

export function buildBusyBlockHash(input: {
  provider: Extract<CalendarProvider, "apple" | "google">;
  calendarIdHash: string;
  sourceId?: string;
  startsAt: string;
  endsAt: string;
}) {
  return hashCalendarCapability([
    input.provider,
    input.calendarIdHash,
    input.sourceId ?? "freebusy-window",
    input.startsAt,
    input.endsAt
  ].join("|"));
}

export function assertValidBusyWindow(startsAt: string, endsAt: string) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new CalendarSyncError("Busy windows require a valid start before end.", 400, "invalid_busy_window");
  }
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString()
  };
}

export function resolveLastKnownCalendarState(input: {
  status: string | null;
  lastSuccessAt: string | null;
  lastSyncAt: string | null;
}) {
  const stampedAt = input.lastSuccessAt ?? input.lastSyncAt;
  return {
    servingLastKnown: input.status === "degraded" && Boolean(stampedAt),
    stampedAt
  };
}

export function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n");
}

export function formatIcsUtc(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CalendarSyncError("Calendar event time is invalid.", 500, "invalid_calendar_event_time");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
