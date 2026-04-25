import type { Route } from "next";
import {
  CalendarDays,
  CircleDollarSign,
  Home,
  UserRound,
  type LucideIcon
} from "lucide-react";

export type BarberAppTab = "home" | "calendar" | "checkout" | "profile";

export const BARBER_PRIMARY_TAB_HREFS = {
  home: "/dashboard/barber",
  calendar: "/dashboard/barber/calendar",
  checkout: "/dashboard/barber/checkout",
  profile: "/dashboard/barber/profile"
} as const satisfies Record<BarberAppTab, Route>;

export const BARBER_PRIMARY_NAV_ITEMS: Array<{
  key: BarberAppTab;
  href: Route;
  activeHref: string;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "home", href: BARBER_PRIMARY_TAB_HREFS.home, activeHref: BARBER_PRIMARY_TAB_HREFS.home, label: "Home", icon: Home },
  { key: "calendar", href: BARBER_PRIMARY_TAB_HREFS.calendar, activeHref: BARBER_PRIMARY_TAB_HREFS.calendar, label: "Calendar", icon: CalendarDays },
  { key: "checkout", href: BARBER_PRIMARY_TAB_HREFS.checkout, activeHref: BARBER_PRIMARY_TAB_HREFS.checkout, label: "Checkout", icon: CircleDollarSign },
  { key: "profile", href: BARBER_PRIMARY_TAB_HREFS.profile, activeHref: BARBER_PRIMARY_TAB_HREFS.profile, label: "Profile", icon: UserRound }
];
