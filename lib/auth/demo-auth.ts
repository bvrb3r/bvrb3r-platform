import type { Route } from "next";
import { demoUsers } from "@/lib/data/demo";
import { isDemoMode, runtimeConfig } from "@/lib/config/runtime";
import { getCanonicalAccountRole, isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Role, UserAccount } from "@/types/domain";

export const DEMO_SESSION_COOKIE = "bvrb3r-demo-email";
export const DEFAULT_DEMO_EMAIL = "owner@bvrb3r.demo";
export const CANONICAL_PLATFORM_ADMIN_EMAIL = "bvrb3r@icloud.com";

const demoEmailAliases = new Map<string, string>([
  ["lux@bvrb3r.demop", "lux@bvrb3r.demo"],
  ["luxe@bvrb3r.demo", "lux@bvrb3r.demo"],
  ["wave@bvrb3r,demo", "wave@bvrb3r.demo"],
  ["manger@bvrb3r.demo", "manager@bvrb3r.demo"]
]);

const demoLauncherOrder = [
  "client@bvrb3r.demo",
  "lux@bvrb3r.demo",
  "blaze@bvrb3r.demo",
  "fade@bvrb3r.demo",
  "wave@bvrb3r.demo",
  "frontdesk@bvrb3r.demo",
  "manager@bvrb3r.demo",
  "owner@bvrb3r.demo"
] as const;

const demoLauncherCopy: Record<string, { dashboardLabel: string; description: string }> = {
  "client@bvrb3r.demo": {
    dashboardLabel: "Client dashboard",
    description: "Book, rebook, manage favorites, and stay on top of your appointments."
  },
  "lux@bvrb3r.demo": {
    dashboardLabel: "Freelance barber dashboard",
    description: "Launch the independent barber workspace with your own chair, clients, and earnings."
  },
  "blaze@bvrb3r.demo": {
    dashboardLabel: "Booth-rent barber dashboard",
    description: "Open Blaze's booth-rent chair flow with independent bookings and revenue visibility."
  },
  "fade@bvrb3r.demo": {
    dashboardLabel: "Freelance barber dashboard",
    description: "Open Fade's freelance barber workspace with shop-aligned service flow and payout visibility."
  },
  "wave@bvrb3r.demo": {
    dashboardLabel: "Barber-manager dashboard",
    description: "Open the barber-manager oversight lane with shop command visibility and chair context."
  },
  "frontdesk@bvrb3r.demo": {
    dashboardLabel: "Front desk / kiosk operations",
    description: "Launch check-in, queue, and guest handoff operations from the front desk board."
  },
  "manager@bvrb3r.demo": {
    dashboardLabel: "Shop manager dashboard",
    description: "Open manager scope for schedule, team, queue, and location operations."
  },
  "owner@bvrb3r.demo": {
    dashboardLabel: "Shop owner dashboard",
    description: "Launch the owner control center for reports, performance, and system oversight."
  }
};

export interface DemoLauncherAccount {
  user: UserAccount;
  dashboardLabel: string;
  roleLabel: string;
  description: string;
  redirectTo: Route;
}

function normalizeDemoEmail(email?: string) {
  if (!email) {
    return undefined;
  }

  const trimmed = email.trim().replace(/^"|"$/g, "");
  const decoded = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const normalized = decoded.toLowerCase();

  return demoEmailAliases.get(normalized) ?? normalized;
}

export function findDemoUserByEmail(email?: string) {
  const normalizedEmail = normalizeDemoEmail(email);
  return demoUsers.find((user) => user.email === normalizedEmail);
}

export function findDemoUserByRole(role?: Role) {
  return demoUsers.find((user) => getCanonicalAccountRole(user.role) === getCanonicalAccountRole(role));
}

export function isPlatformAdminUser(
  user?: Pick<UserAccount, "role" | "primaryOnboardingRole" | "accountStatus" | "platformAdmin"> & { email?: string | null } | null
) {
  if (!user || user.accountStatus !== "active") {
    return false;
  }

  if (user.platformAdmin === true) {
    return true;
  }

  if (user.platformAdmin === false || !isDemoMode()) {
    return false;
  }

  return user.role === "platform_admin"
    && user.primaryOnboardingRole === "platform_admin";
}

export function resolveDemoUser(selectedEmail?: string, fallbackEmail = DEFAULT_DEMO_EMAIL) {
  return findDemoUserByEmail(selectedEmail) ?? findDemoUserByEmail(fallbackEmail) ?? demoUsers[0];
}

export function getDemoUser(email?: string) {
  return resolveDemoUser(email, DEFAULT_DEMO_EMAIL);
}

export function getRoleLabel(role: Role) {
  switch (getCanonicalAccountRole(role)) {
    case "platform_admin":
      return "Platform admin";
    case "shop_owner_user":
      return "Shop owner";
    case "manager":
      return "Shop manager";
    case "front_desk":
      return "Front desk";
    case "barber_user":
      return "Barber";
    case "client_user":
      return "Client";
    default:
      return "User";
  }
}

export function getUserRoleLabel(user: UserAccount) {
  if (isPlatformAdminUser(user)) {
    return "Platform admin";
  }

  if (user.role === "manager" && user.barberId) {
    return "Barber manager";
  }

  if (user.barberSubtype === "freelance" || user.email === "lux@bvrb3r.demo") {
    return "Freelance barber";
  }
  if (user.barberSubtype === "booth_rent") {
    return "Full Booth Rent barber";
  }
  if (user.barberSubtype === "autobooth_rent") {
    return "AutoBooth Rent barber";
  }

  return getRoleLabel(user.role);
}

export function getDefaultRouteForUser(user: UserAccount): Route {
  if (user.accountStatus === "profile_only") {
    return "/post-auth";
  }

  if (isPlatformAdminUser(user)) {
    return "/architect";
  }

  const canonicalRole = getCanonicalAccountRole(user.role);
  switch (canonicalRole) {
    case "platform_admin":
      return "/post-auth";
    case "shop_owner_user":
      return "/dashboard/owner";
    case "manager":
      return "/dashboard/manager";
    case "front_desk":
      return "/dashboard/front-desk";
    case "barber_user":
      return "/dashboard/barber";
    case "client_user":
      return "/dashboard/client";
    default:
      if (isBarberAccountRole(user.role)) {
        return "/dashboard/barber";
      }
      if (isShopOwnerRole(user.role)) {
        return "/dashboard/owner";
      }
      if (isClientRole(user.role)) {
        return "/dashboard/client";
      }
      return "/";
  }
}

export function getDemoLauncherAccounts(): DemoLauncherAccount[] {
  return demoLauncherOrder
    .map((email) => {
      const user = findDemoUserByEmail(email);
      if (!user) {
        return null;
      }

      const copy = demoLauncherCopy[email];
      return {
        user,
        dashboardLabel: copy.dashboardLabel,
        roleLabel: getUserRoleLabel(user),
        description: copy.description,
        redirectTo: getDefaultRouteForUser(user)
      } satisfies DemoLauncherAccount;
    })
    .filter((account): account is DemoLauncherAccount => Boolean(account));
}

export function getLocalRuntimeUser() {
  return resolveDemoUser(undefined, runtimeConfig.demoEmail);
}

export async function signInWithSupabase(email: string, password: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    return { error: "Supabase is not configured. Falling back to demo mode." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message };
}
