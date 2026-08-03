import { redirect } from "next/navigation";
import { getDefaultRouteForUser, isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isRoleAllowed } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { recordIdentityAuditEvent } from "@/lib/auth/identity-audit";
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
    const home = getDefaultRouteForUser(user);
    await recordIdentityAuditEvent({
      actor: user,
      source: "server_route_guard",
      entityType: "protected_route",
      action: "wrong_role_access_denied",
      outcome: "denied",
      metadata: {
        allowedRoles,
        safeDestination: home
      }
    });
    redirect("/access-denied");
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
    const home = getDefaultRouteForUser(user);
    await recordIdentityAuditEvent({
      actor: user,
      source: "server_route_guard",
      entityType: "architect_route",
      action: "architect_access_denied",
      outcome: "denied",
      metadata: {
        safeDestination: home
      }
    });
    redirect("/access-denied");
  }

  return user;
}
