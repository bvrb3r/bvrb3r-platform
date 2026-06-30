import { getArchitectAccessDecision, type ArchitectAccessDecision } from "@/lib/auth/architect-access";
import { buildRuntimeUserFromProductionAuth, type AuthUserLike } from "@/lib/auth/production-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type EnvLike = Record<string, string | undefined>;

type VerificationConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  target: {
    kind: "user_id" | "email";
    value: string;
  };
};

type SupabaseAuthUserLookup = {
  auth: {
    admin: {
      getUserById?: (userId: string) => Promise<{ data?: { user?: AuthUserLike | null } | null; error?: { message?: string } | null }>;
      listUsers?: (options?: { page?: number; perPage?: number }) => Promise<{ data?: { users?: AuthUserLike[] } | null; error?: { message?: string } | null }>;
    };
  };
};

export type ArchitectMetadataVerificationStatus =
  | "pass"
  | "missing_env"
  | "auth_client_unavailable"
  | "auth_lookup_failed"
  | "auth_user_not_found"
  | "missing_app_metadata"
  | "user_metadata_only"
  | "inactive_account"
  | "legacy_bridge"
  | "denied";

export type ArchitectMetadataVerificationReport = {
  ok: boolean;
  status: ArchitectMetadataVerificationStatus;
  targetKind: "user_id" | "email" | "missing";
  appMetadataBvrb3rAccess: "architect" | "missing" | "other";
  userMetadataArchitectClaimPresent: boolean;
  mappedAppMetadataBvrb3rAccess: "architect" | "missing" | "other";
  accountStatus: UserAccount["accountStatus"] | "missing";
  accessDecision: ArchitectAccessDecision;
  missingEnv: string[];
  message: string;
};

export type VerifyArchitectMetadataDeps = {
  createClient?: () => SupabaseAuthUserLookup | null;
  buildRuntimeUser?: (authUser: AuthUserLike) => Promise<UserAccount>;
};

function readEnv(env: EnvLike, key: string) {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function accessValue(value: unknown): "architect" | "missing" | "other" {
  if (value === "architect") return "architect";
  if (value === undefined || value === null || value === "") return "missing";
  return "other";
}

function resolveConfig(env: EnvLike): VerificationConfig | { missingEnv: string[] } {
  const supabaseUrl = readEnv(env, "SUPABASE_URL") ?? readEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const userId = readEnv(env, "ARCHITECT_USER_ID");
  const userEmail = readEnv(env, "ARCHITECT_USER_EMAIL");
  const missingEnv = [
    supabaseUrl ? null : "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
    serviceRoleKey ? null : "SUPABASE_SERVICE_ROLE_KEY",
    userId || userEmail ? null : "ARCHITECT_USER_ID or ARCHITECT_USER_EMAIL"
  ].filter((value): value is string => Boolean(value));

  if (!supabaseUrl || !serviceRoleKey || (!userId && !userEmail)) {
    return { missingEnv };
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    target: userId
      ? {
          kind: "user_id",
          value: userId
        }
      : {
          kind: "email",
          value: userEmail as string
        }
  };
}

function missingEnvReport(missingEnv: string[]): ArchitectMetadataVerificationReport {
  return {
    ok: false,
    status: "missing_env",
    targetKind: "missing",
    appMetadataBvrb3rAccess: "missing",
    userMetadataArchitectClaimPresent: false,
    mappedAppMetadataBvrb3rAccess: "missing",
    accountStatus: "missing",
    accessDecision: {
      allowed: false,
      source: "none",
      reason: "missing_user"
    },
    missingEnv,
    message: `Missing required env: ${missingEnv.join(", ")}. No live Supabase verification was run.`
  };
}

async function findAuthUser(client: SupabaseAuthUserLookup, config: VerificationConfig) {
  if (config.target.kind === "user_id") {
    if (!client.auth.admin.getUserById) {
      return { user: null, error: "Supabase Auth Admin getUserById is unavailable." };
    }

    const result = await client.auth.admin.getUserById(config.target.value);
    if (result.error) {
      return { user: null, error: result.error.message ?? "Supabase Auth Admin lookup failed." };
    }

    return { user: result.data?.user ?? null, error: null };
  }

  if (!client.auth.admin.listUsers) {
    return { user: null, error: "Supabase Auth Admin listUsers is unavailable for email lookup." };
  }

  const targetEmail = config.target.value.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage });
    if (result.error) {
      return { user: null, error: result.error.message ?? "Supabase Auth Admin lookup failed." };
    }

    const users = result.data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) {
      return { user: match, error: null };
    }

    if (users.length < perPage) {
      break;
    }
  }

  return { user: null, error: null };
}

function classifyReport(authUser: AuthUserLike, runtimeUser: UserAccount): ArchitectMetadataVerificationReport {
  const accessDecision = getArchitectAccessDecision(runtimeUser);
  const appMetadataBvrb3rAccess = accessValue(authUser.app_metadata?.bvrb3r_access);
  const mappedAppMetadataBvrb3rAccess = accessValue(runtimeUser.appMetadata?.bvrb3r_access);
  const userMetadataArchitectClaimPresent = authUser.user_metadata?.bvrb3r_access === "architect";
  const accountStatus = runtimeUser.accountStatus ?? "missing";

  if (accessDecision.allowed && accessDecision.source === "app_metadata") {
    return {
      ok: true,
      status: "pass",
      targetKind: "user_id",
      appMetadataBvrb3rAccess,
      userMetadataArchitectClaimPresent,
      mappedAppMetadataBvrb3rAccess,
      accountStatus,
      accessDecision,
      missingEnv: [],
      message: "Canonical app_metadata Architect path passes."
    };
  }

  const status = (() => {
    if (accessDecision.reason === "inactive_account") return "inactive_account";
    if (accessDecision.source === "legacy_bridge") return "legacy_bridge";
    if (appMetadataBvrb3rAccess === "missing" && userMetadataArchitectClaimPresent) return "user_metadata_only";
    if (appMetadataBvrb3rAccess === "missing") return "missing_app_metadata";
    return "denied";
  })();

  return {
    ok: false,
    status,
    targetKind: "user_id",
    appMetadataBvrb3rAccess,
    userMetadataArchitectClaimPresent,
    mappedAppMetadataBvrb3rAccess,
    accountStatus,
    accessDecision,
    missingEnv: [],
    message: status === "user_metadata_only"
      ? "Architect claim exists only in user_metadata; user_metadata does not authorize Architect access."
      : "Canonical app_metadata Architect path did not pass."
  };
}

export async function verifyArchitectMetadata(env: EnvLike = process.env, deps: VerifyArchitectMetadataDeps = {}): Promise<ArchitectMetadataVerificationReport> {
  const config = resolveConfig(env);
  if ("missingEnv" in config) {
    return missingEnvReport(config.missingEnv);
  }

  if (env === process.env && !process.env.NEXT_PUBLIC_SUPABASE_URL && config.supabaseUrl) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = config.supabaseUrl;
  }

  const client = deps.createClient?.() ?? createSupabaseAdminClient();
  if (!client) {
    return {
      ...missingEnvReport(["SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
      status: "auth_client_unavailable",
      targetKind: config.target.kind,
      missingEnv: [],
      message: "Supabase admin client is unavailable. No live Supabase verification was run."
    };
  }

  const lookup = await findAuthUser(client, config);
  if (lookup.error) {
    return {
      ...missingEnvReport([]),
      status: "auth_lookup_failed",
      targetKind: config.target.kind,
      message: `Supabase Auth lookup failed: ${lookup.error.replaceAll(config.serviceRoleKey, "[redacted]")}`
    };
  }

  if (!lookup.user) {
    return {
      ...missingEnvReport([]),
      status: "auth_user_not_found",
      targetKind: config.target.kind,
      message: "Supabase Auth user was not found for the provided target."
    };
  }

  const runtimeUser = await (deps.buildRuntimeUser ?? ((authUser) => buildRuntimeUserFromProductionAuth(authUser, { readOnly: true })))(lookup.user);
  return {
    ...classifyReport(lookup.user, runtimeUser),
    targetKind: config.target.kind
  };
}
