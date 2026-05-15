import { isBarberAccountRole, normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { LiveActorRole, LiveOperationsViewer } from "@/lib/operations/live-state";
import type { UserAccount } from "@/types/domain";

export async function getSessionUser() {
  const session = await getCurrentUserFromServer();
  return session.user;
}

export function toLifecycleActorRole(role: UserAccount["role"]): LiveActorRole | null {
  if (isBarberAccountRole(role)) {
    return "barber";
  }

  if (role === "owner" || role === "manager" || role === "front_desk" || role === "client") {
    return role;
  }

  return null;
}

export function toBarberViewer(user: UserAccount): LiveOperationsViewer | null {
  if (!isBarberAccountRole(user.role)) {
    return null;
  }

  return {
    role: normalizeAccountRole(user.role),
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

export function toBookingViewer(user: UserAccount): LiveOperationsViewer | null {
  if (user.role === "client" && user.clientId) {
    return {
      role: "client",
      clientId: user.clientId,
      email: user.email
    };
  }

  if (isBarberAccountRole(user.role)) {
    return {
      role: normalizeAccountRole(user.role),
      barberId: user.barberId,
      locationIds: user.locationIds,
      email: user.email
    };
  }

  if (user.role === "owner" || user.role === "manager" || user.role === "front_desk") {
    return {
      role: user.role,
      locationIds: user.locationIds,
      email: user.email
    };
  }

  return null;
}
