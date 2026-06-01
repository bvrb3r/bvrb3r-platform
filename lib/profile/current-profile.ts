import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserAccount } from "@/types/domain";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class CurrentProfileResolverError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "profile_resolver_failed") {
    super(message);
    this.name = "CurrentProfileResolverError";
    this.status = status;
    this.code = code;
  }
}

export type SignedInProfileResult<TProfile> = {
  authUserId?: string;
  user: UserAccount;
  profile: TProfile;
  profileId: string;
  role?: string | null;
  email?: string | null;
};

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function logResolverFailure(code: string, details: Record<string, unknown>) {
  console.error("[profile-resolver] signed-in profile resolution failed", {
    code,
    ...details
  });
}

export async function resolveSignedInProfile<TProfile extends { id: string; email?: string | null; role?: string | null }>({
  user,
  supabase,
  select
}: {
  user: UserAccount;
  supabase?: SupabaseAdminClient | null;
  select: string;
}): Promise<SignedInProfileResult<TProfile>> {
  const admin = supabase ?? createSupabaseAdminClient();
  if (!admin) {
    logResolverFailure("supabase_admin_unavailable", { userId: user.id, email: user.email });
    throw new CurrentProfileResolverError("Unable to resolve account profile.", 503, "supabase_admin_unavailable");
  }

  const server = await createSupabaseServerClient();
  const authResult = await server?.auth.getUser().catch((error: unknown) => {
    logResolverFailure("auth_user_lookup_failed", {
      userId: user.id,
      email: user.email,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  const authUser = authResult?.data.user ?? null;
  const authUserId = authUser?.id;
  const idCandidates = uniqueValues([authUserId, user.id === "guest-user" ? null : user.id]);

  for (const profileId of idCandidates) {
    const result = await admin
      .from("profiles")
      .select(select)
      .eq("id", profileId)
      .maybeSingle();

    if (result.error) {
      logResolverFailure("profile_id_lookup_failed", {
        profileId,
        authUserId,
        appUserId: user.id,
        email: user.email,
        message: result.error.message
      });
      throw new CurrentProfileResolverError("Unable to resolve account profile.", 500, "profile_id_lookup_failed");
    }

    if (result.data) {
      const profile = result.data as unknown as TProfile;
      return {
        authUserId,
        user,
        profile,
        profileId: profile.id,
        role: profile.role,
        email: profile.email
      };
    }
  }

  const emailCandidates = uniqueValues([authUser?.email, user.email]);
  for (const email of emailCandidates) {
    const result = await admin
      .from("profiles")
      .select(select)
      .eq("email", email)
      .maybeSingle();

    if (result.error) {
      logResolverFailure("profile_email_lookup_failed", {
        authUserId,
        appUserId: user.id,
        email,
        message: result.error.message
      });
      throw new CurrentProfileResolverError("Unable to resolve account profile.", 500, "profile_email_lookup_failed");
    }

    if (result.data) {
      const profile = result.data as unknown as TProfile;
      return {
        authUserId,
        user,
        profile,
        profileId: profile.id,
        role: profile.role,
        email: profile.email
      };
    }
  }

  logResolverFailure("profile_not_found", {
    authUserId,
    appUserId: user.id,
    email: user.email,
    triedIds: idCandidates.length,
    triedEmails: emailCandidates.length
  });
  throw new CurrentProfileResolverError("Unable to resolve account profile.", 404, "profile_not_found");
}
