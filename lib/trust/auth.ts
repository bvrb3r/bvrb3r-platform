import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isRoleAllowed, normalizeAccountRole } from "@/lib/auth/roles";
import { TrustPermissionError, type TrustActor } from "@/lib/trust/engine";
import type { Role } from "@/types/domain";

export async function requireTrustActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();
  if (!isRoleAllowed(user.role, allowedRoles)) throw new TrustPermissionError("You do not have access to this trust action.");
  return { role: normalizeAccountRole(user.role), userId: user.id, barberId: user.barberId, clientId: user.clientId, locationIds: user.locationIds, userEmail: user.email } satisfies TrustActor;
}
