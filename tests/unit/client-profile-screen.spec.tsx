import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useClientBookingsQueryMock,
  useClientMembershipQueryMock,
  usePointsBalanceQueryMock,
  usePointsHistoryQueryMock,
  useClientReferralSummaryMock,
  useCreateReferralInviteMutationMock,
  invalidateQueriesMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
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
  useClientBookingsQuery: useClientBookingsQueryMock,
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
    useClientBookingsQueryMock.mockReset();
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
        },
        clientProfile: {
          publicUsername: "phillipmcgee",
          publicCity: "Tampa",
          publicState: "FL",
          gallery: []
        }
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        upcoming: [
          {
            id: "appt-next",
            status: "confirmed",
            start: "2026-04-28T14:00:00.000Z",
            view: {
              barber: { name: "Wave Carter" }
            }
          }
        ],
        history: [
          {
            id: "appt-past",
            status: "completed",
            start: "2026-04-18T14:00:00.000Z",
            view: {
              barber: { name: "Receipt Barber" }
            }
          }
        ]
      },
      isLoading: false,
      error: null
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

    expect(screen.getAllByRole("heading", { name: "More" })).toHaveLength(1);
    const identityCard = screen.getByTestId("client-more-identity-card");
    expect(identityCard).toBeInTheDocument();
    expect(within(identityCard).getByRole("heading", { name: "Jordan Ellis" })).toBeInTheDocument();
    expect(within(identityCard).getByText("CLIENT ACCOUNT")).toBeInTheDocument();
    expect(within(identityCard).getAllByText("jordan@bvrb3r.app")).toHaveLength(1);
    expect(within(identityCard).getAllByText("Verified").length).toBeGreaterThan(0);
    expect(within(identityCard).getByText("Wallet ready")).toBeInTheDocument();
    expect(within(identityCard).getByText("Creator payouts locked")).toBeInTheDocument();
    expect(within(identityCard).getByText("@phillipmcgee")).toBeInTheDocument();
    expect(within(identityCard).getByText("Tampa, FL")).toBeInTheDocument();
    expect(within(identityCard).queryByText("813-555-0100")).not.toBeInTheDocument();
    expect(within(identityCard).queryByText(/Street|Avenue|Lane|Road/i)).not.toBeInTheDocument();
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    expect(scrollSpy).not.toHaveBeenCalled();
    const accountDialog = screen.getByRole("dialog", { name: "Edit Account" });
    expect(accountDialog).toBeInTheDocument();
    expect(within(accountDialog).getByLabelText("BVRB3R Username")).toBeInTheDocument();
    expect(within(accountDialog).queryByLabelText("Public display name")).not.toBeInTheDocument();
    expect(within(accountDialog).getByLabelText("Email")).toBeInTheDocument();
    expect(within(accountDialog).getByLabelText("Phone Number")).toBeInTheDocument();
    expect(within(accountDialog).getByText("Default Payment Method")).toBeInTheDocument();
    expect(within(accountDialog).getByLabelText("Location")).toBeInTheDocument();
    expect(within(accountDialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(accountDialog).getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(within(accountDialog).getByLabelText("Close account editor")).toBeInTheDocument();
    fireEvent.click(within(accountDialog).getByLabelText("Close account editor"));
    expect(screen.queryByRole("dialog", { name: "Edit Account" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Public Profile" })).toHaveAttribute("href", "/dashboard/client/public-profile");
    expect(screen.queryByRole("link", { name: "View Activity" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your BVRB3R setup")).not.toBeInTheDocument();
    expect(screen.getByText("BVRB3R App Settings")).toBeInTheDocument();
    ["Notifications & Alerts", "Preferences", "Saved / Favorites", "Activity"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("button", { name: /Account Name, contact, and profile photo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Public Profile Culture profile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Help Support resources/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method for bookings, auto-booking, subscriptions, tools, ads, and promotions/ })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");
    expect(screen.getByRole("link", { name: /Stripe Connect Creator-only/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.getByRole("link", { name: /Creator Payouts Locked until approved. All creator payout information/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.getByRole("link", { name: /Rewards Points, credits, loyalty progress, and referrals/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.getByRole("link", { name: /Transactions Charges, refunds, failed payments, credits, subscriptions, creator payouts, and all money movement/ })).toHaveAttribute("href", "/dashboard/client/activity");
    expect(screen.getByRole("link", { name: /Tax Information Creator tax forms and tax documents/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.queryByText("Payment History")).not.toBeInTheDocument();
    expect(screen.queryByText("Receipts")).not.toBeInTheDocument();
    expect(screen.queryByText("Barber Business Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("SHOP BUSINESS SETTINGS")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Identity Verification Required when this account becomes eligible to receive payouts/ })).toHaveAttribute("href", "/verify-contact");
    expect(screen.getByText("Required when this account becomes eligible to receive payouts, such as creator payouts. Not required for normal booking.")).toBeInTheDocument();
    expect(screen.queryByText("License Verification")).not.toBeInTheDocument();
    expect(screen.queryByText("Business Verification")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Privacy Booking data, rewards data/ })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: /Help Center Guides and support resources/ })).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("heading", { name: "Account & Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Booking Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payments & Wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rewards & Loyalty" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invite & Earn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preferences" })).not.toBeInTheDocument();
    expect(screen.queryByText("Preferred Barbers")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-methods-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Activity/ })).toHaveAttribute("href", "/dashboard/client/activity");
    expect(screen.getByRole("link", { name: /Contact Support/ })).toHaveAttribute("href", "/dashboard/client/messages?thread=support");
    expect(screen.queryByText("Settings & Support")).not.toBeInTheDocument();
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
        initialSection="preferences"
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
    expect(screen.queryByText("View appointments")).not.toBeInTheDocument();
    expect(screen.queryByText("No membership")).not.toBeInTheDocument();
    expect(screen.queryByText("No rewards activity yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Membership status could not be loaded right now.")).not.toBeInTheDocument();
  });

  it("keeps membership failures visible without blocking the rest of profile", () => {
    useClientMembershipQueryMock.mockReturnValue({
      data: null,
      error: new Error("billing_subscriptions query failed")
    });

    render(
      <ClientProfileScreen
        isSignedInClient
        initialSection="rewards"
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

    expect(screen.getByText("Membership status could not be loaded right now.")).toBeInTheDocument();
    expect(screen.getByText("No membership")).toBeInTheDocument();
    expect(screen.getByText("Membership updates appear here when active.")).toBeInTheDocument();
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

    expect(screen.getAllByText("jordan@bvrb3r.app").length).toBeGreaterThan(0);
    expect(screen.getByText("Phone not set")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add Phone" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Account & Profile" })).toBeInTheDocument();
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
        initialSection="settings"
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

    fireEvent.click(screen.getByRole("button", { name: /Add Location|Edit Location/i }));
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
    expect(screen.getByText("Location saved for faster booking.")).toBeInTheDocument();
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
        initialSection="settings"
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

    fireEvent.click(screen.getByRole("button", { name: /Add Location|Edit Location/i }));
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Tampa" } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: "FL" } });
    fireEvent.click(screen.getByRole("button", { name: /Save location/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Client location update was denied by policy. (rls_denied)").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("heading", { name: "Set location" })).toBeInTheDocument();
    expect(screen.getAllByText("Client location update was denied by policy. (rls_denied)").length).toBeGreaterThan(0);
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
