import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_ATLAS_MISSIONS, SYSTEM_ATLAS_RESULT_CODES } from "@/lib/atlas/system-atlas";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: vi.fn(async () => ({
    authenticated: true,
    user: { id: "profile-client", role: "client_user" }
  }))
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span role="img" aria-label={alt} data-source={src} />
}));

import SystemAtlasPage from "@/app/atlas/page";

describe("Product PR37 System Atlas", () => {
  it("keeps the canonical 21 audited missions and result codes in order", () => {
    expect(SYSTEM_ATLAS_MISSIONS).toHaveLength(21);
    expect(SYSTEM_ATLAS_MISSIONS[0]).toMatchObject({ number: "01", title: "Universal Canonical Mechanics" });
    expect(SYSTEM_ATLAS_MISSIONS[20]).toMatchObject({ number: "21", title: "Universal Recovery, Closed Door & Anti-Loop Control" });
    expect(SYSTEM_ATLAS_MISSIONS.map((mission) => mission.image)).toEqual(
      Array.from({ length: 21 }, (_, index) => `/atlas/${String(index + 1).padStart(2, "0")}.png`)
    );
    expect(SYSTEM_ATLAS_RESULT_CODES).toEqual(["SUC", "PAR", "NCH", "VAL", "CNF", "RCV", "CLD", "EXP", "CAN", "ESC"]);
  });

  it("renders the shipped diagrams as behavior references, not production proof", async () => {
    render(await SystemAtlasPage());
    expect(screen.getByRole("heading", { name: "The system, in 21 mission chains." })).toBeInTheDocument();
    expect(screen.getAllByText("Pass ✓")).toHaveLength(21);
    expect(screen.getAllByRole("img")).toHaveLength(21);
    expect(screen.getByText(/diagram is required behavior, not proof of production/i)).toBeInTheDocument();
    expect(screen.getByText("Rent-only shop model — locked ✓")).toBeInTheDocument();
  });

  it("links the atlas from both Architect surfaces", () => {
    const cityMap = readFileSync(join(process.cwd(), "components/architect/city-map/architect-city-map.tsx"), "utf8");
    const consoleChrome = readFileSync(join(process.cwd(), "components/architect-experience/architect-layout-chrome.tsx"), "utf8");
    expect(cityMap).toContain('href="/atlas"');
    expect(consoleChrome).toContain('href="/atlas"');
    expect(`${cityMap}\n${consoleChrome}`).toContain("System Atlas · 21");
  });

  it("places the System Atlas directly below The Road in every role More surface", () => {
    const roleMoreSurfaces = [
      "components/client-experience/client-profile-screen.tsx",
      "components/barber-experience/barber-settings-screen.tsx",
      "components/operations/owner-settings-workspace.tsx"
    ];

    roleMoreSurfaces.forEach((relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      const roadIndex = source.indexOf('title: "The Road"');
      const atlasIndex = source.indexOf('title: "System Atlas"');
      expect(roadIndex).toBeGreaterThan(-1);
      expect(atlasIndex).toBeGreaterThan(roadIndex);
      expect(source.slice(roadIndex, atlasIndex)).not.toContain("rows: [");
      expect(source.slice(Math.max(0, atlasIndex - 120), atlasIndex + 240)).toContain('href: "/atlas"');
    });
  });
});
