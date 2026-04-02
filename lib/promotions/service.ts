import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { calculateAppointmentQuote, type AppointmentFinancialQuote, type BookableServiceSnapshot } from "@/lib/appointments/domain";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  canonicalServiceUuid
} from "@/lib/booking/canonical-booking";
import {
  assertPromotionRedemptionTransition,
  evaluatePromotionDiscount,
  getPromotionAvailabilityState,
  normalizePromotionCode,
  normalizePromotionInput,
  type PromotionCreateInput,
  type PromotionEligibilityContext,
  type PromotionRuleShape,
  type PromotionUpdateInput
} from "@/lib/promotions/domain";
import type {
  PromotionAppliesToScope,
  PromotionDiscountType,
  PromotionRedemptionStatus,
  PromotionType,
  Role,
  UserAccount
} from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  tax_rate: number | string | null;
};

type ServiceRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  name: string;
  category: string;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  active: boolean;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type ClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string | null;
};

type PromotionRow = {
  id: string;
  shop_id: string;
  name: string;
  code: string | null;
  description: string | null;
  promotion_type: PromotionType;
  discount_type: PromotionDiscountType;
  discount_value: number | string;
  applies_to_scope: PromotionAppliesToScope;
  service_id: string | null;
  barber_id: string | null;
  min_subtotal: number | string | null;
  max_discount_amount: number | string | null;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PromotionRedemptionRow = {
  id: string;
  promotion_id: string;
  client_id: string;
  appointment_id: string | null;
  discount_amount: number | string;
  redemption_status: PromotionRedemptionStatus;
  redeemed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PromotionActorContext = {
  user: UserAccount;
  profile: ProfileRow;
  role: UserAccount["role"];
  clientId?: string;
  locationIds: string[];
};

type PromotionBookingContext = {
  clientId?: string;
  shopId: string;
  serviceId: string;
  addOnIds: string[];
  barberId?: string;
  appointmentTime?: string;
};

type PromotionSelection = {
  promotionId?: string;
  promotionCode?: string;
};

type ManagementDirectoryOption = {
  id: string;
  label: string;
};

export type PromotionManagementView = {
  id: string;
  shopId: string;
  shopLabel: string;
  name: string;
  code?: string;
  description?: string;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  discountValue: number;
  appliesToScope: PromotionAppliesToScope;
  serviceId?: string;
  serviceName?: string;
  barberId?: string;
  barberName?: string;
  minSubtotal?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usageCount: number;
  availabilityState: "active" | "scheduled" | "expired" | "inactive";
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientPromotionView = {
  id: string;
  name: string;
  code?: string;
  description?: string;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  discountValue: number;
  appliesToScope: PromotionAppliesToScope;
  serviceId?: string;
  serviceName?: string;
  shopId: string;
  shopLabel: string;
  availabilityState: "active" | "scheduled" | "expired" | "inactive";
  startsAt: string;
  endsAt: string;
  estimatedDiscount: number;
};

export type PromotionQuoteView = {
  serviceTotal: number;
  addOnTotal: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  depositDue: number;
  balanceDue: number;
  totalDurationMinutes: number;
};

export type PromotionPreviewView = {
  promotion: ClientPromotionView;
  quote: PromotionQuoteView;
};

export type PromotionManagementPayload = {
  shops: ManagementDirectoryOption[];
  services: Array<ManagementDirectoryOption & { shopId: string }>;
  barbers: Array<ManagementDirectoryOption & { shopId: string }>;
  promotions: PromotionManagementView[];
};

export class PromotionServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getSupabaseOrThrow() {
  if (!isSupabaseEnabled()) {
    throw new PromotionServiceError("Promotions require the live Supabase environment.", 503);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new PromotionServiceError("Promotions require the live Supabase environment.", 503);
  }

  return supabase;
}

function isPromotionManager(role: UserAccount["role"]) {
  return role === "owner" || role === "manager";
}

function formatShopLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" / ");
  return area ? `${location.name} / ${area}` : [location.name, location.state].filter(Boolean).join(" / ");
}

function toBookableServiceSnapshot(service: ServiceRow): BookableServiceSnapshot {
  return {
    id: service.id,
    referenceCode: service.reference_code ?? service.id,
    name: service.name,
    durationMinutes: service.duration_min,
    bufferMinutes: service.buffer_min,
    unitPrice: numeric(service.price),
    depositAmount: numeric(service.deposit_amount),
    fullPrepayRequired: service.full_prepay_required
  };
}

function mapPromotionRowToRule(row: PromotionRow): PromotionRuleShape {
  return {
    id: row.id,
    shopId: row.shop_id,
    name: row.name,
    code: row.code,
    description: row.description,
    promotionType: row.promotion_type,
    discountType: row.discount_type,
    discountValue: numeric(row.discount_value),
    appliesToScope: row.applies_to_scope,
    serviceId: row.service_id,
    barberId: row.barber_id,
    minSubtotal: row.min_subtotal === null ? null : numeric(row.min_subtotal),
    maxDiscountAmount: row.max_discount_amount === null ? null : numeric(row.max_discount_amount),
    usageLimit: row.usage_limit,
    usageCount: row.usage_count,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active
  };
}

function mapQuote(quote: AppointmentFinancialQuote): PromotionQuoteView {
  return {
    serviceTotal: quote.serviceTotal,
    addOnTotal: quote.addOnTotal,
    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    taxTotal: quote.taxTotal,
    grandTotal: quote.grandTotal,
    depositDue: quote.depositDue,
    balanceDue: quote.balanceDue,
    totalDurationMinutes: quote.totalDurationMinutes
  };
}

async function resolveActor(user: UserAccount, supabase: SupabaseClient): Promise<PromotionActorContext> {
  const profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("email", user.email)
    .maybeSingle();

  if (profileResult.error) {
    throw new PromotionServiceError("Unable to resolve the promotions profile.", 500);
  }

  if (!profileResult.data) {
    throw new PromotionServiceError("No promotions profile is available for this account.", 404);
  }

  const actor: PromotionActorContext = {
    user,
    profile: profileResult.data as ProfileRow,
    role: user.role,
    locationIds: user.locationIds
  };

  if (user.role === "client" && user.clientId) {
    actor.clientId = canonicalClientUuid(user.clientId);
  } else if (user.role === "client") {
    const clientResult = await supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .eq("profile_id", actor.profile.id)
      .maybeSingle();

    if (clientResult.error) {
      throw new PromotionServiceError("Unable to resolve the client promotions account.", 500);
    }

    actor.clientId = (clientResult.data as ClientRow | null)?.id;
  }

  return actor;
}

function assertManagerScope(actor: PromotionActorContext, shopUuid: string) {
  if (!isPromotionManager(actor.role)) {
    throw new PromotionServiceError("Only owner or manager can manage promotions.", 403);
  }

  if (actor.role === "owner") {
    return;
  }

  if (actor.locationIds.length && !actor.locationIds.includes(shopUuid)) {
    throw new PromotionServiceError("This promotion is outside the viewer's shop scope.", 403);
  }
}

async function loadLocationByReference(supabase: SupabaseClient, shopId: string) {
  const result = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state, tax_rate")
    .eq("id", canonicalLocationUuid(shopId))
    .maybeSingle();

  if (result.error) {
    throw new PromotionServiceError("Unable to load the requested shop.", 500);
  }

  if (!result.data) {
    throw new PromotionServiceError("Shop not found for this promotion.", 404);
  }

  return result.data as LocationRow;
}

async function loadServicesByReference(supabase: SupabaseClient, serviceIds: string[]) {
  const ids = [...new Set(serviceIds.filter(Boolean).map((serviceId) => canonicalServiceUuid(serviceId)))];
  if (!ids.length) {
    return [] as ServiceRow[];
  }

  const result = await supabase
    .from("services")
    .select("id, reference_code, location_id, name, category, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active")
    .in("id", ids);

  if (result.error) {
    throw new PromotionServiceError("Unable to load the requested service context.", 500);
  }

  return (result.data ?? []) as ServiceRow[];
}

async function loadBarberByReference(supabase: SupabaseClient, barberId: string) {
  const result = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("id", canonicalBarberUuid(barberId))
    .maybeSingle();

  if (result.error) {
    throw new PromotionServiceError("Unable to load the requested barber.", 500);
  }

  if (!result.data) {
    throw new PromotionServiceError("Barber not found for this promotion.", 404);
  }

  return result.data as BarberRow;
}

async function assertBarberInShop(supabase: SupabaseClient, barber: BarberRow, shopUuid: string) {
  const membershipResult = await supabase
    .from("staff_locations")
    .select("id")
    .eq("profile_id", barber.profile_id)
    .eq("location_id", shopUuid)
    .maybeSingle();

  if (membershipResult.error) {
    throw new PromotionServiceError("Unable to validate barber shop eligibility.", 500);
  }

  if (!membershipResult.data) {
    throw new PromotionServiceError("The selected barber is not assigned to this shop.", 409);
  }
}

async function loadPromotionOrThrow(
  supabase: SupabaseClient,
  selection: PromotionSelection
) {
  if (!selection.promotionId && !selection.promotionCode) {
    throw new PromotionServiceError("Choose a promotion code or offer before applying it.", 400);
  }

  const query = selection.promotionId
    ? supabase
      .from("promotions")
      .select("id, shop_id, name, code, description, promotion_type, discount_type, discount_value, applies_to_scope, service_id, barber_id, min_subtotal, max_discount_amount, usage_limit, usage_count, starts_at, ends_at, is_active, created_by, created_at, updated_at")
      .eq("id", selection.promotionId)
      .maybeSingle()
    : supabase
      .from("promotions")
      .select("id, shop_id, name, code, description, promotion_type, discount_type, discount_value, applies_to_scope, service_id, barber_id, min_subtotal, max_discount_amount, usage_limit, usage_count, starts_at, ends_at, is_active, created_by, created_at, updated_at")
      .eq("code", normalizePromotionCode(selection.promotionCode) ?? "")
      .maybeSingle();

  const result = await query;
  if (result.error) {
    throw new PromotionServiceError("Unable to load the requested promotion.", 500);
  }

  if (!result.data) {
    throw new PromotionServiceError("Promotion not found.", 404);
  }

  return result.data as PromotionRow;
}

async function buildBookingQuoteContext(
  supabase: SupabaseClient,
  input: PromotionBookingContext
) {
  const location = await loadLocationByReference(supabase, input.shopId);
  const serviceRows = await loadServicesByReference(supabase, [input.serviceId, ...input.addOnIds]);
  const primaryService = serviceRows.find((row) => row.id === canonicalServiceUuid(input.serviceId));

  if (!primaryService || !primaryService.active) {
    throw new PromotionServiceError("The selected service is not available for promotions.", 404);
  }

  if (primaryService.location_id !== location.id) {
    throw new PromotionServiceError("The selected service is not available at this shop.", 409);
  }

  const addOnServices = input.addOnIds.map((addOnId) => {
    const addOn = serviceRows.find((row) => row.id === canonicalServiceUuid(addOnId));
    if (!addOn || !addOn.active) {
      throw new PromotionServiceError("One of the selected add-ons is not available.", 404);
    }
    if (addOn.location_id !== location.id) {
      throw new PromotionServiceError("The selected add-on is not available at this shop.", 409);
    }
    return addOn;
  });

  const baseQuote = calculateAppointmentQuote(
    toBookableServiceSnapshot(primaryService),
    addOnServices.map(toBookableServiceSnapshot),
    numeric(location.tax_rate)
  );

  return {
    location,
    primaryService,
    addOnServices,
    baseQuote
  };
}

async function listPromotionCandidatesForBooking(
  supabase: SupabaseClient,
  context: PromotionBookingContext
) {
  const locationUuid = canonicalLocationUuid(context.shopId);
  const result = await supabase
    .from("promotions")
    .select("id, shop_id, name, code, description, promotion_type, discount_type, discount_value, applies_to_scope, service_id, barber_id, min_subtotal, max_discount_amount, usage_limit, usage_count, starts_at, ends_at, is_active, created_by, created_at, updated_at")
    .eq("shop_id", locationUuid)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new PromotionServiceError("Unable to load active promotions.", 500);
  }

  return (result.data ?? []) as PromotionRow[];
}

function buildPromotionPreview(
  row: PromotionRow,
  location: LocationRow,
  primaryService: ServiceRow,
  addOnServices: ServiceRow[],
  baseQuote: AppointmentFinancialQuote,
  context: PromotionBookingContext
): PromotionPreviewView | null {
  const rule = mapPromotionRowToRule(row);
  const evaluation = evaluatePromotionDiscount(rule, {
    shopId: location.id,
    serviceId: primaryService.id,
    barberId: context.barberId ? canonicalBarberUuid(context.barberId) : undefined,
    subtotal: baseQuote.subtotal,
    serviceBaseAmount: numeric(primaryService.price),
    nowIso: context.appointmentTime ?? new Date().toISOString()
  } satisfies PromotionEligibilityContext);

  if (!evaluation.ok) {
    return null;
  }

  return {
    promotion: {
      id: row.id,
      name: row.name,
      code: row.code ?? undefined,
      description: row.description ?? undefined,
      promotionType: row.promotion_type,
      discountType: row.discount_type,
      discountValue: numeric(row.discount_value),
      appliesToScope: row.applies_to_scope,
      serviceId: row.service_id === primaryService.id ? primaryService.reference_code ?? primaryService.id : undefined,
      serviceName: row.service_id === primaryService.id ? primaryService.name : undefined,
      shopId: location.reference_code ?? location.id,
      shopLabel: formatShopLabel(location),
      availabilityState: getPromotionAvailabilityState(rule, context.appointmentTime ?? new Date().toISOString()),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      estimatedDiscount: evaluation.discountAmount
    },
    quote: mapQuote(
      calculateAppointmentQuote(
        toBookableServiceSnapshot(primaryService),
        addOnServices.map(toBookableServiceSnapshot),
        numeric(location.tax_rate),
        {
          discountTotal: evaluation.discountAmount
        }
      )
    )
  };
}

async function mapManagementPayload(actor: PromotionActorContext, supabase: SupabaseClient) {
  const locationsQuery = actor.role === "owner" || !actor.locationIds.length
    ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, tax_rate").order("name")
    : supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, tax_rate").in("id", actor.locationIds).order("name");

  const promotionsQuery = actor.role === "owner" || !actor.locationIds.length
    ? supabase.from("promotions").select("id, shop_id, name, code, description, promotion_type, discount_type, discount_value, applies_to_scope, service_id, barber_id, min_subtotal, max_discount_amount, usage_limit, usage_count, starts_at, ends_at, is_active, created_by, created_at, updated_at").order("created_at", { ascending: false })
    : supabase.from("promotions").select("id, shop_id, name, code, description, promotion_type, discount_type, discount_value, applies_to_scope, service_id, barber_id, min_subtotal, max_discount_amount, usage_limit, usage_count, starts_at, ends_at, is_active, created_by, created_at, updated_at").in("shop_id", actor.locationIds).order("created_at", { ascending: false });

  const servicesQuery = actor.role === "owner" || !actor.locationIds.length
    ? supabase.from("services").select("id, reference_code, location_id, name, category, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active").order("name")
    : supabase.from("services").select("id, reference_code, location_id, name, category, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active").in("location_id", actor.locationIds).order("name");

  const [locationsResult, promotionsResult, servicesResult, barbersResult, profilesResult, membershipsResult] = await Promise.all([
    locationsQuery,
    promotionsQuery,
    servicesQuery,
    supabase.from("barbers").select("id, reference_code, profile_id"),
    supabase.from("profiles").select("id, full_name"),
    actor.role === "owner" || !actor.locationIds.length
      ? supabase.from("staff_locations").select("location_id, profile_id")
      : supabase.from("staff_locations").select("location_id, profile_id").in("location_id", actor.locationIds)
  ]);

  for (const result of [locationsResult, promotionsResult, servicesResult, barbersResult, profilesResult, membershipsResult]) {
    if (result.error) {
      throw new PromotionServiceError("Unable to load the promotions workspace.", 500);
    }
  }

  const locations = (locationsResult.data ?? []) as LocationRow[];
  const promotions = (promotionsResult.data ?? []) as PromotionRow[];
  const services = (servicesResult.data ?? []) as ServiceRow[];
  const barbers = (barbersResult.data ?? []) as BarberRow[];
  const profiles = new Map(((profilesResult.data ?? []) as Array<{ id: string; full_name: string | null }>).map((row) => [row.id, row.full_name ?? row.id]));
  const memberships = (membershipsResult.data ?? []) as Array<{ location_id: string; profile_id: string }>;

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const barberLocationIds = new Map<string, string[]>();

  for (const membership of memberships) {
    const barber = barbers.find((entry) => entry.profile_id === membership.profile_id);
    if (!barber) {
      continue;
    }
    const existing = barberLocationIds.get(barber.id) ?? [];
    if (!existing.includes(membership.location_id)) {
      existing.push(membership.location_id);
      barberLocationIds.set(barber.id, existing);
    }
  }

  const managementPromotions = promotions.map((promotion) => {
    const location = locationById.get(promotion.shop_id);
    const service = promotion.service_id ? serviceById.get(promotion.service_id) : undefined;
    const barber = promotion.barber_id ? barbers.find((entry) => entry.id === promotion.barber_id) : undefined;
    const barberName = barber ? profiles.get(barber.profile_id) ?? barber.reference_code ?? barber.id : undefined;

    return {
      id: promotion.id,
      shopId: location?.reference_code ?? promotion.shop_id,
      shopLabel: location ? formatShopLabel(location) : promotion.shop_id,
      name: promotion.name,
      code: promotion.code ?? undefined,
      description: promotion.description ?? undefined,
      promotionType: promotion.promotion_type,
      discountType: promotion.discount_type,
      discountValue: numeric(promotion.discount_value),
      appliesToScope: promotion.applies_to_scope,
      serviceId: service?.reference_code ?? service?.id ?? undefined,
      serviceName: service?.name,
      barberId: barber?.reference_code ?? barber?.id ?? undefined,
      barberName,
      minSubtotal: promotion.min_subtotal === null ? undefined : numeric(promotion.min_subtotal),
      maxDiscountAmount: promotion.max_discount_amount === null ? undefined : numeric(promotion.max_discount_amount),
      usageLimit: promotion.usage_limit ?? undefined,
      usageCount: promotion.usage_count,
      availabilityState: getPromotionAvailabilityState(mapPromotionRowToRule(promotion)),
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at,
      isActive: promotion.is_active,
      createdAt: promotion.created_at,
      updatedAt: promotion.updated_at
    } satisfies PromotionManagementView;
  });

  return {
    shops: locations.map((location) => ({
      id: location.reference_code ?? location.id,
      label: formatShopLabel(location)
    })),
    services: services.map((service) => ({
      id: service.reference_code ?? service.id,
      label: service.name,
      shopId: locationById.get(service.location_id)?.reference_code ?? service.location_id
    })),
    barbers: barbers.flatMap((barber) => {
      const shopIds = barberLocationIds.get(barber.id) ?? [];
      return shopIds.map((shopId) => ({
        id: barber.reference_code ?? barber.id,
        label: profiles.get(barber.profile_id) ?? barber.reference_code ?? barber.id,
        shopId: locationById.get(shopId)?.reference_code ?? shopId
      }));
    }),
    promotions: managementPromotions
  } satisfies PromotionManagementPayload;
}

export async function listPromotionsForManagement(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  if (!isPromotionManager(actor.role)) {
    throw new PromotionServiceError("Only owner or manager can read the promotions workspace.", 403);
  }

  return mapManagementPayload(actor, supabase);
}

export async function createPromotion(user: UserAccount, input: PromotionCreateInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const normalized = normalizePromotionInput(input, "create");
  const location = await loadLocationByReference(supabase, normalized.shopId ?? "");
  assertManagerScope(actor, location.id);

  let service: ServiceRow | null = null;
  if (normalized.serviceId) {
    const serviceRows = await loadServicesByReference(supabase, [normalized.serviceId]);
    service = serviceRows[0] ?? null;
    if (!service || service.location_id !== location.id) {
      throw new PromotionServiceError("The selected service is not valid for this shop.", 409);
    }
  }

  let barber: BarberRow | null = null;
  if (normalized.barberId) {
    barber = await loadBarberByReference(supabase, normalized.barberId);
    await assertBarberInShop(supabase, barber, location.id);
  }

  if (normalized.code) {
    const existing = await supabase
      .from("promotions")
      .select("id")
      .eq("code", normalized.code)
      .maybeSingle();

    if (existing.error) {
      throw new PromotionServiceError("Unable to validate promotion code uniqueness.", 500);
    }

    if (existing.data) {
      throw new PromotionServiceError("That promotion code is already in use.", 409);
    }
  }

  const now = new Date().toISOString();
  const insertResult = await supabase
    .from("promotions")
    .insert({
      shop_id: location.id,
      name: normalized.name,
      code: normalized.code ?? null,
      description: normalized.description ?? null,
      promotion_type: normalized.promotionType,
      discount_type: normalized.discountType,
      discount_value: normalized.discountValue,
      applies_to_scope: normalized.appliesToScope,
      service_id: service?.id ?? null,
      barber_id: barber?.id ?? null,
      min_subtotal: normalized.minSubtotal ?? null,
      max_discount_amount: normalized.maxDiscountAmount ?? null,
      usage_limit: normalized.usageLimit ?? null,
      usage_count: 0,
      starts_at: normalized.startsAt,
      ends_at: normalized.endsAt,
      is_active: normalized.isActive ?? true,
      created_by: actor.profile.id,
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();

  if (insertResult.error) {
    throw new PromotionServiceError("Unable to create the promotion.", 500);
  }

  const payload = await mapManagementPayload(actor, supabase);
  const promotion = payload.promotions.find((entry) => entry.id === insertResult.data.id);
  if (!promotion) {
    throw new PromotionServiceError("The promotion was created but could not be read back.", 500);
  }

  return { promotion };
}

export async function updatePromotion(user: UserAccount, promotionId: string, input: PromotionUpdateInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  if (!isPromotionManager(actor.role)) {
    throw new PromotionServiceError("Only owner or manager can update promotions.", 403);
  }

  const existing = await loadPromotionOrThrow(supabase, { promotionId });
  assertManagerScope(actor, existing.shop_id);
  const normalized = normalizePromotionInput(input, "update");

  let nextServiceId = existing.service_id;
  if (normalized.serviceId !== undefined) {
    if (!normalized.serviceId) {
      nextServiceId = null;
    } else {
      const serviceRows = await loadServicesByReference(supabase, [normalized.serviceId]);
      const service = serviceRows[0] ?? null;
      if (!service || service.location_id !== existing.shop_id) {
        throw new PromotionServiceError("The selected service is not valid for this shop.", 409);
      }
      nextServiceId = service.id;
    }
  }

  let nextBarberId = existing.barber_id;
  if (normalized.barberId !== undefined) {
    if (!normalized.barberId) {
      nextBarberId = null;
    } else {
      const barber = await loadBarberByReference(supabase, normalized.barberId);
      await assertBarberInShop(supabase, barber, existing.shop_id);
      nextBarberId = barber.id;
    }
  }

  if (normalized.code && normalized.code !== existing.code) {
    const duplicate = await supabase
      .from("promotions")
      .select("id")
      .eq("code", normalized.code)
      .neq("id", existing.id)
      .maybeSingle();

    if (duplicate.error) {
      throw new PromotionServiceError("Unable to validate promotion code uniqueness.", 500);
    }

    if (duplicate.data) {
      throw new PromotionServiceError("That promotion code is already in use.", 409);
    }
  }

  const updateResult = await supabase
    .from("promotions")
    .update({
      name: normalized.name ?? existing.name,
      code: normalized.code === undefined ? existing.code : normalized.code || null,
      description: normalized.description === undefined ? existing.description : normalized.description ?? null,
      promotion_type: normalized.promotionType ?? existing.promotion_type,
      discount_type: normalized.discountType ?? existing.discount_type,
      discount_value: normalized.discountValue ?? numeric(existing.discount_value),
      applies_to_scope: normalized.appliesToScope ?? existing.applies_to_scope,
      service_id: nextServiceId,
      barber_id: nextBarberId,
      min_subtotal: normalized.minSubtotal === undefined ? existing.min_subtotal : normalized.minSubtotal ?? null,
      max_discount_amount: normalized.maxDiscountAmount === undefined ? existing.max_discount_amount : normalized.maxDiscountAmount ?? null,
      usage_limit: normalized.usageLimit === undefined ? existing.usage_limit : normalized.usageLimit ?? null,
      starts_at: normalized.startsAt ?? existing.starts_at,
      ends_at: normalized.endsAt ?? existing.ends_at,
      is_active: normalized.isActive ?? existing.is_active,
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id);

  if (updateResult.error) {
    throw new PromotionServiceError("Unable to update the promotion.", 500);
  }

  const payload = await mapManagementPayload(actor, supabase);
  const promotion = payload.promotions.find((entry) => entry.id === existing.id);
  if (!promotion) {
    throw new PromotionServiceError("The promotion was updated but could not be read back.", 500);
  }

  return { promotion };
}

export async function listClientPromotions(
  input: PromotionBookingContext
) {
  const supabase = getSupabaseOrThrow();
  const { location, primaryService, addOnServices, baseQuote } = await buildBookingQuoteContext(supabase, input);
  const promotions = await listPromotionCandidatesForBooking(supabase, input);

  const previews = promotions
    .map((promotion) => buildPromotionPreview(promotion, location, primaryService, addOnServices, baseQuote, input))
    .filter((preview): preview is PromotionPreviewView => Boolean(preview))
    .sort((left, right) => right.promotion.estimatedDiscount - left.promotion.estimatedDiscount || left.promotion.name.localeCompare(right.promotion.name));

  return {
    promotions: previews.map((preview) => preview.promotion),
    quote: mapQuote(baseQuote)
  };
}

export async function previewPromotionApplication(
  input: PromotionBookingContext & PromotionSelection
) {
  const supabase = getSupabaseOrThrow();
  const { location, primaryService, addOnServices, baseQuote } = await buildBookingQuoteContext(supabase, input);
  const promotion = await loadPromotionOrThrow(supabase, {
    promotionId: input.promotionId,
    promotionCode: input.promotionCode
  });
  const preview = buildPromotionPreview(promotion, location, primaryService, addOnServices, baseQuote, input);

  if (!preview) {
    throw new PromotionServiceError("This promotion is not eligible for the current booking.", 409);
  }

  return preview;
}

export async function preparePromotionForBooking(
  supabase: SupabaseClient,
  input: PromotionBookingContext & PromotionSelection
) {
  if (!input.promotionId && !input.promotionCode) {
    return null;
  }

  const { location, primaryService, addOnServices, baseQuote } = await buildBookingQuoteContext(supabase, input);
  const promotion = await loadPromotionOrThrow(supabase, {
    promotionId: input.promotionId,
    promotionCode: input.promotionCode
  });
  const preview = buildPromotionPreview(promotion, location, primaryService, addOnServices, baseQuote, input);

  if (!preview) {
    throw new PromotionServiceError("This promotion is not eligible for the current booking.", 409);
  }

  return {
    promotionId: promotion.id,
    discountAmount: preview.quote.discountTotal,
    quote: preview.quote,
    promotion: preview.promotion
  };
}

export async function createPromotionRedemptionForAppointment(
  supabase: SupabaseClient,
  input: {
    promotionId: string;
    clientReference: string;
    appointmentReference: string;
    discountAmount: number;
    redeemedAt?: string;
  }
) {
  const appointmentId = canonicalAppointmentUuid(input.appointmentReference);
  const clientId = canonicalClientUuid(input.clientReference);
  const existing = await supabase
    .from("promotion_redemptions")
    .select("id, promotion_id, client_id, appointment_id, discount_amount, redemption_status, redeemed_at, created_at, updated_at")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (existing.error) {
    throw new PromotionServiceError("Unable to inspect existing promotion redemptions.", 500);
  }

  if (existing.data) {
    return existing.data as PromotionRedemptionRow;
  }

  const redeemedAt = input.redeemedAt ?? new Date().toISOString();
  const insertResult = await supabase
    .from("promotion_redemptions")
    .insert({
      promotion_id: input.promotionId,
      client_id: clientId,
      appointment_id: appointmentId,
      discount_amount: roundCurrency(input.discountAmount),
      redemption_status: "applied",
      redeemed_at: redeemedAt,
      created_at: redeemedAt,
      updated_at: redeemedAt
    })
    .select("id, promotion_id, client_id, appointment_id, discount_amount, redemption_status, redeemed_at, created_at, updated_at")
    .single();

  if (insertResult.error) {
    throw new PromotionServiceError("Unable to create the promotion redemption.", 500);
  }

  const promotion = await loadPromotionOrThrow(supabase, { promotionId: input.promotionId });
  const usageUpdate = await supabase
    .from("promotions")
    .update({
      usage_count: Math.max((promotion.usage_count ?? 0) + 1, 0),
      updated_at: redeemedAt
    })
    .eq("id", promotion.id);

  if (usageUpdate.error) {
    throw new PromotionServiceError("Unable to update promotion usage.", 500);
  }

  return insertResult.data as PromotionRedemptionRow;
}

async function updatePromotionRedemptionsForAppointment(
  supabase: SupabaseClient,
  appointmentReference: string,
  nextStatus: PromotionRedemptionStatus,
  updatedAt: string,
  shouldReduceUsage = false
) {
  const appointmentId = canonicalAppointmentUuid(appointmentReference);
  const result = await supabase
    .from("promotion_redemptions")
    .select("id, promotion_id, client_id, appointment_id, discount_amount, redemption_status, redeemed_at, created_at, updated_at")
    .eq("appointment_id", appointmentId);

  if (result.error) {
    throw new PromotionServiceError("Unable to load promotion redemptions for this appointment.", 500);
  }

  const redemptions = (result.data ?? []) as PromotionRedemptionRow[];
  const transitionable = redemptions.filter((redemption) => {
    try {
      assertPromotionRedemptionTransition(redemption.redemption_status, nextStatus);
      return true;
    } catch {
      return false;
    }
  });

  if (!transitionable.length) {
    return;
  }

  const updateResult = await supabase
    .from("promotion_redemptions")
    .update({
      redemption_status: nextStatus,
      redeemed_at: nextStatus === "voided" ? null : updatedAt,
      updated_at: updatedAt
    })
    .eq("appointment_id", appointmentId)
    .in("id", transitionable.map((redemption) => redemption.id));

  if (updateResult.error) {
    throw new PromotionServiceError("Unable to update promotion redemption status.", 500);
  }

  if (shouldReduceUsage) {
    const groupedCounts = new Map<string, number>();
    for (const redemption of transitionable) {
      groupedCounts.set(redemption.promotion_id, (groupedCounts.get(redemption.promotion_id) ?? 0) + 1);
    }

    for (const [promotionId, count] of groupedCounts) {
      const promotion = await loadPromotionOrThrow(supabase, { promotionId });
      const usageUpdate = await supabase
        .from("promotions")
        .update({
          usage_count: Math.max((promotion.usage_count ?? 0) - count, 0),
          updated_at: updatedAt
        })
        .eq("id", promotion.id);

      if (usageUpdate.error) {
        throw new PromotionServiceError("Unable to update promotion usage after voiding a redemption.", 500);
      }
    }
  }
}

export async function completePromotionRedemptionsForAppointment(
  supabase: SupabaseClient,
  appointmentReference: string,
  updatedAt: string
) {
  await updatePromotionRedemptionsForAppointment(supabase, appointmentReference, "completed", updatedAt);
}

export async function voidPromotionRedemptionsForAppointment(
  supabase: SupabaseClient,
  appointmentReference: string,
  updatedAt: string
) {
  await updatePromotionRedemptionsForAppointment(supabase, appointmentReference, "voided", updatedAt, true);
}
