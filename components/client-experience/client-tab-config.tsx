import type { Route } from "next";
import {
  CircleUserRound,
  Ellipsis,
  Home,
  MessageSquareText,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type ClientAppTab = "home" | "search" | "culture" | "messages" | "more" | "activity" | "profile";
export type ClientAppMode = "client" | "guest";

export const CLIENT_PRIMARY_TAB_HREFS = {
  home: "/dashboard/client",
  search: "/dashboard/client/search",
  culture: "/dashboard/client/culture",
  messages: "/dashboard/client/messages",
  more: "/dashboard/client/more",
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
  { key: "culture", href: CLIENT_PRIMARY_TAB_HREFS.culture, label: "Culture", icon: Sparkles },
  { key: "messages", href: CLIENT_PRIMARY_TAB_HREFS.messages, label: "Messages", icon: MessageSquareText },
  { key: "more", href: CLIENT_PRIMARY_TAB_HREFS.more, label: "More", icon: Ellipsis }
];

export const GUEST_CLIENT_NAV_ITEMS: Array<{
  key: ClientAppTab;
  href: Route;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "search", href: "/discover?entry=guest" as Route, label: "Explore", icon: Search },
  { key: "home", href: "/" as Route, label: "Account", icon: UserRound },
  { key: "profile", href: "/booking/new?source=guest_discovery" as Route, label: "Book", icon: CircleUserRound }
];
