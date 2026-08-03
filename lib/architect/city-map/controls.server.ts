import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GATES } from "@/lib/feature-gates";

const SYSTEM_CONTROL_KEYS = ["maintenance", "bookings", "kiosks", "payouts", "hive_ai"] as const;
export type ArchitectSystemControlKey = typeof SYSTEM_CONTROL_KEYS[number];

export type ArchitectControlCommand =
  | {
      action: "system_control";
      target: ArchitectSystemControlKey;
      active: boolean;
      expectedVersion: number;
      reason: string;
      confirmation: string;
    }
  | {
      action: "feature_flag";
      target: string;
      active: boolean;
      reason: string;
      confirmation: string;
    };

type Row = Record<string, unknown>;

function isSystemControlKey(value: unknown): value is ArchitectSystemControlKey {
  return typeof value === "string" && SYSTEM_CONTROL_KEYS.includes(value as ArchitectSystemControlKey);
}

function requiredConfirmation(target: string, active: boolean) {
  return `CONFIRM ${target} ${active ? "ON" : "OFF"}`;
}

function reason(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseArchitectControlCommand(value: unknown): ArchitectControlCommand {
  if (!value || typeof value !== "object") throw new Error("A control command is required.");
  const body = value as Row;
  const active = body.active;
  if (typeof active !== "boolean") throw new Error("The requested control state is invalid.");
  const target = typeof body.target === "string" ? body.target : "";
  const suppliedReason = reason(body.reason);
  if (suppliedReason.length < 8) throw new Error("A reason of at least 8 characters is required.");
  if (body.confirmation !== requiredConfirmation(target, active)) {
    throw new Error(`Confirmation must be exactly: ${requiredConfirmation(target, active)}`);
  }

  if (body.action === "system_control") {
    if (!isSystemControlKey(target)) throw new Error("The system control target is invalid.");
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("A valid optimistic version is required.");
    return {
      action: "system_control",
      target,
      active,
      expectedVersion,
      reason: suppliedReason,
      confirmation: body.confirmation
    };
  }

  if (body.action === "feature_flag") {
    if (!(target in GATES)) throw new Error("The feature flag target is invalid.");
    return {
      action: "feature_flag",
      target,
      active,
      reason: suppliedReason,
      confirmation: body.confirmation
    };
  }

  throw new Error("The control action is invalid.");
}

export async function readArchitectControls(supabase: SupabaseClient) {
  const [controls, flags, audit] = await Promise.all([
    supabase.from("architect_system_controls").select("control_key, label, active, reason, version, changed_by, changed_at").order("control_key"),
    supabase.from("feature_flags").select("gate_key, reason, enabled, updated_at").in("gate_key", Object.keys(GATES)).order("gate_key"),
    supabase.from("architect_control_audit").select("id, actor_user_id, action_type, target_type, target_key, before_state, after_state, reason, request_id, occurred_at").order("occurred_at", { ascending: false }).limit(50)
  ]);

  return {
    controls: controls.error ? [] : controls.data ?? [],
    featureFlags: flags.error ? [] : flags.data ?? [],
    audit: audit.error ? [] : audit.data ?? []
  };
}

export async function executeArchitectControl({
  supabase,
  actorUserId,
  command
}: {
  supabase: SupabaseClient;
  actorUserId: string;
  command: ArchitectControlCommand;
}) {
  const requestId = randomUUID();
  const now = new Date().toISOString();

  if (command.action === "system_control") {
    const beforeResult = await supabase
      .from("architect_system_controls")
      .select("control_key, label, active, reason, version, changed_by, changed_at")
      .eq("control_key", command.target)
      .maybeSingle();
    if (beforeResult.error || !beforeResult.data) throw new Error("The system control could not be loaded.");
    const before = beforeResult.data as Row;
    if (Number(before.version) !== command.expectedVersion) throw new Error("The system control changed. Refresh before trying again.");

    const nextVersion = command.expectedVersion + 1;
    const update = await supabase
      .from("architect_system_controls")
      .update({
        active: command.active,
        reason: command.reason,
        version: nextVersion,
        changed_by: actorUserId,
        changed_at: now,
        updated_at: now
      })
      .eq("control_key", command.target)
      .eq("version", command.expectedVersion)
      .select("control_key, label, active, reason, version, changed_by, changed_at")
      .maybeSingle();
    if (update.error || !update.data) throw new Error("The system control changed. Refresh before trying again.");

    const audit = await supabase.from("architect_control_audit").insert({
      actor_user_id: actorUserId,
      action_type: "system_control_changed",
      target_type: "system_control",
      target_key: command.target,
      before_state: before,
      after_state: update.data,
      reason: command.reason,
      request_id: requestId
    });
    if (audit.error) throw new Error("The control changed but its audit record could not be written.");
    return { requestId, result: update.data };
  }

  const beforeResult = await supabase
    .from("feature_flags")
    .select("gate_key, reason, enabled, updated_at")
    .eq("gate_key", command.target)
    .maybeSingle();
  if (beforeResult.error || !beforeResult.data) throw new Error("The feature flag could not be loaded.");
  const before = beforeResult.data as Row;
  const update = await supabase
    .from("feature_flags")
    .update({ enabled: command.active, updated_at: now })
    .eq("gate_key", command.target)
    .select("gate_key, reason, enabled, updated_at")
    .maybeSingle();
  if (update.error || !update.data) throw new Error("The feature flag could not be changed.");
  const audit = await supabase.from("architect_control_audit").insert({
    actor_user_id: actorUserId,
    action_type: "feature_flag_changed",
    target_type: "feature_flag",
    target_key: command.target,
    before_state: before,
    after_state: update.data,
    reason: command.reason,
    request_id: requestId
  });
  if (audit.error) throw new Error("The feature flag changed but its audit record could not be written.");
  return { requestId, result: update.data };
}
