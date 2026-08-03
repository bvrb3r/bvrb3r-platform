import "server-only";

import {
  assertGoogleCalendarScopes,
  CalendarSyncError,
  GOOGLE_CALENDAR_SCOPES
} from "@/lib/calendar-sync/domain";
import { fetchCalendarProvider } from "@/lib/calendar-sync/provider-fetch";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
};

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new CalendarSyncError("Google Calendar OAuth is not configured.", 503, "google_oauth_unavailable");
  }
  return { clientId, clientSecret, redirectUri };
}

async function parseGoogleResponse<T>(response: Response, fallbackCode: string): Promise<T> {
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) {
    throw new CalendarSyncError("Google Calendar request failed.", 502, fallbackCode);
  }
  return payload;
}

export function buildGoogleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = requireGoogleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
  const response = await fetchCalendarProvider("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  }, "google_token_exchange_timeout");
  const token = await parseGoogleResponse<GoogleTokenResponse>(response, "google_token_exchange_failed");
  if (!token.access_token || !token.refresh_token || !token.expires_in || !token.scope) {
    throw new CalendarSyncError("Google returned an incomplete calendar credential.", 502, "google_token_incomplete");
  }
  try {
    const scopes = assertGoogleCalendarScopes(token.scope.split(/\s+/));
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      scopes
    };
  } catch (error) {
    await revokeGoogleToken(token.access_token).catch(() => undefined);
    throw error;
  }
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requireGoogleConfig();
  const response = await fetchCalendarProvider("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  }, "google_token_refresh_timeout");
  const token = await parseGoogleResponse<GoogleTokenResponse>(response, "google_token_refresh_failed");
  if (!token.access_token || !token.expires_in) {
    throw new CalendarSyncError("Google returned an incomplete refreshed credential.", 502, "google_token_incomplete");
  }
  if (token.scope) assertGoogleCalendarScopes(token.scope.split(/\s+/));
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString()
  };
}

export async function revokeGoogleToken(accessToken: string) {
  const response = await fetchCalendarProvider("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken }),
    cache: "no-store"
  }, "google_revoke_timeout");
  if (!response.ok) {
    throw new CalendarSyncError("Google token revocation failed.", 502, "google_revoke_failed");
  }
}

export async function createBvrb3rGoogleCalendar(accessToken: string) {
  const response = await fetchCalendarProvider("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: "BVRB3R",
      description: "BVRB3R appointments. Managed only by the BVRB3R calendar connection."
    }),
    cache: "no-store"
  }, "google_calendar_create_timeout");
  const payload = await parseGoogleResponse<{ id?: string }>(response, "google_calendar_create_failed");
  if (!payload.id) {
    throw new CalendarSyncError("Google did not return the BVRB3R calendar id.", 502, "google_calendar_id_missing");
  }
  return payload.id;
}

export async function upsertGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  loopTag: string;
  appointmentId: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
}) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`;
  const response = await fetchCalendarProvider(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: input.eventId,
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startsAt },
      end: { dateTime: input.endsAt },
      transparency: "opaque",
      extendedProperties: {
        private: {
          bvrb3rOrigin: input.loopTag,
          bvrb3rAppointmentId: input.appointmentId
        }
      }
    }),
    cache: "no-store"
  }, "google_event_push_timeout");
  if (!response.ok) {
    throw new CalendarSyncError("Unable to push the appointment to Google Calendar.", 502, "google_event_push_failed");
  }
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`;
  const response = await fetchCalendarProvider(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store"
  }, "google_event_delete_timeout");
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new CalendarSyncError("Unable to remove the appointment from Google Calendar.", 502, "google_event_delete_failed");
  }
}

export async function queryGoogleFreeBusy(input: {
  accessToken: string;
  calendarIds: string[];
  startsAt: string;
  endsAt: string;
}) {
  if (!input.calendarIds.length) {
    return {
      calendars: {} as Record<string, Array<{ start: string; end: string }>>,
      failedCalendarIds: [] as string[]
    };
  }
  const response = await fetchCalendarProvider("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin: input.startsAt,
      timeMax: input.endsAt,
      items: input.calendarIds.map((id) => ({ id }))
    }),
    cache: "no-store"
  }, "google_freebusy_read_timeout");
  const payload = await parseGoogleResponse<{
    calendars?: Record<string, {
      busy?: Array<{ start?: string; end?: string }>;
      errors?: Array<{ domain?: string; reason?: string }>;
    }>;
  }>(response, "google_freebusy_read_failed");
  const calendars: Record<string, Array<{ start: string; end: string }>> = {};
  const failedCalendarIds: string[] = [];
  for (const calendarId of input.calendarIds) {
    const value = payload.calendars?.[calendarId];
    if (!value || value.errors?.length) {
      failedCalendarIds.push(calendarId);
      continue;
    }
    const windows: Array<{ start: string; end: string }> = [];
    let invalid = false;
    for (const window of value.busy ?? []) {
      const start = window.start ? Date.parse(window.start) : Number.NaN;
      const end = window.end ? Date.parse(window.end) : Number.NaN;
      if (!window.start || !window.end || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        invalid = true;
        break;
      }
      windows.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString()
      });
    }
    if (invalid) {
      failedCalendarIds.push(calendarId);
      continue;
    }
    calendars[calendarId] = windows;
  }
  return { calendars, failedCalendarIds };
}
