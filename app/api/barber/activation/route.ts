import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

const updateActivationSchema = z.object({
  action: z.literal("set_visibility"),
  visibilityState: z.enum(["public", "hidden"]),
  acceptsInstantBookings: z.boolean().optional()
});

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

function updateDemoVisibility(barberId: string, input: z.infer<typeof updateActivationSchema>) {
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
