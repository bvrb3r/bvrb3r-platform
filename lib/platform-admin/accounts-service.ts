import { assertPlatformAdminAccess, getPlatformAccountStatus, readPlatformAdminAuditLogEntries, readPlatformShopControlState } from "@/lib/platform-admin/service";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { BarberProfileRepairError, ensureBarberProfileForIdentifier, type BarberProfileRepairResult } from "@/lib/barber/profile-repair";
import { getCanonicalMarketplaceEligibility, type MarketplaceBarberEligibilityDiagnostic } from "@/lib/booking/intelligence";
import { syncAllOnboardingBarberServices, syncCheckoutLibraryServicesForBarber } from "@/lib/marketplace/service-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripeConnectEnvironment } from "@/lib/stripe/connect";
import { createEmptyTrustState } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import type { AppointmentStatus, UserAccount } from "@/types/domain";
import type {
  ArchitectAccountDetailPayload,
  ArchitectAccountDirectoryFilters,
  ArchitectAccountDirectoryItem,
  ArchitectAccountDirectoryPayload,
  ArchitectAccountRoleFilter,
  ArchitectAccountStatusFilter,
  ArchitectAccountSummaryCounts,
  ArchitectDashboardPayload,
  ArchitectVerificationDocumentView,
  ArchitectVerificationReviewView,
  PlatformAdminAccountStatus,
  PlatformAdminAuditLogEntry
} from "@/types/platform-admin";

type ProfileRow = {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role: string | null;
  onboarding_state: string | null;
  phone_verified_at?: string | null;
  last_onboarded_at?: string | null;
  created_at?: string | null;
};

type AuthUserRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  app_metadata?: {
    provider?: string | null;
    providers?: unknown;
    role?: string | null;
  } | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    provider?: string | null;
    identity_data?: Record<string, unknown> | null;
  }> | null;
};

type ClientRow = {
  id: string;
  reference_code?: string | null;
  profile_id: string | null;
  loyalty_points?: number | null;
  retention_tag?: string | null;
  created_at?: string | null;
};

type ClientPreferenceRow = {
  client_reference: string;
  client_email?: string | null;
  preferred_location_reference?: string | null;
  preferred_city?: string | null;
  preferred_state?: string | null;
  preferred_postal_code?: string | null;
};

type BarberRow = {
  id: string;
  reference_code?: string | null;
  profile_id: string;
  compensation_model?: string | null;
  barber_subtype?: string | null;
  app_approval_status?: string | null;
  shop_approval_status?: string | null;
  created_at?: string | null;
};

type ShopRow = {
  id: string;
  name: string | null;
  owner_profile_id: string | null;
  app_approval_status?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string | null;
};

type LocationRow = { id: string; reference_code?: string | null; name: string | null; city?: string | null; state?: string | null };
type StaffLocationRow = { profile_id: string; location_id: string };
type BarberShopMembershipRow = { barber_reference: string; shop_reference: string; active: boolean | null };
type BarberProfileRow = { id?: string | null; barber_reference: string; barber_id?: string | null; profile_id?: string | null; user_id?: string | null; username: string | null; display_name?: string | null; shop_reference?: string | null; visibility_state?: string | null; next_available_at?: string | null };
type MarketplaceVisibilityRow = { barber_reference: string; visibility_state: string | null; accepts_instant_bookings: boolean | null };
type BarberStatusRow = { barber_reference: string; shop_reference?: string | null; status?: string | null; accepting_bookings?: boolean | null; next_available_at?: string | null };
type ServiceRow = { id: string; reference_code?: string | null; service_owner_type?: "barber" | "shop" | string | null; barber_reference?: string | null; shop_reference?: string | null; active?: boolean | null; is_bookable?: boolean | null; name?: string | null; price?: number | string | null; duration_min?: number | null };
type MarketplaceServiceRow = { service_reference: string; owner_type?: "barber" | "shop" | string | null; barber_reference?: string | null; shop_reference?: string | null; name?: string | null; price?: number | string | null; duration_min?: number | null };
type AvailabilityRuleRow = { id: string; barber_id: string; location_id?: string | null };
type BarberWorkingHoursRow = { id: string; barber_reference: string; shop_reference?: string | null };
type AppointmentRow = { id: string; barber_id?: string | null; client_id?: string | null; status?: string | null };
type BarberPortfolioRow = { barber_reference: string };
type ShopMediaAssetRow = { shop_reference: string };

type VerificationProfileRow = {
  id: string;
  user_id: string;
  role: string;
  overall_status: string;
  identity_status: string;
  license_status: string;
  business_status: string;
  payout_status: string;
  compliance_status: string;
  public_verified: boolean;
  can_accept_bookings: boolean;
  can_receive_payouts: boolean;
  can_create_shop_listing: boolean;
  current_requirements: unknown;
  review_notes?: string | null;
  last_reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VerificationDocumentRow = {
  id: string;
  verification_profile_id?: string | null;
  user_id?: string | null;
  shop_id?: string | null;
  owner_type?: string | null;
  owner_reference?: string | null;
  category?: string | null;
  document_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  file_size_bytes?: number | null;
  uploaded_at?: string | null;
  expires_at?: string | null;
  status?: string | null;
  review_notes?: string | null;
};

type VerificationReviewRow = {
  id: string;
  verification_profile_id: string;
  review_type: string;
  action_type: string;
  from_status?: string | null;
  to_status?: string | null;
  reviewed_by: string;
  reason?: string | null;
  internal_notes?: string | null;
  created_at: string;
};

type AccountData = {
  authUsers: AuthUserRow[];
  profiles: ProfileRow[];
  clients: ClientRow[];
  clientPreferences: ClientPreferenceRow[];
  barbers: BarberRow[];
  shops: ShopRow[];
  locations: LocationRow[];
  staffLocations: StaffLocationRow[];
  memberships: BarberShopMembershipRow[];
  barberProfiles: BarberProfileRow[];
  marketplaceVisibilities: MarketplaceVisibilityRow[];
  barberStatuses: BarberStatusRow[];
  services: ServiceRow[];
  marketplaceServices: MarketplaceServiceRow[];
  availabilityRules: AvailabilityRuleRow[];
  workingHours: BarberWorkingHoursRow[];
  appointments: AppointmentRow[];
  barberPortfolios: BarberPortfolioRow[];
  shopMediaAssets: ShopMediaAssetRow[];
  verificationProfiles: VerificationProfileRow[];
  verificationDocuments: VerificationDocumentRow[];
  verificationReviews: VerificationReviewRow[];
};

const ACCOUNT_WARNING = "Architect account data is partially unavailable. Live account views are showing true empty states where reads failed.";
const PENDING_REVIEW_STATUSES = new Set(["pending", "submitted", "under_review"]);
const APPROVED_STATUSES = new Set(["approved", "verified"]);
const NEEDS_UPDATE_STATUSES = new Set(["needs_update"]);
const REJECTED_STATUSES = new Set(["rejected"]);

let accountDataOverlay: AccountData | null = null;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type SupabaseAccountReadSource =
  | { client: SupabaseAdminClient; mode: "service_role"; canReadAuthUsers: true }
  | { client: SupabaseServerClient; mode: "authenticated"; canReadAuthUsers: false }
  | { client: null; mode: "unavailable"; canReadAuthUsers: false };

function emptyData(): AccountData {
  return {
    authUsers: [],
    profiles: [],
    clients: [],
    clientPreferences: [],
    barbers: [],
    shops: [],
    locations: [],
    staffLocations: [],
    memberships: [],
    barberProfiles: [],
    marketplaceVisibilities: [],
    barberStatuses: [],
    services: [],
    marketplaceServices: [],
    availabilityRules: [],
    workingHours: [],
    appointments: [],
    barberPortfolios: [],
    shopMediaAssets: [],
    verificationProfiles: [],
    verificationDocuments: [],
    verificationReviews: []
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function getSupabaseReadSource(warnings: string[]): Promise<SupabaseAccountReadSource> {
  if (!isSupabaseEnabled()) {
    warnings.push("Supabase runtime is not configured; Architect cannot read live production accounts.");
    return { client: null, mode: "unavailable", canReadAuthUsers: false };
  }

  const adminClient = createSupabaseAdminClient();
  if (adminClient) {
    return { client: adminClient, mode: "service_role", canReadAuthUsers: true };
  }

  warnings.push("Supabase service-role key is not configured; auth-only identities are unavailable until production env is repaired.");

  try {
    const serverClient = await createSupabaseServerClient();
    if (serverClient) {
      return { client: serverClient, mode: "authenticated", canReadAuthUsers: false };
    }
  } catch (error) {
    console.error("[Architect Accounts] authenticated Supabase fallback could not be created", error);
  }

  warnings.push("Authenticated Supabase fallback could not be created; Architect account reads are unavailable.");
  return { client: null, mode: "unavailable", canReadAuthUsers: false };
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string | null; message?: string | null };
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "42703"
    || candidate.code === "PGRST204"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find");
}

async function safeRows<T>(
  warnings: string[],
  label: string,
  load: () => PromiseLike<{ data: unknown[] | null; error: unknown | null }>
): Promise<T[]> {
  try {
    const result = await load();
    if (result.error) {
      if (!isMissingTableError(result.error)) throw result.error;
      warnings.push(`${label} are not available in this environment.`);
      return [];
    }
    return (result.data ?? []) as T[];
  } catch (error) {
    console.error(`[Architect Accounts] ${label} read failed`, error);
    warnings.push(`${label} could not be read.`);
    return [];
  }
}

function isRealOperationalAuthUser(user: AuthUserRow) {
  const email = `${user.email ?? ""}`.trim().toLowerCase();
  if (!email) return true;
  return !email.endsWith(".demo") && !email.includes("@bvrb3r.demo");
}

async function readAuthUsers(warnings: string[], source: SupabaseAccountReadSource): Promise<AuthUserRow[]> {
  if (!source.client || !source.canReadAuthUsers) {
    return [];
  }

  try {
    const users: AuthUserRow[] = [];
    let scanned = 0;
    let page = 1;
    const perPage = 1000;

    while (page <= 20) {
      const result = await source.client.auth.admin.listUsers({ page, perPage });
      if (result.error) throw result.error;

      const rawBatch = (result.data?.users ?? []) as AuthUserRow[];
      const batch = rawBatch.filter(isRealOperationalAuthUser);
      users.push(...batch);
      scanned += rawBatch.length;

      const total = result.data?.total ?? scanned;
      if (scanned >= total || rawBatch.length < perPage) break;
      page += 1;
    }

    return users;
  } catch (error) {
    console.error("[Architect Accounts] Auth users read failed", error);
    warnings.push("Auth-backed users could not be read; directory is falling back to profile rows.");
    return [];
  }
}

async function readAccountData(warnings: string[]): Promise<AccountData> {
  if (accountDataOverlay) return clone(accountDataOverlay);

  const source = await getSupabaseReadSource(warnings);
  const supabase = source.client;
  if (!supabase) {
    console.error("[Architect Accounts] live account read failed before querying Supabase", {
      mode: source.mode,
      supabaseEnabled: isSupabaseEnabled()
    });
    return emptyData();
  }

  const [
    authUsers,
    profiles,
    clients,
    clientPreferences,
    barbers,
    shops,
    locations,
    staffLocations,
    memberships,
    barberProfiles,
    marketplaceVisibilities,
    barberStatuses,
    services,
    marketplaceServices,
    availabilityRules,
    workingHours,
    appointments,
    barberPortfolios,
    shopMediaAssets,
    verificationProfiles,
    verificationDocuments,
    verificationReviews
  ] = await Promise.all([
    readAuthUsers(warnings, source),
    safeRows<ProfileRow>(warnings, "Profiles", () => supabase.from("profiles").select("id, role, full_name, email, phone, primary_onboarding_role, onboarding_state, phone_verified_at, last_onboarded_at, created_at")),
    safeRows<ClientRow>(warnings, "Clients", () => supabase.from("clients").select("id, reference_code, profile_id, loyalty_points, retention_tag, created_at")),
    safeRows<ClientPreferenceRow>(warnings, "Client preferences", () => supabase.from("client_preferences").select("client_reference, client_email, preferred_location_reference, preferred_city, preferred_state, preferred_postal_code")),
    safeRows<BarberRow>(warnings, "Barbers", () => supabase.from("barbers").select("id, reference_code, profile_id, compensation_model, barber_subtype, app_approval_status, shop_approval_status, created_at")),
    safeRows<ShopRow>(warnings, "Shops", () => supabase.from("shops").select("id, name, owner_profile_id, app_approval_status, neighborhood, city, state, phone, address, created_at")),
    safeRows<LocationRow>(warnings, "Locations", () => supabase.from("locations").select("id, reference_code, name, city, state")),
    safeRows<StaffLocationRow>(warnings, "Staff locations", () => supabase.from("staff_locations").select("profile_id, location_id")),
    safeRows<BarberShopMembershipRow>(warnings, "Shop memberships", () => supabase.from("barber_shop_memberships").select("barber_reference, shop_reference, active")),
    safeRows<BarberProfileRow>(warnings, "Barber profiles", () => supabase.from("barber_profiles").select("barber_reference, username, display_name, shop_reference, visibility_state, next_available_at")),
    safeRows<MarketplaceVisibilityRow>(warnings, "Marketplace visibility rows", () => supabase.from("marketplace_visibility").select("barber_reference, visibility_state, accepts_instant_bookings")),
    safeRows<BarberStatusRow>(warnings, "Barber status rows", () => supabase.from("barber_status").select("barber_reference, shop_reference, status, accepting_bookings, next_available_at")),
    safeRows<ServiceRow>(warnings, "Services", () => supabase.from("services").select("id, reference_code, service_owner_type, barber_reference, shop_reference, active, is_bookable, name, price, duration_min")),
    safeRows<MarketplaceServiceRow>(warnings, "Marketplace services", () => supabase.from("marketplace_services").select("service_reference, owner_type, barber_reference, shop_reference, name, price, duration_min")),
    safeRows<AvailabilityRuleRow>(warnings, "Availability rules", () => supabase.from("availability_rules").select("id, barber_id, location_id")),
    safeRows<BarberWorkingHoursRow>(warnings, "Working hours", () => supabase.from("barber_working_hours").select("id, barber_reference, shop_reference")),
    safeRows<AppointmentRow>(warnings, "Appointments", () => supabase.from("appointments").select("id, barber_id, client_id, status")),
    safeRows<BarberPortfolioRow>(warnings, "Barber portfolios", () => supabase.from("barber_portfolios").select("barber_reference")),
    safeRows<ShopMediaAssetRow>(warnings, "Shop media assets", () => supabase.from("shop_media_assets").select("shop_reference")),
    safeRows<VerificationProfileRow>(warnings, "Verification profiles", () => supabase.from("verification_profiles").select("id, user_id, role, overall_status, identity_status, license_status, business_status, payout_status, compliance_status, public_verified, can_accept_bookings, can_receive_payouts, can_create_shop_listing, current_requirements, review_notes, last_reviewed_at, created_at, updated_at")),
    safeRows<VerificationDocumentRow>(warnings, "Verification documents", () => supabase.from("verification_documents").select("id, verification_profile_id, user_id, shop_id, owner_type, owner_reference, category, document_type, file_name, storage_path, mime_type, content_type, file_size_bytes, uploaded_at, expires_at, status, review_notes")),
    safeRows<VerificationReviewRow>(warnings, "Verification reviews", () => supabase.from("verification_reviews").select("id, verification_profile_id, review_type, action_type, from_status, to_status, reviewed_by, reason, internal_notes, created_at"))
  ]);

  return {
    authUsers,
    profiles,
    clients,
    clientPreferences,
    barbers,
    shops,
    locations,
    staffLocations,
    memberships,
    barberProfiles,
    marketplaceVisibilities,
    barberStatuses,
    services,
    marketplaceServices,
    availabilityRules,
    workingHours,
    appointments,
    barberPortfolios,
    shopMediaAssets,
    verificationProfiles,
    verificationDocuments,
    verificationReviews
  };
}

function dedupeWarnings(warnings: string[]) {
  return Array.from(new Set(warnings.filter((warning) => warning.trim().length > 0)));
}

function byProfileId<T extends { profile_id?: string | null }>(rows: T[]) {
  return new Map(rows.filter((row) => row.profile_id).map((row) => [row.profile_id as string, row]));
}

function stringFromMetadata(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getAuthDisplayName(user?: AuthUserRow) {
  if (!user) return null;
  const metadata = user.user_metadata;
  const direct = stringFromMetadata(metadata, "full_name")
    ?? stringFromMetadata(metadata, "name")
    ?? stringFromMetadata(metadata, "display_name")
    ?? stringFromMetadata(metadata, "username");
  if (direct) return direct;

  const firstName = stringFromMetadata(metadata, "first_name");
  const lastName = stringFromMetadata(metadata, "last_name");
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

function getAuthProviders(user?: AuthUserRow) {
  if (!user) return [];
  const providers = new Set<string>();
  const metadataProviders = user.app_metadata?.providers;
  if (Array.isArray(metadataProviders)) {
    for (const provider of metadataProviders) {
      if (typeof provider === "string" && provider.trim()) providers.add(provider.trim());
    }
  }
  if (user.app_metadata?.provider) providers.add(user.app_metadata.provider);
  for (const identity of user.identities ?? []) {
    if (identity.provider) providers.add(identity.provider);
  }
  return Array.from(providers).sort();
}

function getAuthIdentitySearchValues(user?: AuthUserRow) {
  if (!user) return [];
  const values: string[] = [];
  for (const identity of user.identities ?? []) {
    if (identity.provider) values.push(identity.provider);
    const metadata = identity.identity_data ?? {};
    for (const key of ["email", "phone", "full_name", "name", "display_name", "username", "preferred_username"]) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
  }
  return values;
}

function getAuthPrimaryProvider(user?: AuthUserRow) {
  return getAuthProviders(user)[0];
}

function profileFromAuthUser(user: AuthUserRow): ProfileRow {
  return {
    id: user.id,
    role: user.app_metadata?.role ?? null,
    full_name: getAuthDisplayName(user),
    email: user.email ?? null,
    phone: user.phone ?? null,
    primary_onboarding_role: null,
    onboarding_state: "missing_profile",
    phone_verified_at: user.phone_confirmed_at ?? null,
    last_onboarded_at: user.updated_at ?? null,
    created_at: user.created_at ?? null
  };
}

function profileFromLinkedAccountRows(profileId: string, data: AccountData): ProfileRow | null {
  const client = data.clients.find((row) => row.profile_id === profileId);
  const barber = data.barbers.find((row) => row.profile_id === profileId);
  const shop = data.shops.find((row) => row.owner_profile_id === profileId);
  const verification = data.verificationProfiles.find((row) => row.user_id === profileId);

  if (!client && !barber && !shop && !verification) {
    return null;
  }

  const role = shop
    ? "shop_owner"
    : barber
      ? "barber"
      : verification?.role ?? "client";
  const primary = role === "barber" || role === "shop_owner" || role === "platform_admin"
    ? role
    : role === "client"
      ? "client"
      : null;

  return {
    id: profileId,
    role,
    full_name: shop?.name ?? null,
    email: null,
    phone: shop?.phone ?? null,
    primary_onboarding_role: primary,
    onboarding_state: "missing_profile",
    phone_verified_at: null,
    last_onboarded_at: verification?.updated_at ?? null,
    created_at: barber?.created_at ?? shop?.created_at ?? client?.created_at ?? verification?.created_at ?? null
  };
}

function barberReference(row?: BarberRow | null) {
  return row?.reference_code ?? row?.id ?? "";
}

function normalizeRole(profile: ProfileRow, data: AccountData): ArchitectAccountRoleFilter {
  const barber = data.barbers.find((row) => row.profile_id === profile.id);
  const shop = data.shops.find((row) => row.owner_profile_id === profile.id);
  const primary = profile.primary_onboarding_role;

  if (primary === "platform_admin" || profile.role === "platform_admin") return "platform_admin";
  if (primary === "shop_owner" || profile.role === "shop_owner" || shop) return "shop_owner";
  if (primary === "barber" || barber || profile.role === "commission_barber" || profile.role === "booth_rent_barber") return "barber";
  return "client";
}

function roleLabel(role: ArchitectAccountRoleFilter, barber?: BarberRow) {
  if (role === "platform_admin") return "Platform admin";
  if (role === "shop_owner") return "Shop owner";
  if (role === "barber") return barber?.compensation_model === "booth_rent" ? "Booth-rent barber" : "Barber";
  return "Client";
}

function getVerificationForRole(profileId: string, role: ArchitectAccountRoleFilter, verifications: VerificationProfileRow[]) {
  return verifications.find((row) => row.user_id === profileId && row.role === role)
    ?? verifications.find((row) => row.user_id === profileId);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function buildIndexes(data: AccountData) {
  return {
    clientsByProfileId: byProfileId(data.clients),
    clientPreferencesByReference: new Map(data.clientPreferences.map((row) => [row.client_reference, row])),
    barbersByProfileId: byProfileId(data.barbers),
    shopsByOwnerProfileId: new Map(data.shops.filter((row) => row.owner_profile_id).map((row) => [row.owner_profile_id as string, row])),
    barberProfilesByReference: new Map(data.barberProfiles.map((row) => [row.barber_reference, row])),
    visibilityByReference: new Map(data.marketplaceVisibilities.map((row) => [row.barber_reference, row])),
    barberStatusByReference: new Map(data.barberStatuses.map((row) => [row.barber_reference, row])),
    locationsById: new Map(data.locations.map((row) => [row.id, row]))
  };
}

function getLinkedShopIds(reference: string, profileId: string, data: AccountData) {
  const ids = new Set<string>();
  for (const membership of data.memberships) {
    if (membership.active !== false && membership.barber_reference === reference) ids.add(membership.shop_reference);
  }
  for (const staffLocation of data.staffLocations) {
    if (staffLocation.profile_id !== profileId) continue;
    const location = data.locations.find((row) => row.id === staffLocation.location_id);
    if (location?.reference_code) ids.add(location.reference_code);
  }
  return Array.from(ids);
}

function serviceKeySet(reference: string, barberId: string | undefined, profileId: string | undefined) {
  return new Set([reference, barberId, profileId].filter((value): value is string => Boolean(value)));
}

function getActiveServicesForBarber(reference: string, barberId: string | undefined, profileId: string | undefined, linkedShopIds: string[], data: AccountData) {
  const barberKeys = serviceKeySet(reference, barberId, profileId);
  const canonical = data.services.filter((service) =>
    service.active !== false
    && service.is_bookable !== false
    && (
      (Boolean(service.barber_reference) && barberKeys.has(service.barber_reference as string))
      || (service.service_owner_type === "shop" && Boolean(service.shop_reference) && linkedShopIds.includes(service.shop_reference as string))
    )
  );
  const marketplace = data.marketplaceServices
    .filter((service) =>
      service.owner_type === "barber"
      && Boolean(service.barber_reference)
      && barberKeys.has(service.barber_reference as string)
      && Boolean(service.name?.trim())
      && Number(service.price ?? 0) > 0
      && Number(service.duration_min ?? 0) >= 15
    )
    .map((service) => ({
      id: service.service_reference,
      reference_code: service.service_reference,
      service_owner_type: service.owner_type,
      barber_reference: service.barber_reference,
      shop_reference: service.shop_reference,
      active: true,
      is_bookable: true,
      name: service.name,
      price: service.price,
      duration_min: service.duration_min
    } satisfies ServiceRow));
  const merged = new Map<string, ServiceRow>();
  for (const service of [...canonical, ...marketplace]) {
    merged.set(service.reference_code ?? service.id, service);
  }
  return [...merged.values()];
}

function getActiveServicesForShop(shopId: string, data: AccountData) {
  return data.services.filter((service) => service.active !== false && service.is_bookable !== false && service.shop_reference === shopId);
}

function getServiceHealth(reference: string, barberId: string | undefined, profileId: string | undefined, linkedShopIds: string[], data: AccountData) {
  const barberKeys = serviceKeySet(reference, barberId, profileId);
  const canonicalRows = data.services.filter((service) =>
    (Boolean(service.barber_reference) && barberKeys.has(service.barber_reference as string))
    || (service.service_owner_type === "shop" && Boolean(service.shop_reference) && linkedShopIds.includes(service.shop_reference as string))
  );
  const marketplaceRows = data.marketplaceServices.filter((service) =>
    (Boolean(service.barber_reference) && barberKeys.has(service.barber_reference as string))
    || (service.owner_type === "shop" && Boolean(service.shop_reference) && linkedShopIds.includes(service.shop_reference as string))
  );
  const activeCanonicalRows = canonicalRows.filter((service) => service.active !== false);
  const clientVisibleRows = getActiveServicesForBarber(reference, barberId, profileId, linkedShopIds, data)
    .filter((service) => Boolean(service.name?.trim()) && Number(service.price ?? 0) > 0 && Number(service.duration_min ?? 0) >= 15);
  const firstService = clientVisibleRows[0] ?? activeCanonicalRows[0] ?? marketplaceRows[0];
  const firstServiceRecord = firstService as Partial<ServiceRow & MarketplaceServiceRow> | undefined;
  const marketplaceServiceReferences = new Set(marketplaceRows.map((service) => service.service_reference));
  const firstServiceReference = firstServiceRecord?.service_reference ?? firstServiceRecord?.reference_code ?? firstServiceRecord?.id;
  const sourceTable = activeCanonicalRows.length && marketplaceRows.length
    ? "services + marketplace_services"
    : activeCanonicalRows.length
      ? "services"
      : marketplaceRows.length
        ? "marketplace_services"
        : "none";

  return {
    serviceRowsFound: canonicalRows.length + marketplaceRows.length,
    activeServiceRows: activeCanonicalRows.length + marketplaceRows.filter((service) => Boolean(service.name?.trim()) && Number(service.price ?? 0) > 0 && Number(service.duration_min ?? 0) >= 15).length,
    clientVisibleServiceRows: clientVisibleRows.length,
    serviceSourceTable: sourceTable,
    checkoutLibraryServices: marketplaceRows.length,
    canonicalServices: canonicalRows.length,
    marketplaceServices: marketplaceRows.length,
    onboardingServices: 0,
    firstServiceName: firstService?.name ?? undefined,
    firstServicePrice: firstService?.price !== undefined && firstService?.price !== null ? Number(firstService.price) : undefined,
    firstServiceDurationMin: firstService?.duration_min ?? undefined,
    firstServiceSourceTable: firstServiceReference && marketplaceServiceReferences.has(firstServiceReference) ? "marketplace_services" : firstService ? "services" : undefined,
    firstServiceBarberKey: firstServiceRecord?.barber_reference ?? undefined,
    serviceSourceTablesChecked: ["services", "marketplace_services"],
    serviceBarberKeysChecked: [...barberKeys],
    discoveryServiceGatePass: clientVisibleRows.length > 0,
    serviceBlocker: clientVisibleRows.length > 0 ? undefined : "No active real services",
    serviceSourceMismatchReason: clientVisibleRows.length > 0
      ? undefined
      : marketplaceRows.length > 0
        ? "Marketplace service rows were found, but none were active/client-visible for the canonical barber keys."
        : "Checkout Library uses marketplace_services keyed by barber_reference; no rows matched barbers.reference_code, barbers.id, or profiles.id."
  };
}

function getAvailabilityCount(barber: BarberRow | undefined, reference: string, data: AccountData) {
  if (!barber) return 0;
  return data.availabilityRules.filter((row) => row.barber_id === barber.id).length
    + data.workingHours.filter((row) => row.barber_reference === reference).length;
}

function accountStatusFromControl(profile: ProfileRow, status: PlatformAdminAccountStatus) {
  if (profile.primary_onboarding_role === "platform_admin" || profile.role === "platform_admin") {
    return "active" as const;
  }
  return status;
}

async function getAccountStatuses(data: AccountData) {
  const profileById = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const ids = Array.from(new Set([...data.profiles.map((profile) => profile.id), ...data.authUsers.filter(isRealOperationalAuthUser).map((user) => user.id)]));
  const entries = await Promise.all(ids.map(async (id) => [
    id,
    accountStatusFromControl(profileById.get(id) ?? profileFromAuthUser({ id }), await getPlatformAccountStatus(id))
  ] as const));
  return new Map(entries);
}

function getApprovalStatus(role: ArchitectAccountRoleFilter, barber?: BarberRow, shop?: ShopRow) {
  if (role === "barber") return barber?.app_approval_status ?? "missing_barber_row";
  if (role === "shop_owner") return shop?.app_approval_status ?? "missing_shop_row";
  return "not_required";
}

function getVerificationStatus(verification?: VerificationProfileRow) {
  return verification?.overall_status ?? "missing_verification_profile";
}

function fallbackClientReference(profileId: string) {
  return `client-${profileId.slice(0, 8)}`;
}

function hasSavedClientLocation(preference?: ClientPreferenceRow | null) {
  if (!preference) return false;
  return Boolean(
    preference.preferred_city?.trim()
    || preference.preferred_state?.trim()
    || preference.preferred_postal_code?.trim()
    || preference.preferred_location_reference?.startsWith("client-location:")
  );
}

function formatClientRepairStatus(client: ClientRow | undefined, preference?: ClientPreferenceRow | null) {
  if (!client) return "missing_client_profile_row";
  if (!preference) return "missing_client_preferences_row";
  return "ready";
}

function locationLabelsForProfile(profileId: string, data: AccountData, indexes: ReturnType<typeof buildIndexes>) {
  return data.staffLocations
    .filter((row) => row.profile_id === profileId)
    .map((row) => indexes.locationsById.get(row.location_id))
    .filter((row): row is LocationRow => Boolean(row))
    .map((row) => `${row.name ?? row.id}${row.city ? `, ${row.city}` : ""}${row.state ? ` ${row.state}` : ""}`);
}

function getMarketplaceBlockers(input: {
  profile: ProfileRow;
  role: ArchitectAccountRoleFilter;
  accountStatus: PlatformAdminAccountStatus;
  barber?: BarberRow;
  shop?: ShopRow;
  verification?: VerificationProfileRow;
  barberProfile?: BarberProfileRow;
  visibility?: MarketplaceVisibilityRow;
  barberStatus?: BarberStatusRow;
  serviceCount: number;
  availabilityCount: number;
  linkedShopCount: number;
  activeLinkedBarbers: number;
}) {
  const blockers: string[] = [];
  if (!input.profile.email) blockers.push("Missing email");
  if (!input.profile.full_name) blockers.push("Missing full name");
  if (input.accountStatus !== "active") blockers.push(`Account ${input.accountStatus}`);

  if (input.role === "barber") {
    const barberApproval = input.barber?.app_approval_status ?? null;
    const barberApproved = barberApproval === "approved";
    const verificationApproved = Boolean(input.verification && APPROVED_STATUSES.has(input.verification.overall_status));
    if (!input.barber) blockers.push("Missing barber row");
    if (!barberApproved) blockers.push(`Barber approval ${barberApproval ?? "missing"}`);
    if (!barberApproved && !verificationApproved) blockers.push(`Verification ${input.verification?.overall_status ?? "missing"}`);
    if (input.verification && input.verification.can_receive_payouts !== true) blockers.push("Payout setup incomplete");
    if (input.serviceCount <= 0) blockers.push("No active real services");
    if (input.availabilityCount <= 0) blockers.push("No real availability");
    if (input.linkedShopCount <= 0) blockers.push("No service location or shop connection");
    if (input.barberProfile?.visibility_state === "hidden" || input.visibility?.visibility_state === "hidden") blockers.push("Marketplace visibility hidden");
    if (input.visibility && input.visibility.accepts_instant_bookings === false) blockers.push("Not accepting instant bookings");
    if (input.barberStatus?.accepting_bookings === false) blockers.push("Not accepting bookings");
    if (input.barberStatus?.status === "offline") blockers.push("Barber offline");
  }

  if (input.role === "shop_owner") {
    const shopApproval = input.shop?.app_approval_status ?? null;
    const shopApproved = shopApproval === "approved";
    const verificationApproved = Boolean(input.verification && APPROVED_STATUSES.has(input.verification.overall_status));
    if (!input.shop) blockers.push("Missing shop row");
    if (!shopApproved) blockers.push(`Shop approval ${shopApproval ?? "missing"}`);
    if (!shopApproved && !verificationApproved) blockers.push(`Verification ${input.verification?.overall_status ?? "missing"}`);
    if (input.verification && input.verification.can_receive_payouts !== true) blockers.push("Payout setup incomplete");
    if (!input.shop?.name) blockers.push("Missing shop name");
    if (!input.shop?.city || !input.shop?.state) blockers.push("Missing shop location context");
    if (input.activeLinkedBarbers <= 0) blockers.push("No active linked bookable barbers");
  }

  return blockers;
}

function normalizeSearchToken(value?: string | null) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function digitsOnly(value?: string | null) {
  return `${value ?? ""}`.replace(/\D+/g, "");
}

async function readTrustStateForMarketplaceDiagnostics() {
  try {
    const provider = await getTrustProvider();
    return provider.readState();
  } catch (error) {
    console.error("[Architect Accounts] trust state unavailable for marketplace diagnostics", {
      message: error instanceof Error ? error.message : String(error)
    });
    return createEmptyTrustState();
  }
}

function fallbackBarberSlug(barberReference: string) {
  const shortReference = barberReference
    .replace(/^barber[-_]?/i, "")
    .replace(/[^a-z0-9_-]+/gi, "")
    .slice(0, 18)
    .toLowerCase();
  return `barber-${shortReference || "profile"}`;
}

function matchesMarketplaceSearchTerms(terms: string[] | undefined, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || !terms?.length) {
    return false;
  }

  return terms.some((term) => term.toLowerCase().includes(normalizedQuery));
}

function buildSearchText(values: Array<string | number | boolean | null | undefined>) {
  const raw = values.map((value) => normalizeSearchToken(String(value ?? ""))).filter(Boolean);
  const normalized = raw.map((value) => value.replace(/[^a-z0-9@.]+/g, ""));
  const phones = raw.map(digitsOnly).filter((value) => value.length >= 4);
  return Array.from(new Set([...raw, ...normalized, ...phones])).join(" ");
}

async function buildDirectoryItems(data: AccountData): Promise<ArchitectAccountDirectoryItem[]> {
  const indexes = buildIndexes(data);
  const accountStatuses = await getAccountStatuses(data);
  const stripeEnvironment = getStripeConnectEnvironment();
  const canonicalEligibilityByReference = new Map<string, MarketplaceBarberEligibilityDiagnostic>();
  const repairResultByReference = new Map<string, BarberProfileRepairResult | { attempted: true; reason: string; message: string; details?: Record<string, unknown> }>();
  const diagnosticsClient = accountDataOverlay ? null : createSupabaseAdminClient();
  if (diagnosticsClient) {
    const trustState = await readTrustStateForMarketplaceDiagnostics();
    await syncAllOnboardingBarberServices(diagnosticsClient).catch((error) => {
      console.error("[Architect Accounts] onboarding service sync before marketplace diagnostics failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    });
    await Promise.all(data.barbers.map(async (barber) => {
      const reference = barberReference(barber);
      if (!reference) {
        return;
      }

      try {
        const repairResult = await ensureBarberProfileForIdentifier(reference, diagnosticsClient);
        if (repairResult) {
          repairResultByReference.set(reference, repairResult);
        }
        await syncCheckoutLibraryServicesForBarber(diagnosticsClient, reference);
        canonicalEligibilityByReference.set(reference, await getCanonicalMarketplaceEligibility(diagnosticsClient, reference, { trustState }));
      } catch (error) {
        repairResultByReference.set(reference, {
          attempted: true,
          reason: error instanceof BarberProfileRepairError ? error.reason : error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof BarberProfileRepairError ? error.details : undefined
        });
        console.error("[Architect Accounts] marketplace eligibility diagnostic failed", {
          reference,
          reason: error instanceof BarberProfileRepairError ? error.reason : "unknown",
          details: error instanceof BarberProfileRepairError ? error.details : undefined,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }));
  }
  const profilesById = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const realAuthUsers = data.authUsers.filter(isRealOperationalAuthUser);
  const authUsersById = new Map(realAuthUsers.map((user) => [user.id, user]));
  const accountIds = Array.from(new Set([
    ...data.profiles.map((profile) => profile.id),
    ...realAuthUsers.map((user) => user.id),
    ...data.clients.map((row) => row.profile_id).filter((id): id is string => Boolean(id)),
    ...data.barbers.map((row) => row.profile_id).filter(Boolean),
    ...data.shops.map((row) => row.owner_profile_id).filter((id): id is string => Boolean(id)),
    ...data.verificationProfiles.map((row) => row.user_id).filter(Boolean),
    ...data.verificationDocuments.map((row) => row.user_id).filter((id): id is string => Boolean(id))
  ]));

  const items: ArchitectAccountDirectoryItem[] = [];

  for (const profileId of accountIds) {
    const authUser = authUsersById.get(profileId);
    const existingProfile = profilesById.get(profileId);
    const baseProfile = existingProfile ?? (authUser ? profileFromAuthUser(authUser) : profileFromLinkedAccountRows(profileId, data));
    if (!baseProfile) continue;

    const profileExists = Boolean(existingProfile);
    const profile: ProfileRow = {
      ...baseProfile,
      full_name: baseProfile.full_name ?? getAuthDisplayName(authUser),
      email: baseProfile.email ?? authUser?.email ?? null,
      phone: baseProfile.phone ?? authUser?.phone ?? null,
      phone_verified_at: baseProfile.phone_verified_at ?? authUser?.phone_confirmed_at ?? null
    };
    const authProviders = getAuthProviders(authUser);
    const role = normalizeRole(profile, data);
    const barber = indexes.barbersByProfileId.get(profile.id);
    const shop = indexes.shopsByOwnerProfileId.get(profile.id);
    const client = indexes.clientsByProfileId.get(profile.id);
    const reference = barberReference(barber);
    const linkedShopIds = reference ? getLinkedShopIds(reference, profile.id, data) : [];
    const serviceLocationLabels = locationLabelsForProfile(profile.id, data, indexes);
    const barberProfile = reference ? indexes.barberProfilesByReference.get(reference) : undefined;
    const repairResult = reference ? repairResultByReference.get(reference) : undefined;
    const visibility = reference ? indexes.visibilityByReference.get(reference) : undefined;
    const barberStatus = reference ? indexes.barberStatusByReference.get(reference) : undefined;
    const verification = getVerificationForRole(profile.id, role, data.verificationProfiles);
    const verificationProfileIds = data.verificationProfiles.filter((row) => row.user_id === profile.id).map((row) => row.id);
    const serviceCount = role === "barber"
      ? getActiveServicesForBarber(reference, barber?.id, profile.id, linkedShopIds, data).length
      : role === "shop_owner" && shop
        ? getActiveServicesForShop(shop.id, data).length
        : 0;
    const serviceHealth = role === "barber" && reference
      ? getServiceHealth(reference, barber?.id, profile.id, linkedShopIds, data)
      : undefined;
    const availabilityCount = role === "barber" ? getAvailabilityCount(barber, reference, data) : 0;
    const activeLinkedBarbers = shop
      ? data.memberships.filter((membership) => {
          const linkedBarber = data.barbers.find((row) => barberReference(row) === membership.barber_reference);
          return membership.shop_reference === shop.id && membership.active !== false && linkedBarber?.app_approval_status === "approved";
        }).length
      : 0;
    const documentCount = data.verificationDocuments.filter((row) =>
      (row.user_id && row.user_id === profile.id)
      || (row.verification_profile_id && verificationProfileIds.includes(row.verification_profile_id))
      || (row.shop_id && shop?.id === row.shop_id)
      || (row.owner_reference && (row.owner_reference === reference || row.owner_reference === shop?.id))
    ).length;
    const reviewCount = data.verificationReviews.filter((row) => verificationProfileIds.includes(row.verification_profile_id)).length;
    const accountStatus = profileExists ? accountStatuses.get(profile.id) ?? "active" : "profile_only";
    const approvalStatus = getApprovalStatus(role, barber, shop);
    const verificationStatus = getVerificationStatus(verification);
    const canonicalEligibility = role === "barber" && reference
      ? canonicalEligibilityByReference.get(reference)
      : undefined;
    const fallbackMarketplaceBlockers = getMarketplaceBlockers({
      profile,
      role,
      accountStatus,
      barber,
      shop,
      verification,
      barberProfile,
      visibility,
      barberStatus,
      serviceCount,
      availabilityCount,
      linkedShopCount: linkedShopIds.length,
      activeLinkedBarbers
    });
    const marketplaceBlockers = canonicalEligibility?.blockers ?? fallbackMarketplaceBlockers;
    const marketplaceLive = canonicalEligibility?.eligible ?? marketplaceBlockers.length === 0;
    const canonicalFacts = canonicalEligibility?.facts;
    const canonicalCityState = canonicalFacts
      ? [canonicalFacts.city, canonicalFacts.state].filter(Boolean).join(", ")
      : "";
    const canonicalDiscoveryLocation = canonicalFacts
      ? [canonicalFacts.address, canonicalCityState].filter(Boolean).join(", ") || undefined
      : undefined;
    const publicRoute = canonicalEligibility?.publicProfileRoute ?? (role === "barber" && reference
      ? `/barber/${barberProfile?.username ?? fallbackBarberSlug(reference)}`
      : role === "shop_owner" && shop
        ? `/shop/${encodeURIComponent(shop.id)}`
        : undefined);
    const discoveryLocation = canonicalDiscoveryLocation ?? (role === "barber"
      ? serviceLocationLabels.join(" | ") || undefined
      : role === "shop_owner" && shop
        ? [shop.address, shop.city, shop.state].filter(Boolean).join(", ") || undefined
        : undefined);
    const directSearchMatch = canonicalEligibility
      ? canonicalEligibility.eligible && matchesMarketplaceSearchTerms(canonicalEligibility.searchableTerms, "phillip")
      : marketplaceLive && Boolean(
      role === "barber"
        ? profile.full_name || profile.email || barberProfile?.username || reference
        : role === "shop_owner"
          ? shop?.name || shop?.city || shop?.state
          : false
    );
    const feedAssetCount = canonicalFacts?.publicMediaCount ?? (role === "barber" && reference
      ? data.barberPortfolios.filter((asset) => asset.barber_reference === reference).length
      : role === "shop_owner" && shop
        ? data.shopMediaAssets.filter((asset) => asset.shop_reference === shop.id).length
        : 0);
    const repairDetails = repairResult && "details" in repairResult ? repairResult.details : undefined;
    const barberRowHealth = role === "barber"
      ? {
          authUserExists: Boolean(authUser),
          platformProfileExists: profileExists,
          barberRowExists: Boolean(barber),
          barberRowId: barber?.id,
          barberProfileRowExists: Boolean(barberProfile || (repairResult && "success" in repairResult && repairResult.success)),
          barberProfileId: repairResult && "canonical" in repairResult ? repairResult.canonical.barberProfileId : barberProfile?.barber_reference,
          barberProfileReference: repairResult && "canonical" in repairResult ? repairResult.canonical.barberProfileReference : barberProfile?.barber_reference,
          barberProfileBarberId: repairResult && "barberProfile" in repairResult ? repairResult.barberProfile.barber_id ?? undefined : undefined,
          barberRowLinkedToUser: Boolean(barber && barber.profile_id === profile.id),
          barberReference: reference || undefined,
          username: canonicalFacts?.username ?? (repairResult && "username" in repairResult ? repairResult.username : undefined) ?? barberProfile?.username ?? undefined,
          publicRoute,
          discoverable: marketplaceLive,
          repairAttempted: Boolean(repairResult),
          repairResult: repairResult
            ? "reason" in repairResult && repairResult.reason
              ? repairResult.reason
              : "repaired" in repairResult
                ? repairResult.repaired ? "repaired" : "already_synced"
                : "attempted"
            : "not_attempted",
          repairTable: typeof repairDetails?.table === "string" ? repairDetails.table : undefined,
          repairOperation: typeof repairDetails?.operation === "string" ? repairDetails.operation : undefined,
          repairErrorCode: typeof repairDetails?.code === "string" ? repairDetails.code : undefined,
          repairErrorMessage: typeof repairDetails?.message === "string" ? repairDetails.message : undefined,
          finalReadByReference: repairResult && "readChecks" in repairResult ? repairResult.readChecks.byReference : Boolean(barberProfile),
          finalReadByBarberId: repairResult && "readChecks" in repairResult ? repairResult.readChecks.byBarberId : false,
          finalReadByProfileUser: repairResult && "readChecks" in repairResult ? repairResult.readChecks.byProfileUser : false,
          blockers: [
            ...(!authUser ? ["Missing auth user"] : []),
            ...(!profileExists ? ["Missing platform profile row"] : []),
            ...(!barber ? ["Missing canonical barbers row"] : []),
            ...(barber && barber.profile_id !== profile.id ? ["Barber row is linked to a different profile"] : []),
            ...(!barberProfile && !(repairResult && "success" in repairResult && repairResult.success) ? ["Missing canonical barber_profiles row"] : []),
            ...marketplaceBlockers
          ]
        }
      : undefined;

    items.push({
      profileId: profile.id,
      authUserId: profile.id,
      profileExists,
      fullName: profile.full_name ?? profile.email ?? profile.id,
      email: profile.email ?? "",
      phone: profile.phone ?? undefined,
      authProvider: getAuthPrimaryProvider(authUser),
      authProviders,
      authCreatedAt: authUser?.created_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      emailVerified: Boolean(authUser?.email_confirmed_at),
      phoneVerified: Boolean(profile.phone_verified_at ?? authUser?.phone_confirmed_at),
      role,
      roleLabel: roleLabel(role, barber),
      primaryOnboardingRole: profile.primary_onboarding_role,
      onboardingState: profile.onboarding_state,
      accountStatus,
      approvalStatus,
      verificationStatus,
      verificationProfileId: verification?.id,
      barberId: barber?.id,
      barberReference: reference || undefined,
      barberSubtype: barber?.barber_subtype,
      shopId: shop?.id,
      shopName: shop?.name ?? undefined,
      clientId: client?.reference_code ?? client?.id,
      username: canonicalFacts?.username ?? canonicalFacts?.fallbackSlug ?? barberProfile?.username ?? (reference ? fallbackBarberSlug(reference) : undefined),
      createdAt: profile.created_at,
      updatedAt: profile.last_onboarded_at ?? profile.created_at,
      serviceCount,
      availabilityCount,
      documentCount,
      reviewCount,
      marketplaceLive,
      clientHomeIncluded: canonicalEligibility?.includedInClientHome ?? marketplaceLive,
      searchIncluded: canonicalEligibility?.includedInClientSearch ?? marketplaceLive,
      clientSearchIncluded: canonicalEligibility?.includedInClientSearch ?? marketplaceLive,
      directSearchMatch,
      feedEligible: canonicalEligibility?.includedInMarketplaceFeed ?? (marketplaceLive && feedAssetCount > 0),
      feedAssetCount,
      publicRoute,
      discoveryLocation,
      payoutMode: canonicalFacts?.payoutMode ?? stripeEnvironment.mode,
      serviceLocationCount: canonicalFacts
        ? Number(canonicalFacts.independentLocationExists) + canonicalFacts.acceptedShopCount
        : serviceLocationLabels.length,
      serviceHealth,
      searchableTerms: canonicalEligibility?.searchableTerms,
      barberRowHealth,
      marketplaceFacts: canonicalFacts,
      marketplaceDiagnostics: canonicalEligibility?.diagnostics,
      marketplaceBlockers,
      searchText: buildSearchText([
        profile.full_name,
        authUser ? getAuthDisplayName(authUser) : null,
        profile.email,
        authUser?.email,
        profile.phone,
        authUser?.phone,
        role,
        roleLabel(role, barber),
        profile.primary_onboarding_role,
        profile.onboarding_state,
        profileExists ? "profile exists" : "missing profile auth only",
        getAuthPrimaryProvider(authUser),
        ...authProviders,
        ...getAuthIdentitySearchValues(authUser),
        approvalStatus,
        verificationStatus,
        barber?.barber_subtype,
        reference,
        barberProfile?.username,
        ...(canonicalEligibility?.searchableTerms ?? []),
        shop?.name,
        shop?.city,
        shop?.state,
        discoveryLocation,
        publicRoute,
        stripeEnvironment.mode
      ])
    });
  }

  return items.sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function matchesStatus(item: ArchitectAccountDirectoryItem, status: ArchitectAccountStatusFilter) {
  if (status === "all") return true;
  if (["active", "profile_only", "deactivated", "suspended", "banned"].includes(status)) return item.accountStatus === status;
  if (status === "pending_review") return PENDING_REVIEW_STATUSES.has(item.approvalStatus) || PENDING_REVIEW_STATUSES.has(item.verificationStatus);
  if (status === "approved") return APPROVED_STATUSES.has(item.approvalStatus) || APPROVED_STATUSES.has(item.verificationStatus);
  if (status === "rejected") return REJECTED_STATUSES.has(item.approvalStatus) || REJECTED_STATUSES.has(item.verificationStatus);
  if (status === "needs_update") return NEEDS_UPDATE_STATUSES.has(item.verificationStatus);
  return true;
}

function matchesOnboarding(item: ArchitectAccountDirectoryItem, onboarding: ArchitectAccountDirectoryFilters["onboarding"]) {
  if (!onboarding || onboarding === "all") return true;
  if (onboarding === "missing_profile") return !item.profileExists;
  return item.onboardingState === onboarding;
}

function filterItems(items: ArchitectAccountDirectoryItem[], filters: ArchitectAccountDirectoryFilters) {
  const role = filters.role ?? "all";
  const status = filters.status ?? "all";
  const onboarding = filters.onboarding ?? "all";
  const search = filters.search?.trim().toLowerCase() ?? "";
  const normalizedSearch = search.replace(/[^a-z0-9@.]+/g, "");
  const phoneSearch = digitsOnly(search);
  return items.filter((item) =>
    (role === "all" || item.role === role)
    && matchesStatus(item, status)
    && matchesOnboarding(item, onboarding)
    && (
      !search
      || item.searchText.includes(search)
      || (normalizedSearch.length > 0 && item.searchText.includes(normalizedSearch))
      || (phoneSearch.length >= 4 && item.searchText.includes(phoneSearch))
    )
  );
}

function createCounts(items: ArchitectAccountDirectoryItem[]): ArchitectAccountSummaryCounts {
  return {
    totalAccounts: items.length,
    totalClients: items.filter((item) => item.role === "client").length,
    totalBarbers: items.filter((item) => item.role === "barber").length,
    totalShopOwners: items.filter((item) => item.role === "shop_owner").length,
    totalPlatformAdmins: items.filter((item) => item.role === "platform_admin").length,
    pendingBarberApprovals: items.filter((item) => item.role === "barber" && matchesStatus(item, "pending_review")).length,
    pendingShopOwnerApprovals: items.filter((item) => item.role === "shop_owner" && matchesStatus(item, "pending_review")).length,
    approvedBarbers: items.filter((item) => item.role === "barber" && item.approvalStatus === "approved").length,
    approvedShops: items.filter((item) => item.role === "shop_owner" && item.approvalStatus === "approved").length,
    suspendedAccounts: items.filter((item) => item.accountStatus === "suspended").length,
    bannedAccounts: items.filter((item) => item.accountStatus === "banned").length
  };
}

const VALID_ROLE_FILTERS = new Set<ArchitectAccountRoleFilter>(["all", "client", "barber", "shop_owner", "platform_admin"]);
const VALID_STATUS_FILTERS = new Set<ArchitectAccountStatusFilter>(["all", "active", "profile_only", "deactivated", "suspended", "banned", "pending_review", "approved", "rejected", "needs_update"]);
const VALID_ONBOARDING_FILTERS = new Set<NonNullable<ArchitectAccountDirectoryFilters["onboarding"]>>(["all", "missing_profile", "awaiting_contact_verification", "awaiting_role_selection", "role_selected", "active", "complete"]);

export function normalizeArchitectAccountDirectoryFilters(filters: ArchitectAccountDirectoryFilters = {}): Required<ArchitectAccountDirectoryFilters> {
  const role = filters.role && VALID_ROLE_FILTERS.has(filters.role) ? filters.role : "all";
  const status = filters.status && VALID_STATUS_FILTERS.has(filters.status) ? filters.status : "all";
  const onboarding = filters.onboarding && VALID_ONBOARDING_FILTERS.has(filters.onboarding) ? filters.onboarding : "all";

  return {
    search: filters.search?.trim() ?? "",
    role,
    status,
    onboarding
  };
}

function formatDateSort(value?: string | null) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function isApprovalAudit(entry: PlatformAdminAuditLogEntry) {
  return entry.actionType.includes("verification")
    || entry.actionType.includes("approval")
    || entry.actionType === "set_user_status";
}

function toDocumentView(row: VerificationDocumentRow): ArchitectVerificationDocumentView {
  return {
    id: row.id,
    documentType: row.document_type as ArchitectVerificationDocumentView["documentType"],
    legacyCategory: row.category ?? row.document_type ?? "verification_document",
    fileName: row.file_name ?? row.storage_path?.split("/").pop() ?? row.id,
    mimeType: row.mime_type ?? row.content_type ?? undefined,
    fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : undefined,
    uploadedAt: row.uploaded_at ?? new Date(0).toISOString(),
    expiresAt: row.expires_at ?? undefined,
    status: row.status as ArchitectVerificationDocumentView["status"],
    reviewNotes: row.review_notes ?? undefined
  };
}

function toReviewView(row: VerificationReviewRow, accountsById: Map<string, ArchitectAccountDirectoryItem>): ArchitectVerificationReviewView {
  return {
    id: row.id,
    reviewType: row.review_type as ArchitectVerificationReviewView["reviewType"],
    actionType: row.action_type as ArchitectVerificationReviewView["actionType"],
    fromStatus: row.from_status as ArchitectVerificationReviewView["fromStatus"],
    toStatus: row.to_status as ArchitectVerificationReviewView["toStatus"],
    reviewedBy: row.reviewed_by,
    reviewerLabel: accountsById.get(row.reviewed_by)?.fullName ?? row.reviewed_by,
    reason: row.reason ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    createdAt: row.created_at
  };
}

function verificationProfileView(row: VerificationProfileRow) {
  return {
    id: row.id,
    role: row.role,
    overallStatus: row.overall_status,
    identityStatus: row.identity_status,
    licenseStatus: row.license_status,
    businessStatus: row.business_status,
    payoutStatus: row.payout_status,
    complianceStatus: row.compliance_status,
    publicVerified: row.public_verified,
    canAcceptBookings: row.can_accept_bookings,
    canReceivePayouts: row.can_receive_payouts,
    canCreateShopListing: row.can_create_shop_listing,
    currentRequirements: asStringArray(row.current_requirements),
    reviewNotes: row.review_notes ?? null,
    lastReviewedAt: row.last_reviewed_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

export function stageArchitectAccountRowsForTests(input: Partial<AccountData>) {
  accountDataOverlay = { ...emptyData(), ...clone(input) };
}

export function resetArchitectAccountRowsForTests() {
  accountDataOverlay = null;
}

export async function getArchitectAccountDirectoryPayload(
  actor: UserAccount,
  filters: ArchitectAccountDirectoryFilters = {}
): Promise<ArchitectAccountDirectoryPayload> {
  assertPlatformAdminAccess(actor);
  const normalizedFilters = normalizeArchitectAccountDirectoryFilters(filters);
  const warnings: string[] = [];
  const data = await readAccountData(warnings);
  const allAccounts = await buildDirectoryItems(data);

  return {
    accounts: filterItems(allAccounts, normalizedFilters),
    counts: createCounts(allAccounts),
    filters: normalizedFilters,
    warnings: dedupeWarnings(warnings.length ? [ACCOUNT_WARNING, ...warnings] : [])
  };
}

export async function getArchitectDashboardPayload(actor: UserAccount): Promise<ArchitectDashboardPayload> {
  assertPlatformAdminAccess(actor);
  const warnings: string[] = [];
  const data = await readAccountData(warnings);
  const accounts = await buildDirectoryItems(data);
  const auditLog = (await readPlatformAdminAuditLogEntries()).filter(isApprovalAudit);

  return {
    actorName: actor.name,
    counts: createCounts(accounts),
    recentSignups: [...accounts].sort((left, right) => formatDateSort(right.createdAt) - formatDateSort(left.createdAt)).slice(0, 6),
    recentApprovalActions: auditLog.slice(0, 6),
    warnings: dedupeWarnings(warnings.length ? [ACCOUNT_WARNING, ...warnings] : [])
  };
}

export async function getArchitectAccountDetailPayload(actor: UserAccount, profileId: string): Promise<ArchitectAccountDetailPayload> {
  assertPlatformAdminAccess(actor);
  const warnings: string[] = [];
  const data = await readAccountData(warnings);
  const accounts = await buildDirectoryItems(data);
  const account = accounts.find((item) => item.profileId === profileId) ?? null;
  if (!account) {
    return { account: null, warnings: dedupeWarnings(warnings) };
  }

  const indexes = buildIndexes(data);
  const authUser = data.authUsers.find((row) => row.id === profileId);
  const existingProfile = data.profiles.find((row) => row.id === profileId);
  const profile = existingProfile ?? (authUser ? profileFromAuthUser(authUser) : null);
  if (!profile) {
    return { account: null, warnings: dedupeWarnings(warnings) };
  }
  const effectiveProfile: ProfileRow = {
    ...profile,
    full_name: profile.full_name ?? getAuthDisplayName(authUser),
    email: profile.email ?? authUser?.email ?? null,
    phone: profile.phone ?? authUser?.phone ?? null,
    phone_verified_at: profile.phone_verified_at ?? authUser?.phone_confirmed_at ?? null
  };
  const barber = indexes.barbersByProfileId.get(profileId);
  const shop = indexes.shopsByOwnerProfileId.get(profileId);
  const client = indexes.clientsByProfileId.get(profileId);
  const clientReference = client?.reference_code ?? (account.role === "client" ? fallbackClientReference(profileId) : undefined);
  const clientPreference = clientReference ? indexes.clientPreferencesByReference.get(clientReference) : undefined;
  const reference = barberReference(barber);
  const linkedShopIds = reference ? getLinkedShopIds(reference, profileId, data) : [];
  const serviceLocationLabels = locationLabelsForProfile(profileId, data, indexes);
  const verificationProfiles = data.verificationProfiles.filter((row) => row.user_id === profileId);
  const verificationProfileIds = verificationProfiles.map((row) => row.id);
  const documents = data.verificationDocuments.filter((row) =>
    (row.user_id && row.user_id === profileId)
    || (row.verification_profile_id && verificationProfileIds.includes(row.verification_profile_id))
    || (row.shop_id && shop?.id === row.shop_id)
    || (row.owner_reference && (row.owner_reference === reference || row.owner_reference === shop?.id))
  );
  const reviews = data.verificationReviews.filter((row) => verificationProfileIds.includes(row.verification_profile_id));
  const accountsById = new Map(accounts.map((item) => [item.profileId, item]));
  const auditTrail = (await readPlatformAdminAuditLogEntries()).filter((entry) =>
    entry.targetId === profileId
    || entry.actorUserId === profileId
    || Boolean(account.verificationProfileId && entry.targetId === account.verificationProfileId)
    || Boolean(account.barberReference && entry.targetId.includes(account.barberReference))
    || Boolean(account.shopId && entry.targetId.includes(account.shopId))
  );
  const barberProfile = reference ? indexes.barberProfilesByReference.get(reference) : undefined;
  const visibility = reference ? indexes.visibilityByReference.get(reference) : undefined;
  const barberStatus = reference ? indexes.barberStatusByReference.get(reference) : undefined;
  const bookingRows = data.appointments.filter((row) =>
    (client?.id && row.client_id === client.id)
    || (barber?.id && row.barber_id === barber.id)
  );
  const shopControl = shop ? await readPlatformShopControlState(shop.id) : undefined;

  return {
    account: {
      ...account,
      profile: {
        id: effectiveProfile.id,
        exists: Boolean(existingProfile),
        role: effectiveProfile.role,
        fullName: effectiveProfile.full_name,
        email: effectiveProfile.email,
        phone: effectiveProfile.phone,
        primaryOnboardingRole: effectiveProfile.primary_onboarding_role,
        onboardingState: effectiveProfile.onboarding_state,
        phoneVerifiedAt: effectiveProfile.phone_verified_at ?? null,
        lastOnboardedAt: effectiveProfile.last_onboarded_at ?? null,
        createdAt: effectiveProfile.created_at ?? authUser?.created_at ?? null,
        updatedAt: authUser?.updated_at ?? effectiveProfile.last_onboarded_at ?? null
      },
      authIdentity: authUser ? {
        id: authUser.id,
        email: authUser.email ?? null,
        phone: authUser.phone ?? null,
        providers: getAuthProviders(authUser),
        createdAt: authUser.created_at ?? null,
        updatedAt: authUser.updated_at ?? null,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        emailVerified: Boolean(authUser.email_confirmed_at),
        phoneVerified: Boolean(authUser.phone_confirmed_at)
      } : undefined,
      barber: barber ? {
        id: barber.id,
        referenceCode: reference,
        compensationModel: barber.compensation_model,
        barberSubtype: barber.barber_subtype,
        appApprovalStatus: barber.app_approval_status,
        shopApprovalStatus: barber.shop_approval_status,
        status: barberStatus?.status ?? null,
        acceptingBookings: barberStatus?.accepting_bookings ?? null,
        nextAvailableAt: barberStatus?.next_available_at ?? barberProfile?.next_available_at ?? null,
        visibilityState: visibility?.visibility_state ?? barberProfile?.visibility_state ?? null,
        acceptsInstantBookings: visibility?.accepts_instant_bookings ?? null,
        servicesCount: getActiveServicesForBarber(reference, barber.id, profile.id, linkedShopIds, data).length,
        availabilityRulesCount: data.availabilityRules.filter((row) => row.barber_id === barber.id).length,
        workingHoursCount: data.workingHours.filter((row) => row.barber_reference === reference).length,
        linkedShopIds,
        serviceLocationLabels
      } : undefined,
      shopOwner: {
        shopExists: Boolean(shop),
        id: shop?.id,
        name: shop?.name,
        appApprovalStatus: shop?.app_approval_status,
        city: shop?.city,
        state: shop?.state,
        address: shop?.address,
        phone: shop?.phone,
        activeLinkedBarbers: shop ? data.memberships.filter((membership) => membership.shop_reference === shop.id && membership.active !== false).length : 0,
        serviceCount: shop ? getActiveServicesForShop(shop.id, data).length : 0,
        locationLabels: locationLabelsForProfile(profileId, data, indexes),
        shopStatus: shopControl?.shopStatus
      },
      client: account.role === "client" ? {
        id: client?.id,
        referenceCode: clientReference,
        retentionTag: client?.retention_tag,
        loyaltyPoints: client?.loyalty_points,
        authUserExists: Boolean(authUser),
        clientProfileRowExists: Boolean(client),
        clientPreferencesRowExists: Boolean(clientPreference),
        locationSaved: hasSavedClientLocation(clientPreference),
        repairStatus: formatClientRepairStatus(client, clientPreference),
        bookingCounts: {
          total: bookingRows.length,
          completed: bookingRows.filter((row) => row.status === "completed").length,
          active: bookingRows.filter((row) => row.status && isUpcomingAppointmentStatus(row.status as AppointmentStatus)).length,
          cancelled: bookingRows.filter((row) => row.status === "cancelled" || row.status === "no_show").length
        }
      } : undefined,
      verificationProfiles: verificationProfiles.map(verificationProfileView),
      documents: documents.map(toDocumentView),
      reviews: reviews.map((row) => toReviewView(row, accountsById)),
      auditTrail
    },
    warnings: dedupeWarnings(warnings.length ? [ACCOUNT_WARNING, ...warnings] : [])
  };
}
