import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";

describe("client culture screen", () => {
  it("renders the culture feed shell and discovery actions", () => {
    render(<ClientCultureScreen />);

    expect(screen.getByRole("heading", { name: "Culture" })).toBeInTheDocument();
    expect(screen.getByText("Cuts, shops, style, and community.")).toBeInTheDocument();
    expect(screen.getByText("Community pulse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discover barbers/i })).toHaveAttribute("href", "/dashboard/client/search");
    expect(screen.getByRole("link", { name: /View shops/i })).toHaveAttribute("href", "/dashboard/client/search?type=shops");
    expect(screen.getByText("Share your next cut")).toBeInTheDocument();
  });

  it("renders a safe empty feed state without requiring a feed table", () => {
    render(<ClientCultureScreen posts={[]} />);

    expect(screen.getByText("Culture posts will appear here soon.")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("renders a barber-safe Culture shell without client-only posting copy", () => {
    render(<ClientCultureScreen surface="barber" />);

    expect(screen.getByTestId("client-culture-screen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discover barbers/i })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: /View shops/i })).toHaveAttribute("href", "/discover?type=shops");
    expect(screen.getByText("Share professional work")).toBeInTheDocument();
    expect(screen.getByText("Posting as a barber profile is available when your public profile is live and approved.")).toBeInTheDocument();
    expect(screen.queryByText("Posting is coming soon.")).not.toBeInTheDocument();
  });

  it("renders a shop-owner-safe Culture shell for shop brand posting", () => {
    render(<ClientCultureScreen surface="shop" />);

    expect(screen.getByTestId("client-culture-screen")).toBeInTheDocument();
    expect(screen.getByText("Share shop moments")).toBeInTheDocument();
    expect(screen.getByText("Posting as a shop brand is available when your public shop profile is live and approved.")).toBeInTheDocument();
  });
});
