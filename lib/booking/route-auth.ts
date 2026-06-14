import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
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

  if (isShopOwnerRole(role)) {
    return "owner";
  }

  if (isClientRole(role)) {
    return "client";
  }

  if (role === "manager" || role === "front_desk") {
    return role;
  }

  return null;
}

export function toBarberViewer(user: UserAccount): LiveOperationsViewer | null {
  if (!isBarberAccountRole(user.role)) {
    return null;
  }

  return {
    role: "barber",
    barberId: user.barberId,
    clientId: user.clientId,
    locationIds: user.locationIds,
    email: user.email
  };
}

function getShopScopedLocationIds(user: UserAccount) {
  return Array.from(new Set([user.ownedShopId, ...user.locationIds].filter((value): value is string => Boolean(value))));
}

export function toShopViewer(user: UserAccount): LiveOperationsViewer | null {
  if (!(isShopOwnerRole(user.role) || user.role === "manager")) {
    return null;
  }

  return {
    role: isShopOwnerRole(user.role) ? "owner" : user.role,
    barberId: user.barberId,
    clientId: user.clientId,
    locationIds: isShopOwnerRole(user.role) ? getShopScopedLocationIds(user) : user.locationIds,
    email: user.email
  };
}

export function toBookingViewer(user: UserAccount): LiveOperationsViewer | null {
  if (isClientRole(user.role) && user.clientId) {
    return {
      role: "client",
      clientId: user.clientId,
      email: user.email
    };
  }

  if (isBarberAccountRole(user.role)) {
    return {
      role: "barber",
      barberId: user.barberId,
      locationIds: user.locationIds,
      email: user.email
    };
  }

  if (isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk") {
    return {
      role: isShopOwnerRole(user.role) ? "owner" : user.role,
      locationIds: isShopOwnerRole(user.role) ? getShopScopedLocationIds(user) : user.locationIds,
      email: user.email
    };
  }

  return null;
}
