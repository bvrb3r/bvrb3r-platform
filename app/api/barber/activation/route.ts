import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { normalizeWorkingHoursRows } from "@/lib/barber/domain";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";
import { createBarberShopJoinRequest } from "@/lib/operations/shop-team-invites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const workingHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().trim().regex(/^\d{2}:\d{2}$/)
});

const serviceLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(180),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(40),
  postalCode: z.string().trim().max(20).optional()
});

const setVisibilitySchema = z.object({
  action: z.literal("set_visibility"),
  visibilityState: z.enum(["public", "hidden"]),
  acceptsInstantBookings: z.boolean().optional()
});

const saveAvailabilitySchema = z.object({
  action: z.literal("save_availability"),
  workingHours: z.array(workingHourSchema).min(1),
  locationMode: z.enum(["custom", "shop", "later"]),
  serviceLocation: serviceLocationSchema.optional(),
  shopId: z.string().trim().min(1).optional()
});

const updateActivationSchema = z.discriminatedUnion("action", [
  setVisibilitySchema,
  saveAvailabilitySchema
]);

type SetVisibilityInput = z.infer<typeof setVisibilitySchema>;
type SaveAvailabilityInput = z.infer<typeof saveAvailabilitySchema>;

function assertBarber(user: UserAccount) {
  if (!(user.role === "commission_barber" || user.role === "booth_rent_barber") || !user.barberId) {
    return null;
  }

  return user.barberId;
}

function toErrorResponse(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

function getIndependentLocationReference(barberReference: string) {
  return `independent-${barberReference}`;
}

function formatServiceLocationLabel(input: SaveAvailabilityInput["serviceLocation"]) {
  if (!input) {
    return null;
  }

  return [input.name, [input.city, input.state].filter(Boolean).join(", ")].filter(Boolean).join(" | ");
}

function updateDemoVisibility(barberId: string, input: SetVisibilityInput) {
  const state = getMarketplaceState();
  const profileExists = state.barberProfiles.some((profile) => profile.barberId === barberId);
  if (!profileExists) {
    return null;
  }

  const nextVisibility = {
    barberId,
    visibilityState: input.visibilityState,
    acceptsInstantBookings: input.acceptsInstantBookings ?? true
  } as const;

  setMarketplaceState({
    ...state,
    barberProfiles: state.barberProfiles.map((profile) =>
      profile.barberId === barberId
        ? { ...profile, visibilityState: input.visibilityState }
        : profile
    ),
    visibilities: [
      nextVisibility,
      ...state.visibilities.filter((visibility) => visibility.barberId !== barberId)
    ]
  });

  return nextVisibility;
}

function updateDemoActivationAvailability(barberId: string, input: SaveAvailabilityInput) {
  const state = getMarketplaceState();
  const barber = state.barbers.find((entry) => entry.id === barberId);
  if (!barber) {
    return null;
  }

  const serviceLocationLabel = formatServiceLocationLabel(input.serviceLocation);
  if (input.locationMode !== "custom" || !input.serviceLocation) {
    return {
      hasAvailabilityDraft: true,
      hasServiceLocation: false,
      locationMode: input.locationMode,
      serviceLocationLabel,
      requestedShopId: input.shopId ?? null
    };
  }

  const locationId = getIndependentLocationReference(barberId);
  const nextLocation = {
    id: locationId,
    name: input.serviceLocation.name,
    neighborhood: input.serviceLocation.address,
    city: input.serviceLocation.city,
    state: input.serviceLocation.state,
    phone: "",
    hours: `${input.workingHours.length} working day${input.workingHours.length === 1 ? "" : "s"}`,
    chairs: 1,
    taxRate: 0,
    address: input.serviceLocation.address
  };

  setMarketplaceState({
    ...state,
    locations: [
      nextLocation,
      ...state.locations.filter((location) => location.id !== locationId)
    ],
    barbers: state.barbers.map((entry) =>
      entry.id === barberId
        ? { ...entry, locationIds: Array.from(new Set([...(entry.locationIds ?? []), locationId])) }
        : entry
    )
  });

  return {
    hasAvailabilityDraft: true,
    hasServiceLocation: true,
    locationMode: input.locationMode,
    serviceLocationLabel,
    requestedShopId: null
  };
}

async function resolveBarber(supabase: SupabaseClient, barberReference: string) {
  const referenceResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
    .eq("reference_code", barberReference)
    .maybeSingle();

  if (referenceResult.error) {
    throw referenceResult.error;
  }

  if (referenceResult.data) {
    return referenceResult.data as {
      id: string;
      reference_code: string | null;
      profile_id: string;
      compensation_model: string;
      commission_rate: number | string | null;
      booth_rent_amount: number | string | null;
      booth_rent_frequency: string | null;
    };
  }

  const uuidResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
    .eq("id", barberReference)
    .maybeSingle();

  if (uuidResult.error) {
    throw uuidResult.error;
  }

  return uuidResult.data as {
    id: string;
    reference_code: string | null;
    profile_id: string;
    compensation_model: string;
    commission_rate: number | string | null;
    booth_rent_amount: number | string | null;
    booth_rent_frequency: string | null;
  } | null;
}

async function persistActivationAvailability(
  supabase: SupabaseClient,
  user: UserAccount,
  barberReference: string,
  input: SaveAvailabilityInput
) {
  const barber = await resolveBarber(supabase, barberReference);
  if (!barber) {
    return NextResponse.json({ error: "No barber account is available for activation setup." }, { status: 404 });
  }

  const workingHours = normalizeWorkingHoursRows(input.workingHours);
  const now = new Date().toISOString();
  let hasServiceLocation = false;
  let serviceLocationLabel = formatServiceLocationLabel(input.serviceLocation);
  let requestedShopId: string | null = null;

  if (input.locationMode === "custom") {
    if (!input.serviceLocation) {
      return NextResponse.json({ error: "Add a service location before saving custom-location availability." }, { status: 400 });
    }

    const locationReference = getIndependentLocationReference(barberReference);
    const existingLocation = await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .eq("reference_code", locationReference)
      .maybeSingle();

    if (existingLocation.error) {
      throw existingLocation.error;
    }

    const locationPayload = {
      reference_code: locationReference,
      name: input.serviceLocation.name,
      neighborhood: input.serviceLocation.address,
      city: input.serviceLocation.city,
      state: input.serviceLocation.state,
      phone: null,
      hours: {},
      tax_rate: 0
    };
    const locationResult = existingLocation.data
      ? await supabase
        .from("locations")
        .update(locationPayload)
        .eq("id", (existingLocation.data as { id: string }).id)
        .select("id, reference_code, name, neighborhood, city, state")
        .single()
      : await supabase
        .from("locations")
        .insert(locationPayload)
        .select("id, reference_code, name, neighborhood, city, state")
        .single();

    if (locationResult.error || !locationResult.data) {
      throw locationResult.error ?? new Error("Unable to save barber service location.");
    }

    const location = locationResult.data as { id: string; reference_code: string | null; name: string; neighborhood: string; city: string; state: string };
    const membershipResult = await supabase
      .from("staff_locations")
      .upsert({
        profile_id: barber.profile_id,
        location_id: location.id,
        routing_model: "freelance",
        commission_rate: barber.commission_rate,
        booth_rent_amount: barber.booth_rent_amount,
        booth_rent_frequency: barber.booth_rent_frequency,
        updated_at: now,
        fintech_updated_at: now
      }, { onConflict: "profile_id,location_id" });

    if (membershipResult.error) {
      throw membershipResult.error;
    }

    const deleteResult = await supabase
      .from("availability_rules")
      .delete()
      .eq("barber_id", barber.id)
      .eq("location_id", location.id);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    const insertResult = await supabase
      .from("availability_rules")
      .insert(workingHours.map((row) => ({
        barber_id: barber.id,
        location_id: location.id,
        weekday: row.weekday,
        start_time: row.startTime,
        end_time: row.endTime
      })));

    if (insertResult.error) {
      throw insertResult.error;
    }

    hasServiceLocation = true;
    serviceLocationLabel = [location.name, [location.city, location.state].filter(Boolean).join(", ")].filter(Boolean).join(" | ");
  } else if (input.locationMode === "shop" && input.shopId) {
    requestedShopId = input.shopId;
    const membershipResult = await supabase
      .from("staff_locations")
      .select("id, location_id")
      .eq("profile_id", barber.profile_id)
      .eq("location_id", input.shopId)
      .maybeSingle();

    if (membershipResult.error) {
      throw membershipResult.error;
    }

    if (membershipResult.data) {
      const deleteResult = await supabase
        .from("availability_rules")
        .delete()
        .eq("barber_id", barber.id)
        .eq("location_id", input.shopId);

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      const insertResult = await supabase
        .from("availability_rules")
        .insert(workingHours.map((row) => ({
          barber_id: barber.id,
          location_id: input.shopId,
          weekday: row.weekday,
          start_time: row.startTime,
          end_time: row.endTime
        })));

      if (insertResult.error) {
        throw insertResult.error;
      }

      hasServiceLocation = true;
    } else {
      await createBarberShopJoinRequest(user, {
        shopId: input.shopId,
        message: "Barber requested to join this shop while setting activation availability."
      });
    }
  }

  await markOnboardingStepComplete(user, "barber", "barber_availability", {
    weeklySchedule: workingHours,
    acceptsSameDay: true,
    serviceMode: input.locationMode,
    activationAvailability: {
      workingHours,
      locationMode: input.locationMode,
      serviceLocation: input.serviceLocation ?? null,
      shopId: input.shopId ?? null,
      requestedShopId,
      updatedAt: now
    }
  });

  return NextResponse.json({
    hasAvailabilityDraft: true,
    hasServiceLocation,
    locationMode: input.locationMode,
    serviceLocationLabel,
    requestedShopId
  });
}

export async function POST(request: Request) {
  try {
    const parsed = updateActivationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber activation payload." }, { status: 400 });
    }

    const user = await getSessionUser();
    const barberId = assertBarber(user);
    if (!barberId) {
      return NextResponse.json({ error: "Only barbers can update barber activation." }, { status: 403 });
    }

    if (!isSupabaseEnabled()) {
      if (parsed.data.action === "save_availability") {
        const result = updateDemoActivationAvailability(barberId, parsed.data);
        if (!result) {
          return NextResponse.json({ error: "No barber account is available for activation setup." }, { status: 404 });
        }

        await markOnboardingStepComplete(user, "barber", "barber_availability", {
          weeklySchedule: parsed.data.workingHours,
          acceptsSameDay: true,
          serviceMode: parsed.data.locationMode,
          activationAvailability: {
            workingHours: parsed.data.workingHours,
            locationMode: parsed.data.locationMode,
            serviceLocation: parsed.data.serviceLocation ?? null,
            shopId: parsed.data.shopId ?? null,
            requestedShopId: parsed.data.shopId ?? null,
            updatedAt: new Date().toISOString()
          }
        });

        return NextResponse.json(result);
      }

      const result = updateDemoVisibility(barberId, parsed.data);
      if (!result) {
        return NextResponse.json({ error: "Create a public barber profile before turning visibility on." }, { status: 409 });
      }

      return NextResponse.json(result);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured for barber activation." }, { status: 503 });
    }

    if (parsed.data.action === "save_availability") {
      return await persistActivationAvailability(supabase, user, barberId, parsed.data);
    }

    const profileUpdate = await supabase
      .from("barber_profiles")
      .update({ visibility_state: parsed.data.visibilityState })
      .eq("barber_reference", barberId)
      .select("barber_reference")
      .maybeSingle();

    if (profileUpdate.error) {
      throw profileUpdate.error;
    }

    if (!profileUpdate.data) {
      return NextResponse.json({ error: "Create a public barber profile before turning visibility on." }, { status: 409 });
    }

    const visibility = {
      barber_reference: barberId,
      visibility_state: parsed.data.visibilityState,
      accepts_instant_bookings: parsed.data.acceptsInstantBookings ?? true
    };

    const visibilityUpdate = await supabase
      .from("marketplace_visibility")
      .upsert(visibility, { onConflict: "barber_reference" });

    if (visibilityUpdate.error) {
      throw visibilityUpdate.error;
    }

    return NextResponse.json({
      visibilityState: parsed.data.visibilityState,
      acceptsInstantBookings: visibility.accepts_instant_bookings
    });
  } catch (error) {
    return toErrorResponse(error, "Unable to update barber activation.");
  }
}
