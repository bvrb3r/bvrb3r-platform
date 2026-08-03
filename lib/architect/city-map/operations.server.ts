import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runScheduledFintechJobs } from "@/lib/cron/fintech";
import {
  BARBER_ACCESS_ROLES,
  CLIENT_ACCOUNT_ROLE,
  LEGACY_CLIENT_ACCOUNT_ROLES,
  LEGACY_SHOP_OWNER_ACCOUNT_ROLES,
  SHOP_OWNER_ACCOUNT_ROLE
} from "@/lib/auth/roles";

const OPERATION_TYPES = [
  "job_run",
  "webhook_replay",
  "broadcast",
  "device_restart",
  "sessions_revoke",
  "account_lock",
  "maintenance_schedule",
  "maintenance_cancel",
  "backup",
  "restore_drill",
  "cdn_purge",
  "rate_limit",
  "vercel_rollback"
] as const;

export type ArchitectOperationType = typeof OPERATION_TYPES[number];

export type ArchitectOperationCommand = {
  action: ArchitectOperationType;
  target: string;
  reason: string;
  confirmation: string;
  payload: Record<string, unknown>;
};

type Row = Record<string, unknown>;

function requiredConfirmation(action: string, target: string) {
  return `CONFIRM ${action} ${target}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseArchitectOperationCommand(value: unknown): ArchitectOperationCommand {
  if (!value || typeof value !== "object") throw new Error("An operation command is required.");
  const body = value as Row;
  const action = text(body.action) as ArchitectOperationType;
  if (!OPERATION_TYPES.includes(action)) throw new Error("The operation type is invalid.");
  const target = text(body.target);
  if (!target) throw new Error("An operation target is required.");
  const reason = text(body.reason);
  if (reason.length < 8) throw new Error("A reason of at least 8 characters is required.");
  if (body.confirmation !== requiredConfirmation(action, target)) {
    throw new Error(`Confirmation must be exactly: ${requiredConfirmation(action, target)}`);
  }
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};
  return { action, target, reason, confirmation: body.confirmation, payload };
}

async function rows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderColumn: string,
  limit: number
): Promise<Row[]> {
  try {
    const result = await supabase.from(table).select(columns).order(orderColumn, { ascending: false }).limit(limit);
    return result.error ? [] : (result.data ?? []) as unknown as Row[];
  } catch {
    return [];
  }
}

type VercelDeployment = {
  uid?: string;
  url?: string;
  state?: string;
  target?: string;
  created?: number;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

function vercelConfig() {
  const token = process.env.VERCEL_AUTOMATION_TOKEN?.trim();
  const projectId = (process.env.BVRB3R_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID)?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return token && projectId ? { token, projectId, teamId } : null;
}

async function readVercelRollbackCandidates() {
  const config = vercelConfig();
  if (!config) return [];
  const params = new URLSearchParams({
    projectId: config.projectId,
    target: "production",
    state: "READY",
    limit: "10"
  });
  if (config.teamId) params.set("teamId", config.teamId);
  try {
    const response = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return [];
    const body = await response.json() as { deployments?: VercelDeployment[] };
    const currentId = process.env.VERCEL_DEPLOYMENT_ID;
    return (body.deployments ?? []).filter((deployment) =>
      deployment.uid
      && deployment.uid !== currentId
      && deployment.state === "READY"
      && deployment.target === "production"
    ).map((deployment) => ({
      id: deployment.uid as string,
      url: deployment.url ?? "URL unavailable",
      createdAt: new Date(deployment.createdAt ?? deployment.created ?? 0).toISOString(),
      commit: text(deployment.meta?.githubCommitSha ?? deployment.meta?.githubCommitRef) || "commit unavailable"
    }));
  } catch {
    return [];
  }
}

export async function readArchitectOperations(supabase: SupabaseClient, actorUserId: string) {
  const [jobs, webhooks, devices, commands, maintenance, reportPreference, rollbackCandidates] = await Promise.all([
    rows(supabase, "scheduled_job_runs", "id, job_name, scope_key, status, trigger_source, started_at, completed_at, failed_at, last_error, result_summary", "started_at", 40),
    rows(supabase, "stripe_webhook_events", "id, stripe_event_id, event_type, processing_status, attempt_count, error_message, received_at", "received_at", 40),
    rows(supabase, "kiosk_settings", "id, scope, target_reference, enabled, device_label, paired_at, last_health_check_at, health_status, emergency_disabled_at", "updated_at", 80),
    rows(supabase, "architect_operation_commands", "id, command_type, target_key, status, actor_user_id, reason, requested_at, completed_at, result, error_message", "requested_at", 80),
    rows(supabase, "architect_maintenance_windows", "id, starts_at, ends_at, status, reason, scheduled_by, canceled_at", "starts_at", 20),
    supabase.from("architect_report_preferences").select("architect_user_id, report_email, auto_weekly, auto_monthly, timezone, weekly_schedule, monthly_schedule, updated_at").eq("architect_user_id", actorUserId).maybeSingle(),
    readVercelRollbackCandidates()
  ]);

  return {
    jobs,
    failedWebhooks: webhooks.filter((row) => row.processing_status === "failed"),
    devices,
    commands,
    maintenance,
    rollbackCandidates,
    reportPreference: reportPreference.error ? null : reportPreference.data,
    capabilities: {
      job_run: { executable: true, evidence: "Runs the existing server-owned fintech scheduler." },
      webhook_replay: { executable: false, evidence: "Visible but blocked until a signed Stripe payload replay executor is connected." },
      broadcast: { executable: true, evidence: "Writes operational notices to the canonical notification center." },
      device_restart: { executable: true, evidence: "Queues a realtime device command; completion requires a device acknowledgement." },
      sessions_revoke: { executable: false, evidence: "Visible but blocked until the Supabase global-session revoker is connected." },
      account_lock: { executable: false, evidence: "Use the existing Architect Accounts control until the lookup handoff is embedded here." },
      maintenance_schedule: { executable: true, evidence: "Writes a durable maintenance window for the automation runner." },
      maintenance_cancel: { executable: true, evidence: "Cancels a still-scheduled maintenance window." },
      backup: { executable: false, evidence: "Visible but blocked until a verified Supabase Management token is connected." },
      restore_drill: { executable: false, evidence: "Visible and gold-flagged until the staging restore executor is connected." },
      cdn_purge: { executable: false, evidence: process.env.VERCEL_AUTOMATION_TOKEN ? "Credential found, but the audited CDN executor is not connected yet." : "A scoped Vercel automation token is required." },
      rate_limit: { executable: false, evidence: "Visible but blocked until the booking/auth edge policy adapter is connected." },
      vercel_rollback: {
        executable: rollbackCandidates.length > 0,
        evidence: rollbackCandidates.length
          ? `${rollbackCandidates.length} prior READY production deployment${rollbackCandidates.length === 1 ? "" : "s"} verified for this project.`
          : vercelConfig()
            ? "No prior READY production deployment was verified."
            : "A scoped Vercel automation token and project id are required."
      }
    }
  };
}

async function appendAudit({
  supabase,
  actorUserId,
  actionType,
  command,
  beforeState,
  afterState,
  requestId
}: {
  supabase: SupabaseClient;
  actorUserId: string;
  actionType: "operation_queued" | "operation_started" | "operation_succeeded" | "operation_failed" | "operation_canceled";
  command: ArchitectOperationCommand;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  requestId: string;
}) {
  const write = await supabase.from("architect_control_audit").insert({
    actor_user_id: actorUserId,
    action_type: actionType,
    target_type: "operation",
    target_key: `${command.action}:${command.target}`,
    before_state: beforeState,
    after_state: afterState,
    reason: command.reason,
    request_id: `${requestId}:${actionType}`
  });
  if (write.error) throw new Error("The operation audit record could not be written.");
}

async function insertCommand(
  supabase: SupabaseClient,
  actorUserId: string,
  command: ArchitectOperationCommand,
  requestId: string,
  status: "queued" | "running"
) {
  const write = await supabase.from("architect_operation_commands").insert({
    command_type: command.action,
    target_key: command.target,
    payload: command.payload,
    status,
    actor_user_id: actorUserId,
    reason: command.reason,
    idempotency_key: requestId,
    started_at: status === "running" ? new Date().toISOString() : null
  }).select("*").single();
  if (write.error || !write.data) throw new Error("The operation command could not be recorded.");
  return write.data as Row;
}

async function finishCommand(
  supabase: SupabaseClient,
  id: unknown,
  status: "succeeded" | "failed" | "canceled",
  result: Record<string, unknown>,
  errorMessage?: string
) {
  const write = await supabase.from("architect_operation_commands").update({
    status,
    completed_at: new Date().toISOString(),
    result,
    error_message: errorMessage ?? null
  }).eq("id", id).select("*").single();
  if (write.error || !write.data) throw new Error("The operation result could not be recorded.");
  return write.data as Row;
}

async function executeBroadcast(supabase: SupabaseClient, command: ArchitectOperationCommand) {
  const audience = text(command.payload.audience).toLowerCase();
  const message = text(command.payload.message);
  if (!["all", "clients", "barbers", "owners", "kiosks"].includes(audience)) throw new Error("The broadcast audience is invalid.");
  if (message.length < 2 || message.length > 500) throw new Error("The broadcast message must be between 2 and 500 characters.");
  if (audience === "kiosks") {
    return { queuedFor: "kiosks", delivery: "realtime device command" };
  }

  const roleFilters: Record<string, string[]> = {
    clients: [CLIENT_ACCOUNT_ROLE, ...LEGACY_CLIENT_ACCOUNT_ROLES],
    barbers: [...BARBER_ACCESS_ROLES],
    owners: [SHOP_OWNER_ACCOUNT_ROLE, ...LEGACY_SHOP_OWNER_ACCOUNT_ROLES, "manager"]
  };
  let query = supabase.from("profiles").select("id, email, role");
  if (audience !== "all") query = query.in("role", roleFilters[audience] ?? []);
  const profiles = await query.limit(10_000);
  if (profiles.error) throw new Error("The broadcast audience could not be resolved.");
  const records = (profiles.data ?? []).map((profile) => ({
    profile_id: profile.id,
    audience_email: profile.email,
    audience_role: profile.role,
    channel: "in_app",
    title: "BVRB3R system notice",
    body: message,
    status: "scheduled",
    scheduled_for: new Date().toISOString(),
    notification_type: "system_notice",
    metadata: { source: "architect_city_map", audience }
  }));
  if (!records.length) return { queuedFor: audience, recipients: 0 };
  const write = await supabase.from("notifications").insert(records);
  if (write.error) throw new Error("The operational broadcast could not be written.");
  return { queuedFor: audience, recipients: records.length };
}

async function executeMaintenance(
  supabase: SupabaseClient,
  actorUserId: string,
  command: ArchitectOperationCommand
) {
  if (command.action === "maintenance_schedule") {
    const startsAt = text(command.payload.startsAt);
    const endsAt = text(command.payload.endsAt);
    if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new Error("A valid maintenance start and end are required.");
    }
    const write = await supabase.from("architect_maintenance_windows").insert({
      starts_at: startsAt,
      ends_at: endsAt,
      reason: command.reason,
      scheduled_by: actorUserId
    }).select("*").single();
    if (write.error || !write.data) throw new Error("The maintenance window could not be scheduled.");
    return { window: write.data };
  }

  const before = await supabase.from("architect_maintenance_windows").select("*").eq("id", command.target).eq("status", "scheduled").maybeSingle();
  if (before.error || !before.data) throw new Error("The scheduled maintenance window was not found.");
  const write = await supabase.from("architect_maintenance_windows").update({
    status: "canceled",
    canceled_by: actorUserId,
    canceled_at: new Date().toISOString()
  }).eq("id", command.target).eq("status", "scheduled").select("*").single();
  if (write.error || !write.data) throw new Error("The maintenance window could not be canceled.");
  return { window: write.data };
}

async function executeVercelRollback(command: ArchitectOperationCommand) {
  const config = vercelConfig();
  if (!config) throw new Error("The Vercel rollback executor is not connected.");
  const candidates = await readVercelRollbackCandidates();
  if (!candidates.some((candidate) => candidate.id === command.target)) {
    throw new Error("The rollback target is not a prior READY production deployment for this project.");
  }
  const params = new URLSearchParams({ description: command.reason });
  if (config.teamId) params.set("teamId", config.teamId);
  const response = await fetch(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(command.target)}?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(10_000)
    }
  );
  if (!response.ok) throw new Error(`Vercel rejected the rollback request (${response.status}).`);
  return {
    fromDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? "unavailable",
    toDeploymentId: command.target,
    providerAccepted: true
  };
}

export async function executeArchitectOperation({
  supabase,
  actorUserId,
  command
}: {
  supabase: SupabaseClient;
  actorUserId: string;
  command: ArchitectOperationCommand;
}) {
  const requestId = randomUUID();
  const synchronous = ["job_run", "broadcast", "maintenance_schedule", "maintenance_cancel", "vercel_rollback"].includes(command.action);
  const durableQueue = command.action === "device_restart";
  if (command.action === "vercel_rollback" && !vercelConfig()) {
    throw new Error("The Vercel rollback executor is not connected.");
  }
  if (!synchronous && !durableQueue) {
    throw new Error("This operation executor is not connected.");
  }
  const initial = await insertCommand(supabase, actorUserId, command, requestId, synchronous ? "running" : "queued");
  await appendAudit({
    supabase,
    actorUserId,
    actionType: synchronous ? "operation_started" : "operation_queued",
    command,
    beforeState: {},
    afterState: initial,
    requestId
  });

  if (durableQueue) return { requestId, command: initial, queued: true };

  try {
    let result: Record<string, unknown>;
    if (command.action === "job_run") {
      if (command.target !== "fintech") throw new Error("This job executor is not connected.");
      result = await runScheduledFintechJobs({
        locationIds: [],
        triggerSource: "manual",
        actorUserId,
        actorRole: "platform_admin"
      }) as unknown as Record<string, unknown>;
    } else if (command.action === "broadcast") {
      result = await executeBroadcast(supabase, command);
    } else if (command.action === "maintenance_schedule" || command.action === "maintenance_cancel") {
      result = await executeMaintenance(supabase, actorUserId, command);
    } else if (command.action === "vercel_rollback") {
      result = await executeVercelRollback(command);
    } else throw new Error("This operation executor is not connected.");

    const completed = await finishCommand(supabase, initial.id, "succeeded", result);
    await appendAudit({
      supabase,
      actorUserId,
      actionType: "operation_succeeded",
      command,
      beforeState: initial,
      afterState: completed,
      requestId
    });
    return { requestId, command: completed, queued: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The operation failed.";
    const failed = await finishCommand(supabase, initial.id, "failed", {}, message);
    await appendAudit({
      supabase,
      actorUserId,
      actionType: "operation_failed",
      command,
      beforeState: initial,
      afterState: failed,
      requestId
    });
    throw new Error(message);
  }
}
