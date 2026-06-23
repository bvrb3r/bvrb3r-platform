import type { JsonRecord } from "@/lib/architect/debug/types";

export const AUDIT_WRITE_SPINE_SAFE_CATEGORIES = [
  "finance.payment_evidence_checked",
  "finance.routing_evidence_checked",
  "finance.refund_evidence_checked",
  "compliance.verification_evidence_checked",
  "compliance.repair_audit_checked",
  "architect.evidence_card_evaluated"
] as const;

export type AuditWriteSpineSafeCategory = (typeof AUDIT_WRITE_SPINE_SAFE_CATEGORIES)[number];
export type AuditWriteSpineActorType = "system" | "platform_admin" | "officer_assistant";
export type AuditWriteSpineLane = "Finance" | "Compliance" | "Technology" | "Security";
export type AuditWriteSpineSeverity = "info" | "warning" | "critical";
export type AuditWriteSpineMutationIntent = "none" | "forbidden";

export type AuditWriteSpineEventInput = {
  category: string;
  action: string;
  actorType: AuditWriteSpineActorType;
  actorId?: string | null;
  officerLane: AuditWriteSpineLane;
  targetType: string;
  targetId: string;
  severity?: AuditWriteSpineSeverity;
  beforeState?: JsonRecord | null;
  afterState?: JsonRecord | null;
  metadata?: JsonRecord | null;
  source?: string;
  occurredAt?: string;
};

export type AuditWriteSpineEvent = {
  id: string;
  category: string;
  action: string;
  actorType: AuditWriteSpineActorType;
  actorId: string;
  officerLane: AuditWriteSpineLane;
  targetType: string;
  targetId: string;
  severity: AuditWriteSpineSeverity;
  beforeState: JsonRecord | null;
  afterState: JsonRecord | null;
  metadata: JsonRecord;
  source: string;
  occurredAt: string;
  mutationIntent: AuditWriteSpineMutationIntent;
  productionMutation: false;
  wouldPersist: false;
};

export type AuditWriteSpineValidationResult = {
  valid: boolean;
  reasons: string[];
  safeCategory: boolean;
  forbiddenMutationRequested: boolean;
  productionMutation: false;
  wouldPersist: false;
};

export type AuditWriteSpineDryRunProof = {
  event: AuditWriteSpineEvent;
  validation: AuditWriteSpineValidationResult;
  contentExposed: false;
  productionMutation: false;
  wouldPersist: false;
};

const FORBIDDEN_MUTATION_TOKENS = [
  "approve",
  "charge",
  "delete",
  "execute",
  "insert",
  "mutate",
  "payout",
  "persist",
  "refund_execute",
  "release",
  "role",
  "stripe",
  "update"
];

export function buildAuditWriteSpineEvent(input: AuditWriteSpineEventInput): AuditWriteSpineEvent {
  const occurredAt = normalizeIsoTimestamp(input.occurredAt);
  const action = input.action.trim();
  const category = input.category.trim();
  const targetType = input.targetType.trim();
  const targetId = input.targetId.trim();
  const mutationIntent = hasForbiddenMutationSignal([category, action, input.source, targetType, targetId, JSON.stringify(input.metadata ?? {})])
    ? "forbidden"
    : "none";

  return {
    id: `audit-write-spine:${category}:${targetType}:${targetId}:${occurredAt}`,
    category,
    action,
    actorType: input.actorType,
    actorId: input.actorId?.trim() || "system",
    officerLane: input.officerLane,
    targetType,
    targetId,
    severity: input.severity ?? "info",
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    metadata: input.metadata ?? {},
    source: input.source?.trim() || "architect.audit-write-spine",
    occurredAt,
    mutationIntent,
    productionMutation: false,
    wouldPersist: false
  };
}

export function validateAuditWriteSpineEvent(event: AuditWriteSpineEvent): AuditWriteSpineValidationResult {
  const reasons: string[] = [];
  const safeCategory = isSafeAuditWriteSpineCategory(event.category);
  const forbiddenMutationRequested = event.mutationIntent !== "none" || hasForbiddenMutationSignal([
    event.category,
    event.action,
    event.source,
    event.targetType,
    event.targetId,
    JSON.stringify(event.metadata)
  ]);

  if (!safeCategory) {
    reasons.push(`Unsupported audit write spine category: ${event.category}.`);
  }

  if (forbiddenMutationRequested) {
    reasons.push("Audit write spine helper rejected forbidden mutation intent.");
  }

  if (!event.actorId) {
    reasons.push("Audit write spine event requires actorId or system actor fallback.");
  }

  if (!event.targetType || !event.targetId) {
    reasons.push("Audit write spine event requires targetType and targetId.");
  }

  if (Number.isNaN(Date.parse(event.occurredAt))) {
    reasons.push("Audit write spine event requires a valid occurredAt timestamp.");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    safeCategory,
    forbiddenMutationRequested,
    productionMutation: false,
    wouldPersist: false
  };
}

export function buildAuditWriteSpineDryRunProof(input: AuditWriteSpineEventInput): AuditWriteSpineDryRunProof {
  const event = buildAuditWriteSpineEvent(input);

  return {
    event,
    validation: validateAuditWriteSpineEvent(event),
    contentExposed: false,
    productionMutation: false,
    wouldPersist: false
  };
}

export function isSafeAuditWriteSpineCategory(category: string): category is AuditWriteSpineSafeCategory {
  return AUDIT_WRITE_SPINE_SAFE_CATEGORIES.includes(category as AuditWriteSpineSafeCategory);
}

function normalizeIsoTimestamp(value?: string) {
  if (!value) return new Date(0).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function hasForbiddenMutationSignal(values: Array<string | undefined>) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return FORBIDDEN_MUTATION_TOKENS.some((token) => haystack.includes(token));
}
