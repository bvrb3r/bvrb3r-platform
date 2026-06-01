import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarberProfileScreen } from "@/components/barber-experience/barber-profile-screen";
import type { UserAccount } from "@/types/domain";

const {
  useBarberProfileQueryMock,
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useBarberTrustSummaryMock
} = vi.hoisted(() => ({
  useBarberProfileQueryMock: vi.fn(),
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useBarberTrustSummaryMock: vi.fn()
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
  uploadMediaAsset: vi.fn()
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
          gallery: []
        }
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      error: null
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
    expect(screen.getByText("Public preview")).toBeInTheDocument();
    expect(screen.getAllByText("Edit profile").length).toBeGreaterThan(0);
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByText("Followers")).toBeInTheDocument();
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
    expect(screen.getByText("Your work")).toBeInTheDocument();
    expect(screen.getByText("2 posts")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getAllByText("Haircuts")).toHaveLength(1);
    expect(screen.queryByText("Profile readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Public identity")).not.toBeInTheDocument();
    expect(screen.queryByText(/Public barber photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Portfolio and discovery uploads/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/No file chosen/i)).not.toBeInTheDocument();
  });
});
