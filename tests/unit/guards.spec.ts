import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";
import type { UserAccount } from "@/types/domain";

const { getCurrentUserFromServerMock, redirectMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

import { getAuthorizedUser, getPlatformAdminUser, hasArchitectAccess } from "@/lib/auth/guards";

function makeGuardUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "guard-user",
    role: "client_user",
    email: "guard-user@bvrb3r.app",
    password: "",
    name: "Guard User",
    title: "Client",
    locationIds: [],
    accountStatus: "active",
    ...overrides
  };
}

describe("authorized user guard", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    redirectMock.mockClear();
  });

  it("returns the manager for the manager workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("manager@bvrb3r.demo") });

    const user = await getAuthorizedUser(["manager"]);

    expect(user.email).toBe("manager@bvrb3r.demo");
    expect(user.role).toBe("manager");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects owner away from the manager workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getAuthorizedUser(["manager"])).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("returns the front desk user for the front desk workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("frontdesk@bvrb3r.demo") });

    const user = await getAuthorizedUser(["front_desk"]);

    expect(user.email).toBe("frontdesk@bvrb3r.demo");
    expect(user.role).toBe("front_desk");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects manager away from the front desk workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("manager@bvrb3r.demo") });

    await expect(getAuthorizedUser(["front_desk"])).rejects.toThrow("REDIRECT:/dashboard/manager");
  });

  it("returns the commission barber for the barber workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("fade@bvrb3r.demo") });

    const user = await getAuthorizedUser(["barber_user"]);

    expect(user.email).toBe("fade@bvrb3r.demo");
    expect(user.role).toBe("barber_user");
    expect(user.barberSubtype).toBe("commission");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the booth-rent barber for the barber workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("blaze@bvrb3r.demo") });

    const user = await getAuthorizedUser(["barber_user"]);

    expect(user.email).toBe("blaze@bvrb3r.demo");
    expect(user.role).toBe("barber_user");
    expect(user.barberSubtype).toBe("booth_rent");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects owner away from the barber workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getAuthorizedUser(["barber_user"])).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("redirects the barber-manager demo account away from the barber-only workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("wave@bvrb3r.demo") });

    await expect(getAuthorizedUser(["barber_user"])).rejects.toThrow("REDIRECT:/dashboard/manager");
  });

  it("returns the client for the client workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("client@bvrb3r.demo") });

    const user = await getAuthorizedUser(["client_user"]);

    expect(user.email).toBe("client@bvrb3r.demo");
    expect(user.role).toBe("client_user");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated guest visitors away from protected dashboards", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: {
        id: "guest-user",
        role: "client",
        email: "guest@bvrb3r.local",
        password: "",
        name: "Guest",
        title: "Guest",
        locationIds: [],
        accountStatus: "profile_only"
      }
    });

    await expect(getAuthorizedUser(["client_user"])).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects owner away from the client workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getAuthorizedUser(["client_user"])).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("returns the founder for the hidden architect route", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: makePlatformAdminUser() });

    const user = await getPlatformAdminUser();

    expect(user.email).toBe("bvrb3r@icloud.com");
    expect(user.role).toBe("platform_admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns an active canonical platform-admin session without relying on an email shortcut", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: makePlatformAdminUser({
        email: "ops-admin@bvrb3r.app"
      })
    });

    const user = await getPlatformAdminUser();

    expect(user.email).toBe("ops-admin@bvrb3r.app");
    expect(user.role).toBe("platform_admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns an active canonical Architect metadata session through the architect guard", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: makeGuardUser({
        appMetadata: {
          bvrb3r_access: "architect"
        }
      })
    });

    const user = await getPlatformAdminUser();

    expect(user.appMetadata?.bvrb3r_access).toBe("architect");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects the retired demo architect identity away from the architect route", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("architect@bvrb3r.demo") });

    await expect(getPlatformAdminUser()).rejects.toThrow("REDIRECT:/post-auth");
  });

  it("redirects a normal owner away from the architect route", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getPlatformAdminUser()).rejects.toThrow("REDIRECT:/dashboard/owner");
  });
});

describe("architect access helper", () => {
  it("allows active canonical Architect metadata", () => {
    expect(hasArchitectAccess(makeGuardUser({
      appMetadata: {
        bvrb3r_access: "architect"
      }
    }))).toBe(true);
  });

  it("blocks inactive canonical Architect metadata", () => {
    expect(hasArchitectAccess(makeGuardUser({
      accountStatus: "suspended",
      appMetadata: {
        bvrb3r_access: "architect"
      }
    }))).toBe(false);
  });

  it("blocks canonical Architect metadata when accountStatus is missing", () => {
    expect(hasArchitectAccess(makeGuardUser({
      accountStatus: undefined,
      appMetadata: {
        bvrb3r_access: "architect"
      }
    }))).toBe(false);
  });

  it.each([
    "deactivated",
    "suspended",
    "banned",
    "profile_only"
  ] as const)("blocks %s canonical Architect metadata", (accountStatus) => {
    expect(hasArchitectAccess(makeGuardUser({
      accountStatus,
      appMetadata: {
        bvrb3r_access: "architect"
      }
    }))).toBe(false);
  });

  it("blocks userMetadata Architect claims", () => {
    const userMetadataOnlyUser = {
      ...makeGuardUser(),
      userMetadata: {
        bvrb3r_access: "architect"
      }
    };

    expect(hasArchitectAccess(userMetadataOnlyUser)).toBe(false);
  });

  it("blocks unrelated appMetadata values", () => {
    expect(hasArchitectAccess(makeGuardUser({
      appMetadata: {
        bvrb3r_access: "support"
      }
    }))).toBe(false);
  });

  it.each([
    "client_user",
    "barber_user",
    "shop_owner_user"
  ] as const)("blocks %s without Architect metadata", (role) => {
    expect(hasArchitectAccess(makeGuardUser({ role }))).toBe(false);
  });

  it.each([
    "client_user",
    "barber_user",
    "shop_owner_user"
  ] as const)("allows active %s only when canonical Architect metadata is present", (role) => {
    expect(hasArchitectAccess(makeGuardUser({
      role,
      appMetadata: {
        bvrb3r_access: "architect"
      }
    }))).toBe(true);
  });

  it("blocks unauthenticated or null users", () => {
    expect(hasArchitectAccess(null)).toBe(false);
    expect(hasArchitectAccess(undefined)).toBe(false);
  });

  it("blocks the guest/kiosk user shape", () => {
    expect(hasArchitectAccess(makeGuardUser({
      id: "guest-user",
      role: "client",
      email: "guest@bvrb3r.local",
      name: "Guest",
      title: "Guest",
      accountStatus: "profile_only"
    }))).toBe(false);
  });

  it("allows active legacy platform_admin through the TEMPORARY bridge to prevent Architect lockout until real app_metadata is seeded", () => {
    expect(hasArchitectAccess(makePlatformAdminUser({
      appMetadata: undefined
    }))).toBe(true);
  });

  it("blocks inactive legacy platform_admin", () => {
    expect(hasArchitectAccess(makePlatformAdminUser({
      accountStatus: "suspended",
      appMetadata: undefined
    }))).toBe(false);
  });
});
