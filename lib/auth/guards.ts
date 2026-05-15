import { redirect } from "next/navigation";
import { getDefaultRouteForUser, isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isRoleAllowed } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Role } from "@/types/domain";

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

  if (!isPlatformAdminUser(user)) {
    redirect(getDefaultRouteForUser(user));
  }

  return user;
}
