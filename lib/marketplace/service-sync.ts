import { canonicalServiceUuid } from "@/lib/booking/canonical-booking";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Service } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type LocationRow = {
  id: string;
  reference_code: string | null;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type MarketplaceServiceRow = {
  service_reference: string;
  category?: string | null;
  name?: string | null;
  description?: string | null;
  duration_min?: number | string | null;
  buffer_min?: number | string | null;
  price?: number | string | null;
  deposit_amount?: number | string | null;
  full_prepay_required?: boolean | null;
  owner_type?: string | null;
  barber_reference?: string | null;
  shop_reference?: string | null;
  style_tag_ids?: string[] | null;
};

type OnboardingServiceDraft = {
  category: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  price: number;
  deposit: number;
  fullPrepay: boolean;
  active: boolean;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
}

function numeric(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "").replace(/[^0-9.]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerMinutes(value: unknown) {
  const parsed = Math.round(numeric(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function inferCategory(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("beard")) return "Beard";
  if (normalized.includes("kid")) return "Kids";
  if (normalized.includes("design")) return "Designs";
  if (normalized.includes("cut") || normalized.includes("hair")) return "Haircuts";
  return "Signature";
}

function isMissingRelationOrColumn(error: unknown) {
  const record = typeof error === "object" && error ? error as { code?: string; message?: string } : {};
  const message = `${record.message ?? ""}`.toLowerCase();
  return record.code === "42P01"
    || record.code === "42703"
    || record.code === "PGRST204"
    || record.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("column");
}

function firstServiceName(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.split(/[,\n]/).map((entry) => entry.trim()).find(Boolean) ?? "";
}

export function onboardingServiceDraftFromProfileData(profileData: unknown): OnboardingServiceDraft | null {
  const data = typeof profileData === "object" && profileData ? profileData as Record<string, unknown> : {};
  const name = firstServiceName(data.primaryServices ?? data.serviceName ?? data.name);
  const price = numeric(data.startingPrice ?? data.price);
  const durationMin = integerMinutes(data.averageDuration ?? data.durationMin ?? data.duration);

  if (!name || price <= 0 || durationMin < 15) {
    return null;
  }

  return {
    category: inferCategory(name),
    name,
    description: typeof data.serviceDescription === "string" ? data.serviceDescription : "",
    durationMin,
    bufferMin: 0,
    price,
    deposit: 0,
    fullPrepay: false,
    active: true
  };
}

async function resolveLocationForService(supabase: SupabaseClient, shopId?: string | null) {
  if (!shopId) {
    return null;
  }

  const byReference = await supabase
    .from("locations")
    .select("id, reference_code")
    .eq("reference_code", shopId)
    .maybeSingle();

  if (byReference.error) {
    throw byReference.error;
  }

  if (byReference.data) {
    return byReference.data as LocationRow;
  }

  if (!isUuid(shopId)) {
    return null;
  }

  const byId = await supabase
    .from("locations")
    .select("id, reference_code")
    .eq("id", shopId)
    .maybeSingle();

  if (byId.error) {
    throw byId.error;
  }

  return (byId.data ?? null) as LocationRow | null;
}

export async function syncServiceToCanonicalRows(supabase: SupabaseClient, service: Service) {
  const serviceReference = service.id;
  const marketplacePayload = {
    service_reference: serviceReference,
    category: service.category,
    name: service.name,
    description: service.description ?? "",
    duration_min: service.durationMin,
    buffer_min: service.bufferMin,
    price: service.price,
    deposit_amount: service.deposit,
    full_prepay_required: service.fullPrepay,
    owner_type: service.ownerType ?? "shop",
    barber_reference: service.barberId ?? null,
    shop_reference: service.shopId ?? null,
    style_tag_ids: service.styleTagIds ?? [],
    updated_at: new Date().toISOString()
  };

  const marketplaceResult = await supabase
    .from("marketplace_services")
    .upsert(marketplacePayload, { onConflict: "service_reference" });

  if (marketplaceResult.error) {
    throw marketplaceResult.error;
  }

  const location = await resolveLocationForService(supabase, service.shopId);
  if (!location) {
    return {
      serviceReference,
      marketplaceSynced: true,
      canonicalServiceSynced: false
    };
  }

  const canonicalPayload = {
    id: canonicalServiceUuid(serviceReference),
    reference_code: serviceReference,
    location_id: location.id,
    category: service.category,
    name: service.name,
    description: service.description ?? "",
    duration_min: service.durationMin,
    buffer_min: service.bufferMin,
    price: service.price,
    currency: service.currency ?? "usd",
    deposit_amount: service.deposit,
    full_prepay_required: service.fullPrepay,
    active: service.isActive !== false,
    is_bookable: service.isBookable !== false,
    display_order: service.displayOrder ?? 0,
    service_owner_type: service.ownerType ?? "shop",
    barber_reference: service.barberId ?? null,
    shop_reference: location.reference_code ?? service.shopId ?? location.id,
    style_tag_ids: service.styleTagIds ?? [],
    updated_at: new Date().toISOString()
  };

  const canonicalResult = await supabase
    .from("services")
    .upsert(canonicalPayload, { onConflict: "id" });

  if (canonicalResult.error) {
    throw canonicalResult.error;
  }

  return {
    serviceReference,
    marketplaceSynced: true,
    canonicalServiceSynced: true
  };
}

async function readLocationById(supabase: SupabaseClient, locationId: string) {
  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code")
    .eq("id", locationId)
    .maybeSingle();

  if (locationResult.error) {
    throw locationResult.error;
  }

  return (locationResult.data ?? null) as LocationRow | null;
}

async function resolveFirstServiceLocation(supabase: SupabaseClient, barber: BarberRow) {
  const staffLocationResult = await supabase
    .from("staff_locations")
    .select("location_id")
    .eq("profile_id", barber.profile_id)
    .maybeSingle();

  if (staffLocationResult.error) {
    throw staffLocationResult.error;
  }

  const locationId = (staffLocationResult.data as { location_id?: string | null } | null)?.location_id ?? null;
  if (locationId) {
    return readLocationById(supabase, locationId);
  }

  const availabilityResult = await supabase
    .from("availability_rules")
    .select("location_id")
    .eq("barber_id", barber.id)
    .maybeSingle();

  if (availabilityResult.error) {
    throw availabilityResult.error;
  }

  const availabilityLocationId = (availabilityResult.data as { location_id?: string | null } | null)?.location_id ?? null;
  return availabilityLocationId ? readLocationById(supabase, availabilityLocationId) : null;
}

async function resolveBarberForServiceSync(supabase: SupabaseClient, barberReferenceOrUserId: string) {
  const byReference = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("reference_code", barberReferenceOrUserId)
    .maybeSingle();

  if (byReference.error) {
    throw byReference.error;
  }

  if (byReference.data) {
    return byReference.data as BarberRow;
  }

  const byId = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("id", barberReferenceOrUserId)
    .maybeSingle();

  if (byId.error) {
    throw byId.error;
  }

  if (byId.data) {
    return byId.data as BarberRow;
  }

  const byProfile = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("profile_id", barberReferenceOrUserId)
    .maybeSingle();

  if (byProfile.error) {
    throw byProfile.error;
  }

  return (byProfile.data ?? null) as BarberRow | null;
}

async function readCheckoutLibraryServices(supabase: SupabaseClient) {
  // Checkout Library is sourced from marketplace_services keyed by barber_reference.
  let result = await supabase
    .from("marketplace_services")
    .select("service_reference, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, owner_type, barber_reference, shop_reference, style_tag_ids");

  if (result.error && isMissingRelationOrColumn(result.error)) {
    result = await supabase
      .from("marketplace_services")
      .select("service_reference, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, owner_type, barber_reference, shop_reference");
  }

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? []) as MarketplaceServiceRow[];
}

function isRealCheckoutService(row: MarketplaceServiceRow) {
  return row.owner_type === "barber"
    && Boolean(row.service_reference?.trim())
    && Boolean(row.name?.trim())
    && numeric(row.price) > 0
    && integerMinutes(row.duration_min) >= 15;
}

export async function syncCheckoutLibraryServicesForBarber(supabase: SupabaseClient, barberReferenceOrUserId: string) {
  const barber = await resolveBarberForServiceSync(supabase, barberReferenceOrUserId);
  if (!barber) {
    return {
      synced: false,
      checked: 0,
      repaired: 0,
      reason: "missing_barber_row"
    };
  }

  const barberReference = barber.reference_code ?? barber.id;
  const barberKeys = [barberReference, barber.id, barber.profile_id]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const rows = (await readCheckoutLibraryServices(supabase))
    .filter((row) => row.barber_reference && barberKeys.includes(row.barber_reference))
    .filter(isRealCheckoutService);
  const location = await resolveFirstServiceLocation(supabase, barber);
  let repaired = 0;

  for (const row of rows) {
    const beforeKey = row.barber_reference;
    await syncServiceToCanonicalRows(supabase, {
      id: row.service_reference,
      category: row.category?.trim() || inferCategory(row.name ?? ""),
      name: row.name?.trim() ?? "Service",
      description: row.description ?? "",
      durationMin: integerMinutes(row.duration_min),
      bufferMin: integerMinutes(row.buffer_min),
      price: numeric(row.price),
      deposit: numeric(row.deposit_amount),
      fullPrepay: row.full_prepay_required === true,
      addOnIds: [],
      ownerType: "barber",
      barberId: barberReference,
      shopId: location?.reference_code ?? location?.id ?? row.shop_reference ?? undefined,
      styleTagIds: row.style_tag_ids ?? [],
      isActive: true,
      isBookable: true
    });

    if (beforeKey !== barberReference) {
      repaired += 1;
    }
  }

  return {
    synced: rows.length > 0,
    checked: rows.length,
    repaired,
    barberReference,
    sourceTable: "marketplace_services" as const,
    sourceKeyFields: ["barber_reference", "barbers.reference_code", "barbers.id", "barbers.profile_id"]
  };
}

export async function syncOnboardingBarberService(
  supabase: SupabaseClient,
  input: {
    userId: string;
    profileData: unknown;
  }
) {
  const draft = onboardingServiceDraftFromProfileData(input.profileData);
  if (!draft) {
    return {
      synced: false,
      reason: "no_onboarding_service_payload"
    };
  }

  const barberResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("profile_id", input.userId)
    .maybeSingle();

  if (barberResult.error) {
    throw barberResult.error;
  }

  const barber = (barberResult.data ?? null) as BarberRow | null;
  if (!barber) {
    return {
      synced: false,
      reason: "missing_barber_row"
    };
  }

  const barberReference = barber.reference_code ?? barber.id;
  const location = await resolveFirstServiceLocation(supabase, barber);
  const serviceReference = `srv-${slugify(barberReference)}-${slugify(draft.name)}`.slice(0, 96);
  const synced = await syncServiceToCanonicalRows(supabase, {
    id: serviceReference,
    category: draft.category,
    name: draft.name,
    description: draft.description,
    durationMin: draft.durationMin,
    bufferMin: draft.bufferMin,
    price: draft.price,
    deposit: draft.deposit,
    fullPrepay: draft.fullPrepay,
    addOnIds: [],
    ownerType: "barber",
    barberId: barberReference,
    shopId: location?.reference_code ?? location?.id,
    styleTagIds: [],
    isActive: draft.active,
    isBookable: draft.active
  });

  return {
    synced: true,
    barberReference,
    ...synced
  };
}

function isMissingOnboardingTable(error: unknown) {
  const record = typeof error === "object" && error ? error as { code?: string; message?: string } : {};
  const message = `${record.message ?? ""}`.toLowerCase();
  return record.code === "42P01" || record.code === "PGRST205" || message.includes("does not exist") || message.includes("schema cache");
}

export async function syncOnboardingBarberServicesForUser(supabase: SupabaseClient, userId: string) {
  const result = await supabase
    .from("user_onboarding_states")
    .select("user_id, profile_data")
    .eq("user_id", userId)
    .eq("role", "barber")
    .maybeSingle();

  if (result.error) {
    if (isMissingOnboardingTable(result.error)) {
      return { synced: false, reason: "onboarding_table_unavailable" };
    }
    throw result.error;
  }

  if (!result.data) {
    return { synced: false, reason: "missing_onboarding_state" };
  }

  return syncOnboardingBarberService(supabase, {
    userId,
    profileData: (result.data as { profile_data?: unknown }).profile_data
  });
}

export async function syncAllOnboardingBarberServices(supabase: SupabaseClient) {
  const result = await supabase
    .from("user_onboarding_states")
    .select("user_id, profile_data")
    .eq("role", "barber");

  if (result.error) {
    if (isMissingOnboardingTable(result.error)) {
      return [];
    }
    throw result.error;
  }

  const rows = (result.data ?? []) as Array<{ user_id: string; profile_data?: unknown }>;
  return Promise.all(rows.map((row) =>
    syncOnboardingBarberService(supabase, {
      userId: row.user_id,
      profileData: row.profile_data
    })
  ));
}
