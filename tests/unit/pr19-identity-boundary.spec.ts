import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserFromServerMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => null
}));

import { AuthorizationError, getVerifiedActor, requireVerifiedActor } from "@/lib/auth/permissions";

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

/**
 * Source with comments removed. These modules document *why* they refuse to
 * read auth metadata, so scanning the raw text would flag the explanation
 * itself. The invariant is about executable code.
 */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * The identity boundary that PR 20 booking, PR 21 queue and PR 22 money will
 * consume. These are the invariants those packages are entitled to assume.
 */
describe("authority never comes from user-editable metadata", () => {
  /**
   * `user_metadata` (`raw_user_meta_data`) is writable by the account holder
   * through `supabase.auth.updateUser`, so it can express intent but must never
   * decide authorization. The authorization modules are held to that literally.
   */
  const AUTHORIZATION_MODULES = [
    "lib/auth/permissions.ts",
    "lib/auth/role-activation.ts",
    "lib/auth/guards.ts",
    "lib/auth/roles.ts",
    "middleware.ts"
  ];

  it.each(AUTHORIZATION_MODULES)("%s never reads auth metadata", (file) => {
    const code = readCode(file);
    expect(code).not.toMatch(/user_metadata/);
    expect(code).not.toMatch(/raw_user_meta_data/);
    expect(code).not.toMatch(/app_metadata/);
  });

  it("resolves the session with getUser, never with getSession", () => {
    // getSession only decodes the cookie that arrived; getUser revalidates it
    // against the auth server. Only the second is safe on the server.
    for (const file of ["lib/auth/session.ts", "middleware.ts"]) {
      const source = read(file);
      expect(source, `${file} must call getUser`).toMatch(/auth\.getUser\(\)/);
      expect(source, `${file} must not authorize from getSession`).not.toMatch(/auth\.getSession\(\)/);
    }
  });

  it("keeps the role-activation policy free of any metadata parameter", () => {
    // The policy takes a requested intent and the stored role. Where the intent
    // came from is the caller's problem; the answer is the same either way.
    const source = read("lib/auth/role-activation.ts");
    expect(source).toMatch(/export function evaluateRoleActivation\(\s*requestedIntent: unknown,\s*currentRole: string \| null \| undefined\s*\)/);
  });
});

describe("verified actor resolution fails closed", () => {
  beforeEach(() => getCurrentUserFromServerMock.mockReset());

  it("returns null when the session is unauthenticated", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: { id: "guest-user", role: "client_user" }
    });

    expect(await getVerifiedActor()).toBeNull();
  });

  it("returns null when the session claims authentication but carries the guest sentinel", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: { id: "guest-user", role: "client_user" }
    });

    expect(await getVerifiedActor()).toBeNull();
  });

  it("throws 401 rather than returning a partial actor", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: { id: "guest-user", role: "client_user" }
    });

    await expect(requireVerifiedActor()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });

  it("refuses a disabled account even with a valid session", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: { id: "user-1", role: "client_user", accountStatus: "suspended" }
    });

    await expect(requireVerifiedActor()).rejects.toMatchObject({ status: 403, code: "account_inactive" });
  });

  it("admits an active account and one still completing setup", async () => {
    for (const accountStatus of ["active", "profile_only"]) {
      getCurrentUserFromServerMock.mockResolvedValue({
        mode: "supabase",
        authenticated: true,
        user: { id: "user-1", role: "client_user", accountStatus }
      });

      const actor = await requireVerifiedActor();
      expect(actor.user.id).toBe("user-1");
    }
  });

  it("surfaces a typed error the caller can map to a status code", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: { id: "guest-user", role: "client_user" }
    });

    const error = await requireVerifiedActor().catch((cause) => cause);
    expect(error).toBeInstanceOf(AuthorizationError);
  });
});

describe("middleware protects the authenticated surface", () => {
  const source = read("middleware.ts");

  it("redirects to login when getUser reports no verified user", () => {
    expect(source).toMatch(/if \(error \|\| !data\.user\)/);
    expect(source).toMatch(/redirectToLogin\(request\)/);
  });

  it("covers the role-sensitive route families", () => {
    for (const route of [
      "/architect/",
      "/dashboard/",
      "/onboarding/",
      "/post-auth/",
      "/role-select/",
      "/settings/",
      "/team/",
      "/workspace/"
    ]) {
      expect(source, `${route} is unprotected`).toContain(route);
    }
  });

  it("preserves the requested path so a safe redirect can resume it", () => {
    expect(source).toMatch(/searchParams\.set\("redirect"/);
  });
});
