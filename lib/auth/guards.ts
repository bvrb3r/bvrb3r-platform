import { redirect } from "next/navigation";
import { getDefaultRouteForUser } from "@/lib/auth/demo-auth";
import { hasArchitectAccess } from "@/lib/auth/architect-access";
import { isRoleAllowed } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { Role } from "@/types/domain";

export { getArchitectAccessDecision, hasArchitectAccess } from "@/lib/auth/architect-access";

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
