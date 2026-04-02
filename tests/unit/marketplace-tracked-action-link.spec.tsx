import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { mutateMock, useMarketplaceAnalyticsMutationMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";

describe("marketplace tracked action link", () => {
  it("records marketplace conversion events before continuing navigation", () => {
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutate: mutateMock
    });

    render(
      <MarketplaceTrackedActionLink
        href="/booking/new"
        analytics={{
          eventType: "booking_cta_clicked",
          barberId: "barber-blaze",
          username: "blaze",
          sourceKind: "discovery",
          sourceReference: "stacked"
        }}
      >
        Book
      </MarketplaceTrackedActionLink>
    );

    fireEvent.click(screen.getByRole("link", { name: "Book" }));

    expect(mutateMock).toHaveBeenCalledWith({
      eventType: "booking_cta_clicked",
      barberId: "barber-blaze",
      username: "blaze",
      sourceKind: "discovery",
      sourceReference: "stacked"
    });
  });
});
