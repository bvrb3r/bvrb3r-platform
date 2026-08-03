export type SystemAtlasMission = {
  number: string;
  title: string;
  role: "Universal" | "Walk-In" | "Client" | "Barber" | "Shop Owner" | "Cross-Role";
  color: string;
  builtAs: string;
  image: string;
};

const missions = [
  ["01", "Universal Canonical Mechanics", "Universal", "#D9B461", "The law every screen obeys — enforced per-flow; visible in Architect City Map (doors → routes → exits) and Architect Console (evidence → release certificate)"],
  ["02", "Universal Entry → Role → Onboarding", "Universal", "#D9B461", "Onboarding (role select + identity), Guest, Account Recovery, Access-Denied state"],
  ["03", "Walk-In Acquisition & Kiosk Entry", "Walk-In", "#C4F24E", "Shop Kiosk + Barber Kiosk (attract loop, entry paths), Kiosk System/Recovery States"],
  ["04", "Walk-In Queue Routing & Assignment", "Walk-In", "#C4F24E", "Shop Kiosk rotation, Barber Queue Day, Owner Floor Day (cash-only reassignment), Client Queue Status"],
  ["05", "Walk-In Service → Checkout → Account Claim", "Walk-In", "#C4F24E", "Kiosk pay/tip/celebration, Barber Checkout, Account Verify & Activation, Kiosk Check-In & ClientBridge"],
  ["06", "Client Acquisition, Discovery & Trust", "Client", "#7FB5FF", "Landing ×2, The App, Search v2, Barber Profile, Shop Profile, Coming Soon Shop, Interactive Demo"],
  ["07", "Client Booking & Payment Commitment", "Client", "#7FB5FF", "Booking, Client Book, Group Booking, Confirmation (policy snapshot + payment decision)"],
  ["08", "Client Appointment Lifecycle", "Client", "#7FB5FF", "Appointment Details, Reschedule, External Appointment, Price & Policy-change states, Notification Center"],
  ["09", "Client Checkout, Review, Loyalty & Rebook", "Client", "#7FB5FF", "Checkout States, Review Flow, Loyalty, Road Maps (rebook loop), Gifted Cuts accept moment"],
  ["10", "Barber Acquisition, Verification & Activation", "Barber", "#F5F1E8", "Barber Setup Checklist, License Verification, Payout Setup, Stripe Connect, Business Toolkit"],
  ["11", "Barber Profile, Services & Availability", "Barber", "#F5F1E8", "Barber Profile Manager, Services Manager, Availability & Walk-Ins, Vacation Mode, Post Work"],
  ["12", "Barber Chair-Day Operations", "Barber", "#F5F1E8", "Barber Home (+ChairSync), Barber Queue Day + Queue Day States, Barber Calendar, Unified Schedule"],
  ["13", "Barber Checkout, Earnings, Payout & Booth Rent", "Barber", "#F5F1E8", "Barber Checkout, Barber Money (receipt drill-in), Booth Rent, Rent Statement, Rent Lifecycle, AutoBooth Detail"],
  ["14", "Barber Client Growth & Retention", "Barber", "#F5F1E8", "Barber Growth, Barber ClientBridge, Culture v2 + Post Work, Messages, rebook links"],
  ["15", "Shop Owner Acquisition, Verification & Activation", "Shop Owner", "#C9A87C", "Shop Setup & Kiosk Console, Shop Identity & Hours, Shop Verification, Claim & Transfer, Migration Wizard"],
  ["16", "Shop Setup, Team & Relationship Lifecycle", "Shop Owner", "#C9A87C", "Owner Team P3, Team Invites, Join a Shop (barber side), Booth Rent agreements, pause/end + settle-first"],
  ["17", "Shop Owner Business Day & Kiosk Rotation", "Shop Owner", "#C9A87C", "Owner Home P3, Floor Day P3 + Floor & TV States, Owner Kiosk Settings P3, Waiting Room TV"],
  ["18", "Shop Money, Payouts & Fixed Booth Rent", "Shop Owner", "#C9A87C", "Owner Money, Owner Payouts, Rent Statement ($0.00 reconciliation), overdue recovery — fixed rent only"],
  ["19", "Shop Growth, Quality & Compliance", "Shop Owner", "#C9A87C", "Owner Analytics, Owner Report Pack, Shop Policies (versioned acceptance), Shop ClientBridge Performance"],
  ["20", "Cross-Role Value Exchange", "Cross-Role", "#FF8A65", "Gifted Cuts (gift → pool → accept), Messages ×3, ClientBridge, attribution monitors — minimum-context handoffs, no role impersonation"],
  ["21", "Universal Recovery, Closed Door & Anti-Loop Control", "Cross-Role", "#FF8A65", "Global Safety States (21 states), Locked Layer gates, Win-Back & Door Resolver (never-404), Kiosk Recovery States, Dispute"]
] as const;

export const SYSTEM_ATLAS_MISSIONS: SystemAtlasMission[] = missions.map(
  ([number, title, role, color, builtAs]) => ({
    number,
    title,
    role,
    color,
    builtAs,
    image: `/atlas/${number}.png`
  })
);

export const SYSTEM_ATLAS_RESULT_CODES = [
  "SUC",
  "PAR",
  "NCH",
  "VAL",
  "CNF",
  "RCV",
  "CLD",
  "EXP",
  "CAN",
  "ESC"
] as const;
