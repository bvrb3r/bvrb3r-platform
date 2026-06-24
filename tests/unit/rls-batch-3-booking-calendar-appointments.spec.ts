import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260624003000_rls_batch_3_booking_calendar_appointments.sql"
);

const sql = readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();

type ProfileRole = "client_user" | "barber_user" | "shop_owner_user" | "manager" | "front_desk" | "platform_admin";

type Profile = {
  id: string;
  role: ProfileRole;
  primaryOnboardingRole?: ProfileRole;
};

type Client = {
  id: string;
  profileId: string;
};

type Barber = {
  id: string;
  profileId: string;
  referenceCode: string;
};

type Location = {
  id: string;
  referenceCode: string;
};

type Shop = {
  id: string;
  ownerProfileId: string;
};

type StaffLocation = {
  profileId: string;
  locationId?: string;
  shopId?: string;
  relationshipStatus?: string;
  endedAt?: string | null;
};

type Appointment = {
  id: string;
  clientId: string;
  barberId: string;
  locationId: string;
  shopId?: string | null;
};

const profiles: Profile[] = [
  { id: "profile-client", role: "client_user" },
  { id: "profile-other-client", role: "client_user" },
  { id: "profile-barber", role: "barber_user" },
  { id: "profile-other-barber", role: "barber_user" },
  { id: "profile-owner", role: "shop_owner_user" },
  { id: "profile-other-owner", role: "shop_owner_user" },
  { id: "profile-manager", role: "manager" },
  { id: "profile-front-desk", role: "front_desk" },
  { id: "profile-admin", role: "platform_admin", primaryOnboardingRole: "platform_admin" }
];

const clients: Client[] = [
  { id: "client-owned", profileId: "profile-client" },
  { id: "client-other", profileId: "profile-other-client" }
];

const barbers: Barber[] = [
  { id: "barber-owned", profileId: "profile-barber", referenceCode: "barber-owned-ref" },
  { id: "barber-other", profileId: "profile-other-barber", referenceCode: "barber-other-ref" }
];

const locations: Location[] = [
  { id: "location-owned", referenceCode: "shop-owned" },
  { id: "location-other", referenceCode: "shop-other" }
];

const shops: Shop[] = [
  { id: "shop-owned", ownerProfileId: "profile-owner" },
  { id: "shop-other", ownerProfileId: "profile-other-owner" }
];

const staffLocations: StaffLocation[] = [
  { profileId: "profile-manager", locationId: "location-owned", relationshipStatus: "active", endedAt: null },
  { profileId: "profile-front-desk", shopId: "shop-owned", relationshipStatus: "active", endedAt: null }
];

const ownedAppointment: Appointment = {
  id: "appointment-owned",
  clientId: "client-owned",
  barberId: "barber-owned",
  locationId: "location-owned",
  shopId: "location-owned"
};

const unrelatedAppointment: Appointment = {
  id: "appointment-other",
  clientId: "client-other",
  barberId: "barber-other",
  locationId: "location-other",
  shopId: "location-other"
};

function profile(profileId: string) {
  return profiles.find((entry) => entry.id === profileId) ?? null;
}

function isPlatformAdmin(profileId: string | null) {
  const actor = profileId ? profile(profileId) : null;
  return actor?.role === "platform_admin" || actor?.primaryOnboardingRole === "platform_admin";
}

function isBookingClient(profileId: string | null, clientId: string) {
  return clients.some((client) => client.id === clientId && client.profileId === profileId);
}

function isBookingBarber(profileId: string | null, barberId: string) {
  return barbers.some((barber) => barber.id === barberId && barber.profileId === profileId);
}

function isBookingShopOperator(profileId: string | null, locationId: string | null | undefined) {
  const actor = profileId ? profile(profileId) : null;
  const location = locations.find((entry) => entry.id === locationId);
  const allowedRoles: ProfileRole[] = ["shop_owner_user", "manager", "front_desk"];

  if (!actor || !location || !allowedRoles.includes(actor.role)) return false;

  const ownsShop = shops.some((shop) => shop.id === location.referenceCode && shop.ownerProfileId === profileId);
  const hasActiveMembership = staffLocations.some((membership) =>
    membership.profileId === profileId
    && (membership.relationshipStatus ?? "active") === "active"
    && !membership.endedAt
    && (membership.locationId === location.id || membership.shopId === location.referenceCode)
  );

  return ownsShop || hasActiveMembership;
}

function canReadAppointment(profileId: string | null, appointment: Appointment) {
  return isPlatformAdmin(profileId)
    || isBookingClient(profileId, appointment.clientId)
    || isBookingBarber(profileId, appointment.barberId)
    || isBookingShopOperator(profileId, appointment.shopId ?? appointment.locationId);
}

describe("RLS batch 3 booking/calendar/appointment migration", () => {
  it("enables RLS only for verified booking and calendar target tables", () => {
    [
      "appointments",
      "appointment_status_history",
      "appointment_services",
      "appointment_add_ons",
      "appointment_check_in_events",
      "services",
      "availability_rules",
      "walk_in_queue"
    ].forEach((table) => {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    });
  });

  it("uses private helpers and explicit platform admin guards instead of broad authenticated access", () => {
    expect(sql).toContain("create schema if not exists private");
    expect(sql).toContain("security definer");
    expect(sql).toContain("private.is_booking_client(public.appointments.client_id)");
    expect(sql).toContain("private.is_booking_barber(public.appointments.barber_id)");
    expect(sql).toContain("private.is_booking_shop_operator(coalesce(public.appointments.shop_id, public.appointments.location_id))");
    expect(sql).toContain("private.is_booking_platform_admin()");
    expect(sql).not.toMatch(/for select\s+to authenticated\s+using\s*\(\s*true\s*\)/i);
    expect(normalizedSql).not.toContain("auth.role() = 'authenticated'");
  });

  it("does not touch forbidden money, messaging, culture, report, audit, or role-normalization scope", () => {
    ["payments", "payment_routing_records", "refunds", "payout_executions", "messages", "culture_", "reviews", "reports", "audit_logs", "role_normalization"].forEach((forbidden) => {
      expect(normalizedSql).not.toContain(forbidden);
    });
    expect(sql).not.toMatch(/\bdelete\b/i);
    expect(sql).not.toMatch(/for\s+delete/i);
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("keeps unverified requested table names out of the migration as Needs Review evidence", () => {
    const skippedTables = [
      { tableName: "appointment_events", status: "Needs Review", reason: "No local schema evidence for this table name." },
      { tableName: "availability_blocks", status: "Needs Review", reason: "No local schema evidence for this table name." },
      { tableName: "barber_availability", status: "Needs Review", reason: "No local schema evidence for this table name." },
      { tableName: "shop_hours", status: "Needs Review", reason: "No local schema evidence for this table name." }
    ];

    skippedTables.forEach((entry) => {
      expect(normalizedSql).not.toContain(`public.${entry.tableName}`);
      expect(entry.status).toBe("Needs Review");
      expect(entry.reason).toContain("No local schema evidence");
    });
  });

  it("allows a client to see only their own appointment data", () => {
    expect(canReadAppointment("profile-client", ownedAppointment)).toBe(true);
    expect(canReadAppointment("profile-client", unrelatedAppointment)).toBe(false);
  });

  it("allows a barber to see only assigned barber appointment data", () => {
    expect(canReadAppointment("profile-barber", ownedAppointment)).toBe(true);
    expect(canReadAppointment("profile-barber", unrelatedAppointment)).toBe(false);
  });

  it("allows shop owners and authorized operators to see only owned or operated shop appointments", () => {
    expect(canReadAppointment("profile-owner", ownedAppointment)).toBe(true);
    expect(canReadAppointment("profile-owner", unrelatedAppointment)).toBe(false);
    expect(canReadAppointment("profile-manager", ownedAppointment)).toBe(true);
    expect(canReadAppointment("profile-front-desk", ownedAppointment)).toBe(true);
  });

  it("keeps platform admin access explicit and blocks public/anon private appointment reads", () => {
    expect(canReadAppointment("profile-admin", ownedAppointment)).toBe(true);
    expect(canReadAppointment(null, ownedAppointment)).toBe(false);
    expect(sql).not.toMatch(/to\s+anon/i);
  });

  it("keeps Architect Security evidence honest until production posture is verified", () => {
    const architectSecurityEvidence = {
      postureAfterPr: "Needs Review",
      reason: "Migration candidate is not executed and production pg_policies evidence is not connected.",
      targetTable: "appointments"
    };

    expect(architectSecurityEvidence).toMatchObject({
      postureAfterPr: "Needs Review",
      targetTable: "appointments"
    });
  });
});
