import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { autoCreateCulturePostFromProfileMedia, type CultureServiceSupabaseClient } from "@/lib/culture/service";
import { demoLocations } from "@/lib/data/demo";
import { getEngagementState, setEngagementState } from "@/lib/engagement/state";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import { resolveSignedInProfile, CurrentProfileResolverError } from "@/lib/profile/current-profile";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";
import type { BarberPortfolioAsset, Role, ShopMediaAsset, UserAccount } from "@/types/domain";
import type { NotificationPreferenceRecord } from "@/types/engagement";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileMediaRow = {
  id: string;
  email: string;
  role: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  public_username: string | null;
  public_bio: string | null;
  public_city: string | null;
  public_state: string | null;
};

type BarberProfileMediaRow = {
  barber_reference: string;
  username: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  visibility_state: string | null;
  bio: string | null;
  service_area_label: string | null;
  public_address: string | null;
  public_city: string | null;
  public_state: string | null;
  public_zip: string | null;
};

type BarberMarketplaceVisibilityMediaRow = {
  barber_reference: string;
  visibility_state: string | null;
  accepts_instant_bookings: boolean | null;
};

type BarberPortfolioRow = {
  id: string;
  barber_reference: string;
  storage_path: string;
  image_url: string | null;
  caption: string | null;
  featured: boolean | null;
  created_at: string;
};

type ShopMediaRow = {
  id: string;
  name: string;
  public_username?: string | null;
  brand_line?: string | null;
  public_bio?: string | null;
  neighborhood: string;
  city: string;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  address?: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
};

type ShopGalleryRow = {
  id: string;
  shop_reference: string;
  storage_path: string;
  image_url: string;
  caption: string | null;
  featured: boolean | null;
  created_at: string;
};

type ClientProfileMediaRow = {
  id: string;
  owner_profile_id: string | null;
  asset_type: string;
  storage_path: string;
  featured: boolean | null;
  created_at: string;
};

type ShopIdRow = {
  id: string;
};

type InsertedMediaIdRow = {
  id: string;
};

export type ManagedMediaAsset = {
  id: string;
  imageUrl: string;
  storagePath: string;
  caption: string;
  featured: boolean;
  createdAt: string;
};

export type ShopMediaWorkspaceView = {
  shopId: string;
  label: string;
  name?: string;
  publicUsername?: string | null;
  brandLine?: string | null;
  publicBio?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  address?: string | null;
  profilePhotoUrl?: string;
  profilePhotoPath?: string;
  gallery: ManagedMediaAsset[];
  mediaWarning?: string;
  hasMediaError?: boolean;
};

export type ProfileMediaWorkspacePayload = {
  viewer: {
    role: Role;
    email: string;
    profilePhotoUrl?: string;
    profilePhotoPath?: string;
    notificationPreference: {
      inAppEnabled: boolean;
      smsEnabled: boolean;
      emailEnabled: boolean;
      pushEnabled: boolean;
    } | null;
  };
  clientProfile: {
    profilePhotoUrl?: string;
    profilePhotoPath?: string;
    publicUsername?: string | null;
    publicBio?: string | null;
    publicCity?: string | null;
    publicState?: string | null;
    gallery: ManagedMediaAsset[];
  } | null;
  barberProfile: {
    barberId: string;
    publicUsername?: string | null;
    profilePhotoUrl?: string;
    profilePhotoPath?: string;
    publicBio?: string | null;
    serviceAreaLabel?: string | null;
    publicAddress?: string | null;
    publicCity?: string | null;
    publicState?: string | null;
    publicZip?: string | null;
    visibilityState?: string | null;
    acceptsInstantBookings?: boolean;
    gallery: ManagedMediaAsset[];
  } | null;
  shops: ShopMediaWorkspaceView[];
};

type DemoProfilePhoto = {
  storagePath: string;
  imageUrl: string;
};

type DemoProfileMediaState = {
  viewerPhotosByEmail: Record<string, DemoProfilePhoto>;
  clientPublicProfilesByEmail: Record<string, { publicUsername?: string; publicBio?: string; publicCity?: string; publicState?: string }>;
  clientGalleryByEmail: Record<string, ManagedMediaAsset[]>;
};

type SetPhotoInput = {
  action: "set_viewer_photo" | "set_barber_photo" | "set_shop_photo";
  storagePath: string;
  imageUrl: string;
  shopId?: string;
};

type RemovePhotoInput = {
  action: "remove_viewer_photo" | "remove_barber_photo" | "remove_shop_photo";
  shopId?: string;
};

type AddGalleryImageInput = {
  action: "add_client_gallery_image" | "add_barber_gallery_image" | "add_shop_gallery_image";
  storagePath: string;
  imageUrl: string;
  caption?: string;
  featured?: boolean;
  shopId?: string;
};

type RemoveGalleryImageInput = {
  action: "remove_client_gallery_image" | "remove_barber_gallery_image" | "remove_shop_gallery_image";
  assetId: string;
  shopId?: string;
};

type SetFeaturedMediaInput = {
  action: "set_client_featured_media" | "set_barber_featured_media" | "set_shop_featured_media";
  assetId: string;
  shopId?: string;
};

type UpdateNotificationPreferenceInput = {
  action: "update_viewer_notification_preference";
  inAppEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

type UpdateClientPublicBioInput = {
  action: "set_client_public_bio";
  publicBio: string;
};

type UpdateClientPublicUsernameInput = {
  action: "set_client_public_username";
  username: string;
};

type UpdateClientPublicLocationInput = {
  action: "set_client_public_location";
  city: string;
  state: string;
};

type UpdateBarberPublicBioInput = {
  action: "set_barber_public_bio";
  publicBio: string;
};

type UpdateBarberPublicUsernameInput = {
  action: "set_barber_public_username";
  username: string;
};

type UpdateBarberPublicLocationInput = {
  action: "set_barber_public_location";
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type UpdateShopPublicBioInput = {
  action: "set_shop_public_bio";
  shopId: string;
  publicBio: string;
};

type UpdateShopPublicUsernameInput = {
  action: "set_shop_public_username";
  shopId: string;
  username: string;
};

type UpdateShopPublicLocationInput = {
  action: "set_shop_public_location";
  shopId: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

export type ProfileMediaMutationInput =
  | SetPhotoInput
  | RemovePhotoInput
  | AddGalleryImageInput
  | RemoveGalleryImageInput
  | SetFeaturedMediaInput
  | UpdateNotificationPreferenceInput
  | UpdateClientPublicUsernameInput
  | UpdateClientPublicBioInput
  | UpdateClientPublicLocationInput
  | UpdateBarberPublicUsernameInput
  | UpdateBarberPublicBioInput
  | UpdateBarberPublicLocationInput
  | UpdateShopPublicUsernameInput
  | UpdateShopPublicBioInput
  | UpdateShopPublicLocationInput;

export class ProfileMediaServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProfileMediaServiceError";
    this.status = status;
  }
}

declare global {
  var __bvrb3rProfileMediaState: DemoProfileMediaState | undefined;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function getDemoProfileMediaState() {
  if (!globalThis.__bvrb3rProfileMediaState) {
    globalThis.__bvrb3rProfileMediaState = {
      viewerPhotosByEmail: {},
      clientPublicProfilesByEmail: {},
      clientGalleryByEmail: {}
    };
  }

  return globalThis.__bvrb3rProfileMediaState;
}

function makeDemoId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanPublicText(value?: string | null, maxLength = 300) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function formatProviderPublicLocation({
  address,
  city,
  state,
  zip
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const cleanAddress = cleanPublicText(address, 240);
  const cleanCity = cleanPublicText(city, 120);
  const cleanState = cleanPublicText(state, 40);
  const cleanZip = cleanPublicText(zip, 20);
  const cityState = [cleanCity, cleanState].filter(Boolean).join(", ");
  const cityStateZip = [cityState, cleanZip].filter(Boolean).join(" ");
  return [cleanAddress, cityStateZip].filter(Boolean).join(" - ") || null;
}

export type PublicUsernameOwnerType = "client" | "barber" | "shop";
export type PublicUsernameAvailabilityReason = "taken" | "reserved" | "invalid" | "unavailable" | null;

export type PublicUsernameAvailability = {
  available: boolean;
  normalizedUsername: string;
  reason: PublicUsernameAvailabilityReason;
};

export const CANONICAL_SHOP_ROUTE_USERNAME_RESERVATIONS = [
  "ai",
  "analytics",
  "bridge",
  "chairfill",
  "chairs",
  "floor",
  "home",
  "identity",
  "kiosk",
  "messages",
  "money",
  "more",
  "policies",
  "rent",
  "reports",
  "schedule",
  "switch",
  "sync",
  "team",
  "tv",
  "verify"
] as const;

const RESERVED_PUBLIC_USERNAMES = new Set([
  "admin",
  "support",
  "bvrb3r",
  "help",
  "payments",
  "system",
  "official",
  "login",
  "signup",
  "dashboard",
  "api",
  "client",
  "barber",
  "shop",
  "owner",
  "architect",
  "settings",
  "profile",
  "public",
  ...CANONICAL_SHOP_ROUTE_USERNAME_RESERVATIONS
]);

function normalizePublicUsername(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32) ?? "";
}

function assertPublicUsername(value: string) {
  const username = normalizePublicUsername(value);
  if (RESERVED_PUBLIC_USERNAMES.has(username)) {
    throw new ProfileMediaServiceError("This username is reserved.", 400);
  }

  if (username.length < 3) {
    throw new ProfileMediaServiceError("Use at least 3 lowercase letters, numbers, hyphens, or underscores.", 400);
  }

  if (!/^[a-z0-9_-]+$/.test(username)) {
    throw new ProfileMediaServiceError("Use lowercase letters, numbers, hyphens, or underscores.", 400);
  }

  return username;
}

function isSupabaseMissingRelation(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? "";
  return code === "42P01" || message.includes("public_usernames") || message.includes("claim_public_username");
}

function toUsernameClaimError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? "";
  if (code === "23505" || message.includes("username_taken") || message.includes("already taken")) {
    return new ProfileMediaServiceError("Username taken. Please choose a different username.", 409);
  }

  if (message.includes("reserved_public_username")) {
    return new ProfileMediaServiceError("This username is reserved.", 400);
  }

  if (message.includes("invalid_public_username") || message.includes("invalid_owner")) {
    return new ProfileMediaServiceError("Use lowercase letters, numbers, hyphens, or underscores. No spaces.", 400);
  }

  if (isSupabaseMissingRelation(error)) {
    console.error("[profile-public-username] global username registry migration is missing", {
      code,
      message: (error as { message?: string } | null)?.message
    });
    return new ProfileMediaServiceError("Username ownership registry is not installed. Apply the latest Supabase migration.", 500);
  }

  return new ProfileMediaServiceError("Unable to save username. Please try again.", 500);
}

async function claimPublicUsername(
  supabase: SupabaseClient,
  username: string,
  owner: { type: PublicUsernameOwnerType; id: string },
  changedByProfileId: string
) {
  const result = await supabase.rpc("claim_public_username", {
    p_owner_type: owner.type,
    p_owner_id: owner.id,
    p_new_username: username,
    p_changed_by_profile_id: changedByProfileId,
    p_source: "profile_studio"
  });

  if (result.error) {
    throw toUsernameClaimError(result.error);
  }
}

async function assertPublicUsernameAvailable(
  supabase: SupabaseClient,
  username: string,
  owner: { type: PublicUsernameOwnerType; id: string }
) {
  const registryResult = await supabase
    .from("public_usernames")
    .select("owner_type, owner_id, username")
    .eq("username", username)
    .maybeSingle();

  if (!registryResult.error) {
    const registryOwner = registryResult.data as { owner_type?: PublicUsernameOwnerType | null; owner_id?: string | null } | null;
    if (!registryOwner || (registryOwner.owner_type === owner.type && registryOwner.owner_id === owner.id)) {
      return;
    }

    throw new ProfileMediaServiceError("Username taken. Please choose a different username.", 409);
  }

  if (!isSupabaseMissingRelation(registryResult.error)) {
    throw new ProfileMediaServiceError("Unable to check username availability.", 500);
  }

  const [clientResult, barberResult, shopResult] = await Promise.all([
    supabase.from("profiles").select("id, public_username").eq("public_username", username).maybeSingle(),
    supabase.from("barber_profiles").select("barber_reference, username").eq("username", username).maybeSingle(),
    supabase.from("shops").select("id, public_username").eq("public_username", username).maybeSingle()
  ]);

  if (clientResult.error || barberResult.error || shopResult.error) {
    throw new ProfileMediaServiceError("Unable to check username availability.", 500);
  }

  const clientOwner = (clientResult.data as { id?: string | null } | null)?.id;
  const barberOwner = (barberResult.data as { barber_reference?: string | null } | null)?.barber_reference;
  const shopOwner = (shopResult.data as { id?: string | null } | null)?.id;
  const isOwnClient = owner.type === "client" && clientOwner === owner.id;
  const isOwnBarber = owner.type === "barber" && barberOwner === owner.id;
  const isOwnShop = owner.type === "shop" && shopOwner === owner.id;

  if ((clientOwner && !isOwnClient) || (barberOwner && !isOwnBarber) || (shopOwner && !isOwnShop)) {
    throw new ProfileMediaServiceError("Username taken. Please choose a different username.", 409);
  }
}

export async function checkPublicUsernameAvailability(
  usernameValue: string,
  owner: { type: PublicUsernameOwnerType; id: string }
): Promise<PublicUsernameAvailability> {
  const username = normalizePublicUsername(usernameValue);
  if (RESERVED_PUBLIC_USERNAMES.has(username)) {
    return { available: false, normalizedUsername: username, reason: "reserved" };
  }

  if (username.length < 3 || !/^[a-z0-9_-]+$/.test(username)) {
    return { available: false, normalizedUsername: username, reason: "invalid" };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { available: true, normalizedUsername: username, reason: null };
  }

  try {
    await assertPublicUsernameAvailable(supabase, username, owner);
    return { available: true, normalizedUsername: username, reason: null };
  } catch (error) {
    if (error instanceof ProfileMediaServiceError && error.status === 409) {
      return { available: false, normalizedUsername: username, reason: "taken" };
    }
    return { available: false, normalizedUsername: username, reason: "unavailable" };
  }
}

function mapBarberGalleryAsset(row: BarberPortfolioRow | ManagedMediaAsset): ManagedMediaAsset {
  if ("imageUrl" in row) {
    return row;
  }

  return {
    id: row.id,
    imageUrl: row.image_url ?? row.storage_path,
    storagePath: row.storage_path,
    caption: row.caption ?? "",
    featured: Boolean(row.featured),
    createdAt: row.created_at
  };
}

function mapShopGalleryAsset(row: ShopGalleryRow | ShopMediaAsset | ManagedMediaAsset): ManagedMediaAsset {
  if ("storagePath" in row) {
    return row;
  }

  if ("shop_reference" in row) {
    return {
      id: row.id,
      imageUrl: row.image_url,
      storagePath: row.storage_path,
      caption: row.caption ?? "",
      featured: Boolean(row.featured),
      createdAt: row.created_at
    };
  }

  return {
    id: row.id,
    imageUrl: row.imageUrl,
    storagePath: row.imageUrl,
    caption: row.caption,
    featured: Boolean(row.featured),
    createdAt: new Date().toISOString()
  };
}

function mapClientGalleryAsset(client: SupabaseClient | null, row: ClientProfileMediaRow | ManagedMediaAsset): ManagedMediaAsset {
  if ("imageUrl" in row) {
    return row;
  }

  return {
    id: row.id,
    imageUrl: toPublicMediaUrl(client, row.storage_path) ?? row.storage_path,
    storagePath: row.storage_path,
    caption: "",
    featured: Boolean(row.featured),
    createdAt: row.created_at
  };
}

function assertClientRole(user: UserAccount) {
  if (!isClientRole(user.role)) {
    throw new ProfileMediaServiceError("Only clients can manage Culture profile media.", 403);
  }
}

function assertBarberRole(user: UserAccount) {
  if (!isBarberAccountRole(user.role) || !user.barberId) {
    throw new ProfileMediaServiceError("Only barbers can manage barber profile media.", 403);
  }

  return user.barberId;
}

function assertShopRole(user: UserAccount, managedShopIds: string[], shopId?: string) {
  if (!(isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk")) {
    throw new ProfileMediaServiceError("Only shop-facing roles can manage shop media.", 403);
  }

  if (!shopId || !managedShopIds.includes(shopId)) {
    throw new ProfileMediaServiceError("This role cannot manage media outside the assigned shop scope.", 403);
  }

  return shopId;
}

function listDemoManagedShopIds(user: UserAccount) {
  const state = getMarketplaceState();
  const directShopIds = state.shops
    .filter((shop) => isShopOwnerRole(user.role) || shop.locationIds.some((locationId) => user.locationIds.includes(locationId)))
    .map((shop) => shop.id);

  if (directShopIds.length) {
    return directShopIds;
  }

  return [...user.locationIds];
}

async function listSupabaseManagedShopIds(user: UserAccount, supabase: SupabaseClient) {
  if (isShopOwnerRole(user.role)) {
    const profile = await resolveProfileRow(user, supabase);
    const ownedShopsResult = await supabase
      .from("shops")
      .select("id")
      .eq("owner_profile_id", profile.id)
      .order("id");

    if (ownedShopsResult.error) {
      throw new ProfileMediaServiceError("Unable to resolve shop media scope.", 500);
    }

    return ((ownedShopsResult.data ?? []) as ShopIdRow[]).map((row) => row.id);
  }

  const shopsResult = await supabase.from("shops").select("id").order("id");
  if (shopsResult.error) {
    throw new ProfileMediaServiceError("Unable to resolve shop media scope.", 500);
  }

  const shopIds = ((shopsResult.data ?? []) as ShopIdRow[]).map((row) => row.id);
  const directMatches = shopIds.filter((shopId) => user.locationIds.includes(shopId));
  if (directMatches.length) {
    return directMatches;
  }

  return shopIds.length === 1 ? shopIds : [];
}

async function resolveProfileRow(user: UserAccount, supabase: SupabaseClient) {
  try {
    const result = await resolveSignedInProfile<ProfileMediaRow>({
      user,
      supabase,
      select: "id, email, role, profile_photo_path, profile_photo_url, public_username, public_bio, public_city, public_state"
    });
    return result.profile;
  } catch (error) {
    if (error instanceof CurrentProfileResolverError) {
      throw new ProfileMediaServiceError("Unable to resolve account profile.", error.status);
    }
    throw error;
  }
}

async function readSupabaseNotificationPreference(user: UserAccount, supabase: SupabaseClient) {
  const result = await supabase
    .from("notification_preferences")
    .select("in_app_enabled, sms_enabled, email_enabled, push_enabled")
    .eq("role", user.role)
    .eq("user_email", user.email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data) {
    return null;
  }

  return {
    inAppEnabled: Boolean(result.data.in_app_enabled),
    smsEnabled: Boolean(result.data.sms_enabled),
    emailEnabled: Boolean(result.data.email_enabled),
    pushEnabled: Boolean(result.data.push_enabled)
  };
}

async function readSupabaseBarberMedia(supabase: SupabaseClient, barberId: string) {
  const [profileResult, visibilityResult, galleryResult] = await Promise.all([
    supabase
      .from("barber_profiles")
      .select("barber_reference, username, profile_photo_path, profile_photo_url, visibility_state, bio, service_area_label, public_address, public_city, public_state, public_zip")
      .eq("barber_reference", barberId)
      .maybeSingle(),
    supabase
      .from("marketplace_visibility")
      .select("barber_reference, visibility_state, accepts_instant_bookings")
      .eq("barber_reference", barberId)
      .maybeSingle(),
    supabase
      .from("barber_portfolios")
      .select("id, barber_reference, storage_path, image_url, caption, featured, created_at")
      .eq("barber_reference", barberId)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (profileResult.error || visibilityResult.error || galleryResult.error) {
    throw new ProfileMediaServiceError("Unable to load barber profile media.", 500);
  }

  const profile = (profileResult.data ?? null) as BarberProfileMediaRow | null;
  const visibility = (visibilityResult.data ?? null) as BarberMarketplaceVisibilityMediaRow | null;
  const gallery = ((galleryResult.data ?? []) as BarberPortfolioRow[]).map((row) => ({
    ...mapBarberGalleryAsset(row),
    imageUrl: toPublicMediaUrl(supabase, row.storage_path, row.image_url) ?? row.storage_path
  }));

  return {
    profilePhotoPath: profile?.profile_photo_path ?? undefined,
    profilePhotoUrl: toPublicMediaUrl(supabase, profile?.profile_photo_path, profile?.profile_photo_url),
    publicUsername: profile?.username ?? null,
    publicBio: profile?.bio ?? null,
    serviceAreaLabel: profile?.service_area_label ?? null,
    publicAddress: profile?.public_address ?? null,
    publicCity: profile?.public_city ?? null,
    publicState: profile?.public_state ?? null,
    publicZip: profile?.public_zip ?? null,
    visibilityState: visibility?.visibility_state ?? profile?.visibility_state ?? "hidden",
    acceptsInstantBookings: Boolean(visibility?.accepts_instant_bookings),
    gallery
  };
}

async function readExistingBarberUsername(supabase: SupabaseClient, barberId: string) {
  const result = await supabase
    .from("barber_profiles")
    .select("username")
    .eq("barber_reference", barberId)
    .maybeSingle();

  if (result.error) {
    return barberId;
  }

  return ((result.data as { username?: string | null } | null)?.username ?? barberId).trim() || barberId;
}

async function readSupabaseShopMedia(supabase: SupabaseClient, shopId: string): Promise<ShopMediaWorkspaceView | null> {
  const [shopResult, galleryResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, public_username, brand_line, public_bio, neighborhood, city, state, zip_code, phone, address, profile_photo_path, profile_photo_url")
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("shop_media_assets")
      .select("id, shop_reference, storage_path, image_url, caption, featured, created_at")
      .eq("shop_reference", shopId)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (shopResult.error) {
    throw new ProfileMediaServiceError("Unable to load shop profile.", 500);
  }

  const shop = (shopResult.data ?? null) as ShopMediaRow | null;
  if (!shop) {
    return null;
  }

  if (galleryResult.error) {
    console.warn("[profile-media] shop gallery unavailable; continuing with shop identity", {
      shopId,
      message: galleryResult.error.message,
      code: galleryResult.error.code
    });
  }
  const galleryRows = galleryResult.error ? [] : (galleryResult.data ?? []) as ShopGalleryRow[];
  const mediaWarning = galleryResult.error ? "Unable to load shop profile media." : undefined;

  return {
    shopId: shop.id,
    name: shop.name,
    publicUsername: shop.public_username ?? null,
    brandLine: shop.brand_line ?? null,
    publicBio: shop.public_bio ?? null,
    neighborhood: shop.neighborhood,
    city: shop.city,
    state: shop.state ?? null,
    zipCode: shop.zip_code ?? null,
    phone: shop.phone ?? null,
    address: shop.address ?? null,
    label: `${shop.name} • ${shop.neighborhood}, ${shop.city}`,
    profilePhotoPath: shop.profile_photo_path ?? undefined,
    profilePhotoUrl: toPublicMediaUrl(supabase, shop.profile_photo_path, shop.profile_photo_url),
    mediaWarning,
    hasMediaError: Boolean(galleryResult.error),
    gallery: galleryRows.map((row) => ({
      ...mapShopGalleryAsset(row),
      imageUrl: toPublicMediaUrl(supabase, row.storage_path, row.image_url) ?? row.image_url
    }))
  };
}

async function readSupabaseClientMedia(supabase: SupabaseClient, profile: ProfileMediaRow) {
  const galleryResult = await supabase
    .from("media_assets")
    .select("id, owner_profile_id, asset_type, storage_path, featured, created_at")
    .eq("owner_profile_id", profile.id)
    .eq("asset_type", "client_profile_post")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (galleryResult.error) {
    throw new ProfileMediaServiceError("Unable to load client profile media.", 500);
  }

  return {
    profilePhotoPath: profile.profile_photo_path ?? undefined,
    profilePhotoUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
    publicUsername: profile.public_username ?? null,
    publicBio: profile.public_bio ?? null,
    publicCity: profile.public_city ?? null,
    publicState: profile.public_state ?? null,
    gallery: ((galleryResult.data ?? []) as ClientProfileMediaRow[]).map((row) => mapClientGalleryAsset(supabase, row))
  };
}

function readDemoBarberMedia(barberId: string) {
  const state = getMarketplaceState();
  const profile = state.barberProfiles.find((entry) => entry.barberId === barberId);
  const visibility = state.visibilities.find((entry) => entry.barberId === barberId);
  const gallery = state.barberPortfolios
    .filter((entry) => entry.barberId === barberId)
    .map((entry) => mapBarberGalleryAsset({
      id: entry.id,
      storagePath: entry.imageUrl,
      imageUrl: entry.imageUrl,
      caption: entry.caption,
      featured: entry.featured,
      createdAt: new Date().toISOString()
    }))
    .sort((left, right) => Number(right.featured) - Number(left.featured));

  return {
    profilePhotoPath: profile?.profilePhotoUrl,
    profilePhotoUrl: profile?.profilePhotoUrl,
    publicUsername: profile?.username ?? null,
    publicBio: profile?.headline ?? null,
    serviceAreaLabel: profile?.serviceAreaLabel ?? null,
    publicAddress: null,
    publicCity: null,
    publicState: null,
    publicZip: null,
    visibilityState: visibility?.visibilityState ?? profile?.visibilityState ?? "hidden",
    acceptsInstantBookings: Boolean(visibility?.acceptsInstantBookings),
    gallery
  };
}

function readDemoShopMedia(shopId: string): ShopMediaWorkspaceView | null {
  const state = getMarketplaceState();
  const shop = state.shops.find((entry) => entry.id === shopId) ?? null;
  if (!shop) {
    const location = demoLocations.find((entry) => entry.id === shopId);
    if (!location) {
      return null;
    }

    return {
      shopId: location.id,
      name: location.name,
      neighborhood: location.neighborhood,
      city: location.city,
      state: location.state,
      zipCode: null,
      label: `${location.name} • ${location.neighborhood}, ${location.city}`,
      gallery: []
    };
  }

  const location = demoLocations.find((entry) => entry.id === shopId);
  return {
    shopId,
    label: location ? `${location.name} • ${location.neighborhood}, ${location.city}` : shop.name,
    name: shop.name,
    brandLine: shop.brandLine ?? null,
    publicUsername: shop.shopUsername ?? null,
    publicBio: shop.publicBio ?? null,
    neighborhood: shop.neighborhood ?? location?.neighborhood ?? null,
    city: shop.city ?? location?.city ?? null,
    state: shop.state ?? location?.state ?? null,
    zipCode: (shop as { zipCode?: string | null }).zipCode ?? null,
    phone: shop.phone ?? null,
    address: shop.address ?? null,
    profilePhotoUrl: shop.profilePhotoUrl,
    profilePhotoPath: shop.profilePhotoUrl,
    gallery: (shop.gallery ?? []).map((entry) => mapShopGalleryAsset(entry))
  };
}

function readDemoViewerPhoto(email: string) {
  const state = getDemoProfileMediaState();
  return state.viewerPhotosByEmail[email];
}

function readDemoClientMedia(email: string) {
  const state = getDemoProfileMediaState();
  const publicProfile = state.clientPublicProfilesByEmail[email] ?? {};
  return {
    profilePhotoPath: state.viewerPhotosByEmail[email]?.storagePath,
    profilePhotoUrl: state.viewerPhotosByEmail[email]?.imageUrl,
    publicUsername: publicProfile.publicUsername ?? null,
    publicBio: publicProfile.publicBio ?? null,
    publicCity: publicProfile.publicCity ?? null,
    publicState: publicProfile.publicState ?? null,
    gallery: state.clientGalleryByEmail[email] ?? []
  };
}

function readDemoNotificationPreference(user: UserAccount) {
  const state = getEngagementState();
  return (
    state.notificationPreferences.find(
      (preference) => preference.userEmail === user.email && preference.role === user.role
    ) ?? null
  );
}

function updateDemoNotificationPreference(user: UserAccount, input: UpdateNotificationPreferenceInput) {
  const state = getEngagementState();
  const existing = readDemoNotificationPreference(user);
  const nextPreference: NotificationPreferenceRecord = {
    id: existing?.id ?? `pref-${user.role}-${user.email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    userEmail: user.email,
    role: user.role,
    clientId: existing?.clientId,
    barberId: user.barberId ?? existing?.barberId,
    inAppEnabled: input.inAppEnabled,
    smsEnabled: input.smsEnabled,
    emailEnabled: input.emailEnabled,
    pushEnabled: input.pushEnabled,
    updatedAt: new Date().toISOString()
  };

  setEngagementState({
    ...state,
    notificationPreferences: [
      nextPreference,
      ...state.notificationPreferences.filter(
        (preference) => !(preference.userEmail === user.email && preference.role === user.role)
      )
    ]
  });
}

function updateDemoViewerPhoto(email: string, nextPhoto?: DemoProfilePhoto) {
  const state = getDemoProfileMediaState();
  if (!nextPhoto) {
    delete state.viewerPhotosByEmail[email];
    return;
  }

  state.viewerPhotosByEmail[email] = nextPhoto;
}

function updateDemoClientGallery(email: string, galleryUpdater: (current: ManagedMediaAsset[]) => ManagedMediaAsset[]) {
  const state = getDemoProfileMediaState();
  state.clientGalleryByEmail[email] = galleryUpdater(state.clientGalleryByEmail[email] ?? []);
}

function updateDemoClientPublicProfile(email: string, input: { publicUsername?: string | null; publicBio?: string | null; publicCity?: string | null; publicState?: string | null }) {
  const state = getDemoProfileMediaState();
  state.clientPublicProfilesByEmail[email] = {
    ...(state.clientPublicProfilesByEmail[email] ?? {}),
    ...(input.publicUsername !== undefined ? { publicUsername: input.publicUsername ?? "" } : {}),
    ...(input.publicBio !== undefined ? { publicBio: input.publicBio ?? "" } : {}),
    ...(input.publicCity !== undefined ? { publicCity: input.publicCity ?? "" } : {}),
    ...(input.publicState !== undefined ? { publicState: input.publicState ?? "" } : {})
  };
}

function updateDemoBarberMedia(barberId: string, input: {
  publicUsername?: string;
  profilePhotoUrl?: string;
  publicBio?: string | null;
  serviceAreaLabel?: string | null;
  galleryUpdater?: (current: ManagedMediaAsset[]) => ManagedMediaAsset[];
}) {
  const state = getMarketplaceState();
  const updatedBarberPortfolios: BarberPortfolioAsset[] = input.galleryUpdater
    ? input.galleryUpdater(
        state.barberPortfolios
          .filter((entry) => entry.barberId === barberId)
          .map((entry) => mapBarberGalleryAsset({
            id: entry.id,
            storagePath: entry.imageUrl,
            imageUrl: entry.imageUrl,
            caption: entry.caption,
            featured: entry.featured,
            createdAt: new Date().toISOString()
          }))
      ).map((asset) => ({
        id: asset.id,
        barberId,
        imageUrl: asset.imageUrl,
        caption: asset.caption,
        styleTagIds: [] as string[],
        featured: asset.featured
      }))
        .concat(state.barberPortfolios.filter((entry) => entry.barberId !== barberId))
    : state.barberPortfolios;
  const nextState = {
    ...state,
    barberProfiles: state.barberProfiles.map((profile) =>
      profile.barberId === barberId
        ? {
            ...profile,
            username: input.publicUsername ?? profile.username,
            profilePhotoUrl: input.profilePhotoUrl ?? profile.profilePhotoUrl,
            headline: input.publicBio !== undefined ? input.publicBio ?? "" : profile.headline,
            serviceAreaLabel: input.serviceAreaLabel !== undefined ? input.serviceAreaLabel ?? "" : profile.serviceAreaLabel
          }
        : profile
    ),
    barberPortfolios: updatedBarberPortfolios
  };

  setMarketplaceState(nextState);
}

function updateDemoShopMedia(shopId: string, input: {
  publicUsername?: string;
  profilePhotoUrl?: string;
  publicBio?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  galleryUpdater?: (current: ManagedMediaAsset[]) => ManagedMediaAsset[];
}) {
  const state = getMarketplaceState();
  const nextShops = state.shops.map((shop) => {
    if (shop.id !== shopId) {
      return shop;
    }

    const nextGallery: ShopMediaAsset[] | undefined = input.galleryUpdater
      ? input.galleryUpdater((shop.gallery ?? []).map((entry) => mapShopGalleryAsset(entry))).map((asset) => ({
          id: asset.id,
          shopId,
          imageUrl: asset.imageUrl,
          caption: asset.caption,
          featured: asset.featured
        }))
      : shop.gallery;

    return {
      ...shop,
      shopUsername: input.publicUsername ?? shop.shopUsername,
      profilePhotoUrl: input.profilePhotoUrl ?? shop.profilePhotoUrl,
      publicBio: input.publicBio !== undefined ? input.publicBio ?? "" : shop.publicBio,
      address: input.address !== undefined ? input.address ?? "" : shop.address,
      neighborhood: input.neighborhood !== undefined ? input.neighborhood ?? "" : shop.neighborhood,
      city: input.city !== undefined ? input.city ?? "" : shop.city,
      state: input.state !== undefined ? input.state ?? "" : shop.state,
      zipCode: input.zipCode !== undefined ? input.zipCode ?? "" : (shop as { zipCode?: string | null }).zipCode,
      gallery: nextGallery
    };
  });
  const nextState = {
    ...state,
    shops: nextShops
  };

  setMarketplaceState(nextState);
}

export async function readClientProfilePhotoUrl(clientId?: string, email?: string) {
  if (!email) {
    return undefined;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return readDemoViewerPhoto(email)?.imageUrl;
  }

  const result = await supabase
    .from("profiles")
    .select("profile_photo_path, profile_photo_url")
    .eq("email", email)
    .maybeSingle();

  if (result.error || !result.data) {
    return undefined;
  }

  return toPublicMediaUrl(supabase, result.data.profile_photo_path as string | null, result.data.profile_photo_url as string | null);
}

export async function readBarberProfileMedia(barberId: string) {
  const supabase = getSupabase();
  return supabase ? readSupabaseBarberMedia(supabase, barberId) : readDemoBarberMedia(barberId);
}

export async function readShopProfileMedia(shopId: string) {
  const supabase = getSupabase();
  return supabase ? readSupabaseShopMedia(supabase, shopId) : readDemoShopMedia(shopId);
}

export async function getProfileMediaWorkspacePayload(user: UserAccount): Promise<ProfileMediaWorkspacePayload> {
  const supabase = getSupabase();
  if (!supabase) {
    const viewerPhoto = readDemoViewerPhoto(user.email);
    const notificationPreference = readDemoNotificationPreference(user);
    const clientProfile = isClientRole(user.role) ? readDemoClientMedia(user.email) : null;
    const barberProfile = user.barberId
      ? {
          barberId: user.barberId,
          ...readDemoBarberMedia(user.barberId)
        }
      : null;
    const managedShopIds = listDemoManagedShopIds(user);

    return {
      viewer: {
        role: user.role,
        email: user.email,
        profilePhotoPath: viewerPhoto?.storagePath,
        profilePhotoUrl: viewerPhoto?.imageUrl,
        notificationPreference: notificationPreference
          ? {
              inAppEnabled: notificationPreference.inAppEnabled,
              smsEnabled: notificationPreference.smsEnabled,
              emailEnabled: notificationPreference.emailEnabled,
              pushEnabled: notificationPreference.pushEnabled
            }
          : null
      },
      clientProfile,
      barberProfile,
      shops: (isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk")
        ? managedShopIds.map((shopId) => readDemoShopMedia(shopId)).filter((value): value is ShopMediaWorkspaceView => Boolean(value))
        : []
    };
  }

  const profile = await resolveProfileRow(user, supabase);
  const managedShopIds = (isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk")
    ? await listSupabaseManagedShopIds(user, supabase)
    : [];
  const [clientProfile, barberProfile, shops] = await Promise.all([
    isClientRole(user.role)
      ? readSupabaseClientMedia(supabase, profile)
      : Promise.resolve(null),
    user.barberId
      ? readSupabaseBarberMedia(supabase, user.barberId).then((result) => ({
          barberId: user.barberId!,
          ...result
        }))
      : Promise.resolve(null),
    managedShopIds.length
      ? Promise.all(managedShopIds.map((shopId) => readSupabaseShopMedia(supabase, shopId)))
      : Promise.resolve([])
  ]);
  const notificationPreference = await readSupabaseNotificationPreference(user, supabase);

  return {
    viewer: {
      role: user.role,
      email: user.email,
      profilePhotoPath: profile.profile_photo_path ?? undefined,
      profilePhotoUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
      notificationPreference
    },
    clientProfile,
    barberProfile,
    shops: shops.filter((value): value is ShopMediaWorkspaceView => Boolean(value))
  };
}

export async function mutateProfileMedia(user: UserAccount, input: ProfileMediaMutationInput): Promise<ProfileMediaWorkspacePayload> {
  const supabase = getSupabase();

  if (!supabase) {
    const managedShopIds = listDemoManagedShopIds(user);
    switch (input.action) {
      case "set_viewer_photo":
        updateDemoViewerPhoto(user.email, {
          storagePath: input.storagePath,
          imageUrl: input.imageUrl
        });
        break;
      case "remove_viewer_photo":
        updateDemoViewerPhoto(user.email, undefined);
        break;
      case "add_client_gallery_image":
        assertClientRole(user);
        updateDemoClientGallery(user.email, (current) => [
          {
            id: makeDemoId("client-gallery"),
            imageUrl: input.imageUrl,
            storagePath: input.storagePath,
            caption: input.caption?.trim() ?? "",
            featured: Boolean(input.featured),
            createdAt: new Date().toISOString()
          },
          ...current
        ]);
        break;
      case "remove_client_gallery_image":
        assertClientRole(user);
        updateDemoClientGallery(user.email, (current) => current.filter((asset) => asset.id !== input.assetId));
        break;
      case "set_client_featured_media":
        assertClientRole(user);
        updateDemoClientGallery(user.email, (current) => {
          if (!current.some((asset) => asset.id === input.assetId)) {
            throw new ProfileMediaServiceError("Unable to set featured image.", 404);
          }
          return current.map((asset) => ({ ...asset, featured: asset.id === input.assetId }));
        });
        break;
      case "set_client_public_username":
        assertClientRole(user);
        updateDemoClientPublicProfile(user.email, { publicUsername: assertPublicUsername(input.username) });
        break;
      case "set_client_public_bio":
        assertClientRole(user);
        updateDemoClientPublicProfile(user.email, { publicBio: cleanPublicText(input.publicBio) ?? "" });
        break;
      case "set_client_public_location":
        assertClientRole(user);
        updateDemoClientPublicProfile(user.email, {
          publicCity: cleanPublicText(input.city, 120) ?? "",
          publicState: cleanPublicText(input.state, 40) ?? ""
        });
        break;
      case "set_barber_photo":
        updateDemoBarberMedia(assertBarberRole(user), { profilePhotoUrl: input.imageUrl });
        break;
      case "remove_barber_photo":
        updateDemoBarberMedia(assertBarberRole(user), { profilePhotoUrl: "" });
        break;
      case "add_barber_gallery_image": {
        const barberId = assertBarberRole(user);
        updateDemoBarberMedia(barberId, {
          galleryUpdater: (current) => [
            {
              id: makeDemoId("barber-gallery"),
              imageUrl: input.imageUrl,
              storagePath: input.storagePath,
              caption: input.caption?.trim() ?? "",
              featured: Boolean(input.featured),
              createdAt: new Date().toISOString()
            },
            ...current
          ]
        });
        break;
      }
      case "remove_barber_gallery_image": {
        const barberId = assertBarberRole(user);
        updateDemoBarberMedia(barberId, {
          galleryUpdater: (current) => current.filter((asset) => asset.id !== input.assetId)
        });
        break;
      }
      case "set_barber_featured_media": {
        const barberId = assertBarberRole(user);
        updateDemoBarberMedia(barberId, {
          galleryUpdater: (current) => {
            if (!current.some((asset) => asset.id === input.assetId)) {
              throw new ProfileMediaServiceError("Unable to set featured image.", 404);
            }
            return current.map((asset) => ({ ...asset, featured: asset.id === input.assetId }));
          }
        });
        break;
      }
      case "set_barber_public_bio":
        updateDemoBarberMedia(assertBarberRole(user), { publicBio: cleanPublicText(input.publicBio) ?? "" });
        break;
      case "set_barber_public_username":
        updateDemoBarberMedia(assertBarberRole(user), { publicUsername: assertPublicUsername(input.username) });
        break;
      case "set_barber_public_location":
        updateDemoBarberMedia(assertBarberRole(user), {
          serviceAreaLabel: formatProviderPublicLocation(input) ?? ""
        });
        break;
      case "set_shop_photo":
        updateDemoShopMedia(assertShopRole(user, managedShopIds, input.shopId), { profilePhotoUrl: input.imageUrl });
        break;
      case "remove_shop_photo":
        updateDemoShopMedia(assertShopRole(user, managedShopIds, input.shopId), { profilePhotoUrl: "" });
        break;
      case "add_shop_gallery_image": {
        const shopId = assertShopRole(user, managedShopIds, input.shopId);
        updateDemoShopMedia(shopId, {
          galleryUpdater: (current) => [
            {
              id: makeDemoId("shop-gallery"),
              imageUrl: input.imageUrl,
              storagePath: input.storagePath,
              caption: input.caption?.trim() ?? "",
              featured: Boolean(input.featured),
              createdAt: new Date().toISOString()
            },
            ...current
          ]
        });
        break;
      }
      case "remove_shop_gallery_image": {
        const shopId = assertShopRole(user, managedShopIds, input.shopId);
        updateDemoShopMedia(shopId, {
          galleryUpdater: (current) => current.filter((asset) => asset.id !== input.assetId)
        });
        break;
      }
      case "set_shop_featured_media": {
        const shopId = assertShopRole(user, managedShopIds, input.shopId);
        updateDemoShopMedia(shopId, {
          galleryUpdater: (current) => {
            if (!current.some((asset) => asset.id === input.assetId)) {
              throw new ProfileMediaServiceError("Unable to set featured image.", 404);
            }
            return current.map((asset) => ({ ...asset, featured: asset.id === input.assetId }));
          }
        });
        break;
      }
      case "set_shop_public_bio":
        updateDemoShopMedia(assertShopRole(user, managedShopIds, input.shopId), {
          publicBio: cleanPublicText(input.publicBio) ?? ""
        });
        break;
      case "set_shop_public_username":
        updateDemoShopMedia(assertShopRole(user, managedShopIds, input.shopId), {
          publicUsername: assertPublicUsername(input.username)
        });
        break;
      case "set_shop_public_location": {
        const shopId = assertShopRole(user, managedShopIds, input.shopId);
        updateDemoShopMedia(shopId, {
          address: cleanPublicText(input.address, 240) ?? "",
          city: cleanPublicText(input.city, 120) ?? "",
          state: cleanPublicText(input.state, 40) ?? "",
          zipCode: cleanPublicText(input.zipCode, 20) ?? ""
        });
        break;
      }
      case "update_viewer_notification_preference":
        updateDemoNotificationPreference(user, input);
        break;
    }

    return getProfileMediaWorkspacePayload(user);
  }

  const profile = await resolveProfileRow(user, supabase);
  const cultureSupabase = supabase as unknown as CultureServiceSupabaseClient;
  const managedShopIds = (isShopOwnerRole(user.role) || user.role === "manager" || user.role === "front_desk")
    ? await listSupabaseManagedShopIds(user, supabase)
    : [];

  switch (input.action) {
    case "set_viewer_photo": {
      const result = await supabase
        .from("profiles")
        .update({
          profile_photo_path: input.storagePath,
          profile_photo_url: input.imageUrl
        })
        .eq("id", profile.id);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the profile photo.", 500);
      }
      break;
    }
    case "remove_viewer_photo": {
      const result = await supabase
        .from("profiles")
        .update({
          profile_photo_path: null,
          profile_photo_url: null
        })
        .eq("id", profile.id);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the profile photo.", 500);
      }
      break;
    }
    case "add_client_gallery_image": {
      assertClientRole(user);
      if (input.featured) {
        const clearResult = await supabase
          .from("media_assets")
          .update({ featured: false })
          .eq("owner_profile_id", profile.id)
          .eq("asset_type", "client_profile_post");

        if (clearResult.error) {
          throw new ProfileMediaServiceError("Unable to set featured image.", 500);
        }
      }
      const result = await supabase
        .from("media_assets")
        .insert({
          owner_profile_id: profile.id,
          asset_type: "client_profile_post",
          storage_path: input.storagePath,
          featured: Boolean(input.featured)
        });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to add the client profile media.", 500);
      }
      break;
    }
    case "set_client_featured_media": {
      assertClientRole(user);
      const assetResult = await supabase
        .from("media_assets")
        .select("id")
        .eq("id", input.assetId)
        .eq("owner_profile_id", profile.id)
        .eq("asset_type", "client_profile_post")
        .maybeSingle();

      if (assetResult.error || !assetResult.data) {
        throw new ProfileMediaServiceError("Unable to set featured image.", assetResult.error ? 500 : 404);
      }

      const clearResult = await supabase
        .from("media_assets")
        .update({ featured: false })
        .eq("owner_profile_id", profile.id)
        .eq("asset_type", "client_profile_post");
      const setResult = await supabase
        .from("media_assets")
        .update({ featured: true })
        .eq("id", input.assetId)
        .eq("owner_profile_id", profile.id)
        .eq("asset_type", "client_profile_post");

      if (clearResult.error || setResult.error) {
        throw new ProfileMediaServiceError("Unable to set featured image.", 500);
      }
      break;
    }
    case "remove_client_gallery_image": {
      assertClientRole(user);
      const result = await supabase
        .from("media_assets")
        .delete()
        .eq("id", input.assetId)
        .eq("owner_profile_id", profile.id)
        .eq("asset_type", "client_profile_post");

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the client profile media.", 500);
      }
      break;
    }
    case "set_client_public_username": {
      assertClientRole(user);
      const username = assertPublicUsername(input.username);
      await claimPublicUsername(supabase, username, { type: "client", id: profile.id }, profile.id);
      const result = await supabase
        .from("profiles")
        .update({
          public_username: username,
          updated_at: new Date().toISOString()
        })
        .eq("id", profile.id);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the client public username.", 500);
      }
      break;
    }
    case "set_client_public_bio": {
      assertClientRole(user);
      const result = await supabase
        .from("profiles")
        .update({
          public_bio: cleanPublicText(input.publicBio),
          updated_at: new Date().toISOString()
        })
        .eq("id", profile.id);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the client public bio.", 500);
      }
      break;
    }
    case "set_client_public_location": {
      assertClientRole(user);
      const result = await supabase
        .from("profiles")
        .update({
          public_city: cleanPublicText(input.city, 120),
          public_state: cleanPublicText(input.state, 40),
          updated_at: new Date().toISOString()
        })
        .eq("id", profile.id);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the client public location.", 500);
      }
      break;
    }
    case "set_barber_photo": {
      const barberId = assertBarberRole(user);
      const currentUsername = await readExistingBarberUsername(supabase, barberId);
      const result = await supabase
        .from("barber_profiles")
        .upsert({
          barber_reference: barberId,
          barber_email: user.email,
          username: currentUsername,
          display_name: user.name,
          profile_photo_path: input.storagePath,
          profile_photo_url: input.imageUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: "barber_reference" });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the barber photo.", 500);
      }
      break;
    }
    case "remove_barber_photo": {
      const barberId = assertBarberRole(user);
      const result = await supabase
        .from("barber_profiles")
        .update({
          profile_photo_path: null,
          profile_photo_url: null,
          updated_at: new Date().toISOString()
        })
        .eq("barber_reference", barberId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the barber photo.", 500);
      }
      break;
    }
    case "add_barber_gallery_image": {
      const barberId = assertBarberRole(user);
      if (input.featured) {
        const clearResult = await supabase
          .from("barber_portfolios")
          .update({ featured: false })
          .eq("barber_reference", barberId);

        if (clearResult.error) {
          throw new ProfileMediaServiceError("Unable to set featured image.", 500);
        }
      }
      const result = await supabase
        .from("barber_portfolios")
        .insert({
          barber_reference: barberId,
          barber_email: user.email,
          storage_path: input.storagePath,
          image_url: input.imageUrl,
          caption: input.caption?.trim() ?? "",
          featured: Boolean(input.featured),
          updated_at: new Date().toISOString()
        })
        .select("id")
        .single();

      const insertedMedia = result.data as InsertedMediaIdRow | null;
      if (result.error || !insertedMedia?.id) {
        throw new ProfileMediaServiceError("Unable to add the barber gallery image.", 500);
      }
      await autoCreateCulturePostFromProfileMedia(user, {
        role: "barber",
        sourceTable: "barber_portfolio",
        sourceId: insertedMedia.id,
        caption: input.caption?.trim() ?? "",
        storagePath: input.storagePath,
        imageUrl: input.imageUrl,
        barberId
      }, { supabase: cultureSupabase });
      break;
    }
    case "set_barber_featured_media": {
      const barberId = assertBarberRole(user);
      const assetResult = await supabase
        .from("barber_portfolios")
        .select("id")
        .eq("id", input.assetId)
        .eq("barber_reference", barberId)
        .maybeSingle();

      if (assetResult.error || !assetResult.data) {
        throw new ProfileMediaServiceError("Unable to set featured image.", assetResult.error ? 500 : 404);
      }

      const clearResult = await supabase
        .from("barber_portfolios")
        .update({ featured: false, updated_at: new Date().toISOString() })
        .eq("barber_reference", barberId);
      const setResult = await supabase
        .from("barber_portfolios")
        .update({ featured: true, updated_at: new Date().toISOString() })
        .eq("id", input.assetId)
        .eq("barber_reference", barberId);

      if (clearResult.error || setResult.error) {
        throw new ProfileMediaServiceError("Unable to set featured image.", 500);
      }
      break;
    }
    case "remove_barber_gallery_image": {
      const barberId = assertBarberRole(user);
      const result = await supabase
        .from("barber_portfolios")
        .delete()
        .eq("id", input.assetId)
        .eq("barber_reference", barberId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the barber gallery image.", 500);
      }
      break;
    }
    case "set_barber_public_bio": {
      const barberId = assertBarberRole(user);
      const currentUsername = await readExistingBarberUsername(supabase, barberId);
      const result = await supabase
        .from("barber_profiles")
        .upsert({
          barber_reference: barberId,
          barber_email: user.email,
          username: currentUsername,
          display_name: user.name,
          bio: cleanPublicText(input.publicBio),
          updated_at: new Date().toISOString()
        }, { onConflict: "barber_reference" });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the barber public bio.", 500);
      }
      break;
    }
    case "set_barber_public_username": {
      const barberId = assertBarberRole(user);
      const username = assertPublicUsername(input.username);
      await claimPublicUsername(supabase, username, { type: "barber", id: barberId }, profile.id);
      const result = await supabase
        .from("barber_profiles")
        .upsert({
          barber_reference: barberId,
          barber_email: user.email,
          username,
          display_name: user.name,
          updated_at: new Date().toISOString()
        }, { onConflict: "barber_reference" });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the barber public username.", 500);
      }

      await supabase.from("barbers").update({ booking_slug: username }).eq("reference_code", barberId);
      await supabase.from("barbers").update({ booking_slug: username }).eq("id", barberId);
      break;
    }
    case "set_barber_public_location": {
      const barberId = assertBarberRole(user);
      const currentUsername = await readExistingBarberUsername(supabase, barberId);
      const serviceAreaLabel = formatProviderPublicLocation(input);
      const result = await supabase
        .from("barber_profiles")
        .upsert({
          barber_reference: barberId,
          barber_email: user.email,
          username: currentUsername,
          display_name: user.name,
          public_address: cleanPublicText(input.address, 240),
          public_city: cleanPublicText(input.city, 120),
          public_state: cleanPublicText(input.state, 40),
          public_zip: cleanPublicText(input.zip, 20),
          service_area_label: cleanPublicText(serviceAreaLabel, 240),
          updated_at: new Date().toISOString()
        }, { onConflict: "barber_reference" });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the barber public location.", 500);
      }
      break;
    }
    case "set_shop_photo": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const result = await supabase
        .from("shops")
        .update({
          profile_photo_path: input.storagePath,
          profile_photo_url: input.imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the shop photo.", 500);
      }
      break;
    }
    case "remove_shop_photo": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const result = await supabase
        .from("shops")
        .update({
          profile_photo_path: null,
          profile_photo_url: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the shop photo.", 500);
      }
      break;
    }
    case "add_shop_gallery_image": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      if (input.featured) {
        const clearResult = await supabase
          .from("shop_media_assets")
          .update({ featured: false })
          .eq("shop_reference", shopId);

        if (clearResult.error) {
          throw new ProfileMediaServiceError("Unable to set featured image.", 500);
        }
      }
      const result = await supabase
        .from("shop_media_assets")
        .insert({
          shop_reference: shopId,
          storage_path: input.storagePath,
          image_url: input.imageUrl,
          caption: input.caption?.trim() ?? "",
          featured: Boolean(input.featured),
          created_by_profile_id: profile.id,
          updated_at: new Date().toISOString()
        })
        .select("id")
        .single();

      const insertedMedia = result.data as InsertedMediaIdRow | null;
      if (result.error || !insertedMedia?.id) {
        throw new ProfileMediaServiceError("Unable to add the shop gallery image.", 500);
      }
      await autoCreateCulturePostFromProfileMedia(user, {
        role: "owner",
        sourceTable: "shop_media_asset",
        sourceId: insertedMedia.id,
        caption: input.caption?.trim() ?? "",
        storagePath: input.storagePath,
        imageUrl: input.imageUrl,
        shopId
      }, { supabase: cultureSupabase });
      break;
    }
    case "set_shop_featured_media": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const assetResult = await supabase
        .from("shop_media_assets")
        .select("id")
        .eq("id", input.assetId)
        .eq("shop_reference", shopId)
        .maybeSingle();

      if (assetResult.error || !assetResult.data) {
        throw new ProfileMediaServiceError("Unable to set featured image.", assetResult.error ? 500 : 404);
      }

      const clearResult = await supabase
        .from("shop_media_assets")
        .update({ featured: false, updated_at: new Date().toISOString() })
        .eq("shop_reference", shopId);
      const setResult = await supabase
        .from("shop_media_assets")
        .update({ featured: true, updated_at: new Date().toISOString() })
        .eq("id", input.assetId)
        .eq("shop_reference", shopId);

      if (clearResult.error || setResult.error) {
        throw new ProfileMediaServiceError("Unable to set featured image.", 500);
      }
      break;
    }
    case "remove_shop_gallery_image": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const result = await supabase
        .from("shop_media_assets")
        .delete()
        .eq("id", input.assetId)
        .eq("shop_reference", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to remove the shop gallery image.", 500);
      }
      break;
    }
    case "set_shop_public_bio": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const result = await supabase
        .from("shops")
        .update({
          public_bio: cleanPublicText(input.publicBio),
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the shop public bio.", 500);
      }
      break;
    }
    case "set_shop_public_username": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const username = assertPublicUsername(input.username);
      await claimPublicUsername(supabase, username, { type: "shop", id: shopId }, profile.id);
      const result = await supabase
        .from("shops")
        .update({
          public_username: username,
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the shop public username.", 500);
      }
      break;
    }
    case "set_shop_public_location": {
      const shopId = assertShopRole(user, managedShopIds, input.shopId);
      const result = await supabase
        .from("shops")
        .update({
          address: cleanPublicText(input.address, 240),
          city: cleanPublicText(input.city, 120),
          state: cleanPublicText(input.state, 40),
          zip_code: cleanPublicText(input.zipCode, 20),
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save the shop public location.", 500);
      }
      break;
    }
    case "update_viewer_notification_preference": {
      const existingPreference = await supabase
        .from("notification_preferences")
        .select("id")
        .eq("role", user.role)
        .eq("user_email", user.email)
        .maybeSingle();

      if (existingPreference.error) {
        throw new ProfileMediaServiceError("Unable to load communication preferences.", 500);
      }

      const result = await supabase.from("notification_preferences").upsert(
        {
          id: (existingPreference.data as { id?: string } | null)?.id ?? crypto.randomUUID(),
          role: user.role,
          user_email: user.email,
          client_reference: null,
          barber_reference: user.barberId ?? null,
          in_app_enabled: input.inAppEnabled,
          sms_enabled: input.smsEnabled,
          email_enabled: input.emailEnabled,
          push_enabled: input.pushEnabled,
          updated_at: new Date().toISOString()
        },
        { onConflict: "role,user_email" }
      );

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to save communication preferences.", 500);
      }
      break;
    }
  }

  return getProfileMediaWorkspacePayload(user);
}
