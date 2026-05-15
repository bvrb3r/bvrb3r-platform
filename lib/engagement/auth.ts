import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isRoleAllowed, normalizeAccountRole } from "@/lib/auth/roles";
import { EngagementPermissionError, type EngagementActor } from "@/lib/engagement/engine";
import type { Role } from "@/types/domain";

export async function requireEngagementActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();

  if (!isRoleAllowed(user.role, allowedRoles)) {
    throw new EngagementPermissionError("You do not have access to this engagement action.");
  }

  return {
    role: normalizeAccountRole(user.role),
    barberId: user.barberId,
    clientId: user.clientId,
    locationIds: user.locationIds,
    userEmail: user.email
  } satisfies EngagementActor;
}
