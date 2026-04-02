import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { LiveActorRole, LiveOperationsViewer } from "@/lib/operations/live-state";
import type { UserAccount } from "@/types/domain";

export async function getSessionUser() {
  const session = await getCurrentUserFromServer();
  return session.user;
}

export function toLifecycleActorRole(role: UserAccount["role"]): LiveActorRole | null {
  if (role === "commission_barber" || role === "booth_rent_barber") {
    return "barber";
  }

  if (role === "owner" || role === "manager" || role === "front_desk" || role === "client") {
    return role;
  }

  return null;
}

export function toBarberViewer(user: UserAccount): LiveOperationsViewer | null {
  if (!(user.role === "commission_barber" || user.role === "booth_rent_barber")) {
    return null;
  }

  return {
    role: user.role,
    barberId: user.barberId,
    clientId: user.clientId,
    locationIds: user.locationIds,
    email: user.email
  };
}

export function toShopViewer(user: UserAccount): LiveOperationsViewer | null {
  if (!(user.role === "owner" || user.role === "manager")) {
    return null;
  }

  return {
    role: user.role,
    barberId: user.barberId,
    clientId: user.clientId,
    locationIds: user.locationIds,
    email: user.email
  };
}
