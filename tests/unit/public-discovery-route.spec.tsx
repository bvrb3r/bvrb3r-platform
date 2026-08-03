import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClientExperienceContextMock } = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children, mode }: { children: ReactNode; mode: "client" | "guest" }) => (
    <section data-testid="discovery-shell" data-mode={mode}>{children}</section>
  )
}));

vi.mock("@/components/client-experience/client-search-screen", () => ({
  ClientSearchScreen: ({ mode, clientId }: { mode: "client" | "guest"; clientId?: string }) => (
    <div data-testid="discovery-search" data-mode={mode} data-client-id={clientId}>Discovery</div>
  )
}));

import DiscoveryPage, { metadata } from "@/app/discover/page";

describe("public discovery route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getClientExperienceContextMock.mockResolvedValue({
      isGuest: false,
      clientId: "client-signed-in"
    });
  });

  it("honors the explicit guest entry even when ambient session context resolves a client", async () => {
    const view = await DiscoveryPage({ searchParams: Promise.resolve({ entry: "guest" }) });
    const { container } = render(view);

    expect(container.querySelector("[data-public-site]")).toBeInTheDocument();
    expect(screen.queryByTestId("discovery-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("discovery-search")).toHaveAttribute("data-mode", "guest");
    expect(screen.getByTestId("discovery-search")).not.toHaveAttribute("data-client-id");
    expect(screen.getAllByRole("link", { name: "Enter as guest" })[0]).toHaveAttribute("aria-current", "page");
  });

  it("keeps signed-in discovery in the client shell when guest entry is absent", async () => {
    const view = await DiscoveryPage({ searchParams: Promise.resolve({}) });
    const { container } = render(view);

    expect(container.querySelector("[data-public-site]")).not.toBeInTheDocument();
    expect(screen.getByTestId("discovery-shell")).toHaveAttribute("data-mode", "client");
    expect(screen.getByTestId("discovery-search")).toHaveAttribute("data-client-id", "client-signed-in");
  });

  it("publishes honest guest-discovery metadata and a canonical guest entry", () => {
    expect(metadata).toMatchObject({
      title: "Guest Discovery — BVRB3R",
      alternates: { canonical: "/discover?entry=guest" }
    });
  });
});
