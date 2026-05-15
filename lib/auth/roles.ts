import type { BarberSubtype, Role } from "@/types/domain";

export const LEGACY_BARBER_ACCOUNT_ROLES = ["commission_barber", "booth_rent_barber"] as const;
export const BARBER_ACCOUNT_ROLE = "barber" as const;
export const BARBER_ACCESS_ROLES = [BARBER_ACCOUNT_ROLE, ...LEGACY_BARBER_ACCOUNT_ROLES] as const;

type AnyRole = Role | (typeof LEGACY_BARBER_ACCOUNT_ROLES)[number] | string | null | undefined;
type LegacyBarberRole = (typeof LEGACY_BARBER_ACCOUNT_ROLES)[number];

export function isLegacyBarberRole(role: AnyRole): role is LegacyBarberRole {
  return role === "commission_barber" || role === "booth_rent_barber";
}

export function isBarberAccountRole(role: AnyRole) {
  return role === BARBER_ACCOUNT_ROLE || isLegacyBarberRole(role);
}

export function normalizeAccountRole(role: AnyRole): Role {
  if (isLegacyBarberRole(role)) {
    return BARBER_ACCOUNT_ROLE;
  }

  if (role === "shop_owner") {
    return "owner";
  }

  if (role === "architect") {
    return "platform_admin";
  }

  return (role as Role) ?? "client";
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

  return null;
}
