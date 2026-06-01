import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPublicProfileEditor } from "@/components/operations/owner-public-profile-editor";
import type { UserAccount } from "@/types/domain";

const { useOwnerShopProfileQueryMock } = vi.hoisted(() => ({
  useOwnerShopProfileQueryMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useOwnerShopProfileQuery: useOwnerShopProfileQueryMock
}));

describe("OwnerPublicProfileEditor", () => {
  const user: UserAccount = {
    id: "owner-profile-1",
    role: "shop_owner_user",
    email: "owner@example.com",
    password: "",
    name: "Owner",
    title: "Owner",
    locationIds: [],
    ownedShopName: "The BVRB3R Shop"
  };

  beforeEach(() => {
    useOwnerShopProfileQueryMock.mockReset();
  });

  it("shows setup copy instead of a load error when the owner shop profile is incomplete", () => {
    const error = new Error("Owner shop not found.") as Error & { status?: number };
    error.status = 404;
    useOwnerShopProfileQueryMock.mockReturnValue({
      data: null,
      error,
      isLoading: false,
      refetch: vi.fn()
    });

    render(<OwnerPublicProfileEditor user={user} />);

    expect(screen.getAllByText(/Finish shop profile.*Set your shop name, handle, address, photos, hours, and policies/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Unable to load shop profile. Try again.")).not.toBeInTheDocument();
    expect(screen.getAllByText("The BVRB3R Shop").length).toBeGreaterThan(0);
  });

  it("renders the shop public profile studio fields from the resolved shop", () => {
    useOwnerShopProfileQueryMock.mockReturnValue({
      data: {
        shop: {
          id: "shop-bvrb3r",
          name: "The BVRB3R Shop",
          shop_username: "bvrb3rshop",
          brand_line: "Campus cuts.",
          public_bio: "Public shop bio.",
          city: "Tampa",
          state: "FL",
          address: "2200 E Fowler Ave"
        }
      },
      error: null,
      isLoading: false,
      refetch: vi.fn()
    });

    render(<OwnerPublicProfileEditor user={user} />);

    expect(screen.getByTestId("owner-public-profile-editor")).toBeInTheDocument();
    expect(screen.getByText("Manage your shop profile & brand")).toBeInTheDocument();
    expect(screen.getByText(/Public shop brand/i)).toBeInTheDocument();
    expect(screen.getByText("Shape the public business profile clients see before choosing a shop or barber.")).toBeInTheDocument();
    expect(screen.getByText("Public shop username")).toBeInTheDocument();
    expect(screen.getByText("Shop gallery")).toBeInTheDocument();
    expect(screen.getAllByText("The BVRB3R Shop").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("bvrb3rshop").length).toBeGreaterThan(0);
    expect(screen.getByText(/2200 E Fowler Ave - Tampa, FL/i)).toBeInTheDocument();
    expect(screen.getAllByText("Public barbers").length).toBeGreaterThan(0);
    expect(screen.getByText("Shop status")).toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/barber portfolio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private owner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
  });
});
