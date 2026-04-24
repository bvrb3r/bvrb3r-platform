import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const { getPlatformAdminUserMock } = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
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
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser({
      email: "ops-admin@bvrb3r.app"
    }));
  });

  it("renders shared architect session navigation and a visible logout control", async () => {
    render(await ArchitectLayout({
      children: <div data-testid="architect-layout-child">Architect child</div>
    }));

    expect(screen.getByText("Architect session")).toBeInTheDocument();
    expect(screen.getByText("ops-admin@bvrb3r.app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/architect");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/architect/users");
    expect(screen.getByRole("link", { name: "Verifications" })).toHaveAttribute("href", "/architect/verifications");
    expect(screen.getByRole("link", { name: "Money" })).toHaveAttribute("href", "/architect/money");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/architect/settings");
    expect(screen.queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByTestId("architect-logout-control")).toHaveTextContent("Log out");
    expect(screen.getByTestId("architect-layout-child")).toBeInTheDocument();
  });
});
