import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type ShopTeamInviteStatus = "invited" | "requested" | "active" | "rejected" | "declined" | "ended";
export type RelationshipRoutingModel = "freelance" | "booth_rent" | "commission";
export type ShopRelationshipProposal = {
  routingModel: "booth_rent";
  boothRentAmount?: number | null;
  boothRentFrequency?: "daily" | "weekly" | "monthly" | null;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: "commission" | "booth_rent";
  commission_rate: number | string | null;
  booth_rent_amount: number | string | null;
  booth_rent_frequency: "weekly" | "monthly" | null;
  app_approval_status: string | null;
  shop_approval_status: string | null;
  barber_subtype: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  primary_onboarding_role: string | null;
};

type BarberProfileRow = {
  barber_reference: string;
  username: string;
  display_name: string;
  service_area_label: string | null;
};

type MarketplaceVisibilityRow = {
  barber_reference: string;
  visibility_state: string;
  accepts_instant_bookings: boolean;
};

type StaffLocationRow = {
  id: string;
  profile_id: string;
  location_id: string | null;
  shop_id?: string | null;
  relationship_status?: ShopTeamInviteStatus | null;
  routing_model?: RelationshipRoutingModel | null;
  booth_rent_amount?: number | string | null;
  booth_rent_frequency?: "daily" | "weekly" | "monthly" | null;
  barber_percent?: number | string | null;
  shop_percent?: number | string | null;
  commission_cap_amount?: number | string | null;
  commission_cap_frequency?: "weekly" | "monthly" | null;
  ended_at?: string | null;
  public_team_visible?: boolean | null;
  public_team_order?: number | string | null;
  featured_on_shop_profile?: boolean | null;
};

type InviteRow = {
  id: string;
  shop_id: string;
  barber_id: string;
  barber_profile_id: string;
  invited_by_profile_id: string | null;
  requested_by_profile_id?: string | null;
  status: ShopTeamInviteStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  approved_by_owner_at?: string | null;
  approved_by_barber_at?: string | null;
  rejected_at?: string | null;
  declined_at?: string | null;
  ended_at?: string | null;
  ended_by_profile_id?: string | null;
  ended_by_role?: "barber" | "owner" | "architect" | null;
  ended_reason?: string | null;
  routing_model?: RelationshipRoutingModel | null;
  barber_percent?: number | string | null;
  shop_percent?: number | string | null;
  commission_cap_amount?: number | string | null;
  commission_cap_frequency?: "weekly" | "monthly" | null;
  booth_rent_amount?: number | string | null;
  booth_rent_frequency?: "daily" | "weekly" | "monthly" | null;
  payout_block_reason?: string | null;
  public_team_visible?: boolean | null;
  public_team_order?: number | string | null;
  featured_on_shop_profile?: boolean | null;
};

type ShopRow = {
  id: string;
  name: string;
  owner_profile_id: string | null;
  neighborhood: string;
  city: string;
  state: string;
  address: string | null;
  app_approval_status: string | null;
};

const inviteSelectColumns = "id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, requested_by_profile_id, status, message, created_at, updated_at, responded_at, approved_by_owner_at, approved_by_barber_at, rejected_at, declined_at, ended_at, ended_by_profile_id, ended_by_role, ended_reason, routing_model, barber_percent, shop_percent, commission_cap_amount, commission_cap_frequency, booth_rent_amount, booth_rent_frequency, payout_block_reason, public_team_visible, public_team_order, featured_on_shop_profile";
const membershipSelectColumns = "id, profile_id, location_id, shop_id, relationship_status, routing_model, booth_rent_amount, booth_rent_frequency, barber_percent, shop_percent, commission_cap_amount, commission_cap_frequency, ended_at, public_team_visible, public_team_order, featured_on_shop_profile";
const pendingInviteStatuses = ["invited", "requested", "pending"];
const activeInviteStatuses = ["active", "accepted"];

type ShopScope = {
  id: string;
  label: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  address: string | null;
  appApprovalStatus: string | null;
  locationBridgeId: string | null;
  locationReference: string | null;
  setupNote: string | null;
};

export interface ShopTeamInviteDirectoryBarber {
  inviteId: string | null;
  barberId: string;
  barberReference: string;
  profileId: string;
  name: string;
  email: string;
  username: string | null;
  serviceAreaLabel: string | null;
  compensationModel: string;
  appApprovalStatus: string;
  shopApprovalStatus: string;
  visibilityState: string | null;
  acceptsInstantBookings: boolean;
  alreadyAssigned: boolean;
  inviteStatus: ShopTeamInviteStatus | null;
  marketplaceStatusLabel: string;
  readinessLabels: string[];
  canInvite: boolean;
  inviteDisabledReason: string | null;
}

export interface ShopTeamInviteDirectoryPayload {
  shop: {
    id: string;
    label: string;
    setupNote?: string | null;
  };
  barbers: ShopTeamInviteDirectoryBarber[];
}

export interface ShopTeamInviteView {
  id: string;
  shopId: string;
  shopLabel: string;
  barberId: string;
  barberName: string;
  barberEmail: string;
  status: ShopTeamInviteStatus;
  source: "owner_invite" | "barber_request";
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  operatingModel: RelationshipRoutingModel;
  boothRentAmount: number | null;
  boothRentFrequency: "daily" | "weekly" | "monthly" | null;
  barberPercent: number | null;
  shopPercent: number | null;
  commissionCapAmount: number | null;
  commissionCapFrequency: "weekly" | "monthly" | null;
}

export interface BarberJoinableShopView {
  shopId: string;
  shopReference: string | null;
  shopLabel: string;
  city: string | null;
  state: string | null;
  approvalStatus: string;
  liveStatusLabel: string;
  alreadyAssigned: boolean;
  inviteStatus: ShopTeamInviteStatus | null;
  canRequest: boolean;
  readinessLabels: string[];
}

export class ShopTeamInviteServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ShopTeamInviteServiceError";
    this.status = status;
  }
}

function getSupabaseOrThrow() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new ShopTeamInviteServiceError("Team invitations require the live Supabase environment.", 503);
  }
  return supabase;
}

function requireOwner(user: UserAccount) {
  if (!(isShopOwnerRole(user.role) || user.role === "manager")) {
    throw new ShopTeamInviteServiceError("Only shop owners and managers can manage team invites.", 403);
  }
}

function requireBarber(user: UserAccount) {
  if (!isBarberAccountRole(user.role) || !user.barberId) {
    throw new ShopTeamInviteServiceError("Only barbers can respond to shop invitations.", 403);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toReference(row: { id: string; reference_code: string | null }) {
  return row.reference_code ?? row.id;
}

function formatLocationLabel(location: LocationRow) {
  return [location.name, location.neighborhood, location.city].filter(Boolean).join(" | ");
}

function formatShopLabel(shop: Pick<ShopScope, "name" | "neighborhood" | "city">) {
  return [shop.name, shop.neighborhood, shop.city].filter(Boolean).join(" | ");
}

function mapShopScope(shop: ShopRow, location?: LocationRow | null): ShopScope {
  return {
    id: shop.id,
    label: formatShopLabel({
      name: shop.name,
      neighborhood: shop.neighborhood,
      city: shop.city
    }),
    name: shop.name,
    neighborhood: shop.neighborhood,
    city: shop.city,
    state: shop.state,
    address: shop.address,
    appApprovalStatus: shop.app_approval_status,
    locationBridgeId: location?.id ?? null,
    locationReference: location?.reference_code ?? null,
    setupNote: location ? null : "Shop location bridge is not linked yet. Team invites can continue; shop scheduling may need location setup."
  };
}

function mapLocationScope(location: LocationRow): ShopScope {
  return {
    id: toReference(location),
    label: formatLocationLabel(location),
    name: location.name,
    neighborhood: location.neighborhood,
    city: location.city,
    state: location.state,
    address: null,
    appApprovalStatus: "approved",
    locationBridgeId: location.id,
    locationReference: location.reference_code,
    setupNote: null
  };
}

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function numericOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeInviteStatus(row: Pick<InviteRow, "status" | "requested_by_profile_id" | "invited_by_profile_id">): ShopTeamInviteStatus {
  switch (row.status as string) {
    case "pending":
      return row.requested_by_profile_id ? "requested" : "invited";
    case "accepted":
      return "active";
    case "canceled":
    case "removed":
      return "ended";
    default:
      return row.status;
  }
}

function getBarberDefaultRoutingModel(barber: BarberRow): RelationshipRoutingModel {
  if (barber.compensation_model === "booth_rent" || barber.barber_subtype === "booth_rent") {
    return "booth_rent";
  }

  if (barber.compensation_model === "commission" || barber.barber_subtype === "commission") {
    return "commission";
  }

  return "freelance";
}

function getDefaultRelationshipTerms(barber: BarberRow) {
  const routingModel = getBarberDefaultRoutingModel(barber);
  const commissionRate = numericOrNull(barber.commission_rate);
  const barberPercent = routingModel === "commission" ? commissionRate ?? 0.7 : null;
  const shopPercent = routingModel === "commission" ? Math.max(0, 1 - (barberPercent ?? 0.7)) : null;

  return {
    routing_model: routingModel,
    booth_rent_amount: routingModel === "booth_rent" ? numericOrNull(barber.booth_rent_amount) : null,
    booth_rent_frequency: routingModel === "booth_rent" ? barber.booth_rent_frequency ?? "weekly" : null,
    barber_percent: barberPercent,
    shop_percent: shopPercent,
    commission_cap_amount: null,
    commission_cap_frequency: null
  };
}

function getProposedRelationshipTerms(barber: BarberRow, proposal?: ShopRelationshipProposal) {
  const defaults = getDefaultRelationshipTerms(barber);
  const routingModel = proposal?.routingModel ?? "booth_rent";

  const boothRentAmount = proposal?.boothRentAmount ?? defaults.booth_rent_amount;
  const boothRentFrequency = proposal?.boothRentFrequency ?? defaults.booth_rent_frequency ?? "weekly";
  if (!boothRentAmount || boothRentAmount <= 0) {
    throw new ShopTeamInviteServiceError("Booth rent requires a positive fixed amount.", 400);
  }
  return {
    routing_model: routingModel,
    barber_percent: null,
    shop_percent: null,
    booth_rent_amount: boothRentAmount,
    booth_rent_frequency: boothRentFrequency,
    commission_cap_amount: null,
    commission_cap_frequency: null
  };
}

function isRejectedOrSuspendedStatus(value?: string | null) {
  const normalized = normalize(value);
  return ["rejected", "suspended", "banned", "deactivated", "removed"].includes(normalized);
}

function isApprovedStatus(value?: string | null) {
  return ["approved", "active", "verified"].includes(normalize(value));
}

function isIndependentShopReference(value?: string | null) {
  return Boolean(value?.toLowerCase().startsWith("independent-barber-"));
}

function getMembershipCandidateShopId(row: StaffLocationRow, locationsById: Map<string, LocationRow>) {
  if (row.shop_id && !isIndependentShopReference(row.shop_id)) {
    return row.shop_id;
  }

  const locationReference = row.location_id ? locationsById.get(row.location_id)?.reference_code : null;
  return locationReference && !isIndependentShopReference(locationReference) ? locationReference : null;
}

async function filterRealShopMemberships(supabase: SupabaseClient, rows: StaffLocationRow[]) {
  const activeRows = rows.filter((row) => row.relationship_status === "active" && !row.ended_at);
  if (!activeRows.length) {
    return [];
  }

  const locationIds = [...new Set(activeRows.map((row) => row.location_id).filter((value): value is string => Boolean(value)))];
  const locationsResult = locationIds.length
    ? await supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", locationIds)
    : { data: [], error: null };

  if (locationsResult.error) {
    throw new ShopTeamInviteServiceError("Unable to check active shop relationship.", 500);
  }

  const locationsById = new Map(((locationsResult.data ?? []) as LocationRow[]).map((location) => [location.id, location]));
  const candidateShopIds = [...new Set(activeRows.map((row) => getMembershipCandidateShopId(row, locationsById)).filter((value): value is string => Boolean(value)))];
  if (!candidateShopIds.length) {
    return [];
  }

  const shopsResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .in("id", candidateShopIds);

  if (shopsResult.error) {
    throw new ShopTeamInviteServiceError("Unable to check active shop relationship.", 500);
  }

  const approvedShopIds = new Set(((shopsResult.data ?? []) as ShopRow[])
    .filter((shop) => isApprovedStatus(shop.app_approval_status) && !isIndependentShopReference(shop.id))
    .map((shop) => shop.id));

  return activeRows.filter((row) => {
    const candidateShopId = getMembershipCandidateShopId(row, locationsById);
    return Boolean(candidateShopId && approvedShopIds.has(candidateShopId));
  });
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string | null; message?: string | null };
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find the table");
}

function buildBarberReadinessLabels(input: {
  appApprovalStatus?: string | null;
  visibilityState?: string | null;
  acceptsInstantBookings: boolean;
  hasService: boolean;
  hasAvailability: boolean;
  alreadyAssigned: boolean;
  inviteStatus: ShopTeamInviteStatus | null;
}) {
  const approved = isApprovedStatus(input.appApprovalStatus);
  const publicProfile = input.visibilityState === "public" || input.visibilityState === "featured";
  const bookable = approved && publicProfile && input.acceptsInstantBookings && input.hasService && input.hasAvailability;
  return [
    approved ? "Approved" : "Not approved",
    bookable ? "Bookable" : "Setup incomplete",
    input.alreadyAssigned ? "Already on team" : input.inviteStatus === "invited" || input.inviteStatus === "requested" ? "Relationship pending" : null
  ].filter((label): label is string => Boolean(label));
}

function buildShopReadinessLabels(input: {
  approvalStatus?: string | null;
  alreadyAssigned: boolean;
  inviteStatus: ShopTeamInviteStatus | null;
  hasTeam: boolean;
}) {
  const approved = isApprovedStatus(input.approvalStatus);
  const live = approved && input.hasTeam;
  return [
    approved ? "Approved shop" : "Not accepting requests yet",
    live ? "Live shop" : "Setup incomplete",
    input.alreadyAssigned ? "Already connected" : input.inviteStatus === "invited" || input.inviteStatus === "requested" ? "Request pending" : null
  ].filter((label): label is string => Boolean(label));
}

async function readOwnerShopScopes(user: UserAccount, supabase: SupabaseClient) {
  requireOwner(user);
  const identifiers = [...new Set([user.ownedShopId, ...user.locationIds].filter((value): value is string => Boolean(value)))];
  const shopResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .or(`owner_profile_id.eq.${user.id}${user.ownedShopId ? `,id.eq.${user.ownedShopId}` : ""}`);

  if (shopResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the owner's shop scope.", 500);
  }

  const shops = (shopResult.data ?? []) as ShopRow[];
  const shopIds = new Set(shops.map((shop) => shop.id));
  const allIdentifiers = [...new Set([...identifiers, ...shopIds])];
  const uuidValues = allIdentifiers.filter(isUuid);
  const referenceValues = allIdentifiers.filter((value) => !isUuid(value));
  const [uuidResult, referenceResult, shopReferenceResult] = await Promise.all([
    uuidValues.length
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", uuidValues)
      : Promise.resolve({ data: [], error: null }),
    referenceValues.length
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("reference_code", referenceValues)
      : Promise.resolve({ data: [], error: null }),
    shopIds.size
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("reference_code", [...shopIds])
      : Promise.resolve({ data: [], error: null })
  ]);

  if (uuidResult.error || referenceResult.error || shopReferenceResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the owner's shop scope.", 500);
  }

  const byId = new Map<string, LocationRow>();
  for (const location of [...(uuidResult.data ?? []), ...(referenceResult.data ?? []), ...(shopReferenceResult.data ?? [])] as LocationRow[]) {
    byId.set(location.id, location);
  }

  const locations = [...byId.values()];
  const locationByReference = new Map(locations.map((location) => [location.reference_code ?? location.id, location]));
  const scopes = shops.map((shop) => mapShopScope(shop, locationByReference.get(shop.id) ?? null));
  const scopedLocationIds = new Set(scopes.map((scope) => scope.locationBridgeId).filter(Boolean));
  const legacyLocationScopes = locations
    .filter((location) => !scopedLocationIds.has(location.id))
    .map(mapLocationScope);

  return [...scopes, ...legacyLocationScopes];
}

async function readShopScopesByIds(supabase: SupabaseClient, shopIds: string[]) {
  const ids = [...new Set(shopIds.filter(Boolean))];
  if (!ids.length) {
    return new Map<string, ShopScope>();
  }

  const uuidIds = ids.filter(isUuid);

  const [shopsResult, locationsByIdResult, locationsByReferenceResult] = await Promise.all([
    supabase.from("shops").select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status").in("id", ids),
    uuidIds.length
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", uuidIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("reference_code", ids)
  ]);

  if (shopsResult.error || locationsByIdResult.error || locationsByReferenceResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop scope.", 500);
  }

  const locations = [...((locationsByIdResult.data ?? []) as LocationRow[]), ...((locationsByReferenceResult.data ?? []) as LocationRow[])];
  const locationsByReference = new Map(locations.map((location) => [location.reference_code ?? location.id, location]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const scopes = new Map<string, ShopScope>();

  for (const shop of (shopsResult.data ?? []) as ShopRow[]) {
    scopes.set(shop.id, mapShopScope(shop, locationsByReference.get(shop.id) ?? null));
  }

  for (const id of ids) {
    if (!scopes.has(id)) {
      const location = locationsById.get(id);
      if (location) {
        scopes.set(id, mapLocationScope(location));
      }
    }
  }

  return scopes;
}

async function resolveBarber(supabase: SupabaseClient, barberIdOrReference: string, profileId?: string | null) {
  const referenceResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, app_approval_status, shop_approval_status, barber_subtype")
    .eq("reference_code", barberIdOrReference)
    .maybeSingle();

  if (referenceResult.error) {
    throw new ShopTeamInviteServiceError("Unable to resolve the barber account.", 500);
  }

  if (referenceResult.data) {
    return referenceResult.data as BarberRow;
  }

  if (!isUuid(barberIdOrReference)) {
    if (!profileId) {
      return null;
    }

    const profileResult = await supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, app_approval_status, shop_approval_status, barber_subtype")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (profileResult.error) {
      throw new ShopTeamInviteServiceError("Unable to resolve the barber account.", 500);
    }

    return (profileResult.data as BarberRow | null) ?? null;
  }

  const uuidResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, app_approval_status, shop_approval_status, barber_subtype")
    .eq("id", barberIdOrReference)
    .maybeSingle();

  if (uuidResult.error) {
    throw new ShopTeamInviteServiceError("Unable to resolve the barber account.", 500);
  }

  if (uuidResult.data) {
    return uuidResult.data as BarberRow;
  }

  if (!profileId) {
    return null;
  }

  const profileResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, app_approval_status, shop_approval_status, barber_subtype")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to resolve the barber account.", 500);
  }

  return (profileResult.data as BarberRow | null) ?? null;
}

function mapInvite(row: InviteRow, shopsById: Map<string, ShopScope>, profilesById: Map<string, ProfileRow>, barber: BarberRow): ShopTeamInviteView {
  const shop = shopsById.get(row.shop_id);
  const profile = profilesById.get(row.barber_profile_id);
  const status = normalizeInviteStatus(row);
  const operatingModel = row.routing_model ?? getBarberDefaultRoutingModel(barber);

  return {
    id: row.id,
    shopId: shop?.id ?? row.shop_id,
    shopLabel: shop?.label ?? row.shop_id,
    barberId: toReference(barber),
    barberName: profile?.full_name ?? profile?.email ?? toReference(barber),
    barberEmail: profile?.email ?? "",
    status,
    source: row.requested_by_profile_id ? "barber_request" : "owner_invite",
    message: row.message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    operatingModel,
    boothRentAmount: numericOrNull(row.booth_rent_amount),
    boothRentFrequency: row.booth_rent_frequency ?? null,
    barberPercent: numericOrNull(row.barber_percent),
    shopPercent: numericOrNull(row.shop_percent),
    commissionCapAmount: numericOrNull(row.commission_cap_amount),
    commissionCapFrequency: row.commission_cap_frequency ?? null
  };
}

async function readActiveMembership(supabase: SupabaseClient, profileId: string) {
  const result = await supabase
    .from("staff_locations")
    .select(membershipSelectColumns)
    .eq("profile_id", profileId)
    .eq("relationship_status", "active")
    .is("ended_at", null);

  if (result.error) {
    throw new ShopTeamInviteServiceError("Unable to check active shop relationship.", 500);
  }

  const realMemberships = await filterRealShopMemberships(supabase, (result.data ?? []) as StaffLocationRow[]);
  return realMemberships[0] ?? null;
}

async function assertNoActiveMembership(supabase: SupabaseClient, profileId: string, message: string) {
  const activeMembership = await readActiveMembership(supabase, profileId);
  if (activeMembership) {
    throw new ShopTeamInviteServiceError(message, 409);
  }

  const activeInvite = await supabase
    .from("shop_team_invites")
    .select("id")
    .eq("barber_profile_id", profileId)
    .in("status", activeInviteStatuses)
    .limit(1);

  if (activeInvite.error && !isMissingRelationError(activeInvite.error)) {
    throw new ShopTeamInviteServiceError("Unable to check active shop relationship.", 500);
  }

  if ((activeInvite.data ?? []).length) {
    throw new ShopTeamInviteServiceError(message, 409);
  }
}

async function activatePendingRelationshipAgreement(
  supabase: SupabaseClient,
  inviteId: string,
  actorProfileId: string,
  actorRole: "owner" | "barber"
) {
  const activationResult = await supabase.rpc("activate_shop_barber_relationship_internal", {
    p_invite_id: inviteId,
    p_actor_profile_id: actorProfileId,
    p_actor_role: actorRole
  });

  if (activationResult.error) {
    const message = activationResult.error.message || "Unable to activate the shop agreement.";
    const status = activationResult.error.code === "42501"
      ? 403
      : activationResult.error.code === "23505" || activationResult.error.code === "23514"
        ? 409
        : 500;
    throw new ShopTeamInviteServiceError(message, status);
  }

  const updatedInviteResult = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("id", inviteId)
    .single();

  if (updatedInviteResult.error || !updatedInviteResult.data) {
    throw new ShopTeamInviteServiceError("The agreement activated, but its updated invitation could not be loaded.", 500);
  }

  return updatedInviteResult.data as InviteRow;
}

export async function listOwnerTeamInviteDirectory(user: UserAccount, search?: string): Promise<ShopTeamInviteDirectoryPayload> {
  const supabase = getSupabaseOrThrow();
  const shops = await readOwnerShopScopes(user, supabase);
  const shop = shops[0];
  if (!shop) {
    throw new ShopTeamInviteServiceError("No owner shop is available for team invitations.", 404);
  }

  const barbersResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, app_approval_status, shop_approval_status, barber_subtype")
    .order("created_at", { ascending: false })
    .limit(200);

  if (barbersResult.error) {
    throw new ShopTeamInviteServiceError("Unable to search barber accounts.", 500);
  }

  const barbers = (barbersResult.data ?? []) as BarberRow[];
  const visibleBarbers = barbers.filter((barber) =>
    !isRejectedOrSuspendedStatus(barber.app_approval_status)
    && !isRejectedOrSuspendedStatus(barber.shop_approval_status)
  );
  const profileIds = [...new Set(visibleBarbers.map((barber) => barber.profile_id))];
  const barberReferences = barbers.map(toReference);
  const barberIds = visibleBarbers.map((barber) => barber.id);
  const [profilesResult, barberProfilesResult, visibilityResult, membershipsResult, invitesResult, activeTeamInvitesResult, marketplaceServicesResult, servicesResult, availabilityResult] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    barberReferences.length
      ? supabase.from("barber_profiles").select("barber_reference, username, display_name, service_area_label").in("barber_reference", barberReferences)
      : Promise.resolve({ data: [], error: null }),
    barberReferences.length
      ? supabase.from("marketplace_visibility").select("barber_reference, visibility_state, accepts_instant_bookings").in("barber_reference", barberReferences)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("staff_locations").select(membershipSelectColumns).eq("relationship_status", "active").is("ended_at", null).in("profile_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length && shop.locationBridgeId
      ? supabase.from("shop_team_invites").select(inviteSelectColumns).eq("shop_id", shop.locationBridgeId).in("barber_id", barberIds)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length
      ? supabase.from("shop_team_invites").select(inviteSelectColumns).in("status", activeInviteStatuses).in("barber_id", barberIds)
      : Promise.resolve({ data: [], error: null }),
    barberReferences.length
      ? supabase.from("marketplace_services").select("barber_reference, price, duration_min, name").in("barber_reference", barberReferences)
      : Promise.resolve({ data: [], error: null }),
    barberReferences.length
      ? supabase.from("services").select("barber_reference, price, duration_min, name, active").in("barber_reference", barberReferences).eq("active", true)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length
      ? supabase.from("availability_rules").select("barber_id").in("barber_id", barberIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  for (const result of [profilesResult, barberProfilesResult, visibilityResult, membershipsResult, invitesResult, activeTeamInvitesResult, marketplaceServicesResult, servicesResult, availabilityResult]) {
    if (result.error) {
      if ((result === invitesResult || result === activeTeamInvitesResult) && isMissingRelationError(result.error)) {
        continue;
      }
      throw new ShopTeamInviteServiceError("Unable to load barber invitation details.", 500);
    }
  }

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const barberProfilesByReference = new Map(((barberProfilesResult.data ?? []) as BarberProfileRow[]).map((profile) => [profile.barber_reference, profile]));
  const visibilityByReference = new Map(((visibilityResult.data ?? []) as MarketplaceVisibilityRow[]).map((visibility) => [visibility.barber_reference, visibility]));
  const realShopMemberships = await filterRealShopMemberships(supabase, (membershipsResult.data ?? []) as StaffLocationRow[]);
  const assignedProfileIds = new Set(realShopMemberships.map((row) => row.profile_id));
  for (const invite of (activeTeamInvitesResult.data ?? []) as InviteRow[]) {
    if (!isIndependentShopReference(invite.shop_id)) {
      assignedProfileIds.add(invite.barber_profile_id);
    }
  }
  const independentProfileIds = new Set(((membershipsResult.data ?? []) as StaffLocationRow[])
    .filter((row) => !assignedProfileIds.has(row.profile_id) && row.relationship_status === "active" && !row.ended_at)
    .map((row) => row.profile_id));
  const serviceReferences = new Set(
    ([...((marketplaceServicesResult.data ?? []) as Array<{ barber_reference: string | null; price: number | string | null; duration_min: number | null; name: string | null }>), ...((servicesResult.data ?? []) as Array<{ barber_reference: string | null; price: number | string | null; duration_min: number | null; name: string | null }>)])
      .filter((service) => service.barber_reference && Number(service.price ?? 0) > 0 && Number(service.duration_min ?? 0) >= 15 && Boolean(service.name?.trim()))
      .map((service) => service.barber_reference as string)
  );
  const availableBarberIds = new Set(((availabilityResult.data ?? []) as Array<{ barber_id: string }>).map((row) => row.barber_id));
  const invitesByBarberId = new Map(
    ((invitesResult.data ?? []) as InviteRow[])
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((invite) => [invite.barber_id, invite])
  );
  const query = normalize(search);

  const directory = visibleBarbers
    .flatMap((barber): ShopTeamInviteDirectoryBarber[] => {
      const profile = profilesById.get(barber.profile_id);
      if (!profile || profile.primary_onboarding_role !== "barber") {
        return [];
      }

      const reference = toReference(barber);
      const barberProfile = barberProfilesByReference.get(reference);
      const visibility = visibilityByReference.get(reference);
      const invite = invitesByBarberId.get(barber.id);
      const inviteStatus = invite ? normalizeInviteStatus(invite) : null;
      const alreadyAssigned = assignedProfileIds.has(barber.profile_id);
      const hasIndependentChair = independentProfileIds.has(barber.profile_id);
      const readinessLabels = buildBarberReadinessLabels({
        appApprovalStatus: barber.app_approval_status,
        visibilityState: visibility?.visibility_state,
        acceptsInstantBookings: visibility?.accepts_instant_bookings ?? false,
        hasService: serviceReferences.has(reference),
        hasAvailability: availableBarberIds.has(barber.id),
        alreadyAssigned,
        inviteStatus: alreadyAssigned ? "active" : inviteStatus
      });
      const displayReadinessLabels = hasIndependentChair && !alreadyAssigned
        ? [...readinessLabels, "Independent location"]
        : readinessLabels;
      const bookable = readinessLabels.includes("Bookable");
      const name = profile.full_name ?? barberProfile?.display_name ?? profile.email ?? reference;
      const canInvite = isApprovedStatus(barber.app_approval_status) && !alreadyAssigned && inviteStatus !== "invited" && inviteStatus !== "requested";
      const inviteDisabledReason = alreadyAssigned
        ? "This barber is already connected to another shop."
        : !isApprovedStatus(barber.app_approval_status)
          ? "This barber is not approved for team invites yet."
          : inviteStatus === "invited" || inviteStatus === "requested"
            ? "A team request is already pending."
            : null;
      const searchText = [
        name,
        profile.email,
        profile.phone,
        barberProfile?.username,
        reference,
        barber.id,
        barberProfile?.service_area_label,
        barber.compensation_model,
        barber.app_approval_status,
        barber.shop_approval_status
      ].map((value) => normalize(value)).join(" ");

      if (query && !searchText.includes(query)) {
        return [];
      }

      return [{
        inviteId: invite?.id ?? null,
        barberId: barber.id,
        barberReference: reference,
        profileId: barber.profile_id,
        name,
        email: profile.email ?? "",
        username: barberProfile?.username ?? null,
        serviceAreaLabel: barberProfile?.service_area_label ?? null,
        compensationModel: barber.compensation_model,
        appApprovalStatus: barber.app_approval_status ?? "pending",
        shopApprovalStatus: barber.shop_approval_status ?? "pending",
        visibilityState: visibility?.visibility_state ?? null,
        acceptsInstantBookings: visibility?.accepts_instant_bookings ?? false,
        alreadyAssigned,
        inviteStatus: alreadyAssigned ? "active" : inviteStatus,
        marketplaceStatusLabel: bookable ? "Bookable" : "Not bookable",
        readinessLabels: displayReadinessLabels,
        canInvite,
        inviteDisabledReason
      }];
    })
    .sort((left, right) => Number(right.canInvite) - Number(left.canInvite) || left.name.localeCompare(right.name))
    .slice(0, 80);

  return {
    shop: {
      id: shop.id,
      label: shop.label,
      setupNote: shop.setupNote
    },
    barbers: directory
  };
}

export async function createOwnerTeamInvite(user: UserAccount, input: {
  barberId: string;
  shopId?: string;
  message?: string | null;
  proposal?: ShopRelationshipProposal;
}): Promise<ShopTeamInviteView> {
  const supabase = getSupabaseOrThrow();
  const shops = await readOwnerShopScopes(user, supabase);
  const requestedShop = input.shopId
    ? shops.find((shop) => shop.id === input.shopId || shop.locationBridgeId === input.shopId || shop.locationReference === input.shopId)
    : shops[0];
  if (!requestedShop) {
    throw new ShopTeamInviteServiceError("This shop is outside the owner invite scope.", 403);
  }
  if (!requestedShop.locationBridgeId) {
    throw new ShopTeamInviteServiceError("Link the shop location before sending a money agreement.", 409);
  }

  const ownerAuthorityResult = await supabase
    .from("shops")
    .select("owner_profile_id")
    .eq("id", requestedShop.id)
    .maybeSingle();
  if (ownerAuthorityResult.error) {
    throw new ShopTeamInviteServiceError("Unable to verify shop owner authority.", 500);
  }
  if (ownerAuthorityResult.data?.owner_profile_id !== user.id) {
    throw new ShopTeamInviteServiceError("Only the shop owner can propose booth-rent terms.", 403);
  }

  const barber = await resolveBarber(supabase, input.barberId);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  await assertNoActiveMembership(
    supabase,
    barber.profile_id,
    "This barber is already connected to a shop. They must leave or be released before joining another team."
  );

  const existing = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("shop_id", requestedShop.locationBridgeId)
    .eq("barber_id", barber.id)
    .in("status", pendingInviteStatuses)
    .maybeSingle();

  if (existing.error) {
    throw new ShopTeamInviteServiceError("Unable to check existing invitations.", 500);
  }

  const row = existing.data as InviteRow | null;
  let invite = row;
  if (!invite) {
    const now = new Date().toISOString();
    const insertResult = await supabase
      .from("shop_team_invites")
      .insert({
        shop_id: requestedShop.locationBridgeId,
        barber_id: barber.id,
        barber_profile_id: barber.profile_id,
        invited_by_profile_id: user.id,
        requested_by_profile_id: null,
        status: "invited",
        approved_by_owner_at: now,
        ...getProposedRelationshipTerms(barber, input.proposal),
        message: input.message?.trim() || null
      })
      .select(inviteSelectColumns)
      .single();

    if (insertResult.error) {
      throw new ShopTeamInviteServiceError("Unable to create the barber invitation.", 500);
    }

    invite = insertResult.data as InviteRow | null;
  }

  if (!invite) {
    throw new ShopTeamInviteServiceError("Unable to create the barber invitation.", 500);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, primary_onboarding_role")
    .eq("id", barber.profile_id)
    .maybeSingle();

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load invited barber profile.", 500);
  }

  const profile = profileResult.data as ProfileRow | null;
  return mapInvite(
    invite,
    new Map([[invite.shop_id, requestedShop]]),
    profile ? new Map([[barber.profile_id, profile]]) : new Map(),
    barber
  );
}

export async function listBarberJoinableShops(user: UserAccount, search?: string): Promise<{ shops: BarberJoinableShopView[] }> {
  requireBarber(user);
  const supabase = getSupabaseOrThrow();
  const barber = await resolveBarber(supabase, user.barberId!, user.id);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }
  const activeMembership = await readActiveMembership(supabase, barber.profile_id);

  const shopsResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .order("name", { ascending: true })
    .limit(200);

  if (shopsResult.error) {
    throw new ShopTeamInviteServiceError("Unable to search shop accounts.", 500);
  }

  const rawShops = ((shopsResult.data ?? []) as ShopRow[])
    .filter((shop) => !isRejectedOrSuspendedStatus(shop.app_approval_status));
  const ownerIds = [...new Set(rawShops.map((shop) => shop.owner_profile_id).filter((value): value is string => Boolean(value)))];
  const ownerProfilesResult = ownerIds.length
    ? await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, primary_onboarding_role")
      .in("id", ownerIds)
    : { data: [], error: null };

  if (ownerProfilesResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop owners.", 500);
  }

  const ownerProfilesById = new Map(((ownerProfilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const query = normalize(search);
  const shops = rawShops.filter((shop) => {
    if (!query) {
      return true;
    }

    const owner = shop.owner_profile_id ? ownerProfilesById.get(shop.owner_profile_id) : undefined;
    return [
      shop.id,
      shop.name,
      shop.neighborhood,
      shop.city,
      shop.state,
      shop.address,
      shop.app_approval_status,
      owner?.full_name,
      owner?.email,
      owner?.phone
    ]
      .map((value) => normalize(value))
      .join(" ")
      .includes(query);
  });

  const shopIds = shops.map((shop) => shop.id);
  const locationsResult = shopIds.length
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .in("reference_code", shopIds)
    : { data: [], error: null };

  if (locationsResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop locations.", 500);
  }

  const locationsByReference = new Map(((locationsResult.data ?? []) as LocationRow[]).map((location) => [location.reference_code ?? location.id, location]));
  const inviteLocationIds = shops
    .map((shop) => locationsByReference.get(shop.id)?.id)
    .filter((value): value is string => Boolean(value));
  const [membershipsResult, invitesResult, teamResult] = await Promise.all([
    shopIds.length
      ? supabase.from("staff_locations").select(membershipSelectColumns).eq("profile_id", barber.profile_id)
      : Promise.resolve({ data: [], error: null }),
    inviteLocationIds.length
      ? supabase.from("shop_team_invites").select(inviteSelectColumns).eq("barber_id", barber.id).in("shop_id", inviteLocationIds)
      : Promise.resolve({ data: [], error: null }),
    inviteLocationIds.length
      ? supabase.from("shop_team_invites").select("shop_id").in("shop_id", inviteLocationIds).in("status", activeInviteStatuses)
      : Promise.resolve({ data: [], error: null })
  ]);

  for (const result of [membershipsResult, invitesResult, teamResult]) {
    if (result.error) {
      if (result === invitesResult && isMissingRelationError(result.error)) {
        continue;
      }
      throw new ShopTeamInviteServiceError("Unable to load shop request details.", 500);
    }
  }

  const membershipRows = (membershipsResult.data ?? []) as StaffLocationRow[];
  const realShopMemberships = await filterRealShopMemberships(supabase, membershipRows);
  const assignedShopIds = new Set(realShopMemberships.map((row) => row.shop_id ?? row.location_id).filter(Boolean));
  const hasIndependentChair = membershipRows.some((row) => !realShopMemberships.includes(row) && row.relationship_status === "active" && !row.ended_at);
  const teamShopIds = new Set(((teamResult.data ?? []) as Array<{ shop_id: string }>).map((row) => row.shop_id));
  const invitesByShopId = new Map(
    ((invitesResult.data ?? []) as InviteRow[])
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((invite) => [invite.shop_id, invite])
  );

  return {
    shops: shops.flatMap((shop): BarberJoinableShopView[] => {
      const location = locationsByReference.get(shop.id);
      const invite = invitesByShopId.get(location?.id ?? shop.id);
      const inviteStatus = invite ? normalizeInviteStatus(invite) : null;
      const alreadyAssigned = assignedShopIds.has(shop.id) || Boolean(location && assignedShopIds.has(location.id));
      const activeMembershipShopId = activeMembership?.shop_id ?? activeMembership?.location_id ?? null;
      const activeElsewhere = Boolean(activeMembershipShopId && activeMembershipShopId !== shop.id && activeMembershipShopId !== location?.id);
      const readinessLabels = buildShopReadinessLabels({
        approvalStatus: shop.app_approval_status,
        alreadyAssigned: alreadyAssigned || activeElsewhere,
        inviteStatus: alreadyAssigned ? "active" : inviteStatus,
        hasTeam: teamShopIds.has(location?.id ?? shop.id)
      });
      const labels = activeElsewhere
        ? [...readinessLabels, "Leave current shop first"]
        : location
          ? hasIndependentChair && !alreadyAssigned ? [...readinessLabels, "Freelance chair active"] : readinessLabels
          : [...readinessLabels, hasIndependentChair && !alreadyAssigned ? "Freelance chair active" : "Shop location bridge missing"];

      return [{
        shopId: shop.id,
        shopReference: shop.id,
        shopLabel: location ? formatLocationLabel(location) : [shop.name, shop.city, shop.state].filter(Boolean).join(" | "),
        city: shop.city || location?.city || null,
        state: shop.state || location?.state || null,
        approvalStatus: shop.app_approval_status ?? "pending",
        liveStatusLabel: labels.includes("Live shop") ? "Live shop" : "Not live yet",
        alreadyAssigned: alreadyAssigned || activeElsewhere,
        inviteStatus: alreadyAssigned ? "active" : inviteStatus,
        canRequest: Boolean(isApprovedStatus(shop.app_approval_status) && !alreadyAssigned && !activeElsewhere && inviteStatus !== "invited" && inviteStatus !== "requested"),
        readinessLabels: labels
      }];
    }).slice(0, 80)
  };
}

export async function createBarberShopJoinRequest(user: UserAccount, input: { shopId: string; message?: string | null }): Promise<ShopTeamInviteView> {
  requireBarber(user);
  const supabase = getSupabaseOrThrow();
  const barber = await resolveBarber(supabase, user.barberId!, user.id);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  const shopResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .eq("id", input.shopId)
    .maybeSingle();

  if (shopResult.error) {
    throw new ShopTeamInviteServiceError("Unable to verify the shop approval state.", 500);
  }

  const shop = shopResult.data as ShopRow | null;
  if (!shop || !isApprovedStatus(shop.app_approval_status)) {
    throw new ShopTeamInviteServiceError("This shop is not accepting team requests yet.", 409);
  }

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state")
    .eq("reference_code", shop.id)
    .maybeSingle();

  if (locationResult.error) {
    throw new ShopTeamInviteServiceError("Unable to resolve the shop location bridge.", 500);
  }

  const shopScope = mapShopScope(shop, (locationResult.data as LocationRow | null) ?? null);
  if (!shopScope.locationBridgeId) {
    throw new ShopTeamInviteServiceError("This shop must link its location before receiving money agreements.", 409);
  }

  await assertNoActiveMembership(
    supabase,
    barber.profile_id,
    "You are currently connected to a shop. Leave this shop before requesting to join another team."
  );

  const existing = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("shop_id", shopScope.locationBridgeId)
    .eq("barber_id", barber.id)
    .in("status", pendingInviteStatuses)
    .maybeSingle();

  if (existing.error) {
    throw new ShopTeamInviteServiceError("Unable to check existing shop requests.", 500);
  }

  let invite = existing.data as InviteRow | null;
  if (!invite) {
    const now = new Date().toISOString();
    const insertResult = await supabase
      .from("shop_team_invites")
      .insert({
        shop_id: shopScope.locationBridgeId,
        barber_id: barber.id,
        barber_profile_id: barber.profile_id,
        invited_by_profile_id: null,
        requested_by_profile_id: user.id,
        status: "requested",
        approved_by_barber_at: now,
        ...getProposedRelationshipTerms(barber),
        message: input.message?.trim() || "Barber requested to join this shop."
      })
      .select(inviteSelectColumns)
      .single();

    if (insertResult.error) {
      throw new ShopTeamInviteServiceError("Unable to send the shop join request.", 500);
    }

    invite = insertResult.data as InviteRow | null;
  }

  if (!invite) {
    throw new ShopTeamInviteServiceError("Unable to send the shop join request.", 500);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, primary_onboarding_role")
    .eq("id", barber.profile_id)
    .maybeSingle();

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load barber profile.", 500);
  }

  return mapInvite(
    invite,
    new Map([[invite.shop_id, shopScope]]),
    profileResult.data ? new Map([[barber.profile_id, profileResult.data as ProfileRow]]) : new Map(),
    barber
  );
}

export async function listBarberTeamInvites(user: UserAccount): Promise<{ invites: ShopTeamInviteView[] }> {
  requireBarber(user);
  const supabase = getSupabaseOrThrow();
  const barber = await resolveBarber(supabase, user.barberId!, user.id);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  const invitesResult = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("barber_id", barber.id)
    .in("status", pendingInviteStatuses)
    .order("created_at", { ascending: false })
    .limit(12);

  if (invitesResult.error) {
    if (isMissingRelationError(invitesResult.error)) {
      return { invites: [] };
    }
    throw new ShopTeamInviteServiceError("Unable to load shop invitations.", 500);
  }

  const invites = (invitesResult.data ?? []) as InviteRow[];
  const [shopsById, profileResult] = await Promise.all([
    readShopScopesByIds(supabase, invites.map((invite) => invite.shop_id)),
    supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").eq("id", barber.profile_id).maybeSingle()
  ]);

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop invitations.", 500);
  }

  const profile = profileResult.data as ProfileRow | null;
  const profilesById = profile ? new Map([[barber.profile_id, profile]]) : new Map();

  return {
    invites: invites.map((invite) => mapInvite(invite, shopsById, profilesById, barber))
  };
}

export async function respondToBarberTeamInvite(user: UserAccount, input: { inviteId: string; status: "accepted" | "declined" }): Promise<{ invite: ShopTeamInviteView }> {
  requireBarber(user);
  const supabase = getSupabaseOrThrow();
  const barber = await resolveBarber(supabase, user.barberId!, user.id);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  const inviteResult = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("id", input.inviteId)
    .eq("barber_id", barber.id)
    .maybeSingle();

  if (inviteResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the shop invitation.", 500);
  }

  const invite = inviteResult.data as InviteRow | null;
  if (!invite) {
    throw new ShopTeamInviteServiceError("Shop invitation not found.", 404);
  }

  const inviteStatus = normalizeInviteStatus(invite);
  if (inviteStatus !== "invited") {
    throw new ShopTeamInviteServiceError("This invitation has already been handled.", 409);
  }

  const now = new Date().toISOString();
  let updatedInvite: InviteRow;
  if (input.status === "accepted") {
    updatedInvite = await activatePendingRelationshipAgreement(supabase, invite.id, user.id, "barber");
  } else {
    const updateResult = await supabase
      .from("shop_team_invites")
      .update({
        status: "declined",
        responded_at: now,
        declined_at: now,
        updated_at: now
      })
      .eq("id", invite.id)
      .select(inviteSelectColumns)
      .single();

    if (updateResult.error || !updateResult.data) {
      throw new ShopTeamInviteServiceError("Unable to update the shop invitation.", 500);
    }
    updatedInvite = updateResult.data as InviteRow;
  }

  const [shopsById, profileResult] = await Promise.all([
    readShopScopesByIds(supabase, [invite.shop_id]),
    supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").eq("id", barber.profile_id).maybeSingle()
  ]);

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate the updated invitation.", 500);
  }

  return {
    invite: mapInvite(
      updatedInvite,
      shopsById,
      profileResult.data ? new Map([[barber.profile_id, profileResult.data as ProfileRow]]) : new Map(),
      barber
    )
  };
}

export async function respondToOwnerJoinRequest(user: UserAccount, input: { inviteId: string; status: "accepted" | "rejected" }): Promise<{ invite: ShopTeamInviteView }> {
  const supabase = getSupabaseOrThrow();
  const shops = await readOwnerShopScopes(user, supabase);
  const shopIds = new Set(shops.flatMap((shop) => [shop.id, shop.locationBridgeId]).filter((value): value is string => Boolean(value)));

  const inviteResult = await supabase
    .from("shop_team_invites")
    .select(inviteSelectColumns)
    .eq("id", input.inviteId)
    .maybeSingle();

  if (inviteResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the shop join request.", 500);
  }

  const invite = inviteResult.data as InviteRow | null;
  if (!invite || !shopIds.has(invite.shop_id)) {
    throw new ShopTeamInviteServiceError("Shop join request not found.", 404);
  }

  if (normalizeInviteStatus(invite) !== "requested") {
    throw new ShopTeamInviteServiceError("This shop join request has already been handled.", 409);
  }

  const barber = await resolveBarber(supabase, invite.barber_id, invite.barber_profile_id);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  const now = new Date().toISOString();
  let updatedInvite: InviteRow;
  if (input.status === "accepted") {
    updatedInvite = await activatePendingRelationshipAgreement(supabase, invite.id, user.id, "owner");
  } else {
    const updateResult = await supabase
      .from("shop_team_invites")
      .update({
        status: "rejected",
        responded_at: now,
        rejected_at: now,
        updated_at: now
      })
      .eq("id", invite.id)
      .select(inviteSelectColumns)
      .single();

    if (updateResult.error || !updateResult.data) {
      throw new ShopTeamInviteServiceError("Unable to update the shop join request.", 500);
    }
    updatedInvite = updateResult.data as InviteRow;
  }

  const [hydratedShopsById, profileResult] = await Promise.all([
    readShopScopesByIds(supabase, [invite.shop_id]),
    supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").eq("id", barber.profile_id).maybeSingle()
  ]);

  if (profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate the updated shop join request.", 500);
  }

  return {
    invite: mapInvite(
      updatedInvite,
      hydratedShopsById,
      profileResult.data ? new Map([[barber.profile_id, profileResult.data as ProfileRow]]) : new Map(),
      barber
    )
  };
}

export async function endBarberShopRelationship(user: UserAccount, input: { relationshipId?: string; reason?: string | null; actor: "barber" | "owner" }): Promise<{ relationshipId: string; effectiveRoutingModel: "freelance" }> {
  const supabase = getSupabaseOrThrow();
  let membership: StaffLocationRow | null = null;

  if (input.actor === "barber") {
    requireBarber(user);
    const barber = await resolveBarber(supabase, user.barberId!, user.id);
    if (!barber) {
      throw new ShopTeamInviteServiceError("Barber account not found.", 404);
    }
    membership = await readActiveMembership(supabase, barber.profile_id);
  } else {
    const shops = await readOwnerShopScopes(user, supabase);
    const shopIds = new Set(shops.flatMap((shop) => [shop.id, shop.locationBridgeId]).filter((value): value is string => Boolean(value)));
    if (!input.relationshipId) {
      throw new ShopTeamInviteServiceError("Relationship id is required.", 400);
    }
    const membershipResult = await supabase
      .from("staff_locations")
      .select(membershipSelectColumns)
      .eq("id", input.relationshipId)
      .maybeSingle();
    if (membershipResult.error) {
      throw new ShopTeamInviteServiceError("Unable to load the team relationship.", 500);
    }
    membership = (membershipResult.data as StaffLocationRow | null) ?? null;
    if (!membership || !shopIds.has(membership.shop_id ?? membership.location_id ?? "")) {
      throw new ShopTeamInviteServiceError("Team relationship not found.", 404);
    }
  }

  if (!membership) {
    throw new ShopTeamInviteServiceError("No active shop relationship found.", 404);
  }

  const endResult = await supabase.rpc("end_shop_barber_relationship_internal", {
    p_staff_location_id: membership.id,
    p_actor_profile_id: user.id,
    p_actor_role: input.actor,
    p_reason: input.reason?.trim() || null
  });

  if (endResult.error) {
    const status = endResult.error.code === "42501"
      ? 403
      : endResult.error.code === "23514"
        ? 409
        : 500;
    throw new ShopTeamInviteServiceError(endResult.error.message || "Unable to end the shop relationship.", status);
  }

  return {
    relationshipId: membership.id,
    effectiveRoutingModel: "freelance"
  };
}

export async function updateOwnerTeamRelationship(user: UserAccount, input: {
  relationshipId: string;
  publicTeamVisible?: boolean;
  publicTeamOrder?: number;
  featuredOnShopProfile?: boolean;
}) {
  requireOwner(user);
  const supabase = getSupabaseOrThrow();
  const shops = await readOwnerShopScopes(user, supabase);
  const shopIds = new Set(shops.flatMap((shop) => [shop.id, shop.locationBridgeId]).filter((value): value is string => Boolean(value)));
  const membershipResult = await supabase
    .from("staff_locations")
    .select(membershipSelectColumns)
    .eq("id", input.relationshipId)
    .maybeSingle();

  if (membershipResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the team relationship.", 500);
  }

  const membership = (membershipResult.data as StaffLocationRow | null) ?? null;
  if (!membership || !shopIds.has(membership.shop_id ?? membership.location_id ?? "")) {
    throw new ShopTeamInviteServiceError("Team relationship not found.", 404);
  }

  const now = new Date().toISOString();
  const patch = {
    ...(input.publicTeamVisible !== undefined ? { public_team_visible: input.publicTeamVisible } : {}),
    ...(input.publicTeamOrder !== undefined ? { public_team_order: input.publicTeamOrder } : {}),
    ...(input.featuredOnShopProfile !== undefined ? { featured_on_shop_profile: input.featuredOnShopProfile } : {}),
    updated_at: now
  };

  const updateResult = await supabase
    .from("staff_locations")
    .update(patch)
    .eq("id", membership.id)
    .select(membershipSelectColumns)
    .single();

  if (updateResult.error) {
    throw new ShopTeamInviteServiceError("Unable to update the team relationship.", 500);
  }

  await supabase
    .from("shop_team_invites")
    .update({
      ...patch,
      updated_at: now
    })
    .eq("shop_id", membership.location_id)
    .eq("barber_profile_id", membership.profile_id)
    .in("status", activeInviteStatuses);

  return {
    relationship: updateResult.data as StaffLocationRow
  };
}
