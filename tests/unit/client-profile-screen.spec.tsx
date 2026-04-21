import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn()
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

import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";

describe("client profile screen", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();

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
  });

  it("renders wallet basics from canonical payment methods", () => {
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
        } as any}
      />
    );

    expect(screen.getByText("Wallet basics")).toBeInTheDocument();
    expect(screen.getByText("2 saved payment methods")).toBeInTheDocument();
    expect(screen.getAllByText("Visa ending in 4242").length).toBeGreaterThan(0);
    expect(screen.getByTestId("payment-methods-panel")).toHaveTextContent("Methods 2");
  });

  it("shows clean empty wallet guidance when no saved methods exist", () => {
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
        } as any}
      />
    );

    expect(screen.getAllByText("No saved payment methods yet").length).toBeGreaterThan(0);
    expect(screen.getByText("Add a saved card so booking and rebooking stay fast.")).toBeInTheDocument();
  });
});
