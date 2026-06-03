import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { toPublicMediaUrl } from "@/lib/profile/public-media-url";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type PublicIdentitySearchResult = {
  ownerType: "client" | "barber" | "shop";
  username: string;
  displayName: string;
  imageUrl?: string | null;
  publicProfileUrl: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function cleanQuery(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9 _-]+/g, "").slice(0, 64);
}

function normalizeHandle(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32) ?? "";
}

function fallbackHandle(value: string) {
  return normalizeHandle(value) || "profile";
}

async function searchClients(supabase: SupabaseClient, query: string): Promise<PublicIdentitySearchResult[]> {
  const result = await supabase
    .from("profiles")
    .select("id, full_name, public_username, public_city, public_state, profile_photo_path, profile_photo_url")
    .or(`public_username.ilike.%${query}%,full_name.ilike.%${query}%`)
    .limit(8);

  if (result.error) {
    return [];
  }

  return ((result.data ?? []) as Array<{
    id: string;
    full_name?: string | null;
    public_username?: string | null;
    profile_photo_path?: string | null;
    profile_photo_url?: string | null;
    public_city?: string | null;
    public_state?: string | null;
  }>)
    .map((profile) => {
      const displayName = profile.full_name?.trim() || "BVRB3R client";
      const username = profile.public_username || fallbackHandle(displayName);
      return {
        ownerType: "client" as const,
        username,
        displayName,
        imageUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
        publicProfileUrl: `/client/${username}`,
        city: profile.public_city ?? null,
        state: profile.public_state ?? null
      };
    });
}

async function searchBarbers(supabase: SupabaseClient, query: string): Promise<PublicIdentitySearchResult[]> {
  const result = await supabase
    .from("barber_profiles")
    .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url, public_address, public_city, public_state, public_zip, service_area_label")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(8);

  if (result.error) {
    return [];
  }

  return ((result.data ?? []) as Array<{
    barber_reference: string;
    username?: string | null;
    display_name?: string | null;
    profile_photo_path?: string | null;
    profile_photo_url?: string | null;
    public_address?: string | null;
    public_city?: string | null;
    public_state?: string | null;
    public_zip?: string | null;
    service_area_label?: string | null;
  }>)
    .filter((profile) => Boolean(profile.username))
    .map((profile) => ({
      ownerType: "barber" as const,
      username: profile.username!,
      displayName: profile.display_name?.trim() || profile.username!,
      imageUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
      publicProfileUrl: `/barber/${profile.username}`,
      address: profile.public_address ?? profile.service_area_label ?? null,
      city: profile.public_city ?? null,
      state: profile.public_state ?? null,
      zip: profile.public_zip ?? null
    }));
}

async function searchShops(supabase: SupabaseClient, query: string): Promise<PublicIdentitySearchResult[]> {
  const result = await supabase
    .from("shops")
    .select("id, name, public_username, address, city, state, zip_code, profile_photo_path, profile_photo_url")
    .or(`public_username.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(8);

  if (result.error) {
    return [];
  }

  return ((result.data ?? []) as Array<{
    id: string;
    name?: string | null;
    public_username?: string | null;
    profile_photo_path?: string | null;
    profile_photo_url?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  }>)
    .map((shop) => {
      const displayName = shop.name?.trim() || "BVRB3R shop";
      const username = shop.public_username || fallbackHandle(displayName);
      return {
        ownerType: "shop" as const,
        username,
        displayName,
        imageUrl: toPublicMediaUrl(supabase, shop.profile_photo_path, shop.profile_photo_url),
        publicProfileUrl: `/shop/${username}`,
        address: shop.address ?? null,
        city: shop.city ?? null,
        state: shop.state ?? null,
        zip: shop.zip_code ?? null
      };
    });
}

export async function searchPublicIdentities(query: string): Promise<PublicIdentitySearchResult[]> {
  const cleaned = cleanQuery(query);
  if (!cleaned || !isSupabaseEnabled()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return [];
  }

  const [clients, barbers, shops] = await Promise.all([
    searchClients(supabase, cleaned),
    searchBarbers(supabase, cleaned),
    searchShops(supabase, cleaned)
  ]);

  return [...clients, ...barbers, ...shops].slice(0, 12);
}
