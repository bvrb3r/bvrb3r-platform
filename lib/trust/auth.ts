import { getCurrentUserFromServer } from "@/lib/auth/session";
import { TrustPermissionError, type TrustActor } from "@/lib/trust/engine";
import type { Role } from "@/types/domain";

export async function requireTrustActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();
  if (!allowedRoles.includes(user.role)) throw new TrustPermissionError("You do not have access to this trust action.");
  return { role: user.role, barberId: user.barberId, clientId: user.clientId, locationIds: user.locationIds, userEmail: user.email } satisfies TrustActor;
}
