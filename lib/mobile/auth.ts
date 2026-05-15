import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isRoleAllowed, normalizeAccountRole } from "@/lib/auth/roles";
import { MobilePermissionError, type MobileActor } from "@/lib/mobile/engine";
import type { Role } from "@/types/domain";

export async function requireMobileActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();

  if (!isRoleAllowed(user.role, allowedRoles)) {
    throw new MobilePermissionError("You do not have access to this mobile activation action.");
  }

  return {
    role: normalizeAccountRole(user.role),
    userEmail: user.email,
    clientId: user.clientId,
    barberId: user.barberId,
    locationIds: user.locationIds
  } satisfies MobileActor;
}
