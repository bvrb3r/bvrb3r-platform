import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useCreateReferralInviteMutationMock,
  invalidateQueriesMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useClientMembershipQueryMock: vi.fn(),
  usePointsBalanceQueryMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  useCreateReferralInviteMutationMock: vi.fn(),
  invalidateQueriesMock: vi.fn()
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: invalidateQueriesMock
    })
  };
});

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
    invalidateQueriesMock.mockReset();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: { status: "completed" } })
    })) as unknown as typeof fetch;

    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          profilePhotoUrl: null,
          notificationPreference: {
            inAppEnabled: true,
            smsEnabled: false,
            emailEnabled: true,
            pushEnabled: true
          }
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
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
        emailVerified
        phoneVerified
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
              username: "wave",
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
    expect(screen.getByText("wave")).toBeInTheDocument();
    expect(screen.queryByText("Wave Carter")).not.toBeInTheDocument();
    expect(screen.getByText("Preferred Shops")).toBeInTheDocument();
    expect(screen.queryByText("Preferred Location")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-methods-panel")).toHaveTextContent("Methods 2");
    expect(screen.getByText("BVR Points")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Signed up")).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Credited")).toBeInTheDocument();
    expect(screen.getByText("In-app alerts")).toBeInTheDocument();
    expect(screen.getByText("Text updates")).toBeInTheDocument();
    expect(screen.getByText("Email updates")).toBeInTheDocument();
    expect(screen.getByText("Push alerts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message Support" })).toHaveAttribute("href", "/dashboard/client/messages?thread=support");
    expect(screen.queryByText("Account settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Account status")).not.toBeInTheDocument();
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
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
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

  it("shows the auth email when the client payload email is missing", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        authEmail="jordan@bvrb3r.app"
        authPhone=""
        payload={({
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "",
            phone: ""
          },
          favoriteBarber: null,
          preferredShops: [],
          notificationPreference: null,
          routine: null,
          paymentMethods: []
        } as unknown as ClientProfilePayload)}
      />
    );

    expect(screen.getByText("jordan@bvrb3r.app")).toBeInTheDocument();
    expect(screen.getByText("Phone required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Phone" })).toHaveAttribute("href", "/verify-contact");
  });

  it("treats the location section alias as profile account", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        initialSection="location"
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
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

    expect(screen.getAllByText("Account")[0]).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens quick location setup from the client activation gate and saves canonical client location", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        location: {
          city: "Charlotte",
          state: "NC"
        }
      })
    })) as unknown as typeof fetch;

    render(
      <ClientProfileScreen
        isSignedInClient
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
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

    fireEvent.click(screen.getByRole("button", { name: /Set location/i }));
    expect(screen.getByRole("heading", { name: "Set location" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Charlotte" } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: "NC" } });
    fireEvent.click(screen.getByRole("button", { name: /Save location/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/client/location", expect.objectContaining({
        method: "POST"
      }));
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Set location" })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Charlotte, NC").length).toBeGreaterThan(0);
    expect(screen.getByText("Location saved")).toBeInTheDocument();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["client-home"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["marketplace"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["barber-search"] });
  });

  it("keeps the location modal open with an exact save failure reason", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: "Client location update was denied by policy.",
        reason: "rls_denied"
      })
    })) as unknown as typeof fetch;

    render(
      <ClientProfileScreen
        isSignedInClient
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
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

    fireEvent.click(screen.getByRole("button", { name: /Set location/i }));
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Tampa" } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: "FL" } });
    fireEvent.click(screen.getByRole("button", { name: /Save location/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Client location update was denied by policy. (rls_denied)").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("heading", { name: "Set location" })).toBeInTheDocument();
    expect(screen.getByText("Location missing")).toBeInTheDocument();
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it("displays saved client booking city instead of a pending placeholder", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        authEmail="jordan@bvrb3r.app"
        authPhone="8135550190"
        payload={({
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "jordan@bvrb3r.app",
            phone: "8135550190",
            preferredLocation: {
              city: "Tampa",
              state: "FL"
            }
          },
          favoriteBarber: null,
          preferredShops: [],
          notificationPreference: null,
          routine: null,
          paymentMethods: []
        } as unknown as ClientProfilePayload)}
      />
    );

    expect(screen.getAllByText("Tampa, FL").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pending, Pending, Pending")).not.toBeInTheDocument();
  });
});
