import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPublicProfileEditor } from "@/components/operations/owner-public-profile-editor";
import type { UserAccount } from "@/types/domain";

const {
  useOwnerShopProfileQueryMock,
  useUpdateOwnerShopProfileMutationMock
} = vi.hoisted(() => ({
  useOwnerShopProfileQueryMock: vi.fn(),
  useUpdateOwnerShopProfileMutationMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useOwnerShopProfileQuery: useOwnerShopProfileQueryMock,
  useUpdateOwnerShopProfileMutation: useUpdateOwnerShopProfileMutationMock
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
    useUpdateOwnerShopProfileMutationMock.mockReset();
    useUpdateOwnerShopProfileMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
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

    expect(screen.getByText("Finish shop profile. Set your shop name, handle, address, photos, hours, and policies.")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load shop profile. Try again from Owner Home or More.")).not.toBeInTheDocument();
    expect(screen.getByText("The BVRB3R Shop")).toBeInTheDocument();
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
    expect(screen.getByDisplayValue("The BVRB3R Shop")).toBeInTheDocument();
    expect(screen.getByDisplayValue("bvrb3rshop")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2200 E Fowler Ave")).toBeInTheDocument();
    expect(screen.getByText("Team preview")).toBeInTheDocument();
  });
});
