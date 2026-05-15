import type { BarberSubtype, Role } from "@/types/domain";

export const CLIENT_ACCOUNT_ROLE = "client_user" as const;
export const BARBER_ACCOUNT_ROLE = "barber_user" as const;
export const SHOP_OWNER_ACCOUNT_ROLE = "shop_owner_user" as const;
export const MASTER_TRUTH_ACCOUNT_ROLES = [CLIENT_ACCOUNT_ROLE, BARBER_ACCOUNT_ROLE, SHOP_OWNER_ACCOUNT_ROLE] as const;

export const LEGACY_CLIENT_ACCOUNT_ROLES = ["client"] as const;
export const LEGACY_SHOP_OWNER_ACCOUNT_ROLES = ["owner", "shop_owner"] as const;
export const LEGACY_BARBER_ACCOUNT_ROLES = ["barber", "commission_barber", "booth_rent_barber", "freelance_barber"] as const;
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
    || role === "commission_barber"
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

export function normalizeBarberSubtype(value: string | null | undefined): BarberSubtype {
  if (value === "commission") {
    return "commission";
  }

  if (value === "booth_rent" || value === "blueprint") {
    return "booth_rent";
  }

  return "freelance";
}

export function subtypeFromLegacyBarberRole(role: AnyRole): BarberSubtype | null {
  if (role === "commission_barber") {
    return "commission";
  }

  if (role === "booth_rent_barber") {
    return "booth_rent";
  }

  if (role === "freelance_barber" || role === "barber") {
    return "freelance";
  }

  return null;
}
