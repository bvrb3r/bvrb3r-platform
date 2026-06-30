import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import type { UserAccount } from "@/types/domain";

export type ArchitectAccessUser = Pick<UserAccount, "accountStatus" | "appMetadata" | "primaryOnboardingRole" | "role"> | null | undefined;

export type ArchitectAccessDecisionSource = "app_metadata" | "legacy_bridge" | "none";

export type ArchitectAccessDecisionReason =
  | "missing_user"
  | "inactive_account"
  | "architect_app_metadata"
  | "legacy_bridge"
  | "missing_architect_access";

export type ArchitectAccessDecision = {
  allowed: boolean;
  source: ArchitectAccessDecisionSource;
  reason: ArchitectAccessDecisionReason;
};

export function getArchitectAccessDecision(user?: ArchitectAccessUser): ArchitectAccessDecision {
  if (!user) {
    return {
      allowed: false,
      source: "none",
      reason: "missing_user"
    };
  }

  if (user.accountStatus !== "active") {
    return {
      allowed: false,
      source: "none",
      reason: "inactive_account"
    };
  }

  if (user.appMetadata?.bvrb3r_access === "architect") {
    return {
      allowed: true,
      source: "app_metadata",
      reason: "architect_app_metadata"
    };
  }

  // TEMPORARY MISSION CONTROL BRIDGE:
  // legacy platform_admin arm prevents Architect lockout until the real Supabase Auth app_metadata.bvrb3r_access='architect' claim is seeded and verified in preview/production JWT. Future PR removes this bridge after seeding proof. PR-B RLS must use only auth.jwt()->'app_metadata'->>'bvrb3r_access'.
  if (isPlatformAdminUser(user)) {
    return {
      allowed: true,
      source: "legacy_bridge",
      reason: "legacy_bridge"
    };
  }

  return {
    allowed: false,
    source: "none",
    reason: "missing_architect_access"
  };
}

export function hasArchitectAccess(user?: ArchitectAccessUser) {
  return getArchitectAccessDecision(user).allowed;
}
