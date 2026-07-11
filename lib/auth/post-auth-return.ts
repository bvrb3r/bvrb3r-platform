import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";

const RETURN_PATH_PREFIXES = [
  "/dashboard/client",
  "/dashboard/barber",
  "/dashboard/owner",
  "/architect",
  "/activation-status",
  "/onboarding",
  "/post-auth",
  "/role-select",
  "/verify-contact",
  "/booking",
  "/barbers",
  "/shops"
] as const;

function matchesPrefix(path: string, prefix: string) {
  return path === prefix
    || path.startsWith(`${prefix}/`)
    || path.startsWith(`${prefix}?`)
    || path.startsWith(`${prefix}#`);
}

export function normalizeSafePostAuthReturnPath(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\r\n]/.test(raw)) {
    return null;
  }

  const parsed = new URL(raw, "https://bvrb3r.local");
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (path.startsWith("/auth/") || path === "/login" || path.startsWith("/login?")) {
    return null;
  }

  return RETURN_PATH_PREFIXES.some((prefix) => matchesPrefix(path, prefix)) ? path : null;
}

export function isPostAuthReturnPathAllowedForUser(user: UserAccount, path: string) {
  if (matchesPrefix(path, "/dashboard/client")) {
    return isClientRole(user.role);
  }

  if (matchesPrefix(path, "/dashboard/barber")) {
    return isBarberAccountRole(user.role);
  }

  if (matchesPrefix(path, "/dashboard/owner")) {
    return isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk";
  }

  if (matchesPrefix(path, "/architect")) {
    return isPlatformAdminUser(user);
  }

  // Public conversion paths are safe for every authenticated role. The
  // destination action remains server-authorized when the user continues.
  if (matchesPrefix(path, "/booking") || matchesPrefix(path, "/barbers") || matchesPrefix(path, "/shops")) {
    return true;
  }

  return true;
}

export function resolveSafePostAuthReturnPath(user: UserAccount, requestedPath: string | null | undefined) {
  const path = normalizeSafePostAuthReturnPath(requestedPath);
  if (!path || !isPostAuthReturnPathAllowedForUser(user, path)) {
    return null;
  }

  return path;
}
