import { NextResponse } from "next/server";
import { z } from "zod";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import {
  parseRoleNormalizationApprovalStatus,
  ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS
} from "@/lib/architect/role-normalization-approval";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(8).max(1000),
  confirmation: z.string()
}).strict();

type ServiceRpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function exactDeploymentCommitSha() {
  const value = readArchitectDebugEnvironment().commitHash?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

async function readStatus(client: ServiceRpcClient) {
  const { data, error } = await client.rpc(
    "bvrb3r_pr27_role_normalization_approval_status"
  );
  if (error) {
    throw new Error("Approval status is unavailable.");
  }
  return parseRoleNormalizationApprovalStatus(data);
}

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return noStoreJson({ ok: false, error: "Approval evidence service is unavailable." }, 503);
  }

  try {
    const status = await readStatus(supabase as unknown as ServiceRpcClient);
    return noStoreJson({
      ok: true,
      status,
      surfaceCommitSha: exactDeploymentCommitSha()
    });
  } catch {
    return noStoreJson({
      ok: false,
      error: "Role-normalization approval status could not be verified."
    }, 502);
  }
}

export async function POST(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  if (!isSameOriginMutation(request)) {
    return noStoreJson({ ok: false, error: "Same-origin confirmation is required." }, 403);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStoreJson({
      ok: false,
      error: "Decision, UUID idempotency key, reason, and confirmation are required."
    }, 400);
  }

  const expectedConfirmation =
    ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS[parsed.data.decision];
  if (parsed.data.confirmation !== expectedConfirmation) {
    return noStoreJson({ ok: false, error: "The exact confirmation phrase is required." }, 400);
  }

  const productionCommitSha = exactDeploymentCommitSha();
  if (!productionCommitSha) {
    return noStoreJson({
      ok: false,
      error: "A traceable deployment commit is required."
    }, 409);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return noStoreJson({ ok: false, error: "Approval evidence service is unavailable." }, 503);
  }

  const client = supabase as unknown as ServiceRpcClient;

  try {
    const before = await readStatus(client);
    if (before.approvalEvidencePresent) {
      return noStoreJson({
        ok: false,
        error: "Approval evidence has already been recorded for this plan."
      }, 409);
    }

    const { error } = await client.rpc(
      "bvrb3r_pr27_record_role_normalization_approval_evidence",
      {
        p_idempotency_key: parsed.data.idempotencyKey,
        p_decision: parsed.data.decision,
        p_actor_user_id: access.actor.id,
        p_actor_role: "internal_operator",
        p_production_commit_sha: productionCommitSha,
        p_reason: parsed.data.reason
      }
    );
    if (error) {
      throw new Error("Approval evidence could not be recorded.");
    }

    const status = await readStatus(client);
    if (
      !status.approvalEvidencePresent
      || status.approvalState !== parsed.data.decision
      || status.latestProductionCommitSha !== productionCommitSha
    ) {
      throw new Error("Approval evidence verification failed.");
    }

    return noStoreJson({
      ok: true,
      status,
      surfaceCommitSha: productionCommitSha
    }, 201);
  } catch {
    return noStoreJson({
      ok: false,
      error: "Role-normalization approval evidence could not be safely recorded."
    }, 502);
  }
}
