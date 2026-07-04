import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import type { ClientPaywallSummary } from "@/lib/entitlements/client-paywall";

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

const freeClientPaywallSummary: ClientPaywallSummary = {
  currentPlanLabel: "Free",
  billingLabel: "No paid billing cycle connected",
  statusLabel: "Free access active",
  statusTone: "neutral",
  serverEvidenceLabel: "Server default",
  freeBookingAvailable: true,
  lockedFeatureCount: 6,
  needsReviewCount: 0,
  upgradeActionLabel: "Review plan access",
  upgradeHref: "/dashboard/client/more?section=wallet",
  checkoutUrl: null,
  portalUrl: null,
  features: {
    free: [{
      id: "client-basic-booking",
      title: "Basic booking, search, and discovery",
      description: "Search barbers, view shops, book eligible services, and manage activity.",
      requiredPlanLabel: "Free",
      state: "available",
      stateLabel: "Available",
      reason: "Free client essentials remain available.",
      evidenceSource: "Server entitlement registry"
    }],
    pro: [{
      id: "client-priority-rebooking",
      title: "Priority rebooking preferences",
      description: "Reserved for faster rebooking preferences after server-verified Pro access.",
      requiredPlanLabel: "Pro",
      state: "locked",
      stateLabel: "Upgrade required",
      reason: "Paid feature requires server-verified Pro or Elite entitlement.",
      evidenceSource: "Server entitlement registry"
    }],
    elite: [{
      id: "client-premium-filters",
      title: "Premium discovery filters",
      description: "Reserved for deeper discovery filters after server-verified Elite access.",
      requiredPlanLabel: "Elite",
      state: "locked",
      stateLabel: "Upgrade required",
      reason: "Paid feature requires server-verified Pro or Elite entitlement.",
      evidenceSource: "Server entitlement registry"
    }]
  }
};

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
    const clientNotificationRow = screen.getByRole("link", { name: /Notifications & Alerts Messages, reminders, booking updates, and app alerts/ });
    const clientPreferencesRow = screen.getByRole("link", { name: /Preferences App experience, display, default behavior, and saved area/ });
    const clientSavedRow = screen.getByRole("link", { name: /Saved \/ Favorites Saved barbers, shops, styles, and platform items/ });
    const clientActivityRow = screen.getByRole("link", { name: /Activity App activity, booking activity, and visit history/ });
    expect(clientNotificationRow.compareDocumentPosition(clientPreferencesRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clientPreferencesRow.compareDocumentPosition(clientSavedRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clientSavedRow.compareDocumentPosition(clientActivityRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Account Name, contact, and profile photo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Public Profile Culture profile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Help Support resources/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Client Content Creator Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    const appSettings = screen.getByText("BVRB3R App Settings");
    const creatorSettings = screen.getByRole("heading", { name: "Client Content Creator Settings" });
    const payments = screen.getByRole("heading", { name: "Payments & Banking" });
    const compliance = screen.getByRole("heading", { name: "Compliance & Security" });
    expect(appSettings.compareDocumentPosition(creatorSettings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(creatorSettings.compareDocumentPosition(payments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(payments.compareDocumentPosition(compliance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /Creator Status Locked, eligible, pending review, approved, suspended, or banned. Creator tools locked/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.getByRole("link", { name: /Creator Requirements Loyalty, account verification, auto-book activity, content rules, and payout eligibility/ })).toHaveAttribute("href", "/dashboard/client/more?section=rewards");
    expect(screen.getByRole("link", { name: /Culture Profile Public creator identity, bio, interests, display style, and Culture profile visibility/ })).toHaveAttribute("href", "/dashboard/client/public-profile");
    expect(screen.getByRole("link", { name: /Content Settings Posting defaults, visibility, content categories, comments, sharing, and moderation preferences/ })).toHaveAttribute("href", "/dashboard/client/public-profile");
    expect(screen.getByRole("link", { name: /Performance Posts, views, followers, engagement, shares, profile clicks, and booking influence/ })).toHaveAttribute("href", "/dashboard/client/activity");
    expect(screen.getByRole("link", { name: /Creator Safety Content rules, strikes, reports, appeal status, and platform standing/ })).toHaveAttribute("href", "/contact");
    expect(screen.getByText("Creator tools locked")).toBeInTheDocument();
    expect(screen.queryByText("0 posts")).not.toBeInTheDocument();
    expect(screen.queryByText("No violations")).not.toBeInTheDocument();
    ["Service Library", "Hours", "Booking Rules", "Shop Relationship", "Team & Roles", "Kiosk Settings", "Booth Rent, Commission & Fees"].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method for bookings, auto-booking, subscriptions, tools, ads, and promotions/ })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");
    expect(screen.getByRole("link", { name: /Plan Access Free booking stays open. Pro and Elite tools require server-verified plan access. Needs review/ })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");
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

  it("renders wallet plan access from server entitlement summary without checkout or portal actions", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        initialSection="wallet"
        authEmail="jordan@bvrb3r.app"
        payload={( {
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
        } as unknown as ClientProfilePayload )}
        paywallSummary={freeClientPaywallSummary}
      />
    );

    expect(screen.getByTestId("client-plan-access-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free client access" })).toBeInTheDocument();
    expect(screen.getByText("Basic booking, search, and discovery")).toBeInTheDocument();
    expect(screen.getByText("Priority rebooking preferences")).toBeInTheDocument();
    expect(screen.getByText("Premium discovery filters")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review plan access" })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");
    expect(screen.queryByRole("link", { name: /Checkout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Billing portal/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/stripe customer/i)).not.toBeInTheDocument();
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

  it("opens focused More row modals in the visible viewport with cancel, save, and exit controls", async () => {
    render(
      <>
        <nav data-testid="mobile-bottom-nav" className="fixed inset-x-2 bottom-3 z-50">
          <button type="button">Client nav item</button>
        </nav>
        <ClientProfileScreen
          isSignedInClient
          authEmail="client@bvrb3r.demo"
          authPhone="8135550100"
          emailVerified
          phoneVerified
          payload={{
            client: {
              clientReference: "client-modal",
              fullName: "Modal Client",
              email: "client@bvrb3r.demo",
              phone: "8135550100",
              preferredLocation: { city: "Tampa", state: "FL" }
            },
            favoriteBarber: null,
            preferredShops: [],
            paymentMethods: [],
            notificationPreference: null
          } as unknown as ClientProfilePayload}
        />
      </>
    );

    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollSpy.mockClear();
    const initialScrollY = window.scrollY;

    fireEvent.click(screen.getByRole("link", { name: /Notifications & Alerts Messages, reminders, booking updates, and app alerts/ }));
    let dialog = screen.getByRole("dialog", { name: "Notifications & Alerts" });
    const bottomNav = screen.getByTestId("mobile-bottom-nav");
    const backdrop = screen.getByTestId("more-setting-modal-backdrop");
    const panel = screen.getByTestId("more-setting-modal-panel");
    const footer = screen.getByTestId("more-setting-modal-footer");
    expect(bottomNav).toHaveClass("z-50");
    expect(backdrop).toHaveClass("fixed", "inset-0", "z-[9999]");
    expect(panel).toHaveClass("relative", "z-[10000]", "max-h-[calc(100dvh-1rem)]", "overflow-hidden");
    expect(footer).toHaveClass("sticky", "bottom-0", "z-20", "pb-[calc(1.25rem+env(safe-area-inset-bottom))]");
    expect(backdrop).not.toHaveClass("absolute");
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(initialScrollY);
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByLabelText("Close setting modal")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const notificationSaveButton = within(dialog).getByRole("button", { name: "Save Changes" });
    expect(notificationSaveButton).toBeDisabled();
    expect(within(dialog).queryByText("Canonical save path required")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("Messages, reminders, booking updates, rewards, and app alerts.").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Culture updates")).toBeInTheDocument();
    expect(within(dialog).getByText("Receipt and payment updates")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Not configured yet").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Quiet hours start")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Quiet hours end")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/SMS updates/));
    expect(notificationSaveButton).toBeEnabled();
    expect(within(dialog).getByText("Source of truth")).toBeInTheDocument();
    expect(within(dialog).getByText("Sync targets")).toBeInTheDocument();
    expect(within(dialog).queryByText("Open attached destination")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("This focused control is being prepared. No changes were saved.")).not.toBeInTheDocument();
    fireEvent.click(notificationSaveButton);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/settings/more", expect.objectContaining({
      method: "POST"
    })));
    const settingsRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call) => call[0] === "/api/settings/more")?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(settingsRequest?.body))).toEqual(expect.objectContaining({
      action: "update_notification_preferences",
      values: expect.objectContaining({ sms_enabled: true })
    }));
    const settingsValues = JSON.parse(String(settingsRequest?.body)).values as Record<string, unknown>;
    expect(settingsValues).not.toHaveProperty("quiet_hours_start");
    expect(settingsValues).not.toHaveProperty("quiet_hours_end");
    expect(screen.queryByRole("dialog", { name: "Notifications & Alerts" })).not.toBeInTheDocument();
    await waitFor(() => expect(document.body.style.overflow).toBe(""));

    fireEvent.click(screen.getByRole("link", { name: /Preferences App experience, display, default behavior, and saved area/ }));
    dialog = screen.getByRole("dialog", { name: "Preferences" });
    const clientPreferenceSave = within(dialog).getByRole("button", { name: "Save Changes" });
    expect(clientPreferenceSave).toBeDisabled();
    expect(within(dialog).getAllByText("App experience, booking defaults, saved area, and smart rebooking behavior.").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Default start screen")).toBeInTheDocument();
    expect(within(dialog).getByText("Rebooking reminders")).toBeInTheDocument();
    expect(within(dialog).getByText("Smart booking suggestions")).toBeInTheDocument();
    expect(within(dialog).queryByText("Preferred contact channel")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Auto-book suggestions")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/Smart booking suggestions/));
    expect(clientPreferenceSave).toBeEnabled();
    fireEvent.click(clientPreferenceSave);
    await waitFor(() => {
      const preferencesRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call) => {
        const request = call[1] as RequestInit | undefined;
        return call[0] === "/api/settings/more" && String(request?.body).includes("update_app_preferences");
      })?.[1] as RequestInit | undefined;
      expect(preferencesRequest).toBeDefined();
      const preferencesValues = JSON.parse(String(preferencesRequest?.body)).values as Record<string, unknown>;
      expect(preferencesValues).toEqual(expect.objectContaining({ smart_booking_suggestions_enabled: true }));
      expect(preferencesValues).not.toHaveProperty("preferred_contact_channel");
      expect(preferencesValues).not.toHaveProperty("auto_book_suggestions_enabled");
    });

    fireEvent.click(screen.getByRole("link", { name: /Saved \/ Favorites Saved barbers, shops, styles, and platform items/ }));
    dialog = screen.getByRole("dialog", { name: "Saved / Favorites" });
    expect(within(dialog).getByText("Private account setting")).toBeInTheDocument();
    expect(within(dialog).getByText("Source of truth")).toBeInTheDocument();
    expect(within(dialog).getByText("Sync targets")).toBeInTheDocument();
    expect(within(dialog).getByText("Platform sync contract")).toBeInTheDocument();
    expect(within(dialog).getByText("Canonical save path required")).toBeInTheDocument();
    expect(within(dialog).getByText(/canonical role engagement graph/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        edges: [{ id: "edge-hidden", targetId: "barber-raw-uuid" }],
        sections: [
          {
            key: "client-saved-barbers",
            title: "Saved barbers",
            emptyText: "No saved barbers yet.",
            items: [{ key: "safe-barber", title: "Wave Carter", detail: "Private save record for a barber.", meta: "Updated Jun 11, 2026" }]
          },
          { key: "client-saved-shops", title: "Saved shops", emptyText: "No saved shops yet.", items: [] },
          { key: "client-saved-items", title: "Saved styles and platform items", emptyText: "No saved styles or platform items yet.", items: [] }
        ]
      })
    } as Response);
    fireEvent.click(within(dialog).getByRole("button", { name: "Load current records" }));
    expect(await within(dialog).findByText("Wave Carter")).toBeInTheDocument();
    expect(within(dialog).getByText("No saved shops yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("No saved styles or platform items yet.")).toBeInTheDocument();
    expect(within(dialog).queryByText("barber-raw-uuid")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Saved / Favorites" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Activity App activity, booking activity, and visit history/ }));
    dialog = screen.getByRole("dialog", { name: "Activity" });
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        events: [{ id: "activity-hidden", targetId: "appointment-raw-uuid" }],
        items: [{ key: "safe-activity", title: "Setting Updated", detail: "Setting updated on settings.", meta: "Recorded Jun 11, 2026" }],
        emptyText: "No account activity yet."
      })
    } as Response);
    fireEvent.click(within(dialog).getByRole("button", { name: "Load current records" }));
    expect(await within(dialog).findByText("Setting Updated")).toBeInTheDocument();
    expect(within(dialog).queryByText("appointment-raw-uuid")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("link", { name: /Creator Status Locked, eligible, pending review, approved, suspended, or banned. Creator tools locked/ }));
    dialog = screen.getByRole("dialog", { name: "Creator Status" });
    expect(within(dialog).getAllByText("Creator tools locked").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Verified account")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("Close setting modal"));
    expect(screen.queryByRole("dialog", { name: "Creator Status" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    dialog = screen.getByRole("dialog", { name: "Log Out" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("submits client support intake only after required details are present", async () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        authEmail="client@bvrb3r.demo"
        authPhone="8135550100"
        payload={{
          client: {
            clientReference: "client-support",
            fullName: "Support Client",
            email: "client@bvrb3r.demo",
            phone: "8135550100",
            preferredLocation: { city: "Tampa", state: "FL" }
          },
          favoriteBarber: null,
          preferredShops: [],
          paymentMethods: [],
          notificationPreference: null
        } as unknown as ClientProfilePayload}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Report a problem Report booking, account, messages, payments, safety, or app issues/ }));
    const dialog = screen.getByRole("dialog", { name: "Report a problem" });
    const categorySelect = within(dialog).getByLabelText(/What is this about/);
    const options = within(categorySelect).getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(options).toContain("booking_problem");
    expect(options).toContain("safety_or_trust_concern");
    expect(options).not.toContain("shop_or_queue_problem");
    expect(options).not.toContain("kiosk_problem");
    expect(within(dialog).queryByText("If someone is in immediate danger, contact local emergency services.")).not.toBeInTheDocument();

    fireEvent.change(categorySelect, { target: { value: "safety_or_trust_concern" } });
    expect(within(dialog).getByText("If someone is in immediate danger, contact local emergency services.")).toBeInTheDocument();
    const submitButton = within(dialog).getByRole("button", { name: "Submit to Support" });
    await waitFor(() => expect(submitButton).toBeEnabled());
    fireEvent.click(submitButton);
    expect(await within(dialog).findByText("Complete What happened? before submitting.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/support/issue-intake", expect.anything());

    fireEvent.change(within(dialog).getByLabelText(/What happened/), {
      target: { value: "The app showed an error after I tried to open my next booking." }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit to Support" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/support/issue-intake", expect.objectContaining({
      method: "POST"
    })));
    const supportRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((call) => call[0] === "/api/support/issue-intake")?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(supportRequest?.body))).toEqual(expect.objectContaining({
      category: "safety_or_trust_concern",
      severity: "normal",
      description: "The app showed an error after I tried to open my next booking.",
      sourceSurface: "client_more"
    }));
    expect(await within(dialog).findByText("We received your report and routed it to BVRB3R Support.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Report a problem" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/client_user|barber_user|shop_owner_user|support_ticket_id|issue_intake_records|route_target|architect_internal|stripe_customer_id|account_entitlements/i);
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
