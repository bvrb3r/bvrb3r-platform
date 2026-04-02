import { runtimeConfig } from "@/lib/config/runtime";
import type { Role } from "@/types/domain";
import type { MobileActivationLink } from "@/types/mobile";

const ROLE_HOME_ROUTE: Record<Role, string> = {
  platform_admin: "/architect",
  owner: "/dashboard/owner",
  manager: "/dashboard/manager",
  front_desk: "/dashboard/front-desk",
  commission_barber: "/dashboard/barber",
  booth_rent_barber: "/dashboard/barber",
  client: "/dashboard/client"
};

const SAFE_ROUTE_PREFIXES = [
  "/discover",
  "/leaderboards",
  "/booking/new",
  "/barber/",
  "/referrals",
  "/services",
  "/dashboard/owner",
  "/dashboard/manager",
  "/dashboard/front-desk",
  "/dashboard/barber",
  "/dashboard/client"
] as const;

function extractInternalRoute(candidate: string) {
  const normalizedCandidate = candidate.trim();
  if (!normalizedCandidate) {
    return "/";
  }

  try {
    if (normalizedCandidate.startsWith(`${runtimeConfig.appLinkScheme}://`) || normalizedCandidate.startsWith(`web+${runtimeConfig.appLinkScheme}://`)) {
      const url = new URL(normalizedCandidate);
      const href = url.searchParams.get("href");
      return href ? decodeURIComponent(href) : "/";
    }

    if (/^https?:\/\//i.test(normalizedCandidate)) {
      const url = new URL(normalizedCandidate);
      const appOrigin = new URL(runtimeConfig.appUrl).origin;
      if (url.origin !== appOrigin) {
        return "/";
      }
      return `${url.pathname}${url.search}`;
    }
  } catch {
    return "/";
  }

  return normalizedCandidate.startsWith("/") ? normalizedCandidate : `/${normalizedCandidate}`;
}

export function isSafeAppRoute(route: string) {
  const normalized = route || "/";
  if (normalized === "/") {
    return true;
  }

  return SAFE_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

export function normalizeAppRoute(route: string, fallback = "/") {
  const extracted = extractInternalRoute(route).replace(/#.*$/, "");
  return isSafeAppRoute(extracted) ? extracted : fallback;
}

function createUrl(route: string) {
  return new URL(normalizeAppRoute(route), runtimeConfig.appUrl).toString();
}

export function buildDeepLinkUrl(route: string) {
  const normalized = normalizeAppRoute(route);
  return `${runtimeConfig.appLinkScheme}://open?href=${encodeURIComponent(normalized)}`;
}

export function buildWebProtocolUrl(route: string) {
  const normalized = normalizeAppRoute(route);
  return `web+${runtimeConfig.appLinkScheme}://open?href=${encodeURIComponent(normalized)}`;
}

export function buildUniversalLinkUrl(route: string) {
  return createUrl(route);
}

export function buildMobileActivationLink(route: string, label: string): MobileActivationLink {
  const normalized = normalizeAppRoute(route);
  return {
    label,
    route: normalized,
    webUrl: createUrl(normalized),
    appUrl: buildDeepLinkUrl(normalized),
    webProtocolUrl: buildWebProtocolUrl(normalized),
    universalUrl: buildUniversalLinkUrl(normalized)
  };
}

export function buildRoleHomeLink(role: Role) {
  return buildMobileActivationLink(ROLE_HOME_ROUTE[role], `${role.replaceAll("_", " ")} home`);
}

export function buildDefaultDeepLinks(role: Role) {
  const base = [
    buildMobileActivationLink("/discover", "Discover barbers"),
    buildMobileActivationLink("/booking/new", "Book now"),
    buildRoleHomeLink(role)
  ];

  if (role === "client") {
    return [...base, buildMobileActivationLink("/referrals", "Open referrals")];
  }

  if (role === "owner") {
    return [...base, buildMobileActivationLink("/leaderboards", "Marketplace leaderboards")];
  }

  if (role === "commission_barber" || role === "booth_rent_barber") {
    return [...base, buildMobileActivationLink("/barber/wave", "Public barber profile")];
  }

  return base;
}

export function buildDeepLinkPayload(route: string, label: string) {
  const link = buildMobileActivationLink(route, label);
  return {
    route: link.route,
    label: link.label,
    webUrl: link.webUrl,
    appUrl: link.appUrl,
    webProtocolUrl: link.webProtocolUrl ?? buildWebProtocolUrl(link.route),
    universalUrl: link.universalUrl ?? buildUniversalLinkUrl(link.route)
  };
}
