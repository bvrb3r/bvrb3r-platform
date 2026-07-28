import { getCanonicalAccountRole } from "@/lib/auth/roles";
import { isSignupRoleIntent, getRuntimeRoleForSignupIntent, type SignupRoleIntent } from "@/lib/auth/signup-role-intent";
import type { Role } from "@/types/domain";

/**
 * Role activation policy.
 *
 * Choosing a lane at signup is a self-service action: a person may declare that
 * they are a client, a barber, or a shop owner, and the product is built around
 * that choice. What is *not* self-service is anything that grants authority
 * over other people's data — operator and internal roles — or switching lanes
 * after activation, which would quietly re-point every relationship the first
 * lane created.
 *
 * This module is pure so the rules can be asserted directly rather than
 * inferred from a database round trip. It is the second of three layers:
 *
 *   1. `private.pr19_guard_profile_authority` in the database rejects the write
 *      outright, whatever the caller believes.
 *   2. This policy makes the same decision in the application, with a reason a
 *      UI can show and an audit record can carry.
 *   3. Column-level grants mean `authenticated` cannot even name the column.
 *
 * Nothing here reads user metadata. The caller supplies a requested lane; where
 * that request came from is the caller's problem, and the answer is the same
 * either way.
 */

/** Roles that may never be reached by a self-service activation request. */
export const NON_SELF_ASSIGNABLE_ROLES = [
  "platform_admin",
  "architect",
  "owner",
  "manager",
  "front_desk"
] as const;

export type RoleActivationDecision =
  | { allowed: true; outcome: "activated"; role: Role; intent: SignupRoleIntent }
  | { allowed: true; outcome: "already_active"; role: Role; intent: SignupRoleIntent }
  | { allowed: false; outcome: "invalid_request"; reason: string }
  | { allowed: false; outcome: "escalation_blocked"; reason: string }
  | { allowed: false; outcome: "lane_change_blocked"; reason: string; currentRole: Role };

export function isNonSelfAssignableRole(role: unknown) {
  return typeof role === "string"
    && (NON_SELF_ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/**
 * Decides what a self-service activation request may do.
 *
 * @param requestedIntent the lane the caller is asking for, from any source
 * @param currentRole     the role already on the profile, if any
 */
export function evaluateRoleActivation(
  requestedIntent: unknown,
  currentRole: string | null | undefined
): RoleActivationDecision {
  if (isNonSelfAssignableRole(requestedIntent)) {
    return {
      allowed: false,
      outcome: "escalation_blocked",
      reason: "Operator and internal roles are assigned server-side and can never be self-selected."
    };
  }

  if (!isSignupRoleIntent(requestedIntent)) {
    return {
      allowed: false,
      outcome: "invalid_request",
      reason: "Choose one of the available account types to continue."
    };
  }

  const targetRole = getRuntimeRoleForSignupIntent(requestedIntent);

  // A profile that already holds an internal or operator role is never demoted
  // or re-laned by a signup intent — that path is how an attacker would try to
  // launder an existing privileged account into a fresh lane.
  if (isNonSelfAssignableRole(currentRole)) {
    return {
      allowed: false,
      outcome: "lane_change_blocked",
      reason: "This account is managed by BVRB3R and cannot change its own access.",
      currentRole: getCanonicalAccountRole(currentRole)
    };
  }

  if (!currentRole) {
    return { allowed: true, outcome: "activated", role: targetRole, intent: requestedIntent };
  }

  const canonicalCurrent = getCanonicalAccountRole(currentRole);

  // Idempotency: re-submitting the same activation is a success, not an error.
  // A double-tapped button, a retried request, and a refreshed callback all
  // land here and must be indistinguishable from the first attempt.
  if (canonicalCurrent === targetRole) {
    return { allowed: true, outcome: "already_active", role: targetRole, intent: requestedIntent };
  }

  return {
    allowed: false,
    outcome: "lane_change_blocked",
    reason: "Your account type is already set. Contact support to change it.",
    currentRole: canonicalCurrent
  };
}

/** Convenience wrapper for callers that only need a yes/no. */
export function isRoleActivationAllowed(requestedIntent: unknown, currentRole: string | null | undefined) {
  return evaluateRoleActivation(requestedIntent, currentRole).allowed;
}
