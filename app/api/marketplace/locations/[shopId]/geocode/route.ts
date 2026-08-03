import { NextResponse } from "next/server";
import { z } from "zod";
import { isShopOwnerRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  forwardPermanentMapboxAddress,
  MapboxGeocodingError
} from "@/lib/marketplace/mapbox-geocoding";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  address: z.string().trim().min(6).max(240),
  mapboxId: z.string().trim().min(6).max(240),
  addressLine2: z.string().trim().max(120).optional(),
  visibility: z.enum(["exact", "approximate"]).default("exact")
});

export async function POST(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a complete shop address." }, { status: 400 });
  }

  const session = await getCurrentUserFromServer();
  if (!session.authenticated || !isShopOwnerRole(session.user.role)) {
    return NextResponse.json({ error: "Only an authenticated shop owner can save a shop pin." }, { status: 403 });
  }
  const { shopId } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Shop location storage is unavailable." }, { status: 503 });
  }

  const shopResult = await supabase
    .from("shops")
    .select("id, owner_profile_id")
    .eq("id", shopId)
    .eq("owner_profile_id", session.user.id)
    .maybeSingle();
  if (shopResult.error || !shopResult.data) {
    return NextResponse.json({ error: "This shop does not belong to the signed-in owner." }, { status: 403 });
  }
  const locationResult = await supabase
    .from("locations")
    .select("id")
    .eq("reference_code", shopId)
    .maybeSingle();
  if (locationResult.error || !locationResult.data) {
    return NextResponse.json({ error: "Create the shop location before publishing its map pin." }, { status: 409 });
  }

  const rate = consumeRateLimit({
    bucket: "marketplace-permanent-geocode",
    key: `${session.user.id}:${clientKeyFromRequest(request)}`,
    limit: 8,
    windowMs: 10 * 60_000
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many address verification attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let geocoded;
  try {
    geocoded = await forwardPermanentMapboxAddress(parsed.data.address);
  } catch (error) {
    if (!(error instanceof MapboxGeocodingError)) throw error;
    if (error.code === "mapbox_server_token_missing") {
      return NextResponse.json(
        { error: "Permanent shop geocoding is not configured.", code: error.code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: error.code === "mapbox_address_not_found"
        ? "Mapbox could not verify a complete US shop address."
        : "The address could not be verified right now." },
      { status: error.code === "mapbox_address_not_found" ? 422 : 502 }
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Shop location storage is unavailable." }, { status: 503 });
  }
  const saved = await admin.rpc("pr39_save_verified_shop_location", {
    p_location_id: locationResult.data.id,
    p_owner_profile_id: session.user.id,
    p_formatted_address: geocoded.formattedAddress,
    p_address_line_2: parsed.data.addressLine2 ?? "",
    p_city: geocoded.city,
    p_region: geocoded.region,
    p_postal_code: geocoded.postalCode,
    p_longitude: geocoded.longitude,
    p_latitude: geocoded.latitude,
    p_provider_reference: geocoded.providerReference,
    p_precision: geocoded.accuracy,
    p_visibility: parsed.data.visibility
  }).single();
  if (saved.error || !saved.data) {
    return NextResponse.json({ error: "The verified address could not be saved." }, { status: 500 });
  }
  const savedLocation = saved.data as {
    location_visibility: "exact" | "approximate" | "hidden";
    location_verified: boolean;
    geocoded_at: string;
  };

  return NextResponse.json({
    location: {
      id: locationResult.data.id,
      address: geocoded.formattedAddress,
      city: geocoded.city,
      region: geocoded.region,
      postalCode: geocoded.postalCode,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      visibility: savedLocation.location_visibility,
      verified: savedLocation.location_verified,
      geocodedAt: savedLocation.geocoded_at
    }
  });
}
