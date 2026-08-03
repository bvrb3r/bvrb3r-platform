import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import PublicClientProfilePage from "@/app/client/[username]/page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: vi.fn(async () => ({
    authenticated: false,
    user: { id: "guest-user" }
  }))
}));

describe("public client profile page", () => {
  it("renders a read-only Culture profile without private or marketplace controls", async () => {
    render(await PublicClientProfilePage({
      params: Promise.resolve({ username: "jordan_ellis" })
    }));

    expect(screen.getByText("Culture profile")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Profile" })).toBeInTheDocument();
    expect(screen.getByText("Jordan Ellis")).toBeInTheDocument();
    expect(screen.getByText("@jordan_ellis")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to follow" })).toHaveAttribute("href", "/login?next=%2Fclient%2Fjordan_ellis");
    expect(screen.getByText("Message unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByText("Culture posts")).toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
