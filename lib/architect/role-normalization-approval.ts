import { z } from "zod";

export const ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS = {
  approved: "APPROVE ROLE NORMALIZATION PLAN",
  rejected: "REJECT ROLE NORMALIZATION PLAN"
} as const;

export type RoleNormalizationApprovalDecision =
  keyof typeof ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS;

const aggregateCountsSchema = z.record(z.number().int().nonnegative());

const approvalPacketSchema = z.object({
  schemaVersion: z.literal(1),
  package: z.literal("PR26_ROLE_NORMALIZATION_DRY_RUN"),
  planVersion: z.literal("role-normalization-v1"),
  generatedFor: z.literal("approval_review"),
  approvalRequired: z.literal(true),
  executionEnabled: z.literal(false),
  rawMutationExecuted: z.literal(false),
  publicOutputRedacted: z.literal(true),
  rowsIncluded: z.literal(false),
  profileContentExposed: z.literal(false),
  relationshipMutationAttempted: z.literal(false),
  totalProfilesInspected: z.number().int().nonnegative(),
  totalAffectedCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  manualReviewCount: z.number().int().nonnegative(),
  noOpCount: z.number().int().nonnegative(),
  affectedCount: z.number().int().nonnegative(),
  currentRoleCounts: aggregateCountsSchema,
  proposedRoleCounts: aggregateCountsSchema,
  decisionCounts: aggregateCountsSchema,
  canonicalOutputOnly: z.literal(true),
  rollbackPacketPresent: z.literal(true),
  checkCount: z.literal(10),
  passedCount: z.literal(10),
  certifiable: z.literal(true)
});

export const roleNormalizationApprovalStatusSchema = z.object({
  schemaVersion: z.literal(1),
  package: z.literal("PR27_PRODUCTION_ROLE_NORMALIZATION_APPROVAL_EVIDENCE"),
  planVersion: z.literal("role-normalization-v1"),
  approvalState: z.enum(["pending", "approved", "rejected"]),
  approvalEvidencePresent: z.boolean(),
  evidenceCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  latestDecision: z.enum(["approved", "rejected"]).nullable(),
  latestProductionCommitSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  latestRecordedAt: z.string().nullable(),
  approvalRequired: z.literal(true),
  executionEnabled: z.literal(false),
  roleMutationExecuted: z.literal(false),
  actorContentExposed: z.literal(false),
  approvalPacket: approvalPacketSchema
});

export type RoleNormalizationApprovalStatus =
  z.infer<typeof roleNormalizationApprovalStatusSchema>;

export function parseRoleNormalizationApprovalStatus(input: unknown) {
  return roleNormalizationApprovalStatusSchema.parse(input);
}
