import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

import {
  BarberActivationGate,
  ClientActivationGate,
  OwnerActivationGate,
  getBarberActivationItems,
  getOwnerActivationItems
} from "@/components/activation/tier1-activation-gates";

describe("tier 1 activation gates", () => {
  it("shows approved barbers the real missing services and availability blockers", () => {
    render(
      <BarberActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasActiveService: false,
          hasAvailability: false,
          isProfilePublic: true,
          isAcceptingBookings: true,
          payoutsReady: true,
          hasShopLink: true
        }}
      />
    );

    expect(screen.getByTestId("barber-activation-gate")).toBeInTheDocument();
    expect(screen.getByText("You're approved. Finish setup to go live.")).toBeInTheDocument();
    expect(screen.getByText("Services missing")).toBeInTheDocument();
    expect(screen.getByText("Availability missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add service/i })).toHaveAttribute("href", "/dashboard/barber/services");
    expect(screen.getByRole("link", { name: /Set availability/i })).toHaveAttribute("href", "/dashboard/barber/availability");
  });

  it("lets gates render quick action buttons when a handler is supplied", () => {
    const onAddService = vi.fn();

    render(
      <BarberActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasActiveService: false,
          hasAvailability: true,
          isProfilePublic: true,
          isAcceptingBookings: true,
          payoutsReady: true,
          hasShopLink: true
        }}
        actionHandlers={{
          "barber-services": onAddService
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add service/i }));
    expect(onAddService).toHaveBeenCalledTimes(1);
  });

  it("splits saved availability from the service location blocker", () => {
    const items = getBarberActivationItems({
      approvalStatus: "approved",
      accountStatus: "active",
      hasActiveService: true,
      hasAvailability: true,
      hasServiceLocation: false,
      serviceLocationRequired: true,
      isProfilePublic: true,
      isAcceptingBookings: true,
      payoutsReady: true,
      hasShopLink: false,
      shopLinkRequired: false
    });

    expect(items.find((item) => item.id === "barber-availability")?.complete).toBe(true);
    expect(items.find((item) => item.id === "barber-service-location")?.complete).toBe(false);
    expect(items.find((item) => item.id === "barber-service-location")?.missingLabel).toBe("Service location missing");
    expect(items.find((item) => item.id === "barber-shop-link")?.completeLabel).toBe("Independent lane ready.");
  });

  it("clears the independent lane blocker when a service location exists without a shop", () => {
    const items = getBarberActivationItems({
      approvalStatus: "approved",
      accountStatus: "active",
      hasActiveService: true,
      hasAvailability: true,
      hasServiceLocation: true,
      serviceLocationRequired: true,
      isProfilePublic: true,
      isAcceptingBookings: true,
      payoutsReady: true,
      hasShopLink: false,
      shopLinkRequired: false
    });

    expect(items.every((item) => item.complete)).toBe(true);
  });

  it("does not show a blocking barber gate when canonical live requirements pass", () => {
    const items = getBarberActivationItems({
      approvalStatus: "approved",
      accountStatus: "active",
      hasActiveService: true,
      hasAvailability: true,
      isProfilePublic: true,
      isAcceptingBookings: true,
      payoutsReady: true,
      hasShopLink: true
    });

    expect(items.every((item) => item.complete)).toBe(true);

    const { queryByTestId } = render(
      <BarberActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasActiveService: true,
          hasAvailability: true,
          isProfilePublic: true,
          isAcceptingBookings: true,
          payoutsReady: true,
          hasShopLink: true
        }}
      />
    );

    expect(queryByTestId("barber-activation-gate")).toBeNull();
  });

  it("shows approved shops the missing team activation path", () => {
    render(
      <OwnerActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasShopProfile: true,
          hasAddress: true,
          hasShopHours: true,
          payoutsReady: true,
          hasInvitedBarber: false,
          hasAcceptedBarber: false,
          hasBookableBarber: false
        }}
      />
    );

    expect(screen.getByTestId("owner-activation-gate")).toBeInTheDocument();
    expect(screen.getByText("Your shop is approved. Finish setup to go live.")).toBeInTheDocument();
    expect(screen.getByText("No barber invite")).toBeInTheDocument();
    expect(screen.getByText("No accepted barber")).toBeInTheDocument();
    expect(screen.getByText("No bookable barber")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite barber/i })).toHaveAttribute("href", "/dashboard/owner/team?invite=1");
  });

  it("shows waiting invite copy for owners after an invite has been sent", () => {
    render(
      <OwnerActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasShopProfile: true,
          hasAddress: true,
          hasShopHours: true,
          payoutsReady: true,
          hasInvitedBarber: true,
          hasAcceptedBarber: false,
          hasBookableBarber: false
        }}
      />
    );

    expect(screen.getByText("Waiting for barber to accept")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View invites/i })).toHaveAttribute("href", "/dashboard/owner/team");
  });

  it("clears owner team blockers when an accepted bookable barber is present", () => {
    const items = getOwnerActivationItems({
      approvalStatus: "approved",
      accountStatus: "active",
      hasShopProfile: true,
      hasAddress: true,
      hasShopHours: true,
      payoutsReady: true,
      hasInvitedBarber: true,
      hasAcceptedBarber: true,
      hasBookableBarber: true
    });

    expect(items.every((item) => item.complete)).toBe(true);

    const { queryByTestId } = render(
      <OwnerActivationGate
        input={{
          approvalStatus: "approved",
          accountStatus: "active",
          hasShopProfile: true,
          hasAddress: true,
          hasShopHours: true,
          payoutsReady: true,
          hasInvitedBarber: true,
          hasAcceptedBarber: true,
          hasBookableBarber: true
        }}
      />
    );

    expect(queryByTestId("owner-activation-gate")).toBeNull();
  });

  it("guides incomplete clients without blocking search access", () => {
    render(
      <ClientActivationGate
        input={{
          emailVerified: true,
          phoneVerified: false,
          hasDefaultPaymentMethod: false,
          hasLocation: false,
          hasPreferredSupply: false
        }}
      />
    );

    expect(screen.getByTestId("client-activation-gate")).toBeInTheDocument();
    expect(screen.getByText("Finish setup for faster booking.")).toBeInTheDocument();
    expect(screen.getByText("Phone pending")).toBeInTheDocument();
    expect(screen.getByText("Payment method missing")).toBeInTheDocument();
    expect(screen.getByText("Location missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open search/i })).toHaveAttribute("href", "/dashboard/client/search");
  });
});
