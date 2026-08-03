import "server-only";

import { randomBytes } from "node:crypto";
import {
  CALENDAR_BUSY_CACHE_MINUTES,
  CALENDAR_SYNC_POLL_MINUTES,
  CalendarSyncError,
  type CalendarProvider,
  type OAuthCalendarProvider,
  escapeIcsText,
  formatIcsUtc,
  hashCalendarCapability,
  isBvrb3rCalendarLoopTag,
  resolveLastKnownCalendarState
} from "@/lib/calendar-sync/domain";
import { replaceCalendarBusyBlocks } from "@/lib/calendar-sync/busy-store";
import { buildGoogleAuthorizationUrl, createBvrb3rGoogleCalendar, exchangeGoogleAuthorizationCode, revokeGoogleToken } from "@/lib/calendar-sync/providers/google";
import { buildSquareAuthorizationUrl, exchangeSquareAuthorizationCode, revokeSquareToken } from "@/lib/calendar-sync/providers/square";
import { decryptCalendarSecret, encryptCalendarSecret } from "@/lib/calendar-sync/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRow = {
  id: string;
  profile_id: string;
};

type CalendarPreferenceRow = {
  id: string;
  provider: "apple" | "google";
  provider_calendar_id_hash: string;
  provider_calendar_id_ciphertext: string | null;
  display_name: string;
  display_color: string | null;
  blocks_availability: boolean;
  updated_at: string;
};

type SquareConnectionRow = {
  id: string;
  barber_id: string;
  location_id: string | null;
  square_merchant_id: string;
  square_team_member_id: string | null;
  account_label: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  granted_scopes: string[];
  status: "active" | "degraded" | "disconnected";
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  next_poll_at: string;
  disconnected_at: string | null;
};

type GoogleConnectionRow = {
  id: string;
  barber_id: string;
  account_label: string;
  bvrb3r_calendar_id_ciphertext: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string;
  granted_scopes: string[];
  write_enabled: boolean;
  freebusy_enabled: boolean;
  status: "active" | "degraded" | "disconnected";
  last_push_at: string | null;
  last_busy_sync_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  next_poll_at: string;
  disconnected_at: string | null;
};

type AppleFeedRow = {
  id: string;
  barber_id: string;
  token_hash: string;
  token_ciphertext: string;
  status: "active" | "revoked";
  generated_at: string;
  last_served_at: string | null;
  revoked_at: string | null;
};

export type CalendarConnectionState = {
  provider: CalendarProvider;
  status: "not_connected" | "active" | "degraded" | "disconnected";
  accountLabel: string | null;
  writeEnabled: boolean;
  busyReadEnabled: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  nextPollAt: string | null;
  pollMinutes: number;
  servingLastKnown: boolean;
  lastKnownStampedAt: string | null;
  feedUrl?: string | null;
  scopes?: string[];
  setupRequired?: boolean;
  squareMapping?: {
    locationId: string | null;
    teamMemberId: string | null;
  };
  calendars: Array<{
    id: string;
    name: string;
    color: string | null;
    blocking: boolean;
    updatedAt: string;
  }>;
  stats: {
    syncedThisWeek: number;
    conflicts: number;
    moneyMoved: 0;
  };
};

function getAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new CalendarSyncError("Calendar sync data services are unavailable.", 503, "calendar_data_unavailable");
  }
  return client;
}

async function resolveBarber(admin: AdminClient, user: UserAccount) {
  const result = await admin
    .from("barbers")
    .select("id, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (result.error) {
    throw new CalendarSyncError("Unable to resolve the Barber calendar owner.", 500, "calendar_barber_lookup_failed");
  }
  if (!result.data) {
    throw new CalendarSyncError("Finish Barber setup before connecting a calendar.", 409, "calendar_barber_setup_required");
  }
  return result.data as BarberRow;
}

function applicationOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? process.env.APP_URL?.trim() ?? "https://bvrb3r.app";
  return value.replace(/\/$/, "");
}

function buildWebcalUrl(token: string) {
  return `${applicationOrigin().replace(/^https?:\/\//, "webcal://")}/api/calendar-sync/apple/feed/${token}.ics`;
}

async function readPreferences(admin: AdminClient, barberId: string, provider: "apple" | "google") {
  const result = await admin
    .from("calendar_source_preferences")
    .select("id, provider, provider_calendar_id_hash, provider_calendar_id_ciphertext, display_name, display_color, blocks_availability, updated_at")
    .eq("barber_id", barberId)
    .eq("provider", provider)
    .order("created_at", { ascending: true });
  if (result.error) {
    throw new CalendarSyncError("Unable to load calendar privacy preferences.", 500, "calendar_preferences_read_failed");
  }
  return (result.data ?? []) as CalendarPreferenceRow[];
}

function mapPreferences(rows: CalendarPreferenceRow[]) {
  return rows.map((row) => ({
    id: row.provider_calendar_id_hash,
    name: row.display_name,
    color: row.display_color,
    blocking: row.blocks_availability,
    updatedAt: row.updated_at
  }));
}

async function readSquareStats(admin: AdminClient, barberId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();
  const [appointments, conflicts] = await Promise.all([
    admin
      .from("chairsync_appointments")
      .select("id", { count: "exact", head: true })
      .eq("provider", "square")
      .eq("barber_id", barberId)
      .gte("imported_at", since)
      .lte("imported_at", until),
    admin
      .from("calendar_sync_runs")
      .select("conflict_count")
      .eq("provider", "square")
      .eq("barber_id", barberId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1)
  ]);
  if (appointments.error || conflicts.error) {
    throw new CalendarSyncError("Unable to load Square sync statistics.", 500, "square_stats_read_failed");
  }
  return {
    syncedThisWeek: appointments.count ?? 0,
    conflicts: ((conflicts.data ?? []) as Array<{ conflict_count: number }>)[0]?.conflict_count ?? 0,
    moneyMoved: 0 as const
  };
}

export async function getCalendarConnectionState(user: UserAccount, provider: CalendarProvider): Promise<CalendarConnectionState> {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, user);
  if (provider === "square") {
    const [connectionResult, stats] = await Promise.all([
      admin
        .from("square_connections")
        .select("id, barber_id, location_id, square_merchant_id, square_team_member_id, account_label, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, granted_scopes, status, last_sync_at, last_success_at, last_error_code, next_poll_at, disconnected_at")
        .eq("barber_id", barber.id)
        .maybeSingle(),
      readSquareStats(admin, barber.id)
    ]);
    if (connectionResult.error) {
      throw new CalendarSyncError("Unable to load Square Calendar status.", 500, "square_connection_read_failed");
    }
    const connection = connectionResult.data as SquareConnectionRow | null;
    const setupRequired = Boolean(connection && (!connection.location_id || !connection.square_team_member_id));
    const fallback = resolveLastKnownCalendarState({
      status: connection?.status ?? null,
      lastSuccessAt: connection?.last_success_at ?? null,
      lastSyncAt: connection?.last_sync_at ?? null
    });
    return {
      provider,
      status: connection?.status ?? "not_connected",
      accountLabel: connection?.account_label ?? null,
      writeEnabled: false,
      busyReadEnabled: connection?.status === "active" || connection?.status === "degraded",
      lastSyncAt: connection?.last_sync_at ?? null,
      lastSuccessAt: connection?.last_success_at ?? null,
      lastErrorCode: connection?.last_error_code ?? null,
      nextPollAt: connection?.next_poll_at ?? null,
      pollMinutes: CALENDAR_SYNC_POLL_MINUTES,
      servingLastKnown: fallback.servingLastKnown,
      lastKnownStampedAt: fallback.stampedAt,
      scopes: connection?.granted_scopes ?? [],
      setupRequired,
      squareMapping: {
        locationId: connection?.location_id ?? null,
        teamMemberId: connection?.square_team_member_id ?? null
      },
      calendars: [],
      stats
    };
  }

  if (provider === "apple") {
    const [feedResult, preferences] = await Promise.all([
      admin
        .from("apple_calendar_feeds")
        .select("id, barber_id, token_hash, token_ciphertext, status, generated_at, last_served_at, revoked_at")
        .eq("barber_id", barber.id)
        .maybeSingle(),
      readPreferences(admin, barber.id, "apple")
    ]);
    if (feedResult.error) {
      throw new CalendarSyncError("Unable to load Apple Calendar status.", 500, "apple_connection_read_failed");
    }
    const feed = feedResult.data as AppleFeedRow | null;
    const activeFeed = feed?.status === "active" ? decryptCalendarSecret(feed.token_ciphertext) : null;
    const busyReadEnabled = preferences.some((preference) => preference.blocks_availability);
    return {
      provider,
      status: activeFeed || busyReadEnabled ? "active" : feed ? "disconnected" : "not_connected",
      accountLabel: activeFeed ? "Private Apple subscription" : null,
      writeEnabled: Boolean(activeFeed),
      busyReadEnabled,
      lastSyncAt: feed?.last_served_at ?? null,
      lastSuccessAt: feed?.last_served_at ?? null,
      lastErrorCode: null,
      nextPollAt: null,
      pollMinutes: CALENDAR_SYNC_POLL_MINUTES,
      servingLastKnown: false,
      lastKnownStampedAt: feed?.last_served_at ?? null,
      feedUrl: activeFeed ? buildWebcalUrl(activeFeed) : null,
      calendars: mapPreferences(preferences),
      stats: { syncedThisWeek: 0, conflicts: 0, moneyMoved: 0 }
    };
  }

  const [connectionResult, preferences] = await Promise.all([
    admin
      .from("google_calendar_connections")
      .select("id, barber_id, account_label, bvrb3r_calendar_id_ciphertext, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, granted_scopes, write_enabled, freebusy_enabled, status, last_push_at, last_busy_sync_at, last_success_at, last_error_code, next_poll_at, disconnected_at")
      .eq("barber_id", barber.id)
      .maybeSingle(),
    readPreferences(admin, barber.id, "google")
  ]);
  if (connectionResult.error) {
    throw new CalendarSyncError("Unable to load Google Calendar status.", 500, "google_connection_read_failed");
  }
  const connection = connectionResult.data as GoogleConnectionRow | null;
  const fallback = resolveLastKnownCalendarState({
    status: connection?.status ?? null,
    lastSuccessAt: connection?.last_success_at ?? null,
    lastSyncAt: connection?.last_busy_sync_at ?? connection?.last_push_at ?? null
  });
  return {
    provider,
    status: connection?.status ?? "not_connected",
    accountLabel: connection?.account_label ?? null,
    writeEnabled: Boolean(connection?.write_enabled && connection.status !== "disconnected"),
    busyReadEnabled: Boolean(connection?.freebusy_enabled && connection.status !== "disconnected"),
    lastSyncAt: connection?.last_busy_sync_at ?? connection?.last_push_at ?? null,
    lastSuccessAt: connection?.last_success_at ?? null,
    lastErrorCode: connection?.last_error_code ?? null,
    nextPollAt: connection?.next_poll_at ?? null,
    pollMinutes: CALENDAR_SYNC_POLL_MINUTES,
    servingLastKnown: fallback.servingLastKnown,
    lastKnownStampedAt: fallback.stampedAt,
    scopes: connection?.granted_scopes ?? [],
    calendars: mapPreferences(preferences),
    stats: { syncedThisWeek: 0, conflicts: 0, moneyMoved: 0 }
  };
}

export async function startCalendarOAuth(user: UserAccount, provider: OAuthCalendarProvider) {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, user);
  const state = randomBytes(32).toString("base64url");
  const returnPath = `/dashboard/barber/calendar/${provider}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const insert = await admin.from("calendar_oauth_states").insert({
    provider,
    profile_id: user.id,
    barber_id: barber.id,
    state_hash: hashCalendarCapability(state),
    return_path: returnPath,
    expires_at: expiresAt
  });
  if (insert.error) {
    throw new CalendarSyncError("Unable to start calendar authorization.", 500, "calendar_oauth_state_failed");
  }
  return {
    authorizationUrl: provider === "square"
      ? buildSquareAuthorizationUrl(state)
      : buildGoogleAuthorizationUrl(state),
    expiresAt
  };
}

async function consumeOAuthState(admin: AdminClient, user: UserAccount, provider: OAuthCalendarProvider, state: string) {
  const stateHash = hashCalendarCapability(state);
  const result = await admin
    .from("calendar_oauth_states")
    .select("id, provider, profile_id, barber_id, return_path, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .eq("provider", provider)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Calendar authorization state is invalid.", 400, "calendar_oauth_state_invalid");
  }
  const row = result.data as {
    id: string;
    barber_id: string;
    return_path: string;
    expires_at: string;
    consumed_at: string | null;
  };
  if (row.consumed_at || Date.parse(row.expires_at) <= Date.now()) {
    throw new CalendarSyncError("Calendar authorization state expired.", 400, "calendar_oauth_state_expired");
  }
  const consumedAt = new Date().toISOString();
  const update = await admin
    .from("calendar_oauth_states")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (update.error || !update.data) {
    throw new CalendarSyncError("Calendar authorization state could not be consumed.", 409, "calendar_oauth_state_replayed");
  }
  return row;
}

export async function completeCalendarOAuth(input: {
  user: UserAccount;
  provider: OAuthCalendarProvider;
  state: string;
  code: string;
}) {
  const admin = getAdminClient();
  const oauthState = await consumeOAuthState(admin, input.user, input.provider, input.state);
  const now = new Date().toISOString();
  if (input.provider === "square") {
    const credential = await exchangeSquareAuthorizationCode(input.code);
    const upsert = await admin.from("square_connections").upsert({
      barber_id: oauthState.barber_id,
      // A multi-location Barber must choose this explicitly. Silently choosing
      // the oldest staff location can put every Square appointment on the wrong
      // BVRB3R shop calendar.
      location_id: null,
      square_team_member_id: null,
      square_merchant_id: credential.merchantId,
      account_label: `Square Appointments · ${credential.merchantId.slice(-6)}`,
      access_token_ciphertext: encryptCalendarSecret(credential.accessToken),
      refresh_token_ciphertext: encryptCalendarSecret(credential.refreshToken),
      token_expires_at: credential.expiresAt,
      granted_scopes: credential.scopes,
      status: "active",
      last_error_code: null,
      next_poll_at: now,
      sync_lease_token: null,
      sync_lease_until: null,
      disconnected_at: null,
      updated_at: now
    }, { onConflict: "barber_id" });
    if (upsert.error) {
      await revokeSquareToken(credential.accessToken).catch(() => undefined);
      throw new CalendarSyncError("Unable to save the Square Calendar connection.", 500, "square_connection_save_failed");
    }
  } else {
    const credential = await exchangeGoogleAuthorizationCode(input.code);
    const calendarId = await createBvrb3rGoogleCalendar(credential.accessToken);
    const upsert = await admin
      .from("google_calendar_connections")
      .upsert({
        barber_id: oauthState.barber_id,
        account_label: "Google account",
        bvrb3r_calendar_id_ciphertext: encryptCalendarSecret(calendarId),
        access_token_ciphertext: encryptCalendarSecret(credential.accessToken),
        refresh_token_ciphertext: encryptCalendarSecret(credential.refreshToken),
        token_expires_at: credential.expiresAt,
        granted_scopes: credential.scopes,
        write_enabled: true,
        freebusy_enabled: true,
        status: "active",
        last_error_code: null,
        next_poll_at: now,
        sync_lease_token: null,
        sync_lease_until: null,
        disconnected_at: null,
        updated_at: now
      }, { onConflict: "barber_id" })
      .select("id")
      .single();
    if (upsert.error) {
      await revokeGoogleToken(credential.accessToken).catch(() => undefined);
      throw new CalendarSyncError("Unable to save the Google Calendar connection.", 500, "google_connection_save_failed");
    }

    const primaryId = "primary";
    const preference = await admin.from("calendar_source_preferences").upsert({
      barber_id: oauthState.barber_id,
      provider: "google",
      provider_calendar_id_hash: hashCalendarCapability(primaryId),
      provider_calendar_id_ciphertext: encryptCalendarSecret(primaryId),
      display_name: "Primary Google calendar",
      display_color: "#C4F24E",
      blocks_availability: true,
      updated_at: now
    }, { onConflict: "barber_id,provider,provider_calendar_id_hash" });
    if (preference.error) {
      throw new CalendarSyncError("Unable to activate Google free/busy protection.", 500, "google_freebusy_save_failed");
    }
  }
  return { returnPath: oauthState.return_path };
}

export async function regenerateAppleCalendarFeed(user: UserAccount) {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, user);
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const upsert = await admin.from("apple_calendar_feeds").upsert({
    barber_id: barber.id,
    token_hash: hashCalendarCapability(token),
    token_ciphertext: encryptCalendarSecret(token),
    status: "active",
    generated_at: now,
    revoked_at: null,
    updated_at: now
  }, { onConflict: "barber_id" });
  if (upsert.error) {
    throw new CalendarSyncError("Unable to generate the private Apple Calendar feed.", 500, "apple_feed_generation_failed");
  }
  return { feedUrl: buildWebcalUrl(token), generatedAt: now };
}

export async function disconnectCalendar(user: UserAccount, provider: CalendarProvider) {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, user);
  const now = new Date().toISOString();
  if (provider === "square") {
    const current = await admin
      .from("square_connections")
      .select("access_token_ciphertext")
      .eq("barber_id", barber.id)
      .maybeSingle();
    if (current.error) throw new CalendarSyncError("Unable to disconnect Square Calendar.", 500, "square_disconnect_failed");
    if (current.data) {
      const row = current.data as { access_token_ciphertext: string };
      await revokeSquareToken(
        decryptCalendarSecret(row.access_token_ciphertext),
        { revokeOnlyAccessToken: true }
      ).catch(() => undefined);
    }
    const update = await admin.from("square_connections").update({
      status: "disconnected",
      sync_lease_token: null,
      sync_lease_until: null,
      disconnected_at: now,
      updated_at: now
    }).eq("barber_id", barber.id);
    if (update.error) throw new CalendarSyncError("Unable to disconnect Square Calendar.", 500, "square_disconnect_failed");
    return;
  }
  if (provider === "apple") {
    const [feed, busy, preferences] = await Promise.all([
      admin.from("apple_calendar_feeds").update({ status: "revoked", revoked_at: now, updated_at: now }).eq("barber_id", barber.id),
      admin.from("calendar_busy_blocks").delete().eq("barber_id", barber.id).eq("provider", "apple"),
      admin.from("calendar_source_preferences").update({ blocks_availability: false, updated_at: now }).eq("barber_id", barber.id).eq("provider", "apple")
    ]);
    if (feed.error || busy.error || preferences.error) throw new CalendarSyncError("Unable to disconnect Apple Calendar.", 500, "apple_disconnect_failed");
    return;
  }
  const current = await admin
    .from("google_calendar_connections")
    .select("access_token_ciphertext")
    .eq("barber_id", barber.id)
    .maybeSingle();
  if (current.error) throw new CalendarSyncError("Unable to disconnect Google Calendar.", 500, "google_disconnect_failed");
  if (current.data) {
    await revokeGoogleToken(decryptCalendarSecret((current.data as { access_token_ciphertext: string }).access_token_ciphertext)).catch(() => undefined);
  }
  const [connection, busy] = await Promise.all([
    admin.from("google_calendar_connections").update({
      status: "disconnected",
      write_enabled: false,
      freebusy_enabled: false,
      sync_lease_token: null,
      sync_lease_until: null,
      disconnected_at: now,
      updated_at: now
    }).eq("barber_id", barber.id),
    admin.from("calendar_busy_blocks").delete().eq("barber_id", barber.id).eq("provider", "google")
  ]);
  if (connection.error || busy.error) {
    throw new CalendarSyncError("Unable to disconnect Google Calendar.", 500, "google_disconnect_failed");
  }
}

export async function setCalendarSourcePreference(input: {
  user: UserAccount;
  provider: "apple" | "google";
  calendarIdHash: string;
  calendarId?: string;
  name: string;
  color?: string | null;
  blocking: boolean;
}) {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, input.user);
  if (!/^[0-9a-f]{64}$/.test(input.calendarIdHash)) {
    throw new CalendarSyncError("Calendar identity hash is invalid.", 400, "calendar_identity_invalid");
  }
  if (input.provider === "google" && input.calendarId && hashCalendarCapability(input.calendarId) !== input.calendarIdHash) {
    throw new CalendarSyncError("Calendar identity did not match its privacy hash.", 400, "calendar_identity_mismatch");
  }
  const existing = await admin.from("calendar_source_preferences")
    .select("id, provider_calendar_id_ciphertext")
    .eq("barber_id", barber.id)
    .eq("provider", input.provider)
    .eq("provider_calendar_id_hash", input.calendarIdHash)
    .maybeSingle();
  if (existing.error) {
    throw new CalendarSyncError("Unable to read calendar busy-block preferences.", 500, "calendar_preference_read_failed");
  }
  if (!existing.data && input.provider === "google" && !input.calendarId) {
    throw new CalendarSyncError("A new Google calendar preference requires its calendar id.", 400, "calendar_identity_required");
  }
  const updatedAt = new Date().toISOString();
  const result = existing.data
    ? await admin.from("calendar_source_preferences").update({
      ...(input.calendarId ? { provider_calendar_id_ciphertext: encryptCalendarSecret(input.calendarId) } : {}),
      display_name: input.name.trim(),
      display_color: input.color ?? null,
      blocks_availability: input.blocking,
      updated_at: updatedAt
    }).eq("id", (existing.data as { id: string }).id)
    : await admin.from("calendar_source_preferences").insert({
      barber_id: barber.id,
      provider: input.provider,
      provider_calendar_id_hash: input.calendarIdHash,
      provider_calendar_id_ciphertext: input.calendarId ? encryptCalendarSecret(input.calendarId) : null,
      display_name: input.name.trim(),
      display_color: input.color ?? null,
      blocks_availability: input.blocking,
      updated_at: updatedAt
    });
  if (result.error) {
    throw new CalendarSyncError("Unable to save calendar busy-block preferences.", 500, "calendar_preference_save_failed");
  }
  if (!input.blocking) {
    const remove = await admin.from("calendar_busy_blocks").delete()
      .eq("barber_id", barber.id)
      .eq("provider", input.provider)
      .eq("provider_calendar_id_hash", input.calendarIdHash);
    if (remove.error) {
      throw new CalendarSyncError(
        "Calendar preference was saved, but its old busy windows could not be retired yet.",
        500,
        "calendar_preference_busy_retire_failed"
      );
    }
  }
}

export async function ingestAppleBusyWindows(input: {
  user: UserAccount;
  calendarIdHash: string;
  calendarName: string;
  color?: string | null;
  blocks: Array<{
    externalIdHash: string;
    startsAt: string;
    endsAt: string;
    originTag?: string;
  }>;
}) {
  const admin = getAdminClient();
  const barber = await resolveBarber(admin, input.user);
  if (!/^[0-9a-f]{64}$/.test(input.calendarIdHash)) {
    throw new CalendarSyncError("Apple Calendar identity hash is invalid.", 400, "calendar_identity_invalid");
  }
  const filtered = input.blocks.filter((block) => !isBvrb3rCalendarLoopTag(block.originTag));
  for (const block of filtered) {
    if (!/^[0-9a-f]{64}$/.test(block.externalIdHash) || Date.parse(block.endsAt) <= Date.parse(block.startsAt)) {
      throw new CalendarSyncError("Apple Calendar sent an invalid busy window.", 400, "invalid_busy_window");
    }
  }
  const now = new Date();
  const staleAfter = new Date(now.getTime() + CALENDAR_BUSY_CACHE_MINUTES * 60 * 1000).toISOString();
  const preference = await admin.from("calendar_source_preferences").upsert({
    barber_id: barber.id,
    provider: "apple",
    provider_calendar_id_hash: input.calendarIdHash,
    provider_calendar_id_ciphertext: null,
    display_name: input.calendarName.trim(),
    display_color: input.color ?? null,
    blocks_availability: true,
    updated_at: now.toISOString()
  }, { onConflict: "barber_id,provider,provider_calendar_id_hash" });
  if (preference.error) {
    throw new CalendarSyncError("Unable to save Apple Calendar privacy settings.", 500, "apple_preference_save_failed");
  }
  await replaceCalendarBusyBlocks({
    admin,
    barberId: barber.id,
    provider: "apple",
    calendarIdHash: input.calendarIdHash,
    blocks: filtered.map((block) => ({
      externalEventIdHash: block.externalIdHash,
      startsAt: new Date(block.startsAt).toISOString(),
      endsAt: new Date(block.endsAt).toISOString()
    })),
    cacheStampedAt: now.toISOString(),
    staleAfter
  });
  return { acceptedBusyWindows: filtered.length, ignoredLoopEvents: input.blocks.length - filtered.length };
}

export async function readAppleCalendarFeed(token: string) {
  const admin = getAdminClient();
  const feedResult = await admin
    .from("apple_calendar_feeds")
    .select("id, barber_id, token_hash, token_ciphertext, status, generated_at, last_served_at, revoked_at")
    .eq("token_hash", hashCalendarCapability(token))
    .eq("status", "active")
    .maybeSingle();
  if (feedResult.error || !feedResult.data) {
    throw new CalendarSyncError("Calendar feed not found.", 404, "apple_feed_not_found");
  }
  const feed = feedResult.data as AppleFeedRow;
  const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const appointmentsResult = await admin
    .from("appointments")
    .select("id, client_id, service_id, starts_at, ends_at, status, source_provider, updated_at")
    .eq("barber_id", feed.barber_id)
    .eq("source_provider", "bvrb3r")
    .gte("starts_at", rangeStart)
    .lt("starts_at", rangeEnd)
    .order("starts_at", { ascending: true });
  if (appointmentsResult.error) {
    throw new CalendarSyncError("Unable to build the Apple Calendar feed.", 500, "apple_feed_read_failed");
  }
  const appointments = (appointmentsResult.data ?? []) as Array<{
    id: string;
    client_id: string;
    service_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    updated_at?: string;
  }>;
  const clientIds = Array.from(new Set(appointments.map((appointment) => appointment.client_id)));
  const serviceIds = Array.from(new Set(appointments.map((appointment) => appointment.service_id)));
  const [clientsResult, servicesResult] = await Promise.all([
    clientIds.length
      ? admin.from("clients").select("id, profile_id").in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? admin.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (clientsResult.error || servicesResult.error) {
    throw new CalendarSyncError("Unable to build the Apple Calendar feed.", 500, "apple_feed_read_failed");
  }
  const clientProfileIds = ((clientsResult.data ?? []) as Array<{ id: string; profile_id: string | null }>).flatMap((client) => client.profile_id ? [client.profile_id] : []);
  const profilesResult = clientProfileIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", clientProfileIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    throw new CalendarSyncError("Unable to build the Apple Calendar feed.", 500, "apple_feed_read_failed");
  }
  const profileNameById = new Map(((profilesResult.data ?? []) as Array<{ id: string; full_name: string }>).map((profile) => [profile.id, profile.full_name]));
  const clientNameById = new Map(((clientsResult.data ?? []) as Array<{ id: string; profile_id: string | null }>).map((client) => [
    client.id,
    client.profile_id ? profileNameById.get(client.profile_id) ?? "BVRB3R client" : "BVRB3R client"
  ]));
  const serviceNameById = new Map(((servicesResult.data ?? []) as Array<{ id: string; name: string }>).map((service) => [service.id, service.name]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BVRB3R//Private Barber Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BVRB3R",
    "X-WR-CALDESC:Private BVRB3R appointment feed"
  ];
  for (const appointment of appointments) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:bvrb3r-${appointment.id}@bvrb3r.app`,
      `DTSTAMP:${formatIcsUtc(appointment.updated_at ?? appointment.starts_at)}`,
      `DTSTART:${formatIcsUtc(appointment.starts_at)}`,
      `DTEND:${formatIcsUtc(appointment.ends_at)}`,
      `SUMMARY:${escapeIcsText(`${clientNameById.get(appointment.client_id) ?? "BVRB3R client"} · ${serviceNameById.get(appointment.service_id) ?? "Appointment"}`)}`,
      "DESCRIPTION:Managed by BVRB3R. Update or cancel in BVRB3R.",
      `STATUS:${appointment.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `X-BVRB3R-ORIGIN:bvrb3r:appointment:${appointment.id}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  await admin.from("apple_calendar_feeds").update({ last_served_at: new Date().toISOString() }).eq("id", feed.id);
  return `${lines.join("\r\n")}\r\n`;
}

export type { AppleFeedRow, GoogleConnectionRow, SquareConnectionRow };
