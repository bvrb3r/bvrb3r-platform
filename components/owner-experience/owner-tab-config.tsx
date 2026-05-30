import type { Route } from "next";
import {
  CalendarDays,
  Ellipsis,
  Home,
  MessageSquareText,
  WalletCards,
  type LucideIcon
} from "lucide-react";

export type OwnerAppTab = "home" | "schedule" | "money" | "messages" | "more" | "settings" | "team";

export const OWNER_PRIMARY_TAB_HREFS = {
  home: "/dashboard/owner",
  team: "/dashboard/owner/team",
  schedule: "/dashboard/owner/schedule",
  money: "/dashboard/owner/money",
  messages: "/dashboard/owner/messages",
  more: "/dashboard/owner/more",
  settings: "/dashboard/owner/settings"
} as const satisfies Record<OwnerAppTab, Route>;

export const OWNER_PRIMARY_NAV_ITEMS: Array<{
  key: OwnerAppTab;
  href: Route;
  activeHref: string;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "home", href: OWNER_PRIMARY_TAB_HREFS.home, activeHref: OWNER_PRIMARY_TAB_HREFS.home, label: "Home", icon: Home },
  { key: "schedule", href: OWNER_PRIMARY_TAB_HREFS.schedule, activeHref: OWNER_PRIMARY_TAB_HREFS.schedule, label: "Schedule", icon: CalendarDays },
  { key: "money", href: OWNER_PRIMARY_TAB_HREFS.money, activeHref: OWNER_PRIMARY_TAB_HREFS.money, label: "Money", icon: WalletCards },
  { key: "messages", href: OWNER_PRIMARY_TAB_HREFS.messages, activeHref: OWNER_PRIMARY_TAB_HREFS.messages, label: "Messages", icon: MessageSquareText },
  { key: "more", href: OWNER_PRIMARY_TAB_HREFS.more, activeHref: OWNER_PRIMARY_TAB_HREFS.more, label: "More", icon: Ellipsis }
];
