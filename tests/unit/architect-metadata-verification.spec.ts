import { describe, expect, it, vi } from "vitest";
import { verifyArchitectMetadata } from "@/lib/auth/architect-metadata-verification";
import type { AuthUserLike } from "@/lib/auth/production-identity";
import type { UserAccount } from "@/types/domain";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key",
  ARCHITECT_USER_ID: "auth-user-1"
};

function makeAuthUser(overrides: Partial<AuthUserLike> = {}): AuthUserLike {
  return {
    id: "auth-user-1",
    email: "architect@bvrb3r.test",
    phone: null,
    email_confirmed_at: "2026-04-08T12:00:00.000Z",
    phone_confirmed_at: null,
    app_metadata: {},
    user_metadata: {},
    ...overrides
  };
}

function makeRuntimeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "auth-user-1",
    role: "client_user",
    email: "architect@bvrb3r.test",
    password: "",
    name: "Architect Test",
    title: "Client",
    locationIds: [],
    accountStatus: "active",
    ...overrides
  };
}

function createLookupClient(authUser: AuthUserLike | null) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: authUser
          },
          error: null
        })),
        listUsers: vi.fn(async () => ({
          data: {
            users: authUser ? [authUser] : []
          },
          error: null
        }))
      }
    }
  };
}

describe("Architect metadata verification", () => {
  it("fails closed when required env vars are missing", async () => {
    const createClient = vi.fn();

    const report = await verifyArchitectMetadata({}, { createClient });

    expect(report.ok).toBe(false);
    expect(report.status).toBe("missing_env");
    expect(report.missingEnv).toEqual([
      "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "ARCHITECT_USER_ID or ARCHITECT_USER_EMAIL"
    ]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports app_metadata Architect as the valid canonical path without printing secrets", async () => {
    const report = await verifyArchitectMetadata(validEnv, {
      createClient: () => createLookupClient(makeAuthUser({
        app_metadata: {
          bvrb3r_access: "architect"
        }
      })),
      buildRuntimeUser: async () => makeRuntimeUser({
        appMetadata: {
          bvrb3r_access: "architect"
        }
      })
    });

    expect(report).toMatchObject({
      ok: true,
      status: "pass",
      appMetadataBvrb3rAccess: "architect",
      mappedAppMetadataBvrb3rAccess: "architect",
      accountStatus: "active",
      accessDecision: {
        allowed: true,
        source: "app_metadata",
        reason: "architect_app_metadata"
      }
    });
    expect(JSON.stringify(report)).not.toContain(validEnv.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("reports missing app_metadata when no canonical claim is present", async () => {
    const report = await verifyArchitectMetadata(validEnv, {
      createClient: () => createLookupClient(makeAuthUser()),
      buildRuntimeUser: async () => makeRuntimeUser()
    });

    expect(report).toMatchObject({
      ok: false,
      status: "missing_app_metadata",
      appMetadataBvrb3rAccess: "missing",
      mappedAppMetadataBvrb3rAccess: "missing",
      userMetadataArchitectClaimPresent: false,
      accessDecision: {
        allowed: false,
        source: "none",
        reason: "missing_architect_access"
      }
    });
  });

  it("reports user_metadata-only Architect claims as invalid", async () => {
    const report = await verifyArchitectMetadata(validEnv, {
      createClient: () => createLookupClient(makeAuthUser({
        user_metadata: {
          bvrb3r_access: "architect"
        }
      })),
      buildRuntimeUser: async () => makeRuntimeUser()
    });

    expect(report).toMatchObject({
      ok: false,
      status: "user_metadata_only",
      userMetadataArchitectClaimPresent: true,
      accessDecision: {
        allowed: false,
        source: "none",
        reason: "missing_architect_access"
      }
    });
  });

  it("reports inactive mapped app_metadata Architect users as denied", async () => {
    const report = await verifyArchitectMetadata(validEnv, {
      createClient: () => createLookupClient(makeAuthUser({
        app_metadata: {
          bvrb3r_access: "architect"
        }
      })),
      buildRuntimeUser: async () => makeRuntimeUser({
        accountStatus: "profile_only",
        appMetadata: {
          bvrb3r_access: "architect"
        }
      })
    });

    expect(report).toMatchObject({
      ok: false,
      status: "inactive_account",
      accountStatus: "profile_only",
      accessDecision: {
        allowed: false,
        source: "none",
        reason: "inactive_account"
      }
    });
  });

  it("supports email lookup without using email as an authorization rule", async () => {
    const authUser = makeAuthUser({
      email: "real-architect@bvrb3r.test",
      app_metadata: {
        bvrb3r_access: "architect"
      }
    });
    const client = createLookupClient(authUser);

    const report = await verifyArchitectMetadata({
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: validEnv.SUPABASE_SERVICE_ROLE_KEY,
      ARCHITECT_USER_EMAIL: "real-architect@bvrb3r.test"
    }, {
      createClient: () => client,
      buildRuntimeUser: async () => makeRuntimeUser({
        appMetadata: {
          bvrb3r_access: "architect"
        }
      })
    });

    expect(report.ok).toBe(true);
    expect(report.targetKind).toBe("email");
    expect(client.auth.admin.listUsers).toHaveBeenCalled();
    expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
  });
});
