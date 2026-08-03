import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  assertSquareReadOnlyScopes,
  CalendarSyncError,
  SQUARE_APPOINTMENTS_READ_SCOPE
} from "@/lib/calendar-sync/domain";
import { fetchCalendarProvider } from "@/lib/calendar-sync/provider-fetch";

const SQUARE_API_VERSION = "2026-07-15";
const SQUARE_MAX_BOOKING_PAGES = 12;

type SquareTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  merchant_id?: string;
  errors?: Array<{ code?: string; detail?: string }>;
};

type SquareTokenStatus = {
  scopes?: string[];
  expires_at?: string;
  merchant_id?: string;
  errors?: Array<{ code?: string; detail?: string }>;
};

export type SquareBooking = {
  id: string;
  start_at: string;
  status?: string;
  location_id?: string;
  customer_id?: string;
  updated_at?: string;
  appointment_segments?: Array<{
    duration_minutes?: number;
    service_variation_id?: string;
    service_variation_name?: string;
    team_member_id?: string;
  }>;
};

function squareApiBase() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function requireSquareConfig() {
  const applicationId = process.env.SQUARE_APPLICATION_ID?.trim();
  const applicationSecret = process.env.SQUARE_APPLICATION_SECRET?.trim();
  const redirectUri = process.env.SQUARE_CALENDAR_REDIRECT_URI?.trim();
  if (!applicationId || !applicationSecret || !redirectUri) {
    throw new CalendarSyncError("Square Calendar OAuth is not configured.", 503, "square_oauth_unavailable");
  }
  return { applicationId, applicationSecret, redirectUri };
}

async function parseSquareResponse<T>(response: Response, fallbackCode: string): Promise<T> {
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) {
    throw new CalendarSyncError("Square Calendar request failed.", 502, fallbackCode);
  }
  return payload;
}

export function buildSquareAuthorizationUrl(state: string) {
  const { applicationId, redirectUri } = requireSquareConfig();
  const url = new URL(`${squareApiBase()}/oauth2/authorize`);
  url.searchParams.set("client_id", applicationId);
  url.searchParams.set("scope", SQUARE_APPOINTMENTS_READ_SCOPE);
  url.searchParams.set("session", "false");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeSquareAuthorizationCode(code: string) {
  const { applicationId, applicationSecret, redirectUri } = requireSquareConfig();
  const tokenResponse = await fetchCalendarProvider(`${squareApiBase()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION
    },
    body: JSON.stringify({
      client_id: applicationId,
      client_secret: applicationSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    }),
    cache: "no-store"
  }, "square_token_exchange_timeout");
  const token = await parseSquareResponse<SquareTokenResponse>(tokenResponse, "square_token_exchange_failed");
  if (!token.access_token || !token.refresh_token || !token.expires_at || !token.merchant_id) {
    throw new CalendarSyncError("Square returned an incomplete calendar credential.", 502, "square_token_incomplete");
  }

  try {
    const statusResponse = await fetchCalendarProvider(`${squareApiBase()}/oauth2/token/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_API_VERSION
      },
      cache: "no-store"
    }, "square_scope_check_timeout");
    const status = await parseSquareResponse<SquareTokenStatus>(statusResponse, "square_scope_check_failed");
    const scopes = assertSquareReadOnlyScopes(status.scopes ?? []);
    if (status.merchant_id && status.merchant_id !== token.merchant_id) {
      throw new CalendarSyncError("Square merchant identity did not match the token.", 403, "square_merchant_mismatch");
    }
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: status.expires_at ?? token.expires_at,
      merchantId: token.merchant_id,
      scopes
    };
  } catch (error) {
    await revokeSquareToken(token.access_token).catch(() => undefined);
    throw error;
  }
}

export async function refreshSquareAccessToken(refreshToken: string) {
  const { applicationId, applicationSecret } = requireSquareConfig();
  const response = await fetchCalendarProvider(`${squareApiBase()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION
    },
    body: JSON.stringify({
      client_id: applicationId,
      client_secret: applicationSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scopes: [SQUARE_APPOINTMENTS_READ_SCOPE]
    }),
    cache: "no-store"
  }, "square_token_refresh_timeout");
  const token = await parseSquareResponse<SquareTokenResponse>(response, "square_token_refresh_failed");
  if (!token.access_token || !token.refresh_token || !token.expires_at) {
    throw new CalendarSyncError("Square returned an incomplete refreshed credential.", 502, "square_token_incomplete");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at
  };
}

export async function revokeSquareToken(
  accessToken: string,
  options: { revokeOnlyAccessToken?: boolean } = {}
) {
  const { applicationId, applicationSecret } = requireSquareConfig();
  const response = await fetchCalendarProvider(`${squareApiBase()}/oauth2/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Client ${applicationSecret}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION
    },
    body: JSON.stringify({
      client_id: applicationId,
      access_token: accessToken,
      // Square otherwise revokes every token for this app + merchant. Calendar
      // connections are Barber-scoped, so cleanup must default to the one token.
      revoke_only_access_token: options.revokeOnlyAccessToken ?? true
    }),
    cache: "no-store"
  }, "square_revoke_timeout");
  if (!response.ok) {
    throw new CalendarSyncError("Square token revocation failed.", 502, "square_revoke_failed");
  }
}

export async function listSquareBookings(input: {
  accessToken: string;
  startsAt: string;
  endsAt: string;
}) {
  const bookings = new Map<string, SquareBooking>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pageCount = 0;
  do {
    pageCount += 1;
    if (pageCount > SQUARE_MAX_BOOKING_PAGES) {
      throw new CalendarSyncError(
        "Square returned too many booking pages to reconcile safely.",
        502,
        "square_booking_page_limit"
      );
    }
    const url = new URL(`${squareApiBase()}/v2/bookings`);
    url.searchParams.set("start_at_min", input.startsAt);
    url.searchParams.set("start_at_max", input.endsAt);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchCalendarProvider(url, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_API_VERSION
      },
      cache: "no-store"
    }, "square_booking_read_timeout");
    const payload = await parseSquareResponse<{
      bookings?: SquareBooking[];
      cursor?: string;
      errors?: Array<{ code?: string; detail?: string }>;
    }>(response, "square_booking_read_failed");
    if (payload.errors?.length) {
      throw new CalendarSyncError(
        "Square returned an incomplete booking page; reconciliation stopped before changing local appointments.",
        502,
        "square_booking_read_failed"
      );
    }
    for (const booking of payload.bookings ?? []) {
      if (booking.id) bookings.set(booking.id, booking);
    }
    const nextCursor = payload.cursor || undefined;
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new CalendarSyncError(
        "Square repeated a booking cursor; reconciliation stopped before changing local appointments.",
        502,
        "square_booking_cursor_repeated"
      );
    }
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return Array.from(bookings.values());
}

export function verifySquareWebhookSignature(input: {
  signature: string | null;
  body: string;
}) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const notificationUrl = process.env.SQUARE_CALENDAR_WEBHOOK_URL?.trim();
  if (!signatureKey || !notificationUrl || !input.signature) return false;
  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + input.body, "utf8")
    .digest("base64");
  const providedBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
