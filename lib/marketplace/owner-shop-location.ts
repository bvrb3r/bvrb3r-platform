import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type OwnerShopLocationSource = {
  id: string;
  owner_profile_id: string;
  name: string;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type CanonicalOwnerShopLocation = {
  id: string;
  reference_code: string | null;
};

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

async function readCanonicalLocation(supabase: SupabaseClient, shopId: string) {
  return supabase
    .from("locations")
    .select("id, reference_code")
    .eq("reference_code", shopId)
    .maybeSingle();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readLegacyLocationByShopId(supabase: SupabaseClient, shopId: string) {
  if (!isUuid(shopId)) {
    return { data: null, error: null };
  }

  return supabase
    .from("locations")
    .select("id, reference_code")
    .eq("id", shopId)
    .maybeSingle();
}

async function readExistingOwnerShopLocation(supabase: SupabaseClient, shopId: string) {
  const canonical = await readCanonicalLocation(supabase, shopId);
  if (canonical.error || canonical.data) {
    return canonical;
  }

  // Early production rows used the shop UUID as the location UUID before
  // reference_code became the canonical cross-table link. Reuse that row so
  // reconciliation never creates a second physical location for one shop.
  return readLegacyLocationByShopId(supabase, shopId);
}

/**
 * Bridges an owner-scoped shop id to the canonical UUID location id required
 * by geocoding, hours, marketplace publication, and Stripe Connect. This never
 * marks the location public or verified; only provider-backed geocoding may.
 */
export async function ensureCanonicalOwnerShopLocation(
  supabase: SupabaseClient,
  shop: OwnerShopLocationSource
): Promise<CanonicalOwnerShopLocation> {
  const existing = await readExistingOwnerShopLocation(supabase, shop.id);
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return existing.data as CanonicalOwnerShopLocation;
  }

  const inserted = await supabase
    .from("locations")
    .insert({
      reference_code: shop.id,
      name: shop.name,
      neighborhood: shop.neighborhood ?? shop.address ?? shop.name,
      city: shop.city ?? "",
      state: shop.state ?? "",
      postal_code: shop.zip_code ?? null,
      phone: shop.phone ?? null,
      address: shop.address ?? null,
      hours: {},
      location_active: true,
      location_visibility: "hidden",
      location_verified: false
    })
    .select("id, reference_code")
    .single();

  if (!inserted.error && inserted.data) {
    return inserted.data as CanonicalOwnerShopLocation;
  }

  // Concurrent owner/profile/geocode requests may race on reference_code.
  // The unique constraint chooses one canonical row; every caller reuses it.
  if (isUniqueViolation(inserted.error)) {
    const winner = await readExistingOwnerShopLocation(supabase, shop.id);
    if (!winner.error && winner.data) {
      return winner.data as CanonicalOwnerShopLocation;
    }
    throw winner.error ?? inserted.error;
  }

  throw inserted.error ?? new Error("Unable to create the canonical shop location.");
}
