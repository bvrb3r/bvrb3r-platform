import { createHash, randomBytes } from "node:crypto";
import {
  ArchitectRuntimeControlError,
  assertArchitectRuntimeControlAllows
} from "@/lib/architect/city-map/runtime-controls.server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { KioskSettingsScope } from "@/lib/kiosk/settings-service";

/**
 * Kiosk device sessions (PR22 `kiosk_sessions`).
 *
 * A kiosk device may only mutate (book, join the queue, search clients) while
 * it holds a session that staff started from an authenticated account. This is
 * the server boundary that stops anonymous visitors who discover a public
 * kiosk URL from creating profiles and appointments: they can view the
 * branded landing, but every mutation requires the device session token.
 *
 * The raw token never touches the database — only its sha256 hash is stored,
 * satisfying kiosk_sessions_token_hash_ck.
 */

export const KIOSK_SESSION_COOKIE = "bvrb3r-kiosk-session";
export const KIOSK_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const DEMO_SESSION_TOKEN = "demo-kiosk-session";

export class KioskSessionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "kiosk_session_error") {
    super(message);
    this.name = "KioskSessionError";
    this.status = status;
    this.code = code;
  }
}

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function getSupabaseAdmin() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function assertKioskRuntimeEnabled(supabase: SupabaseAdmin) {
  try {
    await assertArchitectRuntimeControlAllows(supabase, "kiosks");
  } catch (error) {
    if (error instanceof ArchitectRuntimeControlError) {
      throw new KioskSessionError(error.message, error.status, error.code);
    }
    throw error;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type SessionUser = {
  id: string;
  role?: string;
  ownedShopId?: string | null;
  barberId?: string | null;
  locationIds?: string[];
};

async function requireSignedInUser(): Promise<SessionUser> {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    throw new KioskSessionError("Sign in before starting a kiosk session.", 401, "not_authenticated");
  }

  return session.user as SessionUser;
}

type ResolvedKioskSessionTarget = {
  settingId: string;
  shopId: string | null;
  locationId: string | null;
  barberId: string | null;
  mode: "shop_owner" | "barber";
};

async function readEnabledKioskSetting(supabase: SupabaseAdmin, scope: KioskSettingsScope, targetReference: string) {
  const result = await supabase
    .from("kiosk_settings")
    .select("id, enabled, pin_hash")
    .eq("scope", scope)
    .ilike("target_reference", targetReference)
    .maybeSingle();

  if (result.error) {
    throw new KioskSessionError("Unable to load kiosk settings.", 500, "settings_lookup_failed");
  }

  const row = result.data as { id?: unknown; enabled?: unknown; pin_hash?: unknown } | null;
  if (!row?.id || !row.enabled || !row.pin_hash) {
    throw new KioskSessionError(
      "This kiosk is not enabled yet. Set a kiosk PIN in More before launching Kiosk Mode.",
      403,
      "kiosk_not_ready"
    );
  }

  return { id: String(row.id) };
}

async function resolveShopSessionTarget(
  supabase: SupabaseAdmin,
  targetReference: string,
  user: SessionUser
): Promise<{ shopId: string; locationId: string; authorized: boolean }> {
  const normalized = targetReference.replace(/^@+/, "");
  const shopResult = await supabase
    .from("shops")
    .select("id, public_username, owner_profile_id")
    .or(`id.eq.${targetReference},public_username.ilike.${normalized}`)
    .maybeSingle();

  if (shopResult.error) {
    throw new KioskSessionError("Unable to resolve this kiosk target.", 500, "target_lookup_failed");
  }

  const shop = shopResult.data as { id: string; public_username?: string | null; owner_profile_id?: string | null } | null;
  const locationFilter = shop
    ? `reference_code.eq.${shop.id},reference_code.eq.${shop.public_username ?? shop.id}`
    : isUuid(targetReference)
      ? `reference_code.eq.${targetReference},id.eq.${targetReference}`
      : `reference_code.eq.${targetReference}`;

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code")
    .or(locationFilter)
    .maybeSingle();

  if (locationResult.error) {
    throw new KioskSessionError("Unable to resolve this kiosk location.", 500, "target_lookup_failed");
  }

  const location = locationResult.data as { id: string; reference_code?: string | null } | null;
  if (!shop && !location) {
    throw new KioskSessionError("This shop kiosk could not be found.", 404, "target_not_found");
  }
  if (!location) {
    throw new KioskSessionError(
      "This shop has no kiosk-capable location yet, so a kiosk session cannot be started.",
      409,
      "location_unresolved"
    );
  }

  const staffScopeReferences = new Set([
    ...(user.locationIds ?? []),
    ...(user.ownedShopId ? [user.ownedShopId] : [])
  ]);
  const authorized = Boolean(
    (shop?.owner_profile_id && String(shop.owner_profile_id) === user.id)
    || (shop && staffScopeReferences.has(shop.id))
    || staffScopeReferences.has(location.id)
    || (location.reference_code && staffScopeReferences.has(location.reference_code))
    || user.role === "platform_admin"
  );

  return { shopId: shop?.id ?? location.reference_code ?? location.id, locationId: location.id, authorized };
}

async function resolveBarberSessionTarget(
  supabase: SupabaseAdmin,
  targetReference: string,
  user: SessionUser
): Promise<{ barberId: string; authorized: boolean }> {
  const result = await supabase
    .from("barbers")
    .select("id, profile_id")
    .eq("id", targetReference)
    .maybeSingle();

  if (result.error) {
    throw new KioskSessionError("Unable to resolve this kiosk target.", 500, "target_lookup_failed");
  }

  const barber = result.data as { id: string; profile_id?: string | null } | null;
  if (!barber) {
    throw new KioskSessionError("This barber kiosk could not be found.", 404, "target_not_found");
  }

  const authorized = Boolean(
    (barber.profile_id && String(barber.profile_id) === user.id)
    || (user.barberId && user.barberId === barber.id)
    || user.role === "platform_admin"
  );

  return { barberId: barber.id, authorized };
}

async function resolveSessionTarget(
  supabase: SupabaseAdmin,
  scope: KioskSettingsScope,
  targetReference: string,
  user: SessionUser
): Promise<ResolvedKioskSessionTarget> {
  const setting = await readEnabledKioskSetting(supabase, scope, targetReference);

  if (scope === "shop") {
    const resolved = await resolveShopSessionTarget(supabase, targetReference, user);
    if (!resolved.authorized) {
      throw new KioskSessionError("Only this shop's owner or staff can start its kiosk.", 403, "not_authorized");
    }
    return { settingId: setting.id, shopId: resolved.shopId, locationId: resolved.locationId, barberId: null, mode: "shop_owner" };
  }

  const resolved = await resolveBarberSessionTarget(supabase, targetReference, user);
  if (!resolved.authorized) {
    throw new KioskSessionError("Only this barber can start their kiosk.", 403, "not_authorized");
  }
  if (!isUuid(resolved.barberId)) {
    throw new KioskSessionError(
      "This barber account is not kiosk-session capable yet.",
      409,
      "target_unresolved"
    );
  }
  return { settingId: setting.id, shopId: null, locationId: null, barberId: resolved.barberId, mode: "barber" };
}

export async function startKioskDeviceSession(input: {
  scope: KioskSettingsScope;
  targetReference: string;
  deviceLabel?: string;
}) {
  const user = await requireSignedInUser();
  const targetReference = input.targetReference.trim();
  if (!targetReference) {
    throw new KioskSessionError("Kiosk target is required.", 400, "missing_target");
  }

  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + KIOSK_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  if (!supabase) {
    return { token: DEMO_SESSION_TOKEN, expiresAt, scope: input.scope, targetReference };
  }

  await assertKioskRuntimeEnabled(supabase);
  const target = await resolveSessionTarget(supabase, input.scope, targetReference, user);
  const token = randomBytes(32).toString("hex");

  const insert = await supabase
    .from("kiosk_sessions")
    .insert({
      kiosk_setting_id: target.settingId,
      shop_id: target.shopId,
      location_id: target.locationId,
      barber_id: target.barberId,
      session_token_hash: hashSessionToken(token),
      mode: target.mode,
      status: "active",
      device_label: input.deviceLabel?.trim() || null,
      expires_at: expiresAt,
      metadata: {
        startedByProfileId: user.id,
        targetReference,
        scope: input.scope
      }
    })
    .select("id")
    .maybeSingle();

  if (insert.error || !insert.data) {
    throw new KioskSessionError("Unable to start the kiosk session.", 500, "session_start_failed");
  }

  return { token, expiresAt, scope: input.scope, targetReference };
}

/** Reads the kiosk session token from the device cookie or explicit header. */
export function readKioskSessionToken(request: Request) {
  const headerToken = request.headers.get("x-bvrb3r-kiosk-session")?.trim();
  if (headerToken) {
    return headerToken;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === KIOSK_SESSION_COOKIE) {
      return decodeURIComponent(rest.join("=")).trim() || null;
    }
  }

  return null;
}

export async function assertKioskDeviceSession(input: {
  scope: KioskSettingsScope;
  targetReference: string;
  token: string | null;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  await assertKioskRuntimeEnabled(supabase);
  if (!input.token) {
    throw new KioskSessionError(
      "This kiosk device has no active session. Relaunch Kiosk Mode from a staff account.",
      401,
      "session_missing"
    );
  }

  const result = await supabase
    .from("kiosk_sessions")
    .select("id, status, expires_at, metadata")
    .eq("session_token_hash", hashSessionToken(input.token))
    .maybeSingle();

  if (result.error) {
    throw new KioskSessionError("Unable to verify the kiosk session.", 500, "session_lookup_failed");
  }

  const row = result.data as { id: string; status?: string; expires_at?: string; metadata?: Record<string, unknown> } | null;
  const expired = row?.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : true;
  const targetMatches = String(row?.metadata?.targetReference ?? "").toLowerCase() === input.targetReference.toLowerCase()
    && String(row?.metadata?.scope ?? "") === input.scope;

  if (!row || row.status !== "active" || expired || !targetMatches) {
    throw new KioskSessionError(
      "This kiosk device session has ended. Relaunch Kiosk Mode from a staff account.",
      401,
      "session_invalid"
    );
  }

  await supabase
    .from("kiosk_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", row.id);
}

/**
 * Requires any active, unexpired device session — used by kiosk endpoints
 * that are not scoped to a single target (e.g. client search).
 */
export async function assertAnyActiveKioskDeviceSession(token: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  await assertKioskRuntimeEnabled(supabase);
  if (!token) {
    throw new KioskSessionError(
      "This kiosk device has no active session. Relaunch Kiosk Mode from a staff account.",
      401,
      "session_missing"
    );
  }

  const result = await supabase
    .from("kiosk_sessions")
    .select("id, status, expires_at")
    .eq("session_token_hash", hashSessionToken(token))
    .maybeSingle();

  if (result.error) {
    throw new KioskSessionError("Unable to verify the kiosk session.", 500, "session_lookup_failed");
  }

  const row = result.data as { id: string; status?: string; expires_at?: string } | null;
  const expired = row?.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : true;
  if (!row || row.status !== "active" || expired) {
    throw new KioskSessionError(
      "This kiosk device session has ended. Relaunch Kiosk Mode from a staff account.",
      401,
      "session_invalid"
    );
  }
}

/** Marks the device session completed (kiosk exit). Best-effort. */
export async function completeKioskDeviceSession(token: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !token) {
    return;
  }

  await supabase
    .from("kiosk_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("session_token_hash", hashSessionToken(token))
    .eq("status", "active");
}
