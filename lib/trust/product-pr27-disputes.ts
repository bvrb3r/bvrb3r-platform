import { isDemoMode } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductPr27ServiceError } from "@/lib/trust/product-pr27-service";
import type { UserAccount } from "@/types/domain";

export type Pr27DisputeEvidenceInput = {
  evidenceType: "image" | "document" | "message" | "receipt" | "timeline_note";
  storageReference?: string;
  statement?: string;
};

function demoDispute(disputeId: string) {
  return {
    demo: true,
    dispute: {
      id: disputeId,
      disputeType: "service_quality",
      disputeStatus: "open",
      summary: "Service result did not match the disclosed request.",
      resolutionNotes: null,
      createdAt: "2026-07-29T09:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z"
    },
    timeline: [{
      id: "demo-event-1",
      actionLabel: "Dispute submitted",
      notes: "Both sides may add evidence while review is open.",
      createdAt: "2026-07-29T09:00:00.000Z"
    }],
    evidence: []
  };
}

async function requireReadableDispute(disputeId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new ProductPr27ServiceError(
      "Dispute review requires connected server truth.",
      503,
      "server_truth_unavailable"
    );
  }
  const result = await supabase
    .from("disputes")
    .select("id, dispute_type, dispute_status, summary, resolution_notes, created_at, updated_at")
    .eq("id", disputeId)
    .maybeSingle();
  if (result.error) {
    throw new ProductPr27ServiceError("Unable to load this dispute.", 500, "dispute_read_failed");
  }
  if (!result.data) {
    throw new ProductPr27ServiceError("Dispute not found.", 404, "dispute_not_found");
  }
  return { supabase, dispute: result.data };
}

export async function getPr27DisputeCase(user: UserAccount, disputeId: string) {
  if (!user.id || user.id === "guest-user") {
    throw new ProductPr27ServiceError("Authentication required.", 401, "auth_required");
  }
  if (isDemoMode()) return demoDispute(disputeId);
  const { supabase, dispute } = await requireReadableDispute(disputeId);
  const [timelineResult, evidenceResult] = await Promise.all([
    supabase
      .from("dispute_events")
      .select("id, action_label, notes, created_at")
      .eq("dispute_reference", disputeId)
      .order("created_at", { ascending: true }),
    supabase
      .from("dispute_evidence_items")
      .select("id, submitted_by_profile_id, evidence_type, storage_reference, statement, created_at")
      .eq("dispute_reference", disputeId)
      .order("created_at", { ascending: true })
  ]);
  if (timelineResult.error || evidenceResult.error) {
    throw new ProductPr27ServiceError(
      "Unable to load the dispute timeline.",
      500,
      "dispute_timeline_failed"
    );
  }
  return {
    demo: false,
    dispute: {
      id: dispute.id,
      disputeType: dispute.dispute_type,
      disputeStatus: dispute.dispute_status,
      summary: dispute.summary,
      resolutionNotes: dispute.resolution_notes,
      createdAt: dispute.created_at,
      updatedAt: dispute.updated_at
    },
    timeline: (timelineResult.data ?? []).map((event) => ({
      id: event.id,
      actionLabel: event.action_label,
      notes: event.notes,
      createdAt: event.created_at
    })),
    evidence: (evidenceResult.data ?? []).map((item) => ({
      id: item.id,
      submittedBy: item.submitted_by_profile_id === user.id ? "you" : "other_party",
      evidenceType: item.evidence_type,
      storageReference: item.storage_reference,
      statement: item.statement,
      createdAt: item.created_at
    }))
  };
}

export async function addPr27DisputeEvidence(
  user: UserAccount,
  disputeId: string,
  input: Pr27DisputeEvidenceInput
) {
  if (!user.id || user.id === "guest-user") {
    throw new ProductPr27ServiceError("Authentication required.", 401, "auth_required");
  }
  if (isDemoMode()) {
    return {
      id: `demo-evidence-${Date.now()}`,
      submittedBy: "you",
      ...input,
      createdAt: new Date().toISOString(),
      demo: true
    };
  }
  await requireReadableDispute(disputeId);
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new ProductPr27ServiceError(
      "Evidence submission requires connected server truth.",
      503,
      "server_truth_unavailable"
    );
  }
  const result = await admin
    .from("dispute_evidence_items")
    .insert({
      dispute_reference: disputeId,
      submitted_by_profile_id: user.id,
      evidence_type: input.evidenceType,
      storage_reference: input.storageReference?.trim() || null,
      statement: input.statement?.trim() || null
    })
    .select("id, evidence_type, storage_reference, statement, created_at")
    .single();
  if (result.error) {
    throw new ProductPr27ServiceError(
      "Unable to attach dispute evidence.",
      500,
      "dispute_evidence_failed"
    );
  }
  return {
    id: result.data.id,
    submittedBy: "you",
    evidenceType: result.data.evidence_type,
    storageReference: result.data.storage_reference,
    statement: result.data.statement,
    createdAt: result.data.created_at,
    demo: false
  };
}
