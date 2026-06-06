import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashKioskPin, isFourDigitKioskPin, verifyKioskPinHash } from "@/lib/kiosk/pin";

export type KioskSettingsScope = "barber" | "shop";

export class KioskSettingsError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "kiosk_settings_error") {
    super(message);
    this.name = "KioskSettingsError";
    this.status = status;
    this.code = code;
  }
}

function getSupabaseAdmin() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function normalizeTargetReference(value: string) {
  return value.trim();
}

async function requireSignedInProfileId() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    throw new KioskSettingsError("Sign in before changing kiosk settings.", 401, "not_authenticated");
  }

  return session.user.id;
}

export async function saveKioskPin(input: {
  scope: KioskSettingsScope;
  targetReference: string;
  pin: string;
}) {
  const ownerProfileId = await requireSignedInProfileId();
  const targetReference = normalizeTargetReference(input.targetReference);
  if (!targetReference) {
    throw new KioskSettingsError("Kiosk target is required.", 400, "missing_target");
  }
  if (!isFourDigitKioskPin(input.pin)) {
    throw new KioskSettingsError("Kiosk PIN must be exactly 4 digits.", 400, "invalid_pin");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      scope: input.scope,
      targetReference,
      enabled: true,
      pinSet: true
    };
  }

  const result = await supabase
    .from("kiosk_settings")
    .upsert({
      owner_profile_id: ownerProfileId,
      scope: input.scope,
      target_reference: targetReference,
      enabled: true,
      pin_hash: hashKioskPin(input.pin),
      failed_attempt_count: 0,
      locked_until: null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "scope,target_reference"
    })
    .select("scope, target_reference, enabled")
    .maybeSingle();

  if (result.error || !result.data) {
    throw new KioskSettingsError("Unable to save kiosk PIN.", 500, "pin_save_failed");
  }

  return {
    scope: result.data.scope as KioskSettingsScope,
    targetReference: result.data.target_reference as string,
    enabled: Boolean(result.data.enabled),
    pinSet: true
  };
}

export async function verifyKioskPin(input: {
  scope: KioskSettingsScope;
  targetReference: string;
  pin: string;
}) {
  const targetReference = normalizeTargetReference(input.targetReference);
  if (!targetReference) {
    throw new KioskSettingsError("Kiosk target is required.", 400, "missing_target");
  }
  if (!isFourDigitKioskPin(input.pin)) {
    throw new KioskSettingsError("Kiosk PIN must be exactly 4 digits.", 400, "invalid_pin");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: true, scope: input.scope, targetReference };
  }

  const result = await supabase
    .from("kiosk_settings")
    .select("id, pin_hash, enabled, failed_attempt_count, locked_until")
    .eq("scope", input.scope)
    .ilike("target_reference", targetReference)
    .maybeSingle();

  if (result.error) {
    throw new KioskSettingsError("Unable to verify kiosk PIN.", 500, "pin_lookup_failed");
  }
  if (!result.data || !result.data.enabled) {
    throw new KioskSettingsError("Set a kiosk PIN in More before launching Kiosk Mode.", 404, "pin_not_set");
  }

  const lockedUntil = result.data.locked_until ? new Date(result.data.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    throw new KioskSettingsError("Too many failed attempts. Try again later.", 429, "pin_locked");
  }

  const ok = verifyKioskPinHash(input.pin, result.data.pin_hash as string);
  if (!ok) {
    const failedAttempts = Number(result.data.failed_attempt_count ?? 0) + 1;
    await supabase
      .from("kiosk_settings")
      .update({
        failed_attempt_count: failedAttempts,
        locked_until: failedAttempts >= 5 ? new Date(Date.now() + 10 * 60_000).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", result.data.id);
    throw new KioskSettingsError("Invalid kiosk PIN.", failedAttempts >= 5 ? 429 : 403, failedAttempts >= 5 ? "pin_locked" : "pin_invalid");
  }

  await supabase
    .from("kiosk_settings")
    .update({
      failed_attempt_count: 0,
      locked_until: null,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", result.data.id);

  return { ok: true, scope: input.scope, targetReference };
}
