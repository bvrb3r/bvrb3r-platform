import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ClientProfileViewPage from "@/app/(platform)/dashboard/client/profile-view/[targetKind]/[target]/page";
import BarberProfileViewPage from "@/app/(platform)/dashboard/barber/profile-view/[targetKind]/[target]/page";
import OwnerProfileViewPage from "@/app/(platform)/dashboard/owner/profile-view/[targetKind]/[target]/page";

const getAuthorizedUserMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  }
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ activeTab, children }: { activeTab?: string; children: ReactNode }) => (
    <div data-testid="client-shell" data-active-tab={activeTab}>
      <header>Client header</header>
      {children}
      <nav>Client bottom nav</nav>
    </div>
  )
}));

vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({
    activeHref,
    children,
    user
  }: {
    activeHref?: string;
    children: ReactNode;
    user: { role: string };
  }) => (
    <div data-testid={`${user.role}-shell`} data-active-href={activeHref}>
      <header>{user.role === "owner" ? "Owner header" : "Barber header"}</header>
      {children}
      <nav>{user.role === "owner" ? "Owner bottom nav" : "Barber bottom nav"}</nav>
    </div>
  )
}));

vi.mock("@/components/marketplace/public-client-profile", () => ({
  cleanPublicClientUsername: (value: string) => value.trim().toLowerCase(),
  readPublicClientProfile: vi.fn(async (username: string) => ({
    id: "profile-client",
    displayName: "Phillip mcgee",
    username,
    posts: []
  })),
  PublicClientProfileContent: ({
    backHref,
    backLabel,
    username
  }: {
    backHref?: string;
    backLabel?: string;
    username: string;
  }) => (
    <section data-testid="public-client-profile">
      <a href={backHref}>{backLabel}</a>
      <h1>Client public profile</h1>
      <p>@{username}</p>
    </section>
  )
}));

vi.mock("@/components/marketplace/public-barber-profile", () => ({
  PublicBarberProfile: () => <section data-testid="public-barber-profile">Barber public profile</section>
}));

vi.mock("@/components/marketplace/public-shop-profile", () => ({
  PublicShopProfile: () => <section data-testid="public-shop-profile">Shop public profile</section>
}));

vi.mock("@/lib/booking/platform-service", () => ({
  getBarberDetailsPayload: vi.fn(async () => ({ id: "barber-profile" })),
  getPublicShopProfilePayload: vi.fn(async () => ({ shop: { id: "shop-profile" } }))
}));

describe("message profile view routes", () => {
  it("renders barber profile content inside the client shell", async () => {
    getAuthorizedUserMock.mockResolvedValue({
      role: "client",
      locationIds: []
    });

    render(await ClientProfileViewPage({
      params: Promise.resolve({ targetKind: "barber", target: "phillipforsure" }),
      searchParams: Promise.resolve({ sourceThreadId: "thread-client-barber" })
    }));

    expect(screen.getByTestId("client-shell")).toHaveAttribute("data-active-tab", "messages");
    expect(screen.getByText("Client header")).toBeInTheDocument();
    expect(screen.getByText("Client bottom nav")).toBeInTheDocument();
    expect(screen.getByTestId("public-barber-profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Messages" })).toHaveAttribute("href", "/dashboard/client/messages/thread-client-barber");
  });

  it("renders shop profile content inside the barber shell", async () => {
    getAuthorizedUserMock.mockResolvedValue({
      role: "barber",
      locationIds: []
    });

    render(await BarberProfileViewPage({
      params: Promise.resolve({ targetKind: "shop", target: "thebvrb3rshopuniversitymall" }),
      searchParams: Promise.resolve({ sourceThreadId: "thread-barber-shop" })
    }));

    expect(screen.getByTestId("barber-shell")).toHaveAttribute("data-active-href", "/dashboard/barber/messages");
    expect(screen.getByText("Barber header")).toBeInTheDocument();
    expect(screen.getByText("Barber bottom nav")).toBeInTheDocument();
    expect(screen.getByTestId("public-shop-profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Messages" })).toHaveAttribute("href", "/dashboard/barber/messages/thread-barber-shop");
  });

  it("renders client profile content inside the owner shell", async () => {
    getAuthorizedUserMock.mockResolvedValue({
      role: "owner",
      locationIds: []
    });

    render(await OwnerProfileViewPage({
      params: Promise.resolve({ targetKind: "client", target: "phillipmcgee" }),
      searchParams: Promise.resolve({ sourceThreadId: "thread-owner-client" })
    }));

    expect(screen.getByTestId("owner-shell")).toHaveAttribute("data-active-href", "/dashboard/owner/messages");
    expect(screen.getByText("Owner header")).toBeInTheDocument();
    expect(screen.getByText("Owner bottom nav")).toBeInTheDocument();
    expect(screen.getByTestId("public-client-profile")).toBeInTheDocument();
    expect(screen.getByText("@phillipmcgee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Messages" })).toHaveAttribute("href", "/dashboard/owner/messages/thread-owner-client");
  });
});
