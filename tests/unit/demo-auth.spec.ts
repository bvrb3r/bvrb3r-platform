import { findDemoUserByEmail, getDefaultRouteForUser, getDemoLauncherAccounts, getUserRoleLabel, isPlatformAdminUser, resolveDemoUser } from "@/lib/auth/demo-auth";

describe("demo account mapping", () => {
  it.each([
    ["architect@bvrb3r.demo", "platform_admin", "/architect", "Platform admin"],
    ["client@bvrb3r.demo", "client", "/dashboard/client", "Client"],
    ["lux@bvrb3r.demo", "booth_rent_barber", "/dashboard/barber", "Freelance barber"],
    ["blaze@bvrb3r.demo", "booth_rent_barber", "/dashboard/barber", "Booth-rent barber"],
    ["fade@bvrb3r.demo", "commission_barber", "/dashboard/barber", "Commission barber"],
    ["wave@bvrb3r.demo", "manager", "/dashboard/manager", "Barber manager"],
    ["frontdesk@bvrb3r.demo", "front_desk", "/dashboard/front-desk", "Front desk"],
    ["manager@bvrb3r.demo", "manager", "/dashboard/manager", "Shop manager"],
    ["owner@bvrb3r.demo", "owner", "/dashboard/owner", "Shop owner"]
  ])("maps %s to %s and %s", (email, role, route, roleLabel) => {
    const user = findDemoUserByEmail(email);

    expect(user?.email).toBe(email);
    expect(user?.role).toBe(role);
    expect(user ? getDefaultRouteForUser(user) : null).toBe(route);
    expect(user ? getUserRoleLabel(user) : null).toBe(roleLabel);
  });

  it("resolves url-encoded demo emails", () => {
    const user = findDemoUserByEmail("manager%40bvrb3r.demo");

    expect(user?.email).toBe("manager@bvrb3r.demo");
    expect(user?.role).toBe("manager");
  });

  it.each([
    ["lux@bvrb3r.demop", "lux@bvrb3r.demo"],
    ["luxe@bvrb3r.demo", "lux@bvrb3r.demo"],
    ["wave@bvrb3r,demo", "wave@bvrb3r.demo"],
    ["manger@bvrb3r.demo", "manager@bvrb3r.demo"]
  ])("normalizes %s to %s", (input, expected) => {
    const user = findDemoUserByEmail(input);

    expect(user?.email).toBe(expected);
  });

  it("prefers the selected demo account over the fallback email", () => {
    const user = resolveDemoUser("wave@bvrb3r.demo", "owner@bvrb3r.demo");

    expect(user.email).toBe("wave@bvrb3r.demo");
    expect(user.role).toBe("manager");
    expect(user.name).toBe("Wave Carter");
  });

  it("builds the corrected launcher account order and copy", () => {
    const accounts = getDemoLauncherAccounts();

    expect(accounts.map((account) => account.user.email)).toEqual([
      "architect@bvrb3r.demo",
      "client@bvrb3r.demo",
      "lux@bvrb3r.demo",
      "blaze@bvrb3r.demo",
      "fade@bvrb3r.demo",
      "wave@bvrb3r.demo",
      "frontdesk@bvrb3r.demo",
      "manager@bvrb3r.demo",
      "owner@bvrb3r.demo"
    ]);
    expect(accounts.find((account) => account.user.email === "architect@bvrb3r.demo")?.dashboardLabel).toBe("Architect console");
    expect(accounts.find((account) => account.user.email === "wave@bvrb3r.demo")?.dashboardLabel).toBe("Barber-manager dashboard");
    expect(accounts.find((account) => account.user.email === "lux@bvrb3r.demo")?.roleLabel).toBe("Freelance barber");
  });

  it("routes the founder account into the architect console with a dedicated platform-admin role", () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    const accounts = getDemoLauncherAccounts();

    expect(founder.email).toBe("architect@bvrb3r.demo");
    expect(founder.role).toBe("platform_admin");
    expect(getDefaultRouteForUser(founder)).toBe("/architect");
    expect(getUserRoleLabel(founder)).toBe("Platform admin");
    expect(accounts.some((account) => account.user.email === "architect@bvrb3r.demo")).toBe(true);
  });

  it("treats the distinct platform-admin role as founder access even without relying on email aliases", () => {
    expect(isPlatformAdminUser({ role: "platform_admin", email: "founder@example.com", platformAdmin: false })).toBe(true);
  });
});
