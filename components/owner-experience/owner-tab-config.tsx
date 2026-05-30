import type { Route } from "next";
import {
  CalendarDays,
  Home,
  MessageSquareText,
  Settings2,
  WalletCards,
  type LucideIcon
} from "lucide-react";

export type OwnerAppTab = "home" | "schedule" | "money" | "messages" | "settings" | "team";

export const OWNER_PRIMARY_TAB_HREFS = {
  home: "/dashboard/owner",
  team: "/dashboard/owner/team",
  schedule: "/dashboard/owner/schedule",
  money: "/dashboard/owner/money",
  messages: "/dashboard/owner/messages",
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
  { key: "settings", href: OWNER_PRIMARY_TAB_HREFS.settings, activeHref: OWNER_PRIMARY_TAB_HREFS.settings, label: "Settings", icon: Settings2 }
];
