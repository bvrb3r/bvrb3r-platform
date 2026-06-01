import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { isSupabaseEnabled, runtimeConfig } from "@/lib/config/runtime";
import { demoLocations } from "@/lib/data/demo";
import { getEngagementState, setEngagementState } from "@/lib/engagement/state";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import type { BarberPortfolioAsset, Role, ShopMediaAsset, UserAccount } from "@/types/domain";
import type { NotificationPreferenceRecord } from "@/types/engagement";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileMediaRow = {
  id: string;
  email: string;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
};

type BarberProfileMediaRow = {
  barber_reference: string;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  visibility_state: string | null;
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
  brand_line?: string | null;
  neighborhood: string;
  city: string;
  state?: string | null;
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
  created_at: string;
};

type ShopIdRow = {
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
  brandLine?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  address?: string | null;
  profilePhotoUrl?: string;
  profilePhotoPath?: string;
  gallery: ManagedMediaAsset[];
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
    gallery: ManagedMediaAsset[];
  } | null;
  barberProfile: {
    barberId: string;
    profilePhotoUrl?: string;
    profilePhotoPath?: string;
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

type UpdateNotificationPreferenceInput = {
  action: "update_viewer_notification_preference";
  inAppEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

export type ProfileMediaMutationInput =
  | SetPhotoInput
  | RemovePhotoInput
  | AddGalleryImageInput
  | RemoveGalleryImageInput
  | UpdateNotificationPreferenceInput;

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
      clientGalleryByEmail: {}
    };
  }

  return globalThis.__bvrb3rProfileMediaState;
}

function makeDemoId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPublicMediaUrl(client: SupabaseClient | null, storagePath?: string | null, imageUrl?: string | null) {
  if (imageUrl) {
    return imageUrl;
  }

  if (!storagePath) {
    return undefined;
  }

  if (!client) {
    return storagePath;
  }

  const { data } = client.storage.from(runtimeConfig.mediaBucket).getPublicUrl(storagePath);
  return data.publicUrl || storagePath;
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
    featured: false,
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
  const result = await supabase
    .from("profiles")
    .select("id, email, profile_photo_path, profile_photo_url")
    .eq("email", user.email)
    .maybeSingle();

  if (result.error) {
    throw new ProfileMediaServiceError("Unable to resolve the signed-in profile.", 500);
  }

  if (!result.data) {
    throw new ProfileMediaServiceError("No profile was found for this account.", 404);
  }

  return result.data as ProfileMediaRow;
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
      .select("barber_reference, profile_photo_path, profile_photo_url, visibility_state")
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
    visibilityState: visibility?.visibility_state ?? profile?.visibility_state ?? "hidden",
    acceptsInstantBookings: Boolean(visibility?.accepts_instant_bookings),
    gallery
  };
}

async function readSupabaseShopMedia(supabase: SupabaseClient, shopId: string): Promise<ShopMediaWorkspaceView | null> {
  const [shopResult, galleryResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, brand_line, neighborhood, city, state, phone, address, profile_photo_path, profile_photo_url")
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("shop_media_assets")
      .select("id, shop_reference, storage_path, image_url, caption, featured, created_at")
      .eq("shop_reference", shopId)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (shopResult.error || galleryResult.error) {
    throw new ProfileMediaServiceError("Unable to load shop profile media.", 500);
  }

  const shop = (shopResult.data ?? null) as ShopMediaRow | null;
  if (!shop) {
    return null;
  }

  return {
    shopId: shop.id,
    name: shop.name,
    brandLine: shop.brand_line ?? null,
    neighborhood: shop.neighborhood,
    city: shop.city,
    state: shop.state ?? null,
    phone: shop.phone ?? null,
    address: shop.address ?? null,
    label: `${shop.name} • ${shop.neighborhood}, ${shop.city}`,
    profilePhotoPath: shop.profile_photo_path ?? undefined,
    profilePhotoUrl: toPublicMediaUrl(supabase, shop.profile_photo_path, shop.profile_photo_url),
    gallery: ((galleryResult.data ?? []) as ShopGalleryRow[]).map((row) => ({
      ...mapShopGalleryAsset(row),
      imageUrl: toPublicMediaUrl(supabase, row.storage_path, row.image_url) ?? row.image_url
    }))
  };
}

async function readSupabaseClientMedia(supabase: SupabaseClient, profile: ProfileMediaRow) {
  const galleryResult = await supabase
    .from("media_assets")
    .select("id, owner_profile_id, asset_type, storage_path, created_at")
    .eq("owner_profile_id", profile.id)
    .eq("asset_type", "client_profile_post")
    .order("created_at", { ascending: false });

  if (galleryResult.error) {
    throw new ProfileMediaServiceError("Unable to load client profile media.", 500);
  }

  return {
    profilePhotoPath: profile.profile_photo_path ?? undefined,
    profilePhotoUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
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
      label: `${location.name} • ${location.neighborhood}, ${location.city}`,
      gallery: []
    };
  }

  const location = demoLocations.find((entry) => entry.id === shopId);
  return {
    shopId,
    label: location ? `${location.name} • ${location.neighborhood}, ${location.city}` : shop.name,
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
  return {
    profilePhotoPath: state.viewerPhotosByEmail[email]?.storagePath,
    profilePhotoUrl: state.viewerPhotosByEmail[email]?.imageUrl,
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

function updateDemoBarberMedia(barberId: string, input: { profilePhotoUrl?: string; galleryUpdater?: (current: ManagedMediaAsset[]) => ManagedMediaAsset[] }) {
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
            profilePhotoUrl: input.profilePhotoUrl ?? profile.profilePhotoUrl
          }
        : profile
    ),
    barberPortfolios: updatedBarberPortfolios
  };

  setMarketplaceState(nextState);
}

function updateDemoShopMedia(shopId: string, input: { profilePhotoUrl?: string; galleryUpdater?: (current: ManagedMediaAsset[]) => ManagedMediaAsset[] }) {
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
      profilePhotoUrl: input.profilePhotoUrl ?? shop.profilePhotoUrl,
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
      case "update_viewer_notification_preference":
        updateDemoNotificationPreference(user, input);
        break;
    }

    return getProfileMediaWorkspacePayload(user);
  }

  const profile = await resolveProfileRow(user, supabase);
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
      const result = await supabase
        .from("media_assets")
        .insert({
          owner_profile_id: profile.id,
          asset_type: "client_profile_post",
          storage_path: input.storagePath
        });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to add the client profile media.", 500);
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
    case "set_barber_photo": {
      const barberId = assertBarberRole(user);
      const result = await supabase
        .from("barber_profiles")
        .upsert({
          barber_reference: barberId,
          barber_email: user.email,
          username: barberId,
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
        });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to add the barber gallery image.", 500);
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
        });

      if (result.error) {
        throw new ProfileMediaServiceError("Unable to add the shop gallery image.", 500);
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
