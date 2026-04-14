import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

import { ClientAppHeader } from "@/components/client-experience/client-app-header";

describe("client app header", () => {
  it("does not show a fake notification count for fresh client accounts", () => {
    render(<ClientAppHeader />);

    expect(screen.getByRole("link", { name: "Open rewards and reminders" })).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});
