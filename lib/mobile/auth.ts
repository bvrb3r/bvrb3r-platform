import { getCurrentUserFromServer } from "@/lib/auth/session";
import { MobilePermissionError, type MobileActor } from "@/lib/mobile/engine";
import type { Role } from "@/types/domain";

export async function requireMobileActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();

  if (!allowedRoles.includes(user.role)) {
    throw new MobilePermissionError("You do not have access to this mobile activation action.");
  }

  return {
    role: user.role,
    userEmail: user.email,
    clientId: user.clientId,
    barberId: user.barberId,
    locationIds: user.locationIds
  } satisfies MobileActor;
}
