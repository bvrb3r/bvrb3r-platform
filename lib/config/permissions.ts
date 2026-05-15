import type { PermissionGroup } from "@/types/domain";

export const permissionMatrix: PermissionGroup[] = [
  {
    role: "owner",
    allows: ["Manage locations", "Set commission and booth-rent rules", "Control shop service catalog", "View all analytics", "Manage billing and permissions"],
    restricted: []
  },
  {
    role: "manager",
    allows: ["Run daily operations", "Adjust appointments", "Approve limited discounts", "View location reports"],
    restricted: ["Cannot edit ownership financial structures", "Cannot change global billing", "Cannot edit owner-controlled commission service pricing"]
  },
  {
    role: "front_desk",
    allows: ["Create and edit appointments", "Manage walk-ins", "Collect payments", "View client history"],
    restricted: ["Cannot access payroll or global analytics"]
  },
  {
    role: "barber",
    allows: ["Manage own bookings", "Update availability", "Manage chair services", "See own earnings"],
    restricted: ["Cannot access owner reports", "Cannot edit unrelated shop-owned services"]
  },
  {
    role: "commission_barber",
    allows: ["Manage own schedule", "See own earnings", "View shop-defined services", "Update personal notes"],
    restricted: ["Cannot view team financials", "Cannot edit service pricing or service definitions"]
  },
  {
    role: "booth_rent_barber",
    allows: ["Manage own bookings", "View rent ledger", "Update availability", "Manage self-owned services"],
    restricted: ["Cannot access owner reports", "Cannot edit shop-owned commission services"]
  },
  {
    role: "client",
    allows: ["Book and rebook", "Manage profile", "Join waitlist", "View history"],
    restricted: ["Cannot access internal operations"]
  }
];
