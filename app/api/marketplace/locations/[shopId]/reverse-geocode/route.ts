import { NextResponse } from "next/server";
import { isShopOwnerRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { MapboxGeocodingError, reverseMapboxAddress } from "@/lib/marketplace/mapbox-geocoding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || !isShopOwnerRole(session.user.role)) {
    return NextResponse.json(
      { error: "Only an authenticated shop owner can check a saved shop pin." },
      { status: 403 }
    );
  }

  const rate = consumeRateLimit({
    bucket: "marketplace-reverse-geocode",
    key: `${session.user.id}:${clientKeyFromRequest(request)}`,
    limit: 8,
    windowMs: 10 * 60_000
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many saved-pin checks. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { shopId } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Shop location storage is unavailable." }, { status: 503 });
  }
  const shopResult = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("owner_profile_id", session.user.id)
    .maybeSingle();
  if (shopResult.error) {
    return NextResponse.json({ error: "Shop ownership could not be verified." }, { status: 503 });
  }
  if (!shopResult.data) {
    return NextResponse.json({ error: "This shop does not belong to the signed-in owner." }, { status: 403 });
  }

  const locationResult = await supabase
    .from("locations")
    .select("latitude, longitude, location_visibility, location_verified")
    .eq("reference_code", shopId)
    .maybeSingle();
  if (locationResult.error) {
    return NextResponse.json({ error: "The saved shop pin could not be read." }, { status: 503 });
  }
  const location = locationResult.data as {
    latitude: number | null;
    longitude: number | null;
    location_visibility: "exact" | "approximate" | "hidden";
    location_verified: boolean;
  } | null;
  if (
    !location
    || !location.location_verified
    || location.location_visibility !== "exact"
    || typeof location.latitude !== "number"
    || typeof location.longitude !== "number"
  ) {
    return NextResponse.json(
      { error: "Save an exact verified commercial shop pin before checking its address." },
      { status: 409 }
    );
  }

  try {
    const address = await reverseMapboxAddress({
      latitude: location.latitude,
      longitude: location.longitude
    });
    return NextResponse.json(
      {
        address: {
          formattedAddress: address.formattedAddress,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode
        },
        persisted: false
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (!(error instanceof MapboxGeocodingError)) throw error;
    return NextResponse.json(
      {
        error: error.code === "mapbox_server_token_missing"
          ? "Saved-pin checking is not configured."
          : error.code === "mapbox_address_not_found"
            ? "The saved pin did not resolve to a complete US address."
            : "The saved pin could not be checked right now.",
        code: error.code
      },
      { status: error.code === "mapbox_address_not_found" ? 422 : 503 }
    );
  }
}
