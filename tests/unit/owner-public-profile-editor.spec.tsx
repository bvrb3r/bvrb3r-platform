import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPublicProfileEditor } from "@/components/operations/owner-public-profile-editor";
import type { UserAccount } from "@/types/domain";

const {
  useOwnerShopProfileQueryMock,
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  uploadMediaAssetMock
} = vi.hoisted(() => ({
  useOwnerShopProfileQueryMock: vi.fn(),
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  uploadMediaAssetMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useOwnerShopProfileQuery: useOwnerShopProfileQueryMock
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: uploadMediaAssetMock
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
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    uploadMediaAssetMock.mockReset();
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "shop_owner_user",
          email: user.email,
          notificationPreference: null
        },
        clientProfile: null,
        barberProfile: null,
        shops: []
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({})
    });
    uploadMediaAssetMock.mockResolvedValue({
      path: "profiles/shops/shop-bvrb3r/gallery/shop.jpg",
      publicUrl: "https://cdn.example.com/shop.jpg"
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
    expect(screen.queryByText("Public shop username")).not.toBeInTheDocument();
    expect(screen.getByText("@bvrb3rshop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update shop logo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit public shop username" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("This is how clients find and share your shop profile.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Shop gallery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add shop image" })).toBeInTheDocument();
    expect(screen.getAllByText("The BVRB3R Shop").length).toBeGreaterThan(0);
    expect(screen.getByText(/2200 E Fowler Ave - Tampa, FL/i)).toBeInTheDocument();
    expect(screen.getAllByText("Public barbers").length).toBeGreaterThan(0);
    expect(screen.getByText("Shop status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByText("Team display is managed from Owner Home.")).toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();
    expect(screen.queryByText("/shop/bvrb3rshop")).not.toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/barber portfolio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private owner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
  });

  it("uploads shop gallery media through the owner media mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
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

    const file = new File(["shop"], "shop.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add shop image upload input"), { target: { files: [file] } });

    await waitFor(() => expect(uploadMediaAssetMock).toHaveBeenCalledWith(expect.stringContaining("profiles/shops/shop-bvrb3r/gallery"), file));
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "add_shop_gallery_image",
      shopId: "shop-bvrb3r",
      storagePath: "profiles/shops/shop-bvrb3r/gallery/shop.jpg",
      imageUrl: "https://cdn.example.com/shop.jpg"
    });
    expect(await screen.findByText("Shop image added.")).toBeInTheDocument();
  });

  it("keeps the uploaded shop logo in the studio hero without showing a false load error", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const refetch = vi.fn().mockRejectedValue(new Error("Unable to load shop profile."));
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "shop_owner_user",
          email: user.email,
          notificationPreference: null
        },
        clientProfile: null,
        barberProfile: null,
        shops: [
          {
            shopId: "shop-bvrb3r",
            label: "The BVRB3R Shop",
            name: "The BVRB3R Shop",
            profilePhotoUrl: "https://cdn.example.com/current-logo.jpg",
            profilePhotoPath: "profiles/shops/shop-bvrb3r/profile/current.jpg",
            gallery: []
          }
        ]
      }
    });
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
      error: new Error("Unable to load shop profile."),
      isLoading: false,
      refetch
    });

    render(<OwnerPublicProfileEditor user={user} />);

    expect(screen.getByAltText("The BVRB3R Shop public image")).toHaveAttribute("src", "https://cdn.example.com/current-logo.jpg");

    const file = new File(["logo"], "logo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Update shop logo upload input"), { target: { files: [file] } });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      action: "set_shop_photo",
      shopId: "shop-bvrb3r",
      storagePath: "profiles/shops/shop-bvrb3r/gallery/shop.jpg",
      imageUrl: "https://cdn.example.com/shop.jpg"
    }));
    expect(await screen.findByText("Shop logo updated.")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load shop profile. Try again.")).not.toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("removes shop gallery media through the owner media mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "shop_owner_user",
          email: user.email,
          notificationPreference: null
        },
        clientProfile: null,
        barberProfile: null,
        shops: [
          {
            shopId: "shop-bvrb3r",
            label: "The BVRB3R Shop",
            profilePhotoUrl: null,
            gallery: [
              {
                id: "shop-image-1",
                imageUrl: "https://cdn.example.com/shop-1.jpg",
                storagePath: "profiles/shops/shop-bvrb3r/gallery/shop-1.jpg",
                caption: "Shop floor",
                featured: false,
                createdAt: new Date().toISOString()
              }
            ]
          }
        ]
      }
    });
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

    fireEvent.click(screen.getByRole("button", { name: "Remove Shop floor" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      action: "remove_shop_gallery_image",
      shopId: "shop-bvrb3r",
      assetId: "shop-image-1"
    }));
    expect(await screen.findByText("Shop image removed.")).toBeInTheDocument();
  });
});
