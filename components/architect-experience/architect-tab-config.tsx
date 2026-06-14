import { BadgeDollarSign, BrainCircuit, Building2, Megaphone, Rocket, Scale, ShieldCheck, Siren, UsersRound } from "lucide-react";

export const ARCHITECT_PRIMARY_NAV_ITEMS = [
  {
    id: "ceo",
    label: "CEO",
    href: "/architect",
    icon: Rocket
  },
  {
    id: "product",
    label: "Product",
    href: "/architect#product",
    icon: BrainCircuit
  },
  {
    id: "technology",
    label: "Technology",
    href: "/architect#technology",
    icon: ShieldCheck
  },
  {
    id: "operations",
    label: "Operations",
    href: "/architect#operations",
    icon: Building2
  },
  {
    id: "finance",
    label: "Finance",
    href: "/architect#finance",
    icon: BadgeDollarSign
  },
  {
    id: "marketing",
    label: "Marketing",
    href: "/architect#marketing",
    icon: Megaphone
  },
  {
    id: "compliance",
    label: "Compliance",
    href: "/architect#compliance",
    icon: Scale
  },
  {
    id: "security",
    label: "Security",
    href: "/architect#security",
    icon: Siren
  },
  {
    id: "content_community",
    label: "Content & Community",
    href: "/architect#content-community",
    icon: UsersRound
  }
] as const;

export type ArchitectPrimaryNavItem = (typeof ARCHITECT_PRIMARY_NAV_ITEMS)[number];
