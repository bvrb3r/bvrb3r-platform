import "server-only";

import {
  allPr36LaunchChecksGreen,
  buildPr36LaunchChecklist,
  pr36BookingHeadStartAt,
  pr36PaymentAllowed,
  resolvePr36LaunchPhase,
  type Pr36FoundingBarber,
  type Pr36LaunchConfigRow,
  type Pr36LaunchEvidence,
  type Pr36LaunchStatus,
  type Pr36OwnerLaunchConsole,
  type Pr36PublicPrelaunch
} from "@/lib/shops/pr36-prelaunch-domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ShopRow = {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  public_username: string | null;
  shop_username: string | null;
  public_hours: unknown;
  policies: string | null;
  owner_profile_id: string | null;
  app_approval_status: string | null;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  hours: unknown;
};

type ConnectedAccountRow = {
  provider_account_id: string | null;
  onboarding_status: string | null;
  payout_readiness_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
};

type KioskRow = {
  enabled: boolean | null;
  device_label: string | null;
  last_verified_at: string | null;
};

type TeamInviteRow = {
  barber_id: string;
  barber_profile_id: string;
  public_team_order: number | null;
};

type StaffLocationRow = {
  profile_id: string;
  public_team_order: number | null;
};

type BarberRow = {
  id: string;
  profile_id: string;
  reference_code: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  public_username: string | null;
};

type BarberProfileRow = {
  barber_reference: string;
  username: string | null;
  display_name: string | null;
};

type WaitlistPositionRow = {
  position: number;
};

const SHOP_SELECT = "id, name, address, neighborhood, city, state, public_username, shop_username, public_hours, policies, owner_profile_id, app_approval_status";
const CONFIG_SELECT = "shop_id, opening_at, chair_capacity, head_start_hours, status, page_visits, version, go_live_approved_at, created_at, updated_at";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class Pr36PrelaunchServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "prelaunch_request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function adminClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Pr36PrelaunchServiceError("Shop launch persistence is not configured.", 503, "prelaunch_persistence_missing");
  }
  return supabase;
}

function normalizeSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new Pr36PrelaunchServiceError("That coming-soon shop address is invalid.", 404, "prelaunch_shop_not_found");
  }
  return slug;
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Pr36PrelaunchServiceError("Enter a valid email address.", 400, "invalid_waitlist_email");
  }
  return email;
}

function normalizePhone(value: string | null | undefined) {
  const phone = value?.replace(/[^0-9+]/g, "").trim() ?? "";
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Pr36PrelaunchServiceError("Enter a valid phone number.", 400, "invalid_waitlist_phone");
  }
  return phone.startsWith("+") ? `+${digits}` : digits;
}

function requireIdempotencyKey(value: string | null | undefined) {
  const key = value?.trim() ?? "";
  if (key.length < 16 || key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    throw new Pr36PrelaunchServiceError("A valid Idempotency-Key is required.", 400, "idempotency_key_required");
  }
  return key;
}

function requireOwner(user: Pick<UserAccount, "id" | "role">) {
  if (user.role !== "shop_owner_user" || user.id === "guest-user") {
    throw new Pr36PrelaunchServiceError("Only the verified Shop Owner can control launch.", 403, "shop_launch_forbidden");
  }
}

function hasHours(value: unknown) {
  if (!value) return false;
  return typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0;
}

function launchStatus(value: string): Pr36LaunchStatus {
  if (value === "launch_scheduled" || value === "paused" || value === "canceled") return value;
  return "prelaunch";
}

function addressLine(shop: ShopRow) {
  return [shop.address, shop.neighborhood, shop.city, shop.state]
    .map((part) => part?.trim())
    .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
    .join(", ");
}

function publicSlug(shop: ShopRow) {
  return (shop.public_username || shop.shop_username || shop.id).trim().toLowerCase();
}

async function resolvePublicShop(supabase: SupabaseAdmin, rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  const result = await supabase
    .from("shops")
    .select(SHOP_SELECT)
    .or(`public_username.eq.${slug},shop_username.eq.${slug},id.eq.${slug}`)
    .limit(2);
  if (result.error) {
    throw new Pr36PrelaunchServiceError("The coming-soon shop could not be verified.", 500, "prelaunch_shop_read_failed");
  }
  const exact = ((result.data ?? []) as unknown as ShopRow[]).find((shop) => (
    [shop.public_username, shop.shop_username, shop.id].some((value) => value?.trim().toLowerCase() === slug)
  ));
  if (!exact) {
    throw new Pr36PrelaunchServiceError("That coming-soon shop was not found.", 404, "prelaunch_shop_not_found");
  }
  return exact;
}

async function resolveOwnerShop(supabase: SupabaseAdmin, user: Pick<UserAccount, "id" | "role" | "ownedShopId">) {
  requireOwner(user);
  let query = supabase.from("shops").select(SHOP_SELECT).eq("owner_profile_id", user.id).limit(1);
  if (user.ownedShopId) query = query.eq("id", user.ownedShopId);
  let result = await query.maybeSingle();
  if (!result.data && user.ownedShopId) {
    result = await supabase.from("shops").select(SHOP_SELECT).eq("owner_profile_id", user.id).limit(1).maybeSingle();
  }
  if (result.error) {
    throw new Pr36PrelaunchServiceError("The owner shop scope could not be verified.", 500, "owner_shop_read_failed");
  }
  if (!result.data) {
    throw new Pr36PrelaunchServiceError("No shop owned by this account was found.", 404, "owner_shop_missing");
  }
  return result.data as unknown as ShopRow;
}

async function readConfig(supabase: SupabaseAdmin, shopId: string) {
  const result = await supabase.from("shop_prelaunches").select(CONFIG_SELECT).eq("shop_id", shopId).maybeSingle();
  if (result.error) {
    const code = (result.error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") return null;
    throw new Pr36PrelaunchServiceError("Coming-soon state could not be verified.", 500, "prelaunch_state_read_failed");
  }
  return result.data as unknown as Pr36LaunchConfigRow | null;
}

async function resolveLocation(supabase: SupabaseAdmin, shopId: string) {
  const byReference = await supabase
    .from("locations")
    .select("id, reference_code, hours")
    .eq("reference_code", shopId)
    .limit(1)
    .maybeSingle();
  if (byReference.error) {
    throw new Pr36PrelaunchServiceError("The shop location bridge could not be verified.", 500, "prelaunch_location_read_failed");
  }
  if (byReference.data) return byReference.data as unknown as LocationRow;
  if (!UUID_PATTERN.test(shopId)) return null;
  const byId = await supabase.from("locations").select("id, reference_code, hours").eq("id", shopId).maybeSingle();
  if (byId.error) {
    throw new Pr36PrelaunchServiceError("The shop location bridge could not be verified.", 500, "prelaunch_location_read_failed");
  }
  return byId.data as unknown as LocationRow | null;
}

async function readFoundingTeam(supabase: SupabaseAdmin, locationId: string | null) {
  if (!locationId) return { count: 0, members: [] as Pr36FoundingBarber[] };
  const [inviteResult, staffResult] = await Promise.all([
    supabase
      .from("shop_team_invites")
      .select("barber_id, barber_profile_id, public_team_order")
      .eq("shop_id", locationId)
      .eq("status", "active")
      .eq("public_team_visible", true),
    supabase
      .from("staff_locations")
      .select("profile_id, public_team_order")
      .eq("location_id", locationId)
      .eq("relationship_status", "active")
      .is("ended_at", null)
      .eq("public_team_visible", true)
  ]);
  if (inviteResult.error || staffResult.error) {
    throw new Pr36PrelaunchServiceError("The founding team could not be verified.", 500, "founding_team_read_failed");
  }
  const invites = (inviteResult.data ?? []) as unknown as TeamInviteRow[];
  const staff = (staffResult.data ?? []) as unknown as StaffLocationRow[];
  const profileOrder = new Map<string, number>();
  for (const row of staff) profileOrder.set(row.profile_id, Number(row.public_team_order ?? 0));
  for (const row of invites) profileOrder.set(row.barber_profile_id, Number(row.public_team_order ?? 0));
  const profileIds = [...profileOrder.keys()];
  if (!profileIds.length) return { count: 0, members: [] as Pr36FoundingBarber[] };

  const [barbersResult, profilesResult] = await Promise.all([
    supabase.from("barbers").select("id, profile_id, reference_code").in("profile_id", profileIds),
    supabase.from("profiles").select("id, full_name, public_username").in("id", profileIds)
  ]);
  if (barbersResult.error || profilesResult.error) {
    throw new Pr36PrelaunchServiceError("Founding barber profiles could not be verified.", 500, "founding_profile_read_failed");
  }
  const barbers = (barbersResult.data ?? []) as unknown as BarberRow[];
  const profiles = (profilesResult.data ?? []) as unknown as ProfileRow[];
  const references = barbers.map((barber) => barber.reference_code).filter((value): value is string => Boolean(value));
  const barberProfilesResult = references.length
    ? await supabase.from("barber_profiles").select("barber_reference, username, display_name").in("barber_reference", references)
    : { data: [], error: null };
  if (barberProfilesResult.error) {
    throw new Pr36PrelaunchServiceError("Founding public profiles could not be verified.", 500, "founding_public_profile_read_failed");
  }

  const barberByProfile = new Map(barbers.map((barber) => [barber.profile_id, barber]));
  const publicByReference = new Map(((barberProfilesResult.data ?? []) as unknown as BarberProfileRow[])
    .map((profile) => [profile.barber_reference, profile]));
  const members = profiles.map((profile): Pr36FoundingBarber | null => {
    const barber = barberByProfile.get(profile.id);
    const publicProfile = barber?.reference_code ? publicByReference.get(barber.reference_code) : null;
    const username = (publicProfile?.username || profile.public_username || barber?.reference_code || "").trim();
    if (!username) return null;
    return {
      profileId: profile.id,
      name: publicProfile?.display_name?.trim() || profile.full_name?.trim() || `@${username}`,
      username,
      href: `/barber/${encodeURIComponent(username)}`
    };
  }).filter((member): member is Pr36FoundingBarber => Boolean(member));
  members.sort((left, right) => (profileOrder.get(left.profileId) ?? 0) - (profileOrder.get(right.profileId) ?? 0));
  return { count: profileIds.length, members };
}

async function readLaunchEvidence(input: {
  supabase: SupabaseAdmin;
  shop: ShopRow;
  location: LocationRow | null;
  chairCapacity: number;
}) {
  const locationId = input.location?.id ?? null;
  const targetReferences = [input.shop.id, locationId, input.location?.reference_code].filter((value): value is string => Boolean(value));
  const [connectedResult, kioskResult, foundingTeam] = await Promise.all([
    locationId
      ? input.supabase
        .from("connected_accounts")
        .select("provider_account_id, onboarding_status, payout_readiness_status, charges_enabled, payouts_enabled")
        .eq("subject_type", "shop")
        .eq("shop_id", locationId)
        .eq("provider", "stripe_connect")
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    targetReferences.length
      ? input.supabase
        .from("kiosk_settings")
        .select("enabled, device_label, last_verified_at")
        .eq("scope", "shop")
        .in("target_reference", targetReferences)
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    readFoundingTeam(input.supabase, locationId)
  ]);
  if (connectedResult.error || kioskResult.error) {
    throw new Pr36PrelaunchServiceError("Launch readiness could not be verified.", 500, "launch_readiness_failed");
  }
  const connected = connectedResult.data as unknown as ConnectedAccountRow | null;
  const kiosk = kioskResult.data as unknown as KioskRow | null;
  const evidence: Pr36LaunchEvidence = {
    identity: {
      approved: input.shop.app_approval_status === "approved",
      name: input.shop.name,
      publicUsername: input.shop.public_username || input.shop.shop_username,
      address: input.shop.address,
      city: input.shop.city,
      state: input.shop.state
    },
    stripe: {
      connected: Boolean(connected?.provider_account_id),
      chargesEnabled: Boolean(connected?.charges_enabled),
      payoutsEnabled: Boolean(connected?.payouts_enabled),
      onboardingStatus: connected?.onboarding_status ?? null,
      payoutReadinessStatus: connected?.payout_readiness_status ?? null
    },
    policies: { published: Boolean(input.shop.policies?.trim() && input.shop.policies.trim().length >= 20) },
    hours: { published: hasHours(input.shop.public_hours) || hasHours(input.location?.hours) },
    team: { foundingChairCount: foundingTeam.count, chairCapacity: input.chairCapacity },
    kiosk: {
      enabled: Boolean(kiosk?.enabled),
      paired: Boolean(kiosk?.device_label?.trim()),
      tested: Boolean(kiosk?.last_verified_at)
    }
  };
  return { evidence, foundingTeam };
}

async function readWaitlistCount(supabase: SupabaseAdmin, shopId: string) {
  const result = await supabase
    .from("shop_prelaunch_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .in("status", ["active", "notified"]);
  if (result.error) {
    throw new Pr36PrelaunchServiceError("The opening waitlist count could not be verified.", 500, "waitlist_count_failed");
  }
  return result.count ?? 0;
}

async function readViewerPosition(input: {
  supabase: SupabaseAdmin;
  shopId: string;
  profileId?: string | null;
  email?: string | null;
}) {
  if (input.profileId && input.profileId !== "guest-user") {
    const result = await input.supabase
      .from("shop_prelaunch_waitlist")
      .select("position")
      .eq("shop_id", input.shopId)
      .eq("profile_id", input.profileId)
      .in("status", ["active", "notified"])
      .maybeSingle();
    if (result.error) throw new Pr36PrelaunchServiceError("Waitlist position could not be verified.", 500, "waitlist_position_failed");
    if (result.data) return Number((result.data as unknown as WaitlistPositionRow).position);
  }
  const email = input.email?.trim().toLowerCase();
  if (!email) return null;
  const result = await input.supabase
    .from("shop_prelaunch_waitlist")
    .select("position")
    .eq("shop_id", input.shopId)
    .eq("email", email)
    .in("status", ["active", "notified"])
    .maybeSingle();
  if (result.error) throw new Pr36PrelaunchServiceError("Waitlist position could not be verified.", 500, "waitlist_position_failed");
  return result.data ? Number((result.data as unknown as WaitlistPositionRow).position) : null;
}

export async function readPr36PublicPrelaunch(input: {
  slug: string;
  viewer?: Pick<UserAccount, "id" | "email"> | null;
  recordVisit?: boolean;
}): Promise<Pr36PublicPrelaunch> {
  const supabase = adminClient();
  const shop = await resolvePublicShop(supabase, input.slug);
  const config = await readConfig(supabase, shop.id);
  if (!config || config.status === "canceled" || config.status === "paused") {
    throw new Pr36PrelaunchServiceError("That shop does not have a public coming-soon page.", 404, "prelaunch_not_public");
  }
  const location = await resolveLocation(supabase, shop.id);
  const [{ foundingTeam }, waitlistCount, viewerPosition] = await Promise.all([
    readLaunchEvidence({ supabase, shop, location, chairCapacity: config.chair_capacity }),
    readWaitlistCount(supabase, shop.id),
    readViewerPosition({ supabase, shopId: shop.id, profileId: input.viewer?.id, email: input.viewer?.email })
  ]);
  if (input.recordVisit !== false) {
    await supabase.rpc("pr36_record_prelaunch_visit", { p_shop_id: shop.id });
  }
  const slug = publicSlug(shop);
  return {
    shopId: shop.id,
    slug,
    name: shop.name,
    addressLine: addressLine(shop) || "Opening location details are being finalized",
    openingAt: config.opening_at,
    bookingHeadStartAt: pr36BookingHeadStartAt(config.opening_at) ?? config.opening_at,
    phase: resolvePr36LaunchPhase(config),
    waitlistCount,
    viewerPosition,
    foundingTeam: foundingTeam.members,
    foundingChairCount: foundingTeam.count,
    chairCapacity: config.chair_capacity,
    joinChairHref: "/dashboard/barber/setup",
    publicShopHref: `/shop/${encodeURIComponent(shop.id)}`,
    paymentAllowed: pr36PaymentAllowed(config)
  };
}

export async function readPr36OwnerLaunchConsole(input: {
  user: Pick<UserAccount, "id" | "role" | "ownedShopId">;
}): Promise<Pr36OwnerLaunchConsole> {
  const supabase = adminClient();
  const shop = await resolveOwnerShop(supabase, input.user);
  const config = await readConfig(supabase, shop.id);
  const chairCapacity = config?.chair_capacity ?? 6;
  const location = await resolveLocation(supabase, shop.id);
  const [{ evidence }, waitlistCount] = await Promise.all([
    readLaunchEvidence({ supabase, shop, location, chairCapacity }),
    config ? readWaitlistCount(supabase, shop.id) : Promise.resolve(0)
  ]);
  const checks = buildPr36LaunchChecklist(evidence);
  const allGreen = allPr36LaunchChecksGreen(checks);
  const status = config ? launchStatus(config.status) : "not_configured";
  const phase = config ? resolvePr36LaunchPhase(config) : "not_configured";
  const canGoLive = Boolean(config && status === "prelaunch" && allGreen);
  const goLiveReason = !config
    ? "Set and save the opening date before launch can be scheduled."
    : status === "launch_scheduled"
      ? "Launch is already scheduled with the waitlist receiving the first 24 hours."
      : status === "paused" || status === "canceled"
        ? "This coming-soon campaign is not active."
        : !allGreen
          ? `${checks.filter((check) => !check.green).length} launch check${checks.filter((check) => !check.green).length === 1 ? "" : "s"} still need real evidence.`
          : null;
  const slug = publicSlug(shop);
  return {
    configured: Boolean(config),
    shopId: shop.id,
    slug,
    name: shop.name,
    openingAt: config?.opening_at ?? null,
    bookingHeadStartAt: config ? pr36BookingHeadStartAt(config.opening_at) : null,
    status,
    phase,
    version: config?.version ?? 0,
    waitlistCount,
    foundingChairCount: evidence.team.foundingChairCount,
    chairCapacity,
    pageVisits: config?.page_visits ?? 0,
    checks,
    allGreen,
    canGoLive,
    goLiveReason,
    publicPageHref: `/s/${encodeURIComponent(slug)}`
  };
}

export async function joinPr36PrelaunchWaitlist(input: {
  slug: string;
  user?: Pick<UserAccount, "id" | "email"> | null;
  email?: string | null;
  phone?: string | null;
  consent: unknown;
  idempotencyKey: string | null | undefined;
}) {
  if (input.consent !== true) {
    throw new Pr36PrelaunchServiceError("Consent is required to send the opening alert.", 400, "waitlist_consent_required");
  }
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const email = normalizeEmail(input.email || (input.user?.id !== "guest-user" ? input.user?.email : null));
  const phone = normalizePhone(input.phone);
  if (!email) {
    throw new Pr36PrelaunchServiceError("Enter the email that will own your 24-hour booking access.", 400, "waitlist_email_required");
  }
  const supabase = adminClient();
  const shop = await resolvePublicShop(supabase, input.slug);
  const result = await supabase.rpc("pr36_join_prelaunch_waitlist", {
    p_shop_id: shop.id,
    p_profile_id: input.user?.id && input.user.id !== "guest-user" ? input.user.id : null,
    p_email: email,
    p_phone: phone,
    p_consent: true,
    p_idempotency_key: idempotencyKey
  });
  if (result.error) {
    const message = `${result.error.message ?? ""}`;
    if (message.includes("no longer accepting")) {
      throw new Pr36PrelaunchServiceError("This opening waitlist is no longer accepting entries.", 409, "waitlist_closed");
    }
    throw new Pr36PrelaunchServiceError("The opening waitlist could not save your place.", 409, "waitlist_join_failed");
  }
  return result.data as { position: number; waitlistCount: number; bookingOpensAt: string; alreadyJoined: boolean };
}

export async function withdrawPr36PrelaunchWaitlist(input: {
  slug: string;
  user?: Pick<UserAccount, "id" | "email"> | null;
  email?: string | null;
  phone?: string | null;
  idempotencyKey: string | null | undefined;
}) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const profileId = input.user?.id && input.user.id !== "guest-user" ? input.user.id : null;
  const email = normalizeEmail(input.email || (profileId ? input.user?.email : null));
  const phone = normalizePhone(input.phone);
  if (!profileId && !email && !phone) {
    throw new Pr36PrelaunchServiceError(
      "Enter the email or phone used to join this waitlist.",
      400,
      "waitlist_identity_required"
    );
  }

  const supabase = adminClient();
  const shop = await resolvePublicShop(supabase, input.slug);
  const result = await supabase.rpc("pr36_withdraw_prelaunch_waitlist", {
    p_shop_id: shop.id,
    p_profile_id: profileId,
    p_email: email,
    p_phone: phone,
    p_idempotency_key: idempotencyKey
  });
  if (result.error) {
    throw new Pr36PrelaunchServiceError(
      "The opening waitlist could not withdraw that entry.",
      409,
      "waitlist_withdraw_failed"
    );
  }
  const withdrawal = result.data as {
    outcome: "withdrawn" | "not_found";
    position?: number;
    waitlistCount?: number;
    alreadyWithdrawn?: boolean;
    contactAnonymized?: boolean;
    reason?: string;
  };
  if (withdrawal.outcome !== "withdrawn") {
    throw new Pr36PrelaunchServiceError(
      "No active waitlist entry matched that account or contact.",
      404,
      withdrawal.reason ?? "waitlist_entry_not_found"
    );
  }
  return withdrawal;
}

export async function configurePr36Prelaunch(input: {
  user: Pick<UserAccount, "id" | "role" | "ownedShopId">;
  openingAt: unknown;
  chairCapacity: unknown;
  expectedVersion: unknown;
  idempotencyKey: string | null | undefined;
}) {
  requireOwner(input.user);
  const openingAt = typeof input.openingAt === "string" ? new Date(input.openingAt) : new Date(Number.NaN);
  if (!Number.isFinite(openingAt.getTime()) || openingAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000) {
    throw new Pr36PrelaunchServiceError("Opening time must be more than 24 hours away so the waitlist receives its full head start.", 400, "invalid_opening_time");
  }
  if (openingAt.getTime() > Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) {
    throw new Pr36PrelaunchServiceError("Opening time must be within the next two years.", 400, "invalid_opening_time");
  }
  const chairCapacity = Number(input.chairCapacity);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(chairCapacity) || chairCapacity < 1 || chairCapacity > 24) {
    throw new Pr36PrelaunchServiceError("Founding chair capacity must be between 1 and 24.", 400, "invalid_chair_capacity");
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new Pr36PrelaunchServiceError("Refresh the launch console and try again.", 409, "invalid_launch_version");
  }
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const supabase = adminClient();
  const shop = await resolveOwnerShop(supabase, input.user);
  const result = await supabase.rpc("pr36_configure_shop_prelaunch", {
    p_shop_id: shop.id,
    p_actor_profile_id: input.user.id,
    p_opening_at: openingAt.toISOString(),
    p_chair_capacity: chairCapacity,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey
  });
  if (result.error) {
    const message = `${result.error.message ?? ""}`;
    const conflict = message.includes("version") || message.includes("already scheduled") || message.includes("head-start boundary");
    throw new Pr36PrelaunchServiceError(
      conflict ? "Launch timing changed. Refresh and preserve a full 24-hour head start." : "Coming-soon configuration could not be saved.",
      conflict ? 409 : 500,
      conflict ? "launch_version_conflict" : "launch_configure_failed"
    );
  }
  return result.data;
}

export async function goLivePr36Shop(input: {
  user: Pick<UserAccount, "id" | "role" | "ownedShopId">;
  expectedVersion: unknown;
  idempotencyKey: string | null | undefined;
}) {
  requireOwner(input.user);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Pr36PrelaunchServiceError("Refresh the launch console and try again.", 409, "invalid_launch_version");
  }
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const supabase = adminClient();
  const shop = await resolveOwnerShop(supabase, input.user);
  const result = await supabase.rpc("pr36_go_live_shop", {
    p_shop_id: shop.id,
    p_actor_profile_id: input.user.id,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey
  });
  if (result.error) {
    const message = `${result.error.message ?? ""}`;
    const needsChecks = message.includes("launch checks");
    const conflict = message.includes("version") || message.includes("already scheduled") || message.includes("head-start boundary");
    throw new Pr36PrelaunchServiceError(
      needsChecks
        ? "Go live remains disabled until every server launch check is green."
        : conflict
          ? "Launch timing changed or the 24-hour head-start boundary passed. Refresh and reschedule if needed."
          : "Launch could not be scheduled.",
      needsChecks || conflict ? 409 : 500,
      needsChecks ? "launch_checks_incomplete" : conflict ? "launch_version_conflict" : "launch_schedule_failed"
    );
  }
  return result.data;
}
