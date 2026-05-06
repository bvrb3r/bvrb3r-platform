import { revalidatePath, revalidateTag } from "next/cache";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type BarberProfileRow = {
  barber_reference: string;
  username: string | null;
  visibility_state: string | null;
};

type BarberStatusRow = {
  barber_reference: string;
  status: string | null;
  live_status?: string | null;
  accepting_bookings: boolean | null;
};

type VisibilityRow = {
  barber_reference: string;
  visibility_state: string | null;
  accepts_instant_bookings: boolean | null;
};

type ConnectedAccountRow = {
  payout_readiness_status: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  requirements_currently_due: unknown;
  requirements_past_due: unknown;
  disabled_reason: string | null;
};

const MARKETPLACE_PATHS = [
  "/dashboard/client",
  "/dashboard/client/search"
] as const;

function isMissingRelationError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";
  return code === "42P01" || /does not exist|schema cache/i.test(message);
}

function isPublicVisibilityState(value?: string | null) {
  return value === "public" || value === "featured";
}

function requirementList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function isPayoutReady(row?: ConnectedAccountRow | null) {
  return Boolean(
    row
    && row.payout_readiness_status === "ready"
    && row.charges_enabled
    && row.payouts_enabled
    && !row.disabled_reason
    && requirementList(row.requirements_currently_due).length === 0
    && requirementList(row.requirements_past_due).length === 0
  );
}

async function resolveBarber(supabase: SupabaseClient, barberReference: string) {
  const byReference = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("reference_code", barberReference)
    .maybeSingle();

  if (byReference.error) {
    throw byReference.error;
  }

  if (byReference.data) {
    return byReference.data as BarberRow;
  }

  const byUuid = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("id", barberReference)
    .maybeSingle();

  if (byUuid.error) {
    throw byUuid.error;
  }

  return (byUuid.data ?? null) as BarberRow | null;
}

async function readBarberPayoutReady(supabase: SupabaseClient, barberUuid: string) {
  const result = await supabase
    .from("connected_accounts")
    .select("payout_readiness_status, charges_enabled, payouts_enabled, requirements_currently_due, requirements_past_due, disabled_reason")
    .eq("subject_type", "barber")
    .eq("barber_id", barberUuid)
    .maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return false;
    }
    throw result.error;
  }

  return isPayoutReady(result.data as ConnectedAccountRow | null);
}

async function hasActiveService(supabase: SupabaseClient, barberReference: string, barberUuid: string, profileId: string) {
  const [staffLocationsResult, servicesResult, marketplaceServicesResult] = await Promise.all([
    supabase.from("staff_locations").select("location_id").eq("profile_id", profileId),
    supabase.from("services").select("location_id, service_owner_type, barber_reference, shop_reference, active, is_bookable, price, duration_min, name").eq("active", true),
    supabase.from("marketplace_services").select("owner_type, barber_reference, shop_reference, price, duration_min, name")
  ]);

  if (staffLocationsResult.error) {
    throw staffLocationsResult.error;
  }
  if (servicesResult.error) {
    throw servicesResult.error;
  }
  if (marketplaceServicesResult.error) {
    if (!isMissingRelationError(marketplaceServicesResult.error)) {
      throw marketplaceServicesResult.error;
    }
  }

  const locationIds = new Set(((staffLocationsResult.data ?? []) as Array<{ location_id: string }>).map((row) => row.location_id));
  const canonicalServiceReady = ((servicesResult.data ?? []) as Array<{
    location_id: string;
    service_owner_type: string | null;
    barber_reference: string | null;
    shop_reference: string | null;
    active: boolean | null;
    is_bookable: boolean | null;
    price: number | string | null;
    duration_min: number | null;
    name: string | null;
  }>).some((service) => {
    const hasRealService = service.active !== false
      && service.is_bookable !== false
      && Number(service.price ?? 0) > 0
      && Number(service.duration_min ?? 0) >= 15
      && Boolean(service.name?.trim());
    const direct = service.barber_reference === barberReference || service.barber_reference === barberUuid;
    const shopLinked = !service.barber_reference && locationIds.has(service.location_id);
    return hasRealService && (direct || shopLinked);
  });
  const marketplaceServiceReady = ((marketplaceServicesResult.data ?? []) as Array<{
    owner_type: string | null;
    barber_reference: string | null;
    shop_reference: string | null;
    price: number | string | null;
    duration_min: number | null;
    name: string | null;
  }>).some((service) =>
    service.owner_type === "barber"
    && service.barber_reference === barberReference
    && Number(service.price ?? 0) > 0
    && Number(service.duration_min ?? 0) >= 15
    && Boolean(service.name?.trim())
  );

  return canonicalServiceReady || marketplaceServiceReady;
}

async function hasAvailabilityAndLocation(supabase: SupabaseClient, barberUuid: string, profileId: string) {
  const [staffLocationsResult, availabilityResult] = await Promise.all([
    supabase.from("staff_locations").select("location_id").eq("profile_id", profileId),
    supabase.from("availability_rules").select("id").eq("barber_id", barberUuid).limit(1)
  ]);

  if (staffLocationsResult.error) {
    throw staffLocationsResult.error;
  }
  if (availabilityResult.error) {
    throw availabilityResult.error;
  }

  return {
    hasLocation: ((staffLocationsResult.data ?? []) as Array<{ location_id: string }>).length > 0,
    hasAvailability: ((availabilityResult.data ?? []) as Array<{ id: string }>).length > 0
  };
}

export function revalidateMarketplaceSurfaces(input: { barberUsername?: string | null; shopId?: string | null } = {}) {
  for (const path of MARKETPLACE_PATHS) {
    try {
      revalidatePath(path);
    } catch {}
  }

  if (input.barberUsername) {
    try {
      revalidatePath(`/barber/${input.barberUsername}`);
    } catch {}
  }
  if (input.shopId) {
    try {
      revalidatePath(`/shop/${input.shopId}`);
    } catch {}
  }

  for (const tag of ["marketplace", "client-home", "client-search"]) {
    try {
      revalidateTag(tag);
    } catch {}
  }
}

export async function publishBarberMarketplaceReadiness(supabase: SupabaseClient, barberReferenceOrUuid: string) {
  const barber = await resolveBarber(supabase, barberReferenceOrUuid);
  if (!barber) {
    revalidateMarketplaceSurfaces();
    return { published: false, blockers: ["Missing barber row"] };
  }

  const barberReference = barber.reference_code ?? barber.id;
  const [profileResult, canonicalProfileResult, statusResult, visibilityResult, payoutReady, serviceReady, availabilityLocation] = await Promise.all([
    supabase.from("barber_profiles").select("barber_reference, username, visibility_state").eq("barber_reference", barberReference).maybeSingle(),
    supabase.from("profiles").select("email").eq("id", barber.profile_id).maybeSingle(),
    supabase.from("barber_status").select("barber_reference, status, live_status, accepting_bookings").eq("barber_reference", barberReference).maybeSingle(),
    supabase.from("marketplace_visibility").select("barber_reference, visibility_state, accepts_instant_bookings").eq("barber_reference", barberReference).maybeSingle(),
    readBarberPayoutReady(supabase, barber.id),
    hasActiveService(supabase, barberReference, barber.id, barber.profile_id),
    hasAvailabilityAndLocation(supabase, barber.id, barber.profile_id)
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }
  if (canonicalProfileResult.error) {
    throw canonicalProfileResult.error;
  }
  if (statusResult.error) {
    if (!isMissingRelationError(statusResult.error)) {
      throw statusResult.error;
    }
  }
  if (visibilityResult.error) {
    if (!isMissingRelationError(visibilityResult.error)) {
      throw visibilityResult.error;
    }
  }

  const profile = profileResult.data as BarberProfileRow | null;
  const status = statusResult.data as BarberStatusRow | null;
  const visibility = visibilityResult.data as VisibilityRow | null;
  const profilePublic = isPublicVisibilityState(profile?.visibility_state);
  const existingPublicIntent = isPublicVisibilityState(visibility?.visibility_state);
  const acceptingBookings = status ? status.accepting_bookings === true && status.status !== "offline" && status.live_status !== "offline" : visibility?.accepts_instant_bookings === true;
  const blockers = [
    profile ? null : "Missing public barber profile",
    profilePublic ? null : "Profile visibility is hidden",
    existingPublicIntent || profilePublic ? null : "Marketplace visibility not public",
    acceptingBookings ? null : "Not accepting bookings",
    serviceReady ? null : "No active real services",
    availabilityLocation.hasAvailability ? null : "No real availability",
    availabilityLocation.hasLocation ? null : "No service location or shop connection",
    payoutReady ? null : "Payout setup incomplete"
  ].filter((value): value is string => Boolean(value));
  const published = blockers.length === 0;
  const visibilityState = published ? (profile?.visibility_state === "featured" || visibility?.visibility_state === "featured" ? "featured" : "public") : (profile?.visibility_state ?? visibility?.visibility_state ?? "hidden");
  const visibilityUpdate = await supabase
    .from("marketplace_visibility")
    .upsert({
      barber_reference: barberReference,
      barber_email: ((canonicalProfileResult.data as { email?: string | null } | null)?.email ?? "").trim(),
      visibility_state: isPublicVisibilityState(visibilityState) ? visibilityState : "hidden",
      accepts_instant_bookings: published
    }, { onConflict: "barber_reference" });

  if (visibilityUpdate.error) {
    throw visibilityUpdate.error;
  }

  revalidateMarketplaceSurfaces({ barberUsername: profile?.username, shopId: undefined });
  return { published, blockers };
}

export function publishShopMarketplaceReadiness(input: { shopId?: string | null } = {}) {
  revalidateMarketplaceSurfaces({ shopId: input.shopId });
  return { published: true };
}
