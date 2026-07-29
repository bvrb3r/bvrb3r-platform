import { createHash, randomInt } from "node:crypto";
import { isShopOwnerRole } from "@/lib/auth/roles";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { resolveOwnerOperationsShopId } from "@/lib/owner-operations/domain";
import type { OwnerOperationsControlState } from "@/lib/owner-operations/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class OwnerOperationsServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "owner_operations_error"
  ) {
    super(message);
    this.name = "OwnerOperationsServiceError";
  }
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    throw new OwnerOperationsServiceError(
      "Owner operation changes require the production database connection.",
      503,
      "database_unavailable"
    );
  }
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new OwnerOperationsServiceError(
      "Owner operation changes require the production database connection.",
      503,
      "database_unavailable"
    );
  }
  return client;
}

async function requireOwnerShop(
  supabase: SupabaseClient,
  user: UserAccount,
  requestedShopId: string
) {
  if (!isShopOwnerRole(user.role)) {
    throw new OwnerOperationsServiceError(
      "Only a shop owner can change owner operations.",
      403,
      "not_shop_owner"
    );
  }
  const shopId = resolveOwnerOperationsShopId(user, requestedShopId);
  if (!shopId) {
    throw new OwnerOperationsServiceError(
      "That shop is outside your owner scope.",
      403,
      "shop_scope_denied"
    );
  }

  const [shopResult, locationResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, owner_profile_id")
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("locations")
      .select("id, reference_code")
      .eq("reference_code", shopId)
      .maybeSingle()
  ]);

  if (shopResult.error || locationResult.error) {
    throw new OwnerOperationsServiceError(
      "Unable to verify this shop scope.",
      500,
      "shop_scope_lookup_failed"
    );
  }
  if (!shopResult.data || !locationResult.data) {
    throw new OwnerOperationsServiceError(
      "This shop is not connected to an operational location.",
      404,
      "shop_location_missing"
    );
  }
  if (String((shopResult.data as { owner_profile_id?: unknown }).owner_profile_id ?? "") !== user.id) {
    throw new OwnerOperationsServiceError(
      "Only the recorded shop owner can change this shop.",
      403,
      "shop_owner_mismatch"
    );
  }

  return {
    shopId,
    locationId: String((locationResult.data as { id: unknown }).id)
  };
}

async function writeAudit(
  supabase: SupabaseClient,
  input: {
    user: UserAccount;
    shopId: string;
    locationId: string;
    action: string;
    targetType: string;
    targetId: string;
    previousState?: Record<string, unknown> | null;
    nextState?: Record<string, unknown> | null;
    reason: string;
  }
) {
  const result = await supabase.from("audit_logs").insert({
    actor_profile_id: input.user.id,
    action: input.action,
    target: input.targetId,
    severity: "info",
    shop_id: input.shopId,
    location_id: input.locationId,
    target_type: input.targetType,
    target_id: input.targetId,
    previous_state: input.previousState ?? null,
    next_state: input.nextState ?? null,
    reason: input.reason
  });
  if (result.error) {
    throw new OwnerOperationsServiceError(
      "The operation changed but its audit record could not be confirmed.",
      500,
      "audit_write_failed"
    );
  }
}

export async function updateOwnerFloorControls(
  user: UserAccount,
  input: {
    shopId: string;
    intakeOpen?: boolean;
    floorNote?: string | null;
    rotationOverrideBarberId?: string | null;
    rotationOverrideExpiresAt?: string | null;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  let resolvedOverrideBarberId: string | null | undefined;
  if (input.rotationOverrideBarberId !== undefined) {
    resolvedOverrideBarberId = input.rotationOverrideBarberId
      ? await resolveEligibleOwnerFloorBarber(
        supabase,
        scope.locationId,
        input.rotationOverrideBarberId
      )
      : null;
  }
  if (resolvedOverrideBarberId && !input.rotationOverrideExpiresAt) {
    throw new OwnerOperationsServiceError(
      "A rotation override needs an expiration time.",
      400,
      "rotation_expiration_required"
    );
  }
  if (
    input.rotationOverrideExpiresAt
    && new Date(input.rotationOverrideExpiresAt).getTime() <= Date.now()
  ) {
    throw new OwnerOperationsServiceError(
      "A rotation override must expire in the future.",
      400,
      "rotation_expiration_invalid"
    );
  }
  const currentResult = await supabase
    .from("shop_floor_controls")
    .select("id, intake_open, floor_note, rotation_override_barber_id, rotation_override_reason, rotation_override_expires_at, version")
    .eq("shop_id", scope.shopId)
    .eq("location_id", scope.locationId)
    .maybeSingle();
  if (currentResult.error) {
    throw new OwnerOperationsServiceError("Unable to read floor controls.", 500, "floor_read_failed");
  }

  const current = currentResult.data as {
    id?: string;
    intake_open?: boolean;
    floor_note?: string | null;
    rotation_override_barber_id?: string | null;
    rotation_override_reason?: string | null;
    rotation_override_expires_at?: string | null;
    version?: number;
  } | null;
  const nextState = {
    intake_open: input.intakeOpen ?? current?.intake_open ?? true,
    floor_note: input.floorNote === undefined ? current?.floor_note ?? null : input.floorNote,
    rotation_override_barber_id: resolvedOverrideBarberId === undefined
      ? current?.rotation_override_barber_id ?? null
      : resolvedOverrideBarberId,
    rotation_override_reason: resolvedOverrideBarberId === undefined
      ? current?.rotation_override_reason ?? null
      : resolvedOverrideBarberId
        ? input.reason
        : null,
    rotation_override_expires_at: resolvedOverrideBarberId === undefined
      ? current?.rotation_override_expires_at ?? null
      : resolvedOverrideBarberId
        ? input.rotationOverrideExpiresAt
        : null,
    updated_by_profile_id: user.id,
    updated_at: new Date().toISOString(),
    version: (current?.version ?? 0) + 1
  };
  const mutation = current?.id
    ? supabase
      .from("shop_floor_controls")
      .update(nextState)
      .eq("id", current.id)
      .eq("version", current.version ?? 1)
      .select("id, intake_open, floor_note, rotation_override_barber_id, rotation_override_reason, rotation_override_expires_at, version")
      .maybeSingle()
    : supabase
      .from("shop_floor_controls")
      .insert({
        shop_id: scope.shopId,
        location_id: scope.locationId,
        ...nextState
      })
      .select("id, intake_open, floor_note, rotation_override_barber_id, rotation_override_reason, rotation_override_expires_at, version")
      .maybeSingle();
  const result = await mutation;
  if (result.error || !result.data) {
    throw new OwnerOperationsServiceError(
      "Floor controls changed elsewhere. Refresh and try again.",
      409,
      "floor_version_conflict"
    );
  }

  await writeAudit(supabase, {
    user,
    ...scope,
    action: "owner_floor_controls_updated",
    targetType: "shop_floor_controls",
    targetId: String((result.data as { id: unknown }).id),
    previousState: current ? {
      intakeOpen: current.intake_open,
      floorNote: current.floor_note,
      rotationOverrideBarberId: current.rotation_override_barber_id,
      rotationOverrideReason: current.rotation_override_reason,
      rotationOverrideExpiresAt: current.rotation_override_expires_at,
      version: current.version
    } : null,
    nextState: result.data as Record<string, unknown>,
    reason: input.reason
  });
  return { controls: result.data };
}

function integer(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveEligibleOwnerFloorBarber(
  supabase: SupabaseClient,
  locationId: string,
  barberIdOrReference: string
) {
  const query = supabase
    .from("barbers")
    .select("id, profile_id");
  const barberResult = isUuid(barberIdOrReference)
    ? await query.eq("id", barberIdOrReference).maybeSingle()
    : await query.eq("reference_code", barberIdOrReference).maybeSingle();
  if (barberResult.error || !barberResult.data) {
    throw new OwnerOperationsServiceError(
      "The selected barber is not available for this floor.",
      409,
      "rotation_barber_missing"
    );
  }
  const barber = barberResult.data as { id: string; profile_id: string };
  const membership = await supabase
    .from("staff_locations")
    .select("id")
    .eq("profile_id", barber.profile_id)
    .eq("location_id", locationId)
    .eq("relationship_status", "active")
    .is("ended_at", null)
    .maybeSingle();
  if (membership.error || !membership.data) {
    throw new OwnerOperationsServiceError(
      "Rotation overrides can target only an active barber in this shop.",
      409,
      "rotation_barber_ineligible"
    );
  }
  return barber.id;
}

export async function readOwnerOperationsControlState(
  user: UserAccount,
  shopId: string
): Promise<OwnerOperationsControlState> {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, shopId);
  const [
    floorResult,
    kioskResult,
    chairsResult,
    rentResult,
    clientBridgeResult
  ] = await Promise.all([
    supabase
      .from("shop_floor_controls")
      .select("intake_open, floor_note, rotation_override_barber_id, rotation_override_reason, rotation_override_expires_at, version")
      .eq("shop_id", scope.shopId)
      .eq("location_id", scope.locationId)
      .maybeSingle(),
    supabase
      .from("kiosk_settings")
      .select("enabled, pin_hash, health_status, emergency_disabled_at, paired_at, privacy_mode, auto_reset_enabled, external_checkin_enabled, guest_checkin_allowed, qr_entry_enabled, nfc_entry_enabled, clientbridge_prompt_enabled, clientbridge_prompt_frequency, notification_failure_escalation, rotation_policy, balance_guardrail_minutes, payment_collection_policy, session_timeout_seconds")
      .eq("scope", "shop")
      .eq("target_reference", scope.shopId)
      .eq("owner_profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("shop_chairs")
      .select("id, label, sort_order, active, assigned_barber_id, retired_at")
      .eq("shop_id", scope.shopId)
      .eq("location_id", scope.locationId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("booth_rent_charges")
      .select("amount_cents, amount_paid_cents, status")
      .eq("shop_id", scope.shopId)
      .eq("location_id", scope.locationId),
    supabase
      .from("owner_clientbridge_daily_aggregates")
      .select("offered_count, consented_count, invitation_count, claimed_count, opted_out_count")
      .eq("shop_id", scope.shopId)
      .eq("location_id", scope.locationId)
  ]);

  const failed = [
    floorResult.error,
    kioskResult.error,
    chairsResult.error,
    rentResult.error,
    clientBridgeResult.error
  ].find(Boolean);
  if (failed) {
    throw new OwnerOperationsServiceError(
      "PR25 control tables are not ready for this environment.",
      503,
      "pr25_migration_pending"
    );
  }

  const floor = floorResult.data as {
    intake_open?: boolean;
    floor_note?: string | null;
    rotation_override_barber_id?: string | null;
    rotation_override_reason?: string | null;
    rotation_override_expires_at?: string | null;
    version?: number;
  } | null;
  const kiosk = kioskResult.data as {
    enabled?: boolean;
    pin_hash?: string | null;
    health_status?: string;
    emergency_disabled_at?: string | null;
    paired_at?: string | null;
    privacy_mode?: boolean;
    auto_reset_enabled?: boolean;
    external_checkin_enabled?: boolean;
    guest_checkin_allowed?: boolean;
    qr_entry_enabled?: boolean;
    nfc_entry_enabled?: boolean;
    clientbridge_prompt_enabled?: boolean;
    clientbridge_prompt_frequency?: "once_per_visit" | "once_per_30_days" | "never";
    notification_failure_escalation?: boolean;
    rotation_policy?: "strict" | "balanced" | "fastest_available";
    balance_guardrail_minutes?: number;
    payment_collection_policy?: "barber_checkout" | "prepay";
    session_timeout_seconds?: number;
  } | null;
  const chairs = (chairsResult.data ?? []) as Array<{
    id: string;
    label: string;
    sort_order: number;
    active: boolean;
    assigned_barber_id: string | null;
    retired_at: string | null;
  }>;
  const charges = (rentResult.data ?? []) as Array<{
    amount_cents: number | string;
    amount_paid_cents: number | string;
    status: string;
  }>;
  const bridgeRows = (clientBridgeResult.data ?? []) as Array<{
    offered_count: number;
    consented_count: number;
    invitation_count: number;
    claimed_count: number;
    opted_out_count: number;
  }>;

  const billedCents = charges.reduce((sum, row) => sum + integer(row.amount_cents), 0);
  const paidCents = charges.reduce((sum, row) => sum + integer(row.amount_paid_cents), 0);

  return {
    floor: {
      intakeOpen: floor?.intake_open ?? true,
      floorNote: floor?.floor_note ?? null,
      rotationOverrideBarberId: floor?.rotation_override_barber_id ?? null,
      rotationOverrideReason: floor?.rotation_override_reason ?? null,
      rotationOverrideExpiresAt: floor?.rotation_override_expires_at ?? null,
      version: integer(floor?.version)
    },
    kiosk: {
      paired: Boolean(kiosk?.paired_at),
      pinSet: Boolean(kiosk?.pin_hash),
      enabled: kiosk?.enabled ?? false,
      healthStatus: kiosk?.health_status ?? "unpaired",
      emergencyDisabledAt: kiosk?.emergency_disabled_at ?? null,
      privacyMode: kiosk?.privacy_mode ?? true,
      autoResetEnabled: kiosk?.auto_reset_enabled ?? true,
      externalCheckinEnabled: kiosk?.external_checkin_enabled ?? false,
      guestCheckinAllowed: kiosk?.guest_checkin_allowed ?? true,
      qrEntryEnabled: kiosk?.qr_entry_enabled ?? true,
      nfcEntryEnabled: kiosk?.nfc_entry_enabled ?? false,
      clientBridgePromptEnabled: kiosk?.clientbridge_prompt_enabled ?? true,
      clientBridgePromptFrequency: kiosk?.clientbridge_prompt_frequency ?? "once_per_visit",
      notificationFailureEscalation: kiosk?.notification_failure_escalation ?? true,
      rotationPolicy: kiosk?.rotation_policy ?? "balanced",
      balanceGuardrailMinutes: integer(kiosk?.balance_guardrail_minutes ?? 20),
      paymentCollectionPolicy: kiosk?.payment_collection_policy ?? "barber_checkout",
      sessionTimeoutSeconds: integer(kiosk?.session_timeout_seconds ?? 75)
    },
    chairs: chairs.map((row) => ({
      chairId: row.id,
      label: row.label,
      sortOrder: row.sort_order,
      active: row.active,
      assignedBarberId: row.assigned_barber_id,
      retiredAt: row.retired_at
    })),
    boothRent: {
      billedCents,
      paidCents,
      outstandingCents: Math.max(billedCents - paidCents, 0),
      overdueCount: charges.filter((row) => ["late", "failed"].includes(row.status)).length
    },
    clientBridge: bridgeRows.reduce((summary, row) => ({
      offered: summary.offered + integer(row.offered_count),
      consented: summary.consented + integer(row.consented_count),
      invitations: summary.invitations + integer(row.invitation_count),
      claimed: summary.claimed + integer(row.claimed_count),
      optedOut: summary.optedOut + integer(row.opted_out_count)
    }), {
      offered: 0,
      consented: 0,
      invitations: 0,
      claimed: 0,
      optedOut: 0
    })
  };
}

export async function setOwnerKioskEmergencyState(
  user: UserAccount,
  input: {
    shopId: string;
    disabled: boolean;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  const existing = await supabase
    .from("kiosk_settings")
    .select("id, enabled, health_status, emergency_disabled_at")
    .eq("scope", "shop")
    .eq("target_reference", scope.shopId)
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (existing.error) {
    throw new OwnerOperationsServiceError("Unable to read kiosk controls.", 500, "kiosk_read_failed");
  }
  if (!existing.data) {
    throw new OwnerOperationsServiceError(
      "Pair this shop kiosk before using emergency disable.",
      409,
      "kiosk_not_paired"
    );
  }

  const now = new Date().toISOString();
  const result = await supabase
    .from("kiosk_settings")
    .update({
      enabled: !input.disabled,
      emergency_disabled_at: input.disabled ? now : null,
      emergency_disabled_by: input.disabled ? user.id : null,
      health_status: input.disabled ? "disabled" : "unpaired",
      updated_at: now
    })
    .eq("id", String((existing.data as { id: unknown }).id))
    .select("id, enabled, health_status, emergency_disabled_at")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new OwnerOperationsServiceError(
      "Unable to change kiosk emergency state.",
      500,
      "kiosk_update_failed"
    );
  }

  // The database trigger owns session revocation and the canonical kiosk
  // before/after audit. The route returns only after that transaction commits.
  return {
    kiosk: result.data,
    activeSessionsRevoked: input.disabled
  };
}

export async function updateOwnerKioskPolicy(
  user: UserAccount,
  input: {
    shopId: string;
    privacyMode?: boolean;
    autoResetEnabled?: boolean;
    externalCheckinEnabled?: boolean;
    guestCheckinAllowed?: boolean;
    clientBridgePromptEnabled?: boolean;
    clientBridgePromptFrequency?: "once_per_visit" | "once_per_30_days" | "never";
    qrEntryEnabled?: boolean;
    nfcEntryEnabled?: boolean;
    notificationFailureEscalation?: boolean;
    rotationPolicy?: "strict" | "balanced" | "fastest_available";
    balanceGuardrailMinutes?: number;
    paymentCollectionPolicy?: "barber_checkout" | "prepay";
    sessionTimeoutSeconds?: number;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  const existing = await supabase
    .from("kiosk_settings")
    .select("id, privacy_mode, auto_reset_enabled, external_checkin_enabled, guest_checkin_allowed, clientbridge_prompt_enabled, clientbridge_prompt_frequency, qr_entry_enabled, nfc_entry_enabled, notification_failure_escalation, rotation_policy, balance_guardrail_minutes, payment_collection_policy, session_timeout_seconds")
    .eq("scope", "shop")
    .eq("target_reference", scope.shopId)
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (existing.error) {
    throw new OwnerOperationsServiceError("Unable to read kiosk policy.", 500, "kiosk_policy_read_failed");
  }
  if (!existing.data) {
    throw new OwnerOperationsServiceError(
      "Set the shop kiosk PIN before changing its policy.",
      409,
      "kiosk_not_configured"
    );
  }

  const patch = {
    ...(input.privacyMode !== undefined ? { privacy_mode: input.privacyMode } : {}),
    ...(input.autoResetEnabled !== undefined ? { auto_reset_enabled: input.autoResetEnabled } : {}),
    ...(input.externalCheckinEnabled !== undefined ? { external_checkin_enabled: input.externalCheckinEnabled } : {}),
    ...(input.guestCheckinAllowed !== undefined ? { guest_checkin_allowed: input.guestCheckinAllowed } : {}),
    ...(input.clientBridgePromptEnabled !== undefined ? { clientbridge_prompt_enabled: input.clientBridgePromptEnabled } : {}),
    ...(input.clientBridgePromptFrequency !== undefined ? { clientbridge_prompt_frequency: input.clientBridgePromptFrequency } : {}),
    ...(input.qrEntryEnabled !== undefined ? { qr_entry_enabled: input.qrEntryEnabled } : {}),
    ...(input.nfcEntryEnabled !== undefined ? { nfc_entry_enabled: input.nfcEntryEnabled } : {}),
    ...(input.notificationFailureEscalation !== undefined ? { notification_failure_escalation: input.notificationFailureEscalation } : {}),
    ...(input.rotationPolicy !== undefined ? { rotation_policy: input.rotationPolicy } : {}),
    ...(input.balanceGuardrailMinutes !== undefined ? { balance_guardrail_minutes: input.balanceGuardrailMinutes } : {}),
    ...(input.paymentCollectionPolicy !== undefined ? { payment_collection_policy: input.paymentCollectionPolicy } : {}),
    ...(input.sessionTimeoutSeconds !== undefined ? { session_timeout_seconds: input.sessionTimeoutSeconds } : {}),
    updated_at: new Date().toISOString()
  };
  const result = await supabase
    .from("kiosk_settings")
    .update(patch)
    .eq("id", String((existing.data as { id: unknown }).id))
    .select("id, privacy_mode, auto_reset_enabled, external_checkin_enabled, guest_checkin_allowed, clientbridge_prompt_enabled, clientbridge_prompt_frequency, qr_entry_enabled, nfc_entry_enabled, notification_failure_escalation, rotation_policy, balance_guardrail_minutes, payment_collection_policy, session_timeout_seconds")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new OwnerOperationsServiceError(
      "Unable to save the kiosk policy.",
      500,
      "kiosk_policy_update_failed"
    );
  }

  await writeAudit(supabase, {
    user,
    ...scope,
    action: "owner_kiosk_policy_updated",
    targetType: "kiosk_settings",
    targetId: String((existing.data as { id: unknown }).id),
    previousState: existing.data as Record<string, unknown>,
    nextState: result.data as Record<string, unknown>,
    reason: input.reason
  });
  return { kiosk: result.data };
}

export async function pairOwnerKioskDevice(
  user: UserAccount,
  input: {
    shopId: string;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  const pairingCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const pairingCodeHash = createHash("sha256").update(pairingCode).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const result = await supabase
    .from("kiosk_settings")
    .upsert({
      owner_profile_id: user.id,
      scope: "shop",
      target_reference: scope.shopId,
      enabled: true,
      pairing_code_hash: pairingCodeHash,
      pairing_code_expires_at: expiresAt,
      paired_at: now.toISOString(),
      health_status: "healthy",
      emergency_disabled_at: null,
      emergency_disabled_by: null,
      last_health_check_at: now.toISOString(),
      updated_at: now.toISOString()
    }, {
      onConflict: "scope,target_reference"
    })
    .select("id, enabled, paired_at, health_status")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new OwnerOperationsServiceError(
      "Unable to pair this kiosk device.",
      500,
      "kiosk_pair_failed"
    );
  }

  await writeAudit(supabase, {
    user,
    ...scope,
    action: "owner_kiosk_device_paired",
    targetType: "kiosk_settings",
    targetId: String((result.data as { id: unknown }).id),
    nextState: {
      pairedAt: (result.data as { paired_at?: unknown }).paired_at,
      healthStatus: (result.data as { health_status?: unknown }).health_status
    },
    reason: input.reason
  });
  return {
    kiosk: result.data,
    pairingCode,
    expiresAt
  };
}

export async function createOwnerChair(
  user: UserAccount,
  input: {
    shopId: string;
    label: string;
    sortOrder: number;
    assignedBarberId?: string | null;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  const result = await supabase
    .from("shop_chairs")
    .insert({
      shop_id: scope.shopId,
      location_id: scope.locationId,
      label: input.label.trim(),
      sort_order: input.sortOrder,
      assigned_barber_id: input.assignedBarberId ?? null
    })
    .select("id, label, sort_order, active, assigned_barber_id")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new OwnerOperationsServiceError(
      "Unable to add this chair. Check the label and barber assignment.",
      409,
      "chair_create_failed"
    );
  }
  await writeAudit(supabase, {
    user,
    ...scope,
    action: "owner_chair_created",
    targetType: "shop_chairs",
    targetId: String((result.data as { id: unknown }).id),
    nextState: result.data as Record<string, unknown>,
    reason: input.reason
  });
  return { chair: result.data };
}

export async function retireOwnerChair(
  user: UserAccount,
  input: {
    shopId: string;
    chairId: string;
    reason: string;
  }
) {
  const supabase = getSupabase();
  const scope = await requireOwnerShop(supabase, user, input.shopId);
  const existing = await supabase
    .from("shop_chairs")
    .select("id, label, active, assigned_barber_id")
    .eq("id", input.chairId)
    .eq("shop_id", scope.shopId)
    .eq("location_id", scope.locationId)
    .maybeSingle();
  if (existing.error || !existing.data) {
    throw new OwnerOperationsServiceError("This chair was not found in the selected shop.", 404, "chair_not_found");
  }
  const result = await supabase
    .from("shop_chairs")
    .update({
      active: false,
      retired_by_profile_id: user.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.chairId)
    .eq("active", true)
    .select("id, label, active, assigned_barber_id, retired_at")
    .maybeSingle();
  if (result.error || !result.data) {
    const message = String(result.error?.message ?? "");
    if (/open booth rent|settled/i.test(message)) {
      throw new OwnerOperationsServiceError(message, 409, "unsettled_booth_rent");
    }
    throw new OwnerOperationsServiceError("Unable to retire this chair.", 409, "chair_retire_failed");
  }
  await writeAudit(supabase, {
    user,
    ...scope,
    action: "owner_chair_retired",
    targetType: "shop_chairs",
    targetId: input.chairId,
    previousState: existing.data as Record<string, unknown>,
    nextState: result.data as Record<string, unknown>,
    reason: input.reason
  });
  return { chair: result.data };
}
