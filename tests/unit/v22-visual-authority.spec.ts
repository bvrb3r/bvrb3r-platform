import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("V22 visual authority", () => {
  it("uses Archivo for UI and body typography without loading Inter", () => {
    const layout = read("app/layout.tsx");
    const globals = read("app/globals.css");
    const theme = read("design/theme.css");
    const tokens = read("design/tokens.ts");

    expect(layout).toContain('Archivo, Instrument_Serif, Space_Mono');
    expect(layout).not.toMatch(/\bInter\b/);
    expect(globals).toContain("--font-body: var(--font-archivo)");
    expect(theme).toContain("--font-body: var(--font-archivo)");
    expect(tokens).toContain("body: 'var(--font-archivo)");
  });

  it("keeps the canonical Client navigation label Home, Search, Culture, Messages, More", () => {
    const tabs = read("components/client-experience/client-tab-config.tsx");

    for (const label of ["Home", "Search", "Culture", "Messages", "More"]) {
      expect(tabs).toContain(`label: "${label}"`);
    }
    expect(tabs).not.toContain('key: "more", href: CLIENT_PRIMARY_TAB_HREFS.more, label: "Account"');
  });

  it("routes Barber Home and Calendar to separate canonical screens", () => {
    const homePage = read("app/(platform)/dashboard/barber/page.tsx");
    const calendarPage = read("app/(platform)/dashboard/barber/calendar/page.tsx");
    const homeWorkspace = read("components/operations/barber-workspace.tsx");

    expect(homePage).toContain("<BarberWorkspace");
    expect(homePage).not.toContain("<BarberCalendarScreen");
    expect(calendarPage).toContain("<BarberCalendarScreen");
    expect(homeWorkspace).not.toContain('router.push("/dashboard/barber")');
    expect(homeWorkspace).toContain('router.push("/dashboard/barber/calendar")');
  });

  it("keeps release readiness portable and documents its automation secret", () => {
    const readiness = read("scripts/release-readiness.mjs");
    const localEnv = read(".env.example");
    const stagingEnv = read(".env.staging.example");

    expect(readiness).toContain('hasFile("android/app/build.gradle")');
    expect(readiness).not.toContain("android\\\\app");
    expect(localEnv).toContain("AUTOMATION_PROCESS_SECRET=");
    expect(stagingEnv).toContain("AUTOMATION_PROCESS_SECRET=");
  });

  it("guards every private Client route and records denied Architect access", () => {
    const clientLayout = read("app/(platform)/dashboard/client/layout.tsx");
    const guards = read("lib/auth/guards.ts");

    expect(clientLayout).toContain('getAuthorizedUser(["client_user"])');
    expect(guards).toContain('action: "architect_access_denied"');
    expect(guards).toContain('redirect("/access-denied")');
  });
});
