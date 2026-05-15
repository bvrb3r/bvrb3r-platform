import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type ShopTeamInviteStatus = "pending" | "accepted" | "declined" | "canceled" | "removed";

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
  location_id: string;
};

type InviteRow = {
  id: string;
  shop_id: string;
  barber_id: string;
  barber_profile_id: string;
  invited_by_profile_id: string | null;
  status: ShopTeamInviteStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
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

export interface ShopTeamInviteDirectoryBarber {
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
}

export interface ShopTeamInviteDirectoryPayload {
  shop: {
    id: string;
    label: string;
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
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
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

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isRejectedOrSuspendedStatus(value?: string | null) {
  const normalized = normalize(value);
  return ["rejected", "suspended", "banned", "deactivated", "removed"].includes(normalized);
}

function isApprovedStatus(value?: string | null) {
  return ["approved", "active", "verified"].includes(normalize(value));
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
    input.alreadyAssigned ? "Already on team" : input.inviteStatus === "pending" ? "Already invited" : null
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
    input.alreadyAssigned ? "Already connected" : input.inviteStatus === "pending" ? "Request pending" : null
  ].filter((label): label is string => Boolean(label));
}

async function readOwnerLocations(user: UserAccount, supabase: SupabaseClient) {
  requireOwner(user);
  const identifiers = [...new Set([user.ownedShopId, ...user.locationIds].filter((value): value is string => Boolean(value)))];
  const shopIds = new Set<string>();
  const shopResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .or(`owner_profile_id.eq.${user.id}${user.ownedShopId ? `,id.eq.${user.ownedShopId}` : ""}`);

  if (shopResult.error) {
    throw new ShopTeamInviteServiceError("Unable to load the owner's shop scope.", 500);
  }

  for (const shop of (shopResult.data ?? []) as ShopRow[]) {
    shopIds.add(shop.id);
  }

  const allIdentifiers = [...new Set([...identifiers, ...shopIds])];
  if (!allIdentifiers.length) {
    return [];
  }

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

  return [...byId.values()];
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

function mapInvite(row: InviteRow, locationsById: Map<string, LocationRow>, profilesById: Map<string, ProfileRow>, barber: BarberRow): ShopTeamInviteView {
  const location = locationsById.get(row.shop_id);
  const profile = profilesById.get(row.barber_profile_id);

  return {
    id: row.id,
    shopId: location ? toReference(location) : row.shop_id,
    shopLabel: location ? formatLocationLabel(location) : row.shop_id,
    barberId: toReference(barber),
    barberName: profile?.full_name ?? profile?.email ?? toReference(barber),
    barberEmail: profile?.email ?? "",
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    respondedAt: row.responded_at
  };
}

export async function listOwnerTeamInviteDirectory(user: UserAccount, search?: string): Promise<ShopTeamInviteDirectoryPayload> {
  const supabase = getSupabaseOrThrow();
  const locations = await readOwnerLocations(user, supabase);
  const shop = locations[0];
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
  const [profilesResult, barberProfilesResult, visibilityResult, membershipsResult, invitesResult, marketplaceServicesResult, servicesResult, availabilityResult] = await Promise.all([
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
      ? supabase.from("staff_locations").select("id, profile_id, location_id").eq("location_id", shop.id).in("profile_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length
      ? supabase.from("shop_team_invites").select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at").eq("shop_id", shop.id).in("barber_id", barberIds)
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

  for (const result of [profilesResult, barberProfilesResult, visibilityResult, membershipsResult, invitesResult, marketplaceServicesResult, servicesResult, availabilityResult]) {
    if (result.error) {
      if (result === invitesResult && isMissingRelationError(result.error)) {
        continue;
      }
      throw new ShopTeamInviteServiceError("Unable to load barber invitation details.", 500);
    }
  }

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const barberProfilesByReference = new Map(((barberProfilesResult.data ?? []) as BarberProfileRow[]).map((profile) => [profile.barber_reference, profile]));
  const visibilityByReference = new Map(((visibilityResult.data ?? []) as MarketplaceVisibilityRow[]).map((visibility) => [visibility.barber_reference, visibility]));
  const assignedProfileIds = new Set(((membershipsResult.data ?? []) as StaffLocationRow[]).map((row) => row.profile_id));
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
      const alreadyAssigned = assignedProfileIds.has(barber.profile_id);
      const readinessLabels = buildBarberReadinessLabels({
        appApprovalStatus: barber.app_approval_status,
        visibilityState: visibility?.visibility_state,
        acceptsInstantBookings: visibility?.accepts_instant_bookings ?? false,
        hasService: serviceReferences.has(reference),
        hasAvailability: availableBarberIds.has(barber.id),
        alreadyAssigned,
        inviteStatus: alreadyAssigned ? "accepted" : invite?.status ?? null
      });
      const bookable = readinessLabels.includes("Bookable");
      const name = profile.full_name ?? barberProfile?.display_name ?? profile.email ?? reference;
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
        inviteStatus: alreadyAssigned ? "accepted" : invite?.status ?? null,
        marketplaceStatusLabel: bookable ? "Bookable" : "Not bookable",
        readinessLabels,
        canInvite: isApprovedStatus(barber.app_approval_status) && !alreadyAssigned && invite?.status !== "pending"
      }];
    })
    .sort((left, right) => Number(right.canInvite) - Number(left.canInvite) || left.name.localeCompare(right.name))
    .slice(0, 80);

  return {
    shop: {
      id: toReference(shop),
      label: formatLocationLabel(shop)
    },
    barbers: directory
  };
}

export async function createOwnerTeamInvite(user: UserAccount, input: { barberId: string; shopId?: string; message?: string | null }): Promise<ShopTeamInviteView> {
  const supabase = getSupabaseOrThrow();
  const locations = await readOwnerLocations(user, supabase);
  const requestedShop = input.shopId
    ? locations.find((location) => location.id === input.shopId || toReference(location) === input.shopId)
    : locations[0];
  if (!requestedShop) {
    throw new ShopTeamInviteServiceError("This shop is outside the owner invite scope.", 403);
  }

  const barber = await resolveBarber(supabase, input.barberId);
  if (!barber) {
    throw new ShopTeamInviteServiceError("Barber account not found.", 404);
  }

  const membership = await supabase
    .from("staff_locations")
    .select("id, profile_id, location_id")
    .eq("profile_id", barber.profile_id)
    .eq("location_id", requestedShop.id)
    .maybeSingle();

  if (membership.error) {
    throw new ShopTeamInviteServiceError("Unable to check current team membership.", 500);
  }

  if (membership.data) {
    throw new ShopTeamInviteServiceError("This barber is already assigned to the shop.", 409);
  }

  const existing = await supabase
    .from("shop_team_invites")
    .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
    .eq("shop_id", requestedShop.id)
    .eq("barber_id", barber.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing.error) {
    throw new ShopTeamInviteServiceError("Unable to check existing invitations.", 500);
  }

  const row = existing.data as InviteRow | null;
  let invite = row;
  if (!invite) {
    const insertResult = await supabase
      .from("shop_team_invites")
      .insert({
        shop_id: requestedShop.id,
        barber_id: barber.id,
        barber_profile_id: barber.profile_id,
        invited_by_profile_id: user.id,
        status: "pending",
        message: input.message?.trim() || null
      })
      .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
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
    new Map([[requestedShop.id, requestedShop]]),
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

  const shopReferences = shops.map((shop) => shop.id);
  const locationsResult = shopReferences.length
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .in("reference_code", shopReferences)
    : { data: [], error: null };

  if (locationsResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop locations.", 500);
  }

  const locationsByReference = new Map(((locationsResult.data ?? []) as LocationRow[]).map((location) => [location.reference_code ?? location.id, location]));
  const locationIds = [...new Set(((locationsResult.data ?? []) as LocationRow[]).map((location) => location.id))];
  const [membershipsResult, invitesResult, teamResult] = await Promise.all([
    locationIds.length
      ? supabase.from("staff_locations").select("id, profile_id, location_id").eq("profile_id", barber.profile_id).in("location_id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("shop_team_invites").select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at").eq("barber_id", barber.id).in("shop_id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("staff_locations").select("location_id").in("location_id", locationIds)
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

  const assignedLocationIds = new Set(((membershipsResult.data ?? []) as StaffLocationRow[]).map((row) => row.location_id));
  const teamLocationIds = new Set(((teamResult.data ?? []) as Array<{ location_id: string }>).map((row) => row.location_id));
  const invitesByShopId = new Map(
    ((invitesResult.data ?? []) as InviteRow[])
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((invite) => [invite.shop_id, invite])
  );

  return {
    shops: shops.flatMap((shop): BarberJoinableShopView[] => {
      const location = locationsByReference.get(shop.id);
      const invite = location ? invitesByShopId.get(location.id) : undefined;
      const alreadyAssigned = location ? assignedLocationIds.has(location.id) : false;
      const readinessLabels = buildShopReadinessLabels({
        approvalStatus: shop.app_approval_status,
        alreadyAssigned,
        inviteStatus: alreadyAssigned ? "accepted" : invite?.status ?? null,
        hasTeam: location ? teamLocationIds.has(location.id) : false
      });
      const labels = location ? readinessLabels : [...readinessLabels, "Shop location missing"];

      return [{
        shopId: location?.id ?? shop.id,
        shopReference: shop.id,
        shopLabel: location ? formatLocationLabel(location) : [shop.name, shop.city, shop.state].filter(Boolean).join(" | "),
        city: shop.city || location?.city || null,
        state: shop.state || location?.state || null,
        approvalStatus: shop.app_approval_status ?? "pending",
        liveStatusLabel: labels.includes("Live shop") ? "Live shop" : "Not live yet",
        alreadyAssigned,
        inviteStatus: alreadyAssigned ? "accepted" : invite?.status ?? null,
        canRequest: Boolean(location && isApprovedStatus(shop.app_approval_status) && !alreadyAssigned && invite?.status !== "pending"),
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

  const locationQuery = supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state");
  const locationResult = isUuid(input.shopId)
    ? await locationQuery.or(`id.eq.${input.shopId},reference_code.eq.${input.shopId}`).maybeSingle()
    : await locationQuery.eq("reference_code", input.shopId).maybeSingle();

  if (locationResult.error) {
    throw new ShopTeamInviteServiceError("Unable to resolve the shop location.", 500);
  }

  const location = locationResult.data as LocationRow | null;
  if (!location) {
    throw new ShopTeamInviteServiceError("This shop has no service location configured yet.", 409);
  }

  const shopResult = await supabase
    .from("shops")
    .select("id, name, owner_profile_id, neighborhood, city, state, address, app_approval_status")
    .eq("id", location.reference_code ?? input.shopId)
    .maybeSingle();

  if (shopResult.error) {
    throw new ShopTeamInviteServiceError("Unable to verify the shop approval state.", 500);
  }

  const shop = shopResult.data as ShopRow | null;
  if (!shop || !isApprovedStatus(shop.app_approval_status)) {
    throw new ShopTeamInviteServiceError("This shop is not accepting team requests yet.", 409);
  }

  const membership = await supabase
    .from("staff_locations")
    .select("id, profile_id, location_id")
    .eq("profile_id", barber.profile_id)
    .eq("location_id", location.id)
    .maybeSingle();

  if (membership.error) {
    throw new ShopTeamInviteServiceError("Unable to check current team membership.", 500);
  }

  if (membership.data) {
    throw new ShopTeamInviteServiceError("You are already connected to this shop.", 409);
  }

  const existing = await supabase
    .from("shop_team_invites")
    .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
    .eq("shop_id", location.id)
    .eq("barber_id", barber.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing.error) {
    throw new ShopTeamInviteServiceError("Unable to check existing shop requests.", 500);
  }

  let invite = existing.data as InviteRow | null;
  if (!invite) {
    const insertResult = await supabase
      .from("shop_team_invites")
      .insert({
        shop_id: location.id,
        barber_id: barber.id,
        barber_profile_id: barber.profile_id,
        invited_by_profile_id: user.id,
        status: "pending",
        message: input.message?.trim() || "Barber requested to join this shop."
      })
      .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
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
    new Map([[location.id, location]]),
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
    .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
    .eq("barber_id", barber.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(12);

  if (invitesResult.error) {
    if (isMissingRelationError(invitesResult.error)) {
      return { invites: [] };
    }
    throw new ShopTeamInviteServiceError("Unable to load shop invitations.", 500);
  }

  const invites = (invitesResult.data ?? []) as InviteRow[];
  const locationIds = [...new Set(invites.map((invite) => invite.shop_id))];
  const [locationsResult, profileResult] = await Promise.all([
    locationIds.length
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").eq("id", barber.profile_id).maybeSingle()
  ]);

  if (locationsResult.error && isMissingRelationError(locationsResult.error)) {
    return { invites: [] };
  }

  if (locationsResult.error || profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate shop invitations.", 500);
  }

  const locationsById = new Map(((locationsResult.data ?? []) as LocationRow[]).map((location) => [location.id, location]));
  const profile = profileResult.data as ProfileRow | null;
  const profilesById = profile ? new Map([[barber.profile_id, profile]]) : new Map();

  return {
    invites: invites.map((invite) => mapInvite(invite, locationsById, profilesById, barber))
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
    .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
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

  if (invite.status !== "pending") {
    throw new ShopTeamInviteServiceError("This invitation has already been handled.", 409);
  }

  const now = new Date().toISOString();
  if (input.status === "accepted") {
    const routingModel = barber.compensation_model === "booth_rent" ? "booth_rent" : "commission";
    const membershipResult = await supabase
      .from("staff_locations")
      .upsert({
        profile_id: barber.profile_id,
        location_id: invite.shop_id,
        routing_model: routingModel,
        commission_rate: barber.commission_rate,
        booth_rent_amount: barber.booth_rent_amount,
        booth_rent_frequency: barber.booth_rent_frequency,
        updated_at: now,
        fintech_updated_at: now
      }, { onConflict: "profile_id,location_id" });

    if (membershipResult.error) {
      throw new ShopTeamInviteServiceError("Unable to assign the barber to this shop.", 500);
    }
  }

  const updateResult = await supabase
    .from("shop_team_invites")
    .update({
      status: input.status,
      responded_at: now,
      updated_at: now
    })
    .eq("id", invite.id)
    .select("id, shop_id, barber_id, barber_profile_id, invited_by_profile_id, status, message, created_at, updated_at, responded_at")
    .single();

  if (updateResult.error || !updateResult.data) {
    throw new ShopTeamInviteServiceError("Unable to update the shop invitation.", 500);
  }

  const [locationResult, profileResult] = await Promise.all([
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").eq("id", invite.shop_id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, phone, role, primary_onboarding_role").eq("id", barber.profile_id).maybeSingle()
  ]);

  if (locationResult.error || profileResult.error) {
    throw new ShopTeamInviteServiceError("Unable to hydrate the updated invitation.", 500);
  }

  return {
    invite: mapInvite(
      updateResult.data as InviteRow,
      locationResult.data ? new Map([[invite.shop_id, locationResult.data as LocationRow]]) : new Map(),
      profileResult.data ? new Map([[barber.profile_id, profileResult.data as ProfileRow]]) : new Map(),
      barber
    )
  };
}
