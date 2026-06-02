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
    .select("id, full_name, public_username, profile_photo_path, profile_photo_url")
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
  }>)
    .map((profile) => {
      const displayName = profile.full_name?.trim() || "BVRB3R client";
      const username = profile.public_username || fallbackHandle(displayName);
      return {
        ownerType: "client" as const,
        username,
        displayName,
        imageUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
        publicProfileUrl: `/client/${username}`
      };
    });
}

async function searchBarbers(supabase: SupabaseClient, query: string): Promise<PublicIdentitySearchResult[]> {
  const result = await supabase
    .from("barber_profiles")
    .select("barber_reference, username, display_name, profile_photo_path, profile_photo_url")
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
  }>)
    .filter((profile) => Boolean(profile.username))
    .map((profile) => ({
      ownerType: "barber" as const,
      username: profile.username!,
      displayName: profile.display_name?.trim() || profile.username!,
      imageUrl: toPublicMediaUrl(supabase, profile.profile_photo_path, profile.profile_photo_url),
      publicProfileUrl: `/barber/${profile.username}`
    }));
}

async function searchShops(supabase: SupabaseClient, query: string): Promise<PublicIdentitySearchResult[]> {
  const result = await supabase
    .from("shops")
    .select("id, name, public_username, profile_photo_path, profile_photo_url")
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
  }>)
    .map((shop) => {
      const displayName = shop.name?.trim() || "BVRB3R shop";
      const username = shop.public_username || fallbackHandle(displayName);
      return {
        ownerType: "shop" as const,
        username,
        displayName,
        imageUrl: toPublicMediaUrl(supabase, shop.profile_photo_path, shop.profile_photo_url),
        publicProfileUrl: `/shop/${username}`
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
