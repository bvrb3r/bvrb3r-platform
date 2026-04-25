import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useClientMembershipQueryMock,
  usePointsBalanceQueryMock,
  usePointsHistoryQueryMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useClientMembershipQueryMock: vi.fn(),
  usePointsBalanceQueryMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn()
}));

vi.mock("@/lib/booking/client", () => ({
  useClientMembershipQuery: useClientMembershipQueryMock
}));

vi.mock("@/lib/points/client", () => ({
  usePointsBalanceQuery: usePointsBalanceQueryMock,
  usePointsHistoryQuery: usePointsHistoryQueryMock
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: vi.fn()
}));

vi.mock("@/components/profile/profile-media-manager", () => ({
  ProfilePhotoManagerCard: ({ title }: { title: string }) => <div>{title}</div>
}));

vi.mock("@/components/client-experience/client-payment-methods-panel", () => ({
  ClientPaymentMethodsPanel: ({ initialMethods }: { initialMethods: Array<{ id: string }> }) => (
    <div data-testid="payment-methods-panel">Methods {initialMethods.length}</div>
  )
}));

vi.mock("@/components/engagement/referrals-workspace", () => ({
  ReferralsWorkspace: () => <div data-testid="referrals-workspace-stub">Referrals workspace</div>
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

    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          profilePhotoUrl: null
        }
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn()
    });
    useClientMembershipQueryMock.mockReturnValue({
      data: {
        subscription: {
          subscriptionStatus: "active",
          planName: "Client Core"
        },
        value: {
          valueMessage: "Member pricing and faster repeat booking are live on this account.",
          perkLabels: ["10% member pricing", "Priority booking"]
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
  });

  it("renders wallet, rewards, and referrals inside profile", () => {
    render(
      <ClientProfileScreen
        isSignedInClient
        payload={{
          client: {
            clientReference: "client-jordan",
            fullName: "Jordan Ellis",
            email: "jordan@bvrb3r.app",
            phone: "8135550190"
          },
          favoriteBarber: {
            barber: { name: "Wave Carter" },
            profile: {
              headline: "Precision fades that hold their shape.",
              specialties: ["Precision fades"]
            }
          },
          preferredShops: [
            {
              id: "loc-ybor",
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City",
              city: "Tampa"
            }
          ],
          notificationPreference: {
            inAppEnabled: true,
            emailEnabled: true,
            smsEnabled: true
          },
          routine: {
            label: "Every 2 weeks",
            nextSuggestedAt: "2026-04-30T14:00:00.000Z"
          },
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
        } as unknown as ClientProfilePayload}
      />
    );

    expect(screen.getByText("Wallet and payment methods")).toBeInTheDocument();
    expect(screen.getAllByText("2 saved payment methods").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visa ending in 4242").length).toBeGreaterThan(0);
    expect(screen.getByText("BVR Points and membership")).toBeInTheDocument();
    expect(screen.getAllByText("120 pts").length).toBeGreaterThan(0);
    expect(screen.getByTestId("referrals-workspace-stub")).toBeInTheDocument();
    expect(screen.getByTestId("payment-methods-panel")).toHaveTextContent("Methods 2");
  });

  it("shows clean empty wallet and rewards guidance when canonical data is absent", () => {
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

    render(
      <ClientProfileScreen
        isSignedInClient
        payload={{
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
        } as unknown as ClientProfilePayload}
      />
    );

    expect(screen.getByText("No saved payment methods yet")).toBeInTheDocument();
    expect(screen.getByText("Add a saved card so booking and rebooking stay fast.")).toBeInTheDocument();
    expect(screen.getByText("No rewards or membership history yet. Completed paid services, qualified referrals, and live subscriptions will show up here when they exist.")).toBeInTheDocument();
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
          preferredShops: [
            {
              id: "loc-ybor",
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City",
              city: "Tampa"
            }
          ],
          notificationPreference: null,
          routine: null,
          paymentMethods: []
        } as unknown as ClientProfilePayload)}
      />
    );

    expect(screen.getByText("Preferred setup")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
