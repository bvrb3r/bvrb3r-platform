import type { Route } from "next";
import {
  CalendarDays,
  Home,
  Search,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type ClientAppTab = "home" | "search" | "activity" | "profile";
export type ClientAppMode = "client" | "guest";

export const CLIENT_PRIMARY_TAB_HREFS = {
  home: "/dashboard/client",
  search: "/dashboard/client/search",
  activity: "/dashboard/client/activity",
  profile: "/dashboard/client/profile"
} as const satisfies Record<ClientAppTab, Route>;

export const CLIENT_PRIMARY_NAV_ITEMS: Array<{
  key: ClientAppTab;
  href: Route;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "home", href: CLIENT_PRIMARY_TAB_HREFS.home, label: "Home", icon: Home },
  { key: "search", href: CLIENT_PRIMARY_TAB_HREFS.search, label: "Search", icon: Search },
  { key: "activity", href: CLIENT_PRIMARY_TAB_HREFS.activity, label: "Activity", icon: CalendarDays },
  { key: "profile", href: CLIENT_PRIMARY_TAB_HREFS.profile, label: "Profile", icon: UserRound }
];

export const GUEST_CLIENT_NAV_ITEMS: Array<{
  key: ClientAppTab;
  href: Route;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "search", href: "/discover?entry=guest" as Route, label: "Explore", icon: Search },
  { key: "home", href: "/" as Route, label: "Account", icon: UserRound },
  { key: "activity", href: "/booking/new?source=guest_discovery" as Route, label: "Book", icon: CalendarDays }
];
