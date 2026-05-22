import type { Route } from "next";
import {
  CalendarDays,
  Home,
  Images,
  MessageSquareText,
  Search,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type ClientAppTab = "home" | "search" | "culture" | "activity" | "messages" | "profile";
export type ClientAppMode = "client" | "guest";

export const CLIENT_PRIMARY_TAB_HREFS = {
  home: "/dashboard/client",
  search: "/dashboard/client/search",
  culture: "/dashboard/client/culture",
  activity: "/dashboard/client/activity",
  messages: "/dashboard/client/messages",
  profile: "/dashboard/client/profile"
} as const satisfies Record<ClientAppTab, Route>;

export const CLIENT_PRIMARY_NAV_ITEMS: Array<{
  key: ClientAppTab;
  href: Route;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}> = [
  { key: "home", href: CLIENT_PRIMARY_TAB_HREFS.home, label: "Home", subtitle: "Book fast", icon: Home },
  { key: "search", href: CLIENT_PRIMARY_TAB_HREFS.search, label: "Search", subtitle: "Discover", icon: Search },
  { key: "culture", href: CLIENT_PRIMARY_TAB_HREFS.culture, label: "Culture", subtitle: "Feed / Community / Discover", icon: Images },
  { key: "messages", href: CLIENT_PRIMARY_TAB_HREFS.messages, label: "Messages", subtitle: "DMs & support", icon: MessageSquareText },
  { key: "profile", href: CLIENT_PRIMARY_TAB_HREFS.profile, label: "Profile", subtitle: "Account controls", icon: UserRound }
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
