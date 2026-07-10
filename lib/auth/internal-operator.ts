import { isDemoMode } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

export const FULL_ARCHITECT_ACCESS_LEVELS = ["architect_prime", "operator"] as const;

export type InternalOperatorAccessLevel = "architect_prime" | "operator" | "viewer";
export type InternalOperatorAccessStatus = "active" | "suspended" | "revoked";

export type InternalOperatorAccessRecord = {
  access_level: InternalOperatorAccessLevel | string | null;
  status: InternalOperatorAccessStatus | string | null;
};

export function hasFullArchitectAccess(record?: InternalOperatorAccessRecord | null) {
  return Boolean(
    record?.status === "active"
    && FULL_ARCHITECT_ACCESS_LEVELS.includes(record.access_level as (typeof FULL_ARCHITECT_ACCESS_LEVELS)[number])
  );
}

export function applyInternalOperatorAccessRecord(
  user: UserAccount,
  record?: InternalOperatorAccessRecord | null
): UserAccount {
  return {
    ...user,
    platformAdmin: user.accountStatus === "active" && hasFullArchitectAccess(record)
  };
}

function isLegacyDemoArchitect(user: UserAccount) {
  return user.accountStatus === "active"
    && user.role === "platform_admin"
    && user.primaryOnboardingRole === "platform_admin";
}

function failClosed(user: UserAccount): UserAccount {
  return {
    ...user,
    platformAdmin: false
  };
}

export async function applyInternalOperatorAccessOverlay(user: UserAccount): Promise<UserAccount> {
  if (isDemoMode()) {
    return {
      ...user,
      platformAdmin: isLegacyDemoArchitect(user)
    };
  }

  if (!user.id || user.id === "guest-user") {
    return failClosed(user);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("[auth] internal operator access lookup unavailable", {
      reason: "service_role_not_configured"
    });
    return failClosed(user);
  }

  const result = await supabase
    .from("internal_operator_access")
    .select("access_level, status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (result.error) {
    console.error("[auth] internal operator access lookup failed", {
      code: result.error.code ?? "unknown"
    });
    return failClosed(user);
  }

  return applyInternalOperatorAccessRecord(
    user,
    result.data as InternalOperatorAccessRecord | null
  );
}
