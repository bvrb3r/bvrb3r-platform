import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Product PR33 Calendar Connect screens", () => {
  const workspace = read("components/calendar-sync/calendar-sync-workspace.tsx");
  const schedule = read("components/operations/barber-schedule-workspace.tsx");
  const more = read("components/barber-experience/barber-settings-screen.tsx");

  it("ships dedicated authenticated Square, Apple, and Google routes", () => {
    for (const provider of ["square", "apple", "google"]) {
      const page = read(`app/(platform)/dashboard/barber/calendar/${provider}/page.tsx`);
      expect(page).toContain('getAuthorizedUser(["barber_user"])');
      expect(page).toContain(`provider="${provider}"`);
    }
  });

  it("renders the exact Square read-only and zero-money promises", () => {
    expect(workspace).toContain("Square Calendar Connect");
    expect(workspace).toContain("Appointments read access only");
    expect(workspace).toContain("no payments, payouts, card data, or write access");
    expect(workspace).toContain("Money moved — always");
    expect(workspace).toContain("checkout and settlement stay unreachable");
    expect(workspace).toContain("Finish the calendar mapping");
    expect(workspace).toContain("Import stays off until both server-validated choices are saved");
    expect(workspace).toContain("Find mapping choices");
    expect(schedule).toContain('"SQUARE APP"');
    expect(schedule).toContain('"Pays on Square. "');
  });

  it("renders private Apple feed rotation and device-only busy import truth", () => {
    expect(workspace).toContain("private subscription writes BVRB3R appointments out");
    expect(workspace).toContain("titles never leave it");
    expect(workspace).toContain("Regenerate private link");
    expect(workspace).toContain("old link no longer works");
  });

  it("renders Google dedicated-calendar write and free/busy-only read truth", () => {
    expect(workspace).toContain("writes only to its dedicated Google calendar");
    expect(workspace).toContain("free/busy endpoint returns time windows only");
    expect(workspace).toContain("never writes to another Google calendar");
  });

  it("cross-links the three providers without changing shared navigation", () => {
    expect(workspace).toContain('/dashboard/barber/calendar/square');
    expect(workspace).toContain('/dashboard/barber/calendar/apple');
    expect(workspace).toContain('/dashboard/barber/calendar/google');
    expect(more).toContain('title: "Calendar Connections"');
    expect(more).toContain('href: "/dashboard/barber/calendar/square"');
    expect(more).toContain('href: "/dashboard/barber/calendar/apple"');
    expect(more).toContain('href: "/dashboard/barber/calendar/google"');
  });
});
