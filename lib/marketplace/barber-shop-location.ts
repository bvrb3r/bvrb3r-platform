import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ApprovedShopLocation = {
  shopId: string;
  locationId: string;
};

function isApprovedStatus(value: unknown) {
  return ["approved", "verified"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Barber setup receives the public shops.id from the directory, while
 * availability_rules and staff_locations require the canonical locations.id
 * UUID. Resolve that bridge server-side and fail closed if the shop is not
 * approved or has not finished creating its canonical location.
 */
export async function resolveApprovedShopLocation(
  supabase: SupabaseClient,
  shopId: string
): Promise<ApprovedShopLocation | null> {
  const shopResult = await supabase
    .from("shops")
    .select("id, app_approval_status")
    .eq("id", shopId)
    .maybeSingle();

  if (shopResult.error) {
    throw shopResult.error;
  }

  const shop = shopResult.data as { id: string; app_approval_status?: string | null } | null;
  if (!shop || !isApprovedStatus(shop.app_approval_status)) {
    return null;
  }

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code")
    .eq("reference_code", shop.id)
    .maybeSingle();

  if (locationResult.error) {
    throw locationResult.error;
  }

  const location = locationResult.data as { id: string; reference_code: string | null } | null;
  return location
    ? { shopId: shop.id, locationId: location.id }
    : null;
}
