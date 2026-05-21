import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRow = {
  id: string;
  profile_id: string | null;
  reference_code: string | null;
  booking_slug: string | null;
};

type BarberPublicProfileRow = {
  barber_reference: string | null;
  username: string | null;
  display_name: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type BarberReportTargetResolution = {
  rawSubjectId: string;
  subjectId: string;
  resolution: "resolved" | "unresolved";
  displayName: string | null;
  publicHref: string | null;
  publicReference: string | null;
  username: string | null;
  warnings: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

export function normalizeBarberReportReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed).pathname
      : trimmed;
    const match = parsed.match(/\/barber\/([^/?#]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).replace(/^@/, "");
    }
  } catch {
    // Fall through to the raw trimmed value.
  }

  return trimmed.replace(/^@/, "");
}

async function findBarberByColumn(
  supabase: SupabaseClient,
  column: "id" | "profile_id" | "reference_code" | "booking_slug" | "public_reference",
  value: string,
  warnings: string[]
): Promise<BarberRow | null> {
  const result = await supabase
    .from("barbers")
    .select("id, profile_id, reference_code, booking_slug")
    .eq(column, value)
    .maybeSingle();

  if (result.error) {
    warnings.push(`barbers.${column}: ${result.error.message ?? result.error.code ?? "lookup_failed"}`);
    return null;
  }

  return result.data as BarberRow | null;
}

async function findBarber(
  supabase: SupabaseClient,
  values: string[],
  warnings: string[]
): Promise<BarberRow | null> {
  for (const value of values) {
    const columns: Array<"id" | "profile_id" | "reference_code" | "booking_slug" | "public_reference"> = isUuid(value)
      ? ["id", "profile_id", "reference_code", "booking_slug", "public_reference"]
      : ["reference_code", "booking_slug", "public_reference"];

    for (const column of columns) {
      const barber = await findBarberByColumn(supabase, column, value, warnings);
      if (barber) return barber;
    }
  }

  return null;
}

async function findPublicProfile(
  supabase: SupabaseClient,
  values: string[],
  warnings: string[]
): Promise<BarberPublicProfileRow | null> {
  for (const value of values) {
    for (const column of ["username", "barber_reference"] as const) {
      const result = await supabase
        .from("barber_profiles")
        .select("barber_reference, username, display_name")
        .eq(column, value)
        .maybeSingle();

      if (result.error) {
        warnings.push(`barber_profiles.${column}: ${result.error.message ?? result.error.code ?? "lookup_failed"}`);
        continue;
      }

      if (result.data) {
        return result.data as BarberPublicProfileRow;
      }
    }
  }

  return null;
}

async function readProfile(supabase: SupabaseClient, profileId: string | null, warnings: string[]) {
  if (!profileId) return null;

  const result = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) {
    warnings.push(`profiles.id: ${result.error.message ?? result.error.code ?? "lookup_failed"}`);
    return null;
  }

  return result.data as ProfileRow | null;
}

export async function resolveBarberReportTarget(
  subjectId: string,
  supabase: SupabaseClient | null = createSupabaseAdminClient()
): Promise<BarberReportTargetResolution> {
  const rawSubjectId = subjectId.trim();
  const normalizedSubjectId = normalizeBarberReportReference(rawSubjectId);
  const values = uniqueStrings([rawSubjectId, normalizedSubjectId]);
  const warnings: string[] = [];

  if (!supabase || !values.length) {
    return {
      rawSubjectId,
      subjectId: rawSubjectId || "unknown",
      resolution: "unresolved",
      displayName: null,
      publicHref: null,
      publicReference: null,
      username: null,
      warnings
    };
  }

  let barber = await findBarber(supabase, values, warnings);
  let publicProfile = await findPublicProfile(supabase, values, warnings);

  if (!barber && publicProfile?.barber_reference) {
    barber = await findBarber(supabase, uniqueStrings([publicProfile.barber_reference]), warnings);
  }

  if (barber && !publicProfile) {
    publicProfile = await findPublicProfile(
      supabase,
      uniqueStrings([barber.reference_code, barber.booking_slug, barber.id, barber.profile_id]),
      warnings
    );
  }

  if (!barber) {
    return {
      rawSubjectId,
      subjectId: rawSubjectId || "unknown",
      resolution: "unresolved",
      displayName: publicProfile?.display_name ?? null,
      publicHref: null,
      publicReference: publicProfile?.barber_reference ?? null,
      username: publicProfile?.username ?? null,
      warnings
    };
  }

  const profile = await readProfile(supabase, barber.profile_id, warnings);
  const slug = publicProfile?.username ?? barber.booking_slug ?? barber.reference_code ?? barber.id;

  return {
    rawSubjectId,
    subjectId: barber.id,
    resolution: "resolved",
    displayName: publicProfile?.display_name ?? profile?.full_name ?? profile?.email ?? barber.reference_code ?? barber.id,
    publicHref: `/barber/${encodeURIComponent(slug)}`,
    publicReference: barber.reference_code ?? barber.booking_slug ?? publicProfile?.barber_reference ?? null,
    username: publicProfile?.username ?? null,
    warnings
  };
}
