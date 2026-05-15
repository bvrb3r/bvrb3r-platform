import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isRoleAllowed, normalizeAccountRole } from "@/lib/auth/roles";
import { MarketplaceActor, MarketplacePermissionError } from "@/lib/marketplace/engine";
import type { Role } from "@/types/domain";

export async function requireMarketplaceActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();

  if (!isRoleAllowed(user.role, allowedRoles)) {
    throw new MarketplacePermissionError("You do not have access to this marketplace action.");
  }

  return {
    role: normalizeAccountRole(user.role),
    barberSubtype: user.barberSubtype,
    barberId: user.barberId,
    locationIds: user.locationIds,
    email: user.email
  } satisfies MarketplaceActor;
}
