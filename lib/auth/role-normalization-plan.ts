import type { BarberSubtype, Role } from "@/types/domain";

export const ROLE_NORMALIZATION_PLAN_VERSION = "role-normalization-v1";

export const ROLE_NORMALIZATION_CANONICAL_PUBLIC_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;
export const ROLE_NORMALIZATION_BLOCKED_ROLES = ["front_desk", "manager", "platform_admin"] as const;

export type RoleNormalizationAction =
  | "no_change"
  | "normalize_account_role"
  | "manual_review";

export type RoleNormalizationStatus =
  | "eligible"
  | "blocked"
  | "no_change";

export type RoleNormalizationProfileEvidence = {
  profileId: string;
  currentRole: string | null | undefined;
  primaryOnboardingRole?: string | null;
  hasClientRecord?: boolean;
  hasBarberRecord?: boolean;
  hasOwnedShopRecord?: boolean;
  barberSubtype?: BarberSubtype | null;
};

export type RoleNormalizationDecision = {
  profileId: string;
  currentRole: string;
  targetRole: Role | null;
  action: RoleNormalizationAction;
  status: RoleNormalizationStatus;
  reason: string;
  requiresFounderApproval: boolean;
  rollbackSql: string | null;
  relationshipMetadataPreserved: boolean;
  proposedBarberSubtype: BarberSubtype | null;
};

export type RoleNormalizationSummary = {
  totalProfilesInspected: number;
  eligibleCount: number;
  blockedCount: number;
  noChangeCount: number;
  rollbackPlanPresent: boolean;
  unsupportedRoles: string[];
  ambiguousRoles: string[];
  decisions: RoleNormalizationDecision[];
};

export type RoleNormalizationApprovalDecision =
  | "eligible"
  | "blocked"
  | "manual_review"
  | "no_op";

export type RoleNormalizationApprovalPacketRow = {
  redactedProfileId: string;
  currentRole: string;
  proposedRole: Role | null;
  decision: RoleNormalizationApprovalDecision;
  reason: string;
  requiredEvidence: string[];
  safetyReason: string;
  rollbackInstructions: string;
  safeToNormalize: boolean;
};

export type RoleNormalizationApprovalPacket = {
  planVersion: string;
  generatedFor: "public_review";
  approvalRequired: true;
  rawMutationExecuted: false;
  totalProfilesInspected: number;
  totalAffectedCount: number;
  eligibleCount: number;
  blockedCount: number;
  manualReviewCount: number;
  noOpCount: number;
  rollbackPacketPresent: boolean;
  publicOutputRedacted: true;
  rows: RoleNormalizationApprovalPacketRow[];
};

function sqlString(value: string) {
  return value.replace(/'/g, "''");
}

function rollbackSql(profileId: string, currentRole: string) {
  return `update public.profiles set role = '${sqlString(currentRole)}'::public.app_role where id = '${sqlString(profileId)}';`;
}

function normalizeBlankRole(role: string | null | undefined) {
  return String(role ?? "").trim();
}

export function roleRequiresManualReview(role: string | null | undefined) {
  const value = normalizeBlankRole(role);
  return ROLE_NORMALIZATION_BLOCKED_ROLES.includes(value as (typeof ROLE_NORMALIZATION_BLOCKED_ROLES)[number]);
}

export function decideRoleNormalization(input: RoleNormalizationProfileEvidence): RoleNormalizationDecision {
  const currentRole = normalizeBlankRole(input.currentRole);
  const baseDecision = {
    profileId: input.profileId,
    currentRole,
    requiresFounderApproval: true,
    relationshipMetadataPreserved: false,
    proposedBarberSubtype: null
  };

  if (!currentRole) {
    return {
      ...baseDecision,
      targetRole: null,
      action: "manual_review",
      status: "blocked",
      reason: "Missing primary profile role cannot be normalized automatically.",
      rollbackSql: null
    };
  }

  if (ROLE_NORMALIZATION_CANONICAL_PUBLIC_ROLES.includes(currentRole as (typeof ROLE_NORMALIZATION_CANONICAL_PUBLIC_ROLES)[number])) {
    return {
      ...baseDecision,
      targetRole: currentRole as Role,
      action: "no_change",
      status: "no_change",
      reason: "Profile already uses a canonical public account role.",
      requiresFounderApproval: false,
      rollbackSql: null
    };
  }

  if (currentRole === "client") {
    if (!input.hasClientRecord) {
      return {
        ...baseDecision,
        targetRole: "client_user",
        action: "manual_review",
        status: "blocked",
        reason: "client can map to client_user only when a linked client record exists.",
        rollbackSql: null
      };
    }

    return {
      ...baseDecision,
      targetRole: "client_user",
      action: "normalize_account_role",
      status: "eligible",
      reason: "Linked client record supports client -> client_user account-role normalization.",
      rollbackSql: rollbackSql(input.profileId, currentRole)
    };
  }

  if (currentRole === "booth_rent_barber" || currentRole === "commission_barber") {
    if (!input.hasBarberRecord) {
      return {
        ...baseDecision,
        targetRole: "barber_user",
        action: "manual_review",
        status: "blocked",
        reason: `${currentRole} can map to barber_user only when a linked barber record exists.`,
        rollbackSql: null,
        relationshipMetadataPreserved: true,
        proposedBarberSubtype: currentRole === "booth_rent_barber" ? "booth_rent" : "commission"
      };
    }

    return {
      ...baseDecision,
      targetRole: "barber_user",
      action: "normalize_account_role",
      status: "eligible",
      reason: `${currentRole} is account-role drift; linked barber evidence supports barber_user while relationship metadata stays separate.`,
      rollbackSql: rollbackSql(input.profileId, currentRole),
      relationshipMetadataPreserved: true,
      proposedBarberSubtype: currentRole === "booth_rent_barber" ? "booth_rent" : "commission"
    };
  }

  if (currentRole === "owner") {
    if (!input.hasOwnedShopRecord) {
      return {
        ...baseDecision,
        targetRole: "shop_owner_user",
        action: "manual_review",
        status: "blocked",
        reason: "owner can map to shop_owner_user only when owned shop evidence exists.",
        rollbackSql: null
      };
    }

    return {
      ...baseDecision,
      targetRole: "shop_owner_user",
      action: "normalize_account_role",
      status: "eligible",
      reason: "Owned shop evidence supports owner -> shop_owner_user account-role normalization.",
      rollbackSql: rollbackSql(input.profileId, currentRole)
    };
  }

  if (roleRequiresManualReview(currentRole)) {
    return {
      ...baseDecision,
      targetRole: currentRole as Role,
      action: "manual_review",
      status: "blocked",
      reason: `${currentRole} is an internal or operational role and must not be blindly converted into a public account role.`,
      rollbackSql: null
    };
  }

  if (currentRole === "platform_admin" && input.primaryOnboardingRole === "platform_admin") {
    return {
      ...baseDecision,
      targetRole: "platform_admin",
      action: "no_change",
      status: "no_change",
      reason: "Platform admin account stays internal and is excluded from public role normalization.",
      rollbackSql: null
    };
  }

  return {
    ...baseDecision,
    targetRole: null,
    action: "manual_review",
    status: "blocked",
    reason: `${currentRole} is not in the approved role normalization mapping.`,
    rollbackSql: null
  };
}

export function summarizeRoleNormalizationPlan(inputs: RoleNormalizationProfileEvidence[]): RoleNormalizationSummary {
  const decisions = inputs.map(decideRoleNormalization);
  const ambiguousRoles = [...new Set(decisions
    .filter((decision) => decision.status === "blocked")
    .map((decision) => decision.currentRole || "__NULL_OR_EMPTY__"))].sort();
  const unsupportedRoles = ambiguousRoles.filter((role) =>
    !["front_desk", "manager", "platform_admin", "client", "owner", "booth_rent_barber", "commission_barber"].includes(role)
  );

  return {
    totalProfilesInspected: decisions.length,
    eligibleCount: decisions.filter((decision) => decision.status === "eligible").length,
    blockedCount: decisions.filter((decision) => decision.status === "blocked").length,
    noChangeCount: decisions.filter((decision) => decision.status === "no_change").length,
    rollbackPlanPresent: decisions.filter((decision) => decision.status === "eligible").every((decision) => Boolean(decision.rollbackSql)),
    unsupportedRoles,
    ambiguousRoles,
    decisions
  };
}

function redactedProfileId(profileId: string) {
  let hash = 5381;
  for (const character of profileId) {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  }
  return `profile_redacted_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function approvalDecisionFor(decision: RoleNormalizationDecision): RoleNormalizationApprovalDecision {
  if (decision.status === "eligible") return "eligible";
  if (decision.status === "no_change") return "no_op";
  return roleRequiresManualReview(decision.currentRole) ? "manual_review" : "blocked";
}

function requiredEvidenceFor(decision: RoleNormalizationDecision) {
  if (decision.currentRole === "client") return ["clients.profile_id link"];
  if (decision.currentRole === "booth_rent_barber" || decision.currentRole === "commission_barber") {
    return ["barbers.profile_id link", "relationship metadata preserved outside profiles.role"];
  }
  if (decision.currentRole === "owner") return ["shops.owner_profile_id link"];
  if (roleRequiresManualReview(decision.currentRole)) return ["founder manual approval", "internal/operational role model confirmation"];
  if (!decision.currentRole) return ["non-empty profile role"];
  return ["approved mapping doctrine"];
}

function rollbackInstructionsFor(decision: RoleNormalizationDecision) {
  if (decision.status !== "eligible") {
    return "No role update is proposed for this row; rollback is not needed unless a later approved migration changes it.";
  }

  return "Before approved execution, snapshot profile_id and old_role. Roll back by restoring profiles.role from the approved backup snapshot for this redacted row.";
}

function safetyReasonFor(decision: RoleNormalizationDecision) {
  if (decision.status === "eligible") {
    return "Eligible only for a future founder-approved migration; this packet does not execute role mutation.";
  }
  if (decision.status === "no_change") {
    return "Already canonical; no role mutation proposed.";
  }
  if (roleRequiresManualReview(decision.currentRole)) {
    return "Internal or operational role must not be converted into a public account role without explicit approval.";
  }
  return "Required linkage or mapping evidence is missing; row remains blocked.";
}

export function buildRoleNormalizationApprovalPacket(inputs: RoleNormalizationProfileEvidence[]): RoleNormalizationApprovalPacket {
  const summary = summarizeRoleNormalizationPlan(inputs);
  const rows = summary.decisions.map((decision) => {
    const packetDecision = approvalDecisionFor(decision);

    return {
      redactedProfileId: redactedProfileId(decision.profileId),
      currentRole: decision.currentRole || "__NULL_OR_EMPTY__",
      proposedRole: decision.targetRole,
      decision: packetDecision,
      reason: decision.reason,
      requiredEvidence: requiredEvidenceFor(decision),
      safetyReason: safetyReasonFor(decision),
      rollbackInstructions: rollbackInstructionsFor(decision),
      safeToNormalize: packetDecision === "eligible" && Boolean(decision.rollbackSql)
    };
  });
  const manualReviewCount = rows.filter((row) => row.decision === "manual_review").length;
  const blockedCount = rows.filter((row) => row.decision === "blocked").length;
  const noOpCount = rows.filter((row) => row.decision === "no_op").length;
  const eligibleCount = rows.filter((row) => row.decision === "eligible").length;

  return {
    planVersion: ROLE_NORMALIZATION_PLAN_VERSION,
    generatedFor: "public_review",
    approvalRequired: true,
    rawMutationExecuted: false,
    totalProfilesInspected: summary.totalProfilesInspected,
    totalAffectedCount: eligibleCount + blockedCount + manualReviewCount,
    eligibleCount,
    blockedCount,
    manualReviewCount,
    noOpCount,
    rollbackPacketPresent: rows.filter((row) => row.decision === "eligible").every((row) => row.rollbackInstructions.length > 0),
    publicOutputRedacted: true,
    rows
  };
}
