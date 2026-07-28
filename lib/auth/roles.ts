import {
  RETIRED_REVENUE_SHARE_ACCOUNT_ROLE,
  isRetiredRevenueShareAccountRole
} from "@/lib/doctrine/legacy-data-aliases";
import type { BarberSubtype, CompensationModel, Role } from "@/types/domain";

export const CLIENT_ACCOUNT_ROLE = "client_user" as const;
export const BARBER_ACCOUNT_ROLE = "barber_user" as const;
export const SHOP_OWNER_ACCOUNT_ROLE = "shop_owner_user" as const;
export const MASTER_TRUTH_ACCOUNT_ROLES = [CLIENT_ACCOUNT_ROLE, BARBER_ACCOUNT_ROLE, SHOP_OWNER_ACCOUNT_ROLE] as const;

export const LEGACY_CLIENT_ACCOUNT_ROLES = ["client"] as const;
export const LEGACY_SHOP_OWNER_ACCOUNT_ROLES = ["owner", "shop_owner"] as const;
/**
 * Legacy barber account roles still present on pre-doctrine rows. The retired
 * revenue-share role is recognized only so it can be normalized away; identity
 * is never a money relationship.
 */
export const LEGACY_BARBER_ACCOUNT_ROLES = [
  "barber",
  RETIRED_REVENUE_SHARE_ACCOUNT_ROLE,
  "booth_rent_barber",
  "freelance_barber"
] as const;
export const BARBER_ACCESS_ROLES = [BARBER_ACCOUNT_ROLE, ...LEGACY_BARBER_ACCOUNT_ROLES] as const;

type AnyRole =
  | Role
  | (typeof LEGACY_CLIENT_ACCOUNT_ROLES)[number]
  | (typeof LEGACY_SHOP_OWNER_ACCOUNT_ROLES)[number]
  | (typeof LEGACY_BARBER_ACCOUNT_ROLES)[number]
  | string
  | null
  | undefined;
type LegacyBarberRole = (typeof LEGACY_BARBER_ACCOUNT_ROLES)[number];

export function isLegacyBarberRole(role: AnyRole): role is LegacyBarberRole {
  return role === "barber"
    || isRetiredRevenueShareAccountRole(role)
    || role === "booth_rent_barber"
    || role === "freelance_barber";
}

export function isClientRole(role: AnyRole) {
  return role === CLIENT_ACCOUNT_ROLE || role === "client";
}

export function isShopOwnerRole(role: AnyRole) {
  return role === SHOP_OWNER_ACCOUNT_ROLE || role === "owner" || role === "shop_owner";
}

export function isBarberAccountRole(role: AnyRole) {
  return role === BARBER_ACCOUNT_ROLE || isLegacyBarberRole(role);
}

export function getCanonicalAccountRole(role: AnyRole): Role {
  if (role === CLIENT_ACCOUNT_ROLE || role === "client") {
    return CLIENT_ACCOUNT_ROLE;
  }

  if (isLegacyBarberRole(role)) {
    return BARBER_ACCOUNT_ROLE;
  }

  if (role === SHOP_OWNER_ACCOUNT_ROLE || role === "owner" || role === "shop_owner") {
    return SHOP_OWNER_ACCOUNT_ROLE;
  }

  if (role === "architect") {
    return "platform_admin";
  }

  return (role as Role) ?? CLIENT_ACCOUNT_ROLE;
}

export function normalizeAccountRole(role: AnyRole): Role {
  return getCanonicalAccountRole(role);
}

export function roleMatchesAllowedRole(userRole: Role, allowedRole: Role) {
  if (normalizeAccountRole(userRole) === normalizeAccountRole(allowedRole)) {
    return true;
  }

  return isBarberAccountRole(userRole) && isBarberAccountRole(allowedRole);
}

export function isRoleAllowed(userRole: Role, allowedRoles: Role[]) {
  return allowedRoles.some((allowedRole) => roleMatchesAllowedRole(userRole, allowedRole));
}

/**
 * Normalizes a stored barber subtype onto the locked doctrine.
 *
 * Retired revenue-share values normalize to `freelance`, never to a rent model:
 * promoting a retired split into booth rent would invent an unowed debt. The
 * owner and barber must establish a real Full Booth Rent or AutoBooth Rent
 * agreement before the shop can collect anything.
 */
export function normalizeBarberSubtype(value: string | null | undefined): BarberSubtype {
  if (value === "autobooth_rent") {
    return "autobooth_rent";
  }

  if (value === "booth_rent" || value === "blueprint") {
    return "booth_rent";
  }

  return "freelance";
}

/**
 * Normalizes a stored compensation model onto the locked doctrine. Retired
 * revenue-share rows become `freelance` for the same fail-safe reason as
 * {@link normalizeBarberSubtype}.
 */
export function normalizeCompensationModel(value: string | null | undefined): CompensationModel {
  if (value === "autobooth_rent") {
    return "autobooth_rent";
  }

  if (value === "booth_rent" || value === "blueprint") {
    return "booth_rent";
  }

  return "freelance";
}

export function subtypeFromLegacyBarberRole(role: AnyRole): BarberSubtype | null {
  if (role === "booth_rent_barber") {
    return "booth_rent";
  }

  // The retired revenue-share role carries no rent agreement, so it falls back
  // to freelance alongside the other non-rent legacy roles.
  if (isRetiredRevenueShareAccountRole(role) || role === "freelance_barber" || role === "barber") {
    return "freelance";
  }

  return null;
}
