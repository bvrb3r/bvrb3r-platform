import { revalidatePath, revalidateTag } from "next/cache";
import { getCanonicalMarketplaceEligibility } from "@/lib/booking/intelligence";
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

const MARKETPLACE_PATHS = [
  "/dashboard/client",
  "/dashboard/client/search"
] as const;

function isPublicVisibilityState(value?: string | null) {
  return value === "public" || value === "featured";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "barber";
}

function fallbackBarberSlug(barberReference: string) {
  const shortReference = barberReference
    .replace(/^barber[-_]?/i, "")
    .replace(/[^a-z0-9_-]+/gi, "")
    .slice(0, 18)
    .toLowerCase();
  return `barber-${shortReference || "profile"}`;
}

function publicBarberSlug(username: string | null | undefined, barberReference: string) {
  if (!username?.trim()) {
    return fallbackBarberSlug(barberReference);
  }

  const normalized = slugify(username ?? "");
  return normalized !== "barber" ? normalized : fallbackBarberSlug(barberReference);
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
  const [profileResult, canonicalProfileResult, eligibility] = await Promise.all([
    supabase.from("barber_profiles").select("barber_reference, username, visibility_state").eq("barber_reference", barberReference).maybeSingle(),
    supabase.from("profiles").select("email").eq("id", barber.profile_id).maybeSingle(),
    getCanonicalMarketplaceEligibility(supabase, barberReference)
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }
  if (canonicalProfileResult.error) {
    throw canonicalProfileResult.error;
  }

  const profile = profileResult.data as BarberProfileRow | null;
  const blockers = eligibility.blockers;
  const published = eligibility.eligible;
  const visibilityState = isPublicVisibilityState(profile?.visibility_state) ? profile!.visibility_state : "hidden";
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

  revalidateMarketplaceSurfaces({ barberUsername: publicBarberSlug(profile?.username, barberReference), shopId: undefined });
  return { published, blockers };
}

export function publishShopMarketplaceReadiness(input: { shopId?: string | null } = {}) {
  revalidateMarketplaceSurfaces({ shopId: input.shopId });
  return { published: true };
}
