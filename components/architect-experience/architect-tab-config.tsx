import { Bug, Home, MessageCircle, ShieldCheck, UserCog, WalletCards, Settings2 } from "lucide-react";

export const ARCHITECT_PRIMARY_NAV_ITEMS = [
  {
    id: "home",
    label: "Home",
    href: "/architect",
    icon: Home
  },
  {
    id: "users",
    label: "Users",
    href: "/architect/users",
    icon: UserCog
  },
  {
    id: "verifications",
    label: "Verifications",
    href: "/architect/verifications",
    icon: ShieldCheck
  },
  {
    id: "money",
    label: "Money",
    href: "/architect/money",
    icon: WalletCards
  },
  {
    id: "debug",
    label: "Debug",
    href: "/architect/debug",
    icon: Bug
  },
  {
    id: "messages",
    label: "Messages",
    href: "/architect/messages",
    icon: MessageCircle
  },
  {
    id: "settings",
    label: "Settings",
    href: "/architect/settings",
    icon: Settings2
  }
] as const;

export type ArchitectPrimaryNavItem = (typeof ARCHITECT_PRIMARY_NAV_ITEMS)[number];
