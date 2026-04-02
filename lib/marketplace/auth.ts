import { getCurrentUserFromServer } from "@/lib/auth/session";
import { MarketplaceActor, MarketplacePermissionError } from "@/lib/marketplace/engine";
import type { Role } from "@/types/domain";

export async function requireMarketplaceActor(allowedRoles: Role[]) {
  const { user } = await getCurrentUserFromServer();

  if (!allowedRoles.includes(user.role)) {
    throw new MarketplacePermissionError("You do not have access to this marketplace action.");
  }

  return {
    role: user.role,
    barberId: user.barberId,
    locationIds: user.locationIds,
    email: user.email
  } satisfies MarketplaceActor;
}