import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const { getPlatformAdminUserMock, navState } = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn(),
  navState: { pathname: "/architect" }
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="architect-logout-control">
      Log out
    </div>
  )
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>
      {children}
    </a>
  )
}));

import ArchitectLayout from "@/app/(platform)/architect/layout";

describe("architect layout", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
    navState.pathname = "/architect";
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser({
      email: "ops-admin@bvrb3r.app"
    }));
  });

  it("renders shared architect session navigation and a visible logout control", async () => {
    render(await ArchitectLayout({
      children: <div data-testid="architect-layout-child">Architect child</div>
    }));

    expect(screen.getByText("Architect session")).toBeInTheDocument();
    expect(screen.getByText("BVR")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mission Control" })).toHaveAttribute("href", "/architect");
    expect(screen.getByText("ops-admin@bvrb3r.app")).toBeInTheDocument();
    expect(screen.getByTestId("architect-shell")).toHaveClass("bvr-screen");
    expect(screen.getByTestId("architect-header-shell")).not.toHaveClass("bvr-screen");
    expect(screen.getByTestId("architect-header-shell").className).not.toMatch(/min-h|h-screen|100svh|items-center/);
    expect(screen.getByRole("navigation", { name: "BVRB3R Mission Control Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CEO" })).toHaveAttribute("href", "/architect/ceo");
    expect(screen.getByRole("link", { name: "CEO" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute("href", "/architect/product");
    expect(screen.getByRole("link", { name: "Technology" })).toHaveAttribute("href", "/architect/technology");
    expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute("href", "/architect/operations");
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute("href", "/architect/finance");
    expect(screen.getByRole("link", { name: "Marketing" })).toHaveAttribute("href", "/architect/marketing");
    expect(screen.getByRole("link", { name: "Compliance" })).toHaveAttribute("href", "/architect/compliance");
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("href", "/architect/security");
    expect(screen.getByRole("link", { name: "Content & Community" })).toHaveAttribute("href", "/architect/content-community");
    expect(screen.queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByTestId("architect-logout-control")).toHaveTextContent("Log out");
    expect(screen.getByTestId("architect-layout-child")).toBeInTheDocument();
  });

  it("highlights routed department lanes by pathname", async () => {
    navState.pathname = "/architect/product";

    render(await ArchitectLayout({
      children: <div data-testid="architect-layout-child">Architect child</div>
    }));

    expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "CEO" })).not.toHaveAttribute("aria-current");
  });
});
