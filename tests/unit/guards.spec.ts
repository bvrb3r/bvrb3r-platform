import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

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

import { getAuthorizedUser, getPlatformAdminUser } from "@/lib/auth/guards";

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

    const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

    expect(user.email).toBe("fade@bvrb3r.demo");
    expect(user.role).toBe("commission_barber");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the booth-rent barber for the barber workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("blaze@bvrb3r.demo") });

    const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

    expect(user.email).toBe("blaze@bvrb3r.demo");
    expect(user.role).toBe("booth_rent_barber");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects owner away from the barber workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getAuthorizedUser(["commission_barber", "booth_rent_barber"])).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("redirects the barber-manager demo account away from the barber-only workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("wave@bvrb3r.demo") });

    await expect(getAuthorizedUser(["commission_barber", "booth_rent_barber"])).rejects.toThrow("REDIRECT:/dashboard/manager");
  });

  it("returns the client for the client workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("client@bvrb3r.demo") });

    const user = await getAuthorizedUser(["client"]);

    expect(user.email).toBe("client@bvrb3r.demo");
    expect(user.role).toBe("client");
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

    await expect(getAuthorizedUser(["client"])).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects owner away from the client workspace", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    await expect(getAuthorizedUser(["client"])).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("returns the founder for the hidden architect route", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: makePlatformAdminUser() });

    const user = await getPlatformAdminUser();

    expect(user.email).toBe("bvrb3r@icloud.com");
    expect(user.role).toBe("platform_admin");
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
