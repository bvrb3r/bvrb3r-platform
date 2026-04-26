import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useClientMembershipQueryMock,
  usePointsBalanceQueryMock,
  usePointsHistoryQueryMock,
  useClientReferralSummaryMock,
  useCreateReferralInviteMutationMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useClientMembershipQueryMock: vi.fn(),
  usePointsBalanceQueryMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  useCreateReferralInviteMutationMock: vi.fn()
}));

vi.mock("@/lib/booking/client", () => ({
  useClientMembershipQuery: useClientMembershipQueryMock
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

vi.mock("@/lib/points/client", () => ({
  usePointsBalanceQuery: usePointsBalanceQueryMock,
  usePointsHistoryQuery: usePointsHistoryQueryMock
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientReferralSummary: useClientReferralSummaryMock,
  useCreateReferralInviteMutation: useCreateReferralInviteMutationMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: vi.fn()
}));

vi.mock("@/components/client-experience/client-payment-methods-panel", () => ({
  ClientPaymentMethodsPanel: ({ initialMethods }: { initialMethods: Array<{ id: string }> }) => (
    <div data-testid="payment-methods-panel">Methods {initialMethods.length}</div>
  )
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>
}));

import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";

describe("client profile screen", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    useClientMembershipQueryMock.mockReset();
    usePointsBalanceQueryMock.mockReset();
    usePointsHistoryQueryMock.mockReset();
    useClientReferralSummaryMock.mockReset();
    useCreateReferralInviteMutationMock.mockReset();

    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          profilePhotoUrl: null
        }
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useClientMembershipQueryMock.mockReturnValue({
      data: {
        subscription: {
          subscriptionStatus: "active",
          planName: "Client Core"
        },
        value: {
          valueMessage: "Member pricing is active.",
          perkLabels: ["Priority booking"]
        }
      },
      error: null
    });
    usePointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 120,
        pendingPoints: 10,
        inAppValue: 12,
        explanation: {
          progressLabel: "80 points to the next milestone."
        }
      },
      error: null
    });
    usePointsHistoryQueryMock.mockReturnValue({
      data: {
        activity: [
          {
            id: "points-1",
            title: "Completed booking",
            detail: "Points posted from your latest visit.",
            amountLabel: "+10 pts",
            occurredAt: "2026-04-20T00:00:00.000Z"
          }
        ]
      }
    });
    useClientReferralSummaryMock.mockReturnValue({
      data: {
        referralCode: {
          code: "BVRB3R-ALEX",
          rewardPoints: 250
        },
        inviteLink: "https://bvrb3r.app/invite/BVRB3R-ALEX",
        totals: {
          invited: 12,
          signedUp: 4,
          booked: 2,
          completed: 1,
          credited: 1,
          rewardPointsEarned: 250
        },
        recentReferrals: [
          {
            id: "ref-1",
            referredClientEmail: "friend@example.com",
            status: "booked",
            createdAt: "2026-04-21T00:00:00.000Z",
            rewardPoints: 250
          }
        ]
      },
      error: null
    });
    useCreateReferralInviteMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders the refined profile sections in order with wallet, rewards, referrals, and logout", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        payload={({
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "jordan@bvrb3r.app",
            phone: "8135550190"
          },
          favoriteBarber: {
            barber: { name: "Wave Carter" },
            profile: {
              profilePhotoUrl: null,
              headline: "Precision fades that hold their shape."
            },
            proof: {
              reviewScore: 4.9
            },
            shopLocations: [
              {
                id: "loc-ybor",
                name: "Centro Ybor Flagship"
              }
            ],
            bookingCtaHref: "/booking/new?barberId=barber-wave"
          },
          preferredShops: [
            {
              id: "loc-ybor",
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City",
              city: "Tampa",
              state: "FL"
            }
          ],
          notificationPreference: null,
          routine: null,
          paymentMethods: [
            {
              id: "pm-default",
              label: "Visa ending in 4242",
              isDefault: true
            },
            {
              id: "pm-alt",
              label: "Mastercard ending in 4444",
              isDefault: false
            }
          ]
        } as unknown as ClientProfilePayload)}
      />
    );

    const headings = [
      screen.getAllByText("Account")[0],
      screen.getAllByText("Preferences")[0],
      screen.getAllByText("Wallet")[0],
      screen.getAllByText("Rewards")[0],
      screen.getAllByText("Invite & Earn")[0],
      screen.getAllByText("Settings & Support")[0],
      screen.getAllByText("Logout")[0]
    ];

    for (let index = 1; index < headings.length; index += 1) {
      expect(headings[index - 1].compareDocumentPosition(headings[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    expect(screen.getByLabelText("Edit profile photo")).toBeInTheDocument();
    expect(screen.queryByText("Quick profile sections")).not.toBeInTheDocument();
    expect(screen.queryByText("Preferred barber")).not.toBeInTheDocument();
    expect(screen.queryByText("Standing routine")).not.toBeInTheDocument();
    expect(screen.getByText("Preferred Barbers")).toBeInTheDocument();
    expect(screen.getByText("Preferred Shops")).toBeInTheDocument();
    expect(screen.getByTestId("payment-methods-panel")).toHaveTextContent("Methods 2");
    expect(screen.getByText("BVR Points")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Signed up")).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Credited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows clean empty states for preferences and rewards when canonical data is absent", () => {
    useClientMembershipQueryMock.mockReturnValue({
      data: { subscription: null, value: null },
      error: null
    });
    usePointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 0,
        pendingPoints: 0,
        inAppValue: 0,
        explanation: {
          progressLabel: "No milestone yet"
        }
      },
      error: null
    });
    usePointsHistoryQueryMock.mockReturnValue({
      data: { activity: [] }
    });
    useClientReferralSummaryMock.mockReturnValue({
      data: {
        referralCode: undefined,
        inviteLink: "",
        totals: {
          invited: 0,
          signedUp: 0,
          booked: 0,
          completed: 0,
          credited: 0,
          rewardPointsEarned: 0
        },
        recentReferrals: []
      },
      error: null
    });

    render(
      <ClientProfileScreen
        isSignedInClient
        payload={({
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "jordan@bvrb3r.app",
            phone: "8135550190"
          },
          favoriteBarber: null,
          preferredShops: [],
          notificationPreference: null,
          routine: null,
          paymentMethods: []
        } as unknown as ClientProfilePayload)}
      />
    );

    expect(screen.getByText("No preferred barbers yet")).toBeInTheDocument();
    expect(screen.getByText("No preferred shops yet")).toBeInTheDocument();
    expect(screen.getByText("No rewards activity yet.")).toBeInTheDocument();
  });

  it("treats the location section alias as profile preferences", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        initialSection="location"
        payload={({
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "jordan@bvrb3r.app",
            phone: "8135550190"
          },
          favoriteBarber: null,
          preferredShops: [],
          notificationPreference: null,
          routine: null,
          paymentMethods: []
        } as unknown as ClientProfilePayload)}
      />
    );

    expect(screen.getAllByText("Preferences")[0]).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
