import { buildCanonicalBarberProfile, buildCanonicalDiscoveryResults } from "@/lib/booking/intelligence";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEmptyTrustState } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { readSymmetricBlockedProfileIds } from "@/lib/trust/product-pr31-blocks";
import type { DiscoveryResult } from "@/types/domain";

export type PublicDiscoveryFilters = {
  query?: string;
  category?: string;
  locationId?: string;
  minRating?: number;
  maxPrice?: number;
  availability?: "any" | "today" | "now";
  specialty?: string;
  maxDistanceMiles?: number;
};

async function readPublicTrustState() {
  return getTrustProvider().then((provider) => provider.readState()).catch(() => createEmptyTrustState());
}

function matchesPublicFilters(result: DiscoveryResult, filters: PublicDiscoveryFilters) {
  if (typeof filters.minRating === "number" && result.rating < filters.minRating) return false;
  if (typeof filters.maxPrice === "number" && result.priceRange[0] > filters.maxPrice) return false;
  if (typeof filters.maxDistanceMiles === "number" && result.distanceMiles > filters.maxDistanceMiles) return false;

  if (filters.specialty) {
    const specialty = filters.specialty.trim().toLowerCase();
    if (specialty && !result.specialties.some((entry) => entry.toLowerCase().includes(specialty))) return false;
  }

  if (filters.availability === "today") {
    const date = new Date(result.nextAvailableAt);
    if (Number.isNaN(date.getTime()) || date.toDateString() !== new Date().toDateString()) return false;
  }

  if (filters.availability === "now") {
    const date = new Date(result.nextAvailableAt);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 2 * 60 * 60 * 1000) return false;
  }

  return true;
}

export async function readPublicBarberProfile(identifier: string) {
  if (!isSupabaseEnabled()) return null;

  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const trustState = await readPublicTrustState();
  return buildCanonicalBarberProfile(supabase, identifier, trustState);
}

export async function readPublicDiscovery(filters: PublicDiscoveryFilters, viewerProfileId?: string) {
  if (!isSupabaseEnabled()) return [] as DiscoveryResult[];

  const supabase = createSupabaseAdminClient();
  if (!supabase) return [] as DiscoveryResult[];

  const trustState = await readPublicTrustState();
  const results = await buildCanonicalDiscoveryResults(supabase, {
    locationId: filters.locationId ?? "",
    query: filters.query,
    category: filters.category,
    diagnosticRouteName: "public_marketplace_discovery",
    trustState
  });

  const filteredResults = results.filter((result) => matchesPublicFilters(result, filters));
  if (!viewerProfileId || !filteredResults.length) return filteredResults;

  const barberKeys = filteredResults.map((result) => result.barberId);
  const [byReferenceResult, byIdResult, bySlugResult] = await Promise.all([
    supabase.from("barbers").select("id, reference_code, booking_slug, profile_id").in("reference_code", barberKeys),
    supabase.from("barbers").select("id, reference_code, booking_slug, profile_id").in("id", barberKeys),
    supabase.from("barbers").select("id, reference_code, booking_slug, profile_id").in("booking_slug", barberKeys)
  ]);
  if (byReferenceResult.error || byIdResult.error || bySlugResult.error) {
    throw new Error("Unable to verify marketplace block state.");
  }

  const profileIdByReference = new Map<string, string>();
  for (const row of [
    ...(byReferenceResult.data ?? []),
    ...(byIdResult.data ?? []),
    ...(bySlugResult.data ?? [])
  ]) {
    for (const key of [row.id, row.reference_code, row.booking_slug]) {
      if (key) profileIdByReference.set(String(key), String(row.profile_id));
    }
  }
  if (filteredResults.some((result) => !profileIdByReference.get(result.barberId))) {
    throw new Error("Unable to verify every marketplace profile.");
  }

  const blockedProfileIds = await readSymmetricBlockedProfileIds(supabase, viewerProfileId);
  return filteredResults.filter((result) => !blockedProfileIds.has(profileIdByReference.get(result.barberId)!));
}
