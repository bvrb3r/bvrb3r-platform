import type { Route } from "next";
import { demoUsers } from "@/lib/data/demo";
import { runtimeConfig } from "@/lib/config/runtime";
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
    dashboardLabel: "Commission barber dashboard",
    description: "Open the commission barber workspace with shop-aligned service flow and payout visibility."
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
  return demoUsers.find((user) => user.role === role);
}

function isCanonicalPlatformAdminEmail(email?: string | null) {
  return email?.trim().toLowerCase() === CANONICAL_PLATFORM_ADMIN_EMAIL;
}

export function isPlatformAdminUser(user?: Pick<UserAccount, "role" | "primaryOnboardingRole"> & { email?: string | null } | null) {
  return Boolean(
    user?.role === "platform_admin"
    && user.primaryOnboardingRole === "platform_admin"
    && isCanonicalPlatformAdminEmail(user.email)
  );
}

export function resolveDemoUser(selectedEmail?: string, fallbackEmail = DEFAULT_DEMO_EMAIL) {
  return findDemoUserByEmail(selectedEmail) ?? findDemoUserByEmail(fallbackEmail) ?? demoUsers[0];
}

export function getDemoUser(email?: string) {
  return resolveDemoUser(email, DEFAULT_DEMO_EMAIL);
}

export function getRoleLabel(role: Role) {
  switch (role) {
    case "platform_admin":
      return "Platform admin";
    case "owner":
      return "Shop owner";
    case "manager":
      return "Shop manager";
    case "front_desk":
      return "Front desk";
    case "commission_barber":
      return "Commission barber";
    case "booth_rent_barber":
      return "Booth-rent barber";
    case "client":
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

  if (user.email === "lux@bvrb3r.demo") {
    return "Freelance barber";
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

  switch (user.role) {
    case "platform_admin":
      return "/post-auth";
    case "owner":
      return "/dashboard/owner";
    case "manager":
      return "/dashboard/manager";
    case "front_desk":
      return "/dashboard/front-desk";
    case "commission_barber":
    case "booth_rent_barber":
      return "/dashboard/barber";
    case "client":
      return "/dashboard/client";
    default:
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
