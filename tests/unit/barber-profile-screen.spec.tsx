import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarberProfileScreen } from "@/components/barber-experience/barber-profile-screen";
import type { UserAccount } from "@/types/domain";

const {
  useBarberProfileQueryMock,
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useBarberTrustSummaryMock,
  uploadMediaAssetMock
} = vi.hoisted(() => ({
  useBarberProfileQueryMock: vi.fn(),
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useBarberTrustSummaryMock: vi.fn(),
  uploadMediaAssetMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/booking/client", () => ({
  useBarberProfileQuery: useBarberProfileQueryMock
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: uploadMediaAssetMock
}));

vi.mock("@/lib/trust/client", () => ({
  useBarberTrustSummary: useBarberTrustSummaryMock
}));

describe("BarberProfileScreen", () => {
  const user: UserAccount = {
    id: "barber-profile-1",
    role: "barber_user",
    email: "barber@example.com",
    password: "",
    name: "Phillip mcgee",
    title: "Barber",
    locationIds: [],
    barberId: "barber-43b3cda2"
  };

  beforeEach(() => {
    useBarberProfileQueryMock.mockReset();
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    useBarberTrustSummaryMock.mockReset();
    uploadMediaAssetMock.mockReset();

    useBarberProfileQueryMock.mockReturnValue({
      data: {
        barber: {
          id: "barber-43b3cda2",
          name: "Phillip mcgee",
          bio: "Phillip mcgee on the BVRB3R network.",
          rating: 5,
          reviewCount: 1,
          bookingLink: "/barber/barber-43b3cda2"
        },
        profile: {
          username: "phillipmcgee",
          profilePhotoUrl: null,
          headline: "Phillip mcgee on the BVRB3R network.",
          badges: [],
          yearsExperience: null
        },
        proof: {
          reviewScore: 5,
          reviewCount: 1,
          rankingLabel: "Best booking fit",
          followCount: 0,
          bookingsCompleted: 4,
          profileViews: 0,
          bookingClicks: 0,
          verificationLabels: []
        },
        shop: null,
        shopLocations: [{ name: "Phils chair" }],
        portfolio: [
          { id: "work-1", imageUrl: "https://cdn.example.com/work-1.jpg", caption: "Fade", featured: true },
          { id: "work-2", imageUrl: "https://cdn.example.com/work-2.jpg", caption: "Lineup", featured: false }
        ],
        reviews: [{}],
        services: [],
        mostBookedService: { service: { name: "test cut" } }
      },
      error: null,
      refetch: vi.fn()
    });
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        barberProfile: {
          barberId: "barber-43b3cda2",
          profilePhotoUrl: null,
          publicBio: "Sharp public barber bio.",
          serviceAreaLabel: "Phils chair",
          gallery: []
        }
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      error: null
    });
    uploadMediaAssetMock.mockResolvedValue({
      path: "profiles/barbers/barber-43b3cda2/gallery/work.jpg",
      publicUrl: "https://cdn.example.com/new-work.jpg"
    });
    useBarberTrustSummaryMock.mockReturnValue({
      data: { verificationDecision: { gates: { badge: { allowed: false } } } },
      error: null
    });
  });

  it("renders the final minimal barber profile studio without duplicated lower sections", () => {
    render(<BarberProfileScreen user={user} />);

    expect(screen.getByTestId("barber-profile-screen")).toBeInTheDocument();
    expect(screen.getByText(/Public barber brand/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Profile" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Manage your profile & brand")).toBeInTheDocument();
    expect(screen.getByText("The client-facing preview, portfolio, trust signals, and booking profile live here.")).toBeInTheDocument();
    expect(screen.getByText("Sharp public barber bio.")).toBeInTheDocument();
    expect(screen.getByText("Phils chair")).toBeInTheDocument();
    expect(screen.getByText("Public preview")).toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Portfolio" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update public barber photo" })).toBeInTheDocument();
    expect(screen.getByText("@phillipmcgee")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("This is how clients find and share your barber profile.")).toBeInTheDocument();
    const usernameInput = screen.getByLabelText("Public username");
    expect(usernameInput).toHaveAttribute("spellcheck", "false");
    expect(usernameInput).toHaveAttribute("autocapitalize", "none");
    expect(usernameInput).toHaveAttribute("autocorrect", "off");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByText("Followers")).toBeInTheDocument();
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
    expect(screen.getByText("Your work")).toBeInTheDocument();
    expect(screen.getByText("2 posts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add portfolio image" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Remove/i })).toHaveLength(2);
    expect(screen.getAllByText("Haircuts")).toHaveLength(1);
    expect(screen.queryByText("/barber/phillipmcgee")).not.toBeInTheDocument();
    expect(screen.queryByText("Phillip mcgee on the BVRB3R network.")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Public identity")).not.toBeInTheDocument();
    expect(screen.queryByText(/Public barber photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Portfolio and discovery uploads/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/No file chosen/i)).not.toBeInTheDocument();
  });

  it("uploads and removes barber portfolio media through the profile media mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const refetch = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync,
      error: null
    });
    useBarberProfileQueryMock.mockReturnValue({
      data: {
        barber: {
          id: "barber-43b3cda2",
          name: "Phillip mcgee",
          bio: "",
          rating: 5,
          reviewCount: 1,
          bookingLink: "/barber/barber-43b3cda2"
        },
        profile: {
          username: "phillipmcgee",
          profilePhotoUrl: null,
          headline: "",
          badges: [],
          yearsExperience: null
        },
        proof: {
          reviewScore: 5,
          reviewCount: 1,
          rankingLabel: "Best booking fit",
          followCount: 0,
          bookingsCompleted: 4,
          profileViews: 0,
          bookingClicks: 0,
          verificationLabels: []
        },
        shop: null,
        shopLocations: [{ name: "Phils chair" }],
        portfolio: [],
        reviews: [{}],
        services: [],
        mostBookedService: { service: { name: "test cut" } }
      },
      error: null,
      refetch
    });
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        barberProfile: {
          barberId: "barber-43b3cda2",
          profilePhotoUrl: null,
          gallery: [
            {
              id: "work-1",
              imageUrl: "https://cdn.example.com/work-1.jpg",
              storagePath: "profiles/barbers/barber-43b3cda2/gallery/work-1.jpg",
              caption: "Fade",
              featured: true,
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    });

    render(<BarberProfileScreen user={user} />);

    const file = new File(["work"], "work.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add portfolio image upload input"), { target: { files: [file] } });

    await screen.findByText("Portfolio image added.");
    expect(uploadMediaAssetMock).toHaveBeenCalledWith(expect.stringContaining("profiles/barbers/barber-43b3cda2/gallery"), file);
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "add_barber_gallery_image",
      storagePath: "profiles/barbers/barber-43b3cda2/gallery/work.jpg",
      imageUrl: "https://cdn.example.com/new-work.jpg"
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Fade" }));
    await screen.findByText("Portfolio image removed.");
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "remove_barber_gallery_image",
      assetId: "work-1"
    });
  });

  it("saves barber public bio and freelance chair/location from the hero", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const refetch = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync,
      error: null
    });
    useBarberProfileQueryMock.mockReturnValue({
      ...useBarberProfileQueryMock(),
      refetch
    });

    render(<BarberProfileScreen user={user} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit public barber bio" }));
    fireEvent.change(screen.getByLabelText("Public bio"), { target: { value: "Fresh public story" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Barber bio updated.");
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "set_barber_public_bio",
      publicBio: "Fresh public story"
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit chair or location display" }));
    fireEvent.change(screen.getByLabelText("Chair or location display"), { target: { value: "Downtown chair" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Public chair/location updated.");
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "set_barber_public_location",
      label: "Downtown chair"
    });
    expect(refetch).toHaveBeenCalled();
  });
});
