import type { Route } from "next";
import {
  CalendarDays,
  CircleDollarSign,
  Ellipsis,
  MessageSquareText,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type BarberAppTab = "calendar" | "checkout" | "profile" | "messages" | "more";

export const BARBER_PRIMARY_TAB_HREFS = {
  calendar: "/dashboard/barber",
  checkout: "/dashboard/barber/checkout",
  profile: "/dashboard/barber/profile",
  messages: "/dashboard/barber/messages",
  more: "/dashboard/barber/more"
} as const satisfies Record<BarberAppTab, Route>;

export const BARBER_PRIMARY_NAV_ITEMS: Array<{
  key: BarberAppTab;
  href: Route;
  activeHref: string;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "calendar", href: BARBER_PRIMARY_TAB_HREFS.calendar, activeHref: BARBER_PRIMARY_TAB_HREFS.calendar, label: "Calendar", icon: CalendarDays },
  { key: "checkout", href: BARBER_PRIMARY_TAB_HREFS.checkout, activeHref: BARBER_PRIMARY_TAB_HREFS.checkout, label: "Checkout", icon: CircleDollarSign },
  { key: "profile", href: BARBER_PRIMARY_TAB_HREFS.profile, activeHref: BARBER_PRIMARY_TAB_HREFS.profile, label: "Profile", icon: UserRound },
  { key: "messages", href: BARBER_PRIMARY_TAB_HREFS.messages, activeHref: BARBER_PRIMARY_TAB_HREFS.messages, label: "Messages", icon: MessageSquareText },
  { key: "more", href: BARBER_PRIMARY_TAB_HREFS.more, activeHref: BARBER_PRIMARY_TAB_HREFS.more, label: "More", icon: Ellipsis }
];
