import "server-only";

import { CalendarSyncError } from "@/lib/calendar-sync/domain";

const CALENDAR_PROVIDER_TIMEOUT_MS = 15_000;

export async function fetchCalendarProvider(
  input: string | URL,
  init: RequestInit,
  errorCode: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALENDAR_PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new CalendarSyncError(
      "Calendar provider did not respond in time.",
      502,
      errorCode
    );
  } finally {
    clearTimeout(timeout);
  }
}
