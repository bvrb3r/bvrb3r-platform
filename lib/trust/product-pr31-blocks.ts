import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class ProductPr31BlockError extends Error {
  constructor(message = "Unable to verify account block state.") {
    super(message);
    this.name = "ProductPr31BlockError";
  }
}

export async function readSymmetricBlockedProfileIds(
  supabase: AdminClient,
  viewerProfileId: string
): Promise<Set<string>> {
  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from("culture_profile_blocks")
      .select("blocked_profile_id")
      .eq("blocker_profile_id", viewerProfileId)
      .eq("active", true),
    supabase
      .from("culture_profile_blocks")
      .select("blocker_profile_id")
      .eq("blocked_profile_id", viewerProfileId)
      .eq("active", true)
  ]);

  if (outgoingResult.error || incomingResult.error) {
    throw new ProductPr31BlockError();
  }

  return new Set([
    ...(outgoingResult.data ?? []).map((row) => String(row.blocked_profile_id)),
    ...(incomingResult.data ?? []).map((row) => String(row.blocker_profile_id))
  ].filter(Boolean));
}

export async function areProfilesCultureBlocked(
  supabase: AdminClient,
  viewerProfileId: string,
  targetProfileId: string
) {
  if (viewerProfileId === targetProfileId) return false;
  return (await readSymmetricBlockedProfileIds(supabase, viewerProfileId)).has(targetProfileId);
}
