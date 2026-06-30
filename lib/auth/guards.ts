import { redirect } from "next/navigation";
import { getDefaultRouteForUser, isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isRoleAllowed } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { Role, UserAccount } from "@/types/domain";

type ArchitectAccessUser = Pick<UserAccount, "accountStatus" | "appMetadata" | "primaryOnboardingRole" | "role"> | null | undefined;

function isAuthenticatedSession(
  session: Awaited<ReturnType<typeof getCurrentUserFromServer>>
) {
  if (typeof session.authenticated === "boolean") {
    return session.authenticated;
  }

  return Boolean(session.user && session.user.id !== "guest-user");
}

function redirectIfAccessDisabled(accountStatus?: string) {
  if (accountStatus === "profile_only") {
    redirect("/post-auth");
  }

  if (accountStatus && accountStatus !== "active") {
    redirect("/login?account=disabled");
  }
}

export function hasArchitectAccess(user?: ArchitectAccessUser) {
  if (user?.appMetadata?.bvrb3r_access === "architect" && user.accountStatus === "active") {
    return true;
  }

  // TEMPORARY MISSION CONTROL BRIDGE:
  // legacy platform_admin arm prevents Architect lockout until the real Supabase Auth app_metadata.bvrb3r_access='architect' claim is seeded and verified in preview/production JWT. Future PR removes this bridge after seeding proof. PR-B RLS must use only auth.jwt()->'app_metadata'->>'bvrb3r_access'.
  return isPlatformAdminUser(user);
}

export async function getAuthorizedUser(allowedRoles: Role[]) {
  const session = await getCurrentUserFromServer();
  const { user } = session;
  if (!isAuthenticatedSession(session)) {
    redirect("/login");
  }
  redirectIfAccessDisabled(user.accountStatus);

  if (!isRoleAllowed(user.role, allowedRoles)) {
    redirect(getDefaultRouteForUser(user));
  }

  return user;
}

export async function getPlatformAdminUser() {
  const session = await getCurrentUserFromServer();
  const { user } = session;
  if (!isAuthenticatedSession(session)) {
    redirect("/login");
  }
  redirectIfAccessDisabled(user.accountStatus);

  if (!hasArchitectAccess(user)) {
    redirect(getDefaultRouteForUser(user));
  }

  return user;
}
