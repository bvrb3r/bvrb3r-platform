import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  ensureClientProfileForUserMock,
  getClientProfilePayloadMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  ensureClientProfileForUserMock: vi.fn(),
  getClientProfilePayloadMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  ensureClientProfileForUser: ensureClientProfileForUserMock,
  getClientProfilePayload: getClientProfilePayloadMock
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children }: { children: ReactNode }) => (
    <main data-testid="client-app-shell">{children}</main>
  )
}));

vi.mock("@/components/client-experience/client-profile-screen", () => ({
  ClientProfileScreen: ({ payload }: { payload: { client: { clientReference: string } | null } }) => (
    <section data-testid="client-profile-screen">{payload.client?.clientReference ?? "empty-profile"}</section>
  )
}));

vi.mock("@/components/debug/stripe-debug-card", () => ({
  StripeDebugCard: () => <section data-testid="stripe-debug-card" />
}));

import ClientProfileDashboardPage from "@/app/(platform)/dashboard/client/profile/page";

function clientProfilePayload(clientReference = "client-repaired") {
  return {
    client: {
      clientReference,
      fullName: "Phillip mcgee",
      phone: "",
      email: "client@bvrb3r.app",
      loyaltyPoints: 0,
      retentionTag: "new",
      notes: []
    },
    favoriteBarber: null,
    preferredShops: [],
    notificationPreference: null,
    routine: null,
    paymentMethods: []
  };
}

function profilePage(searchParams: { section?: string; stripeMinimalTest?: string } = {}) {
  return ClientProfileDashboardPage({
    searchParams: Promise.resolve(searchParams)
  });
}

describe("client profile dashboard page", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    ensureClientProfileForUserMock.mockReset();
    getClientProfilePayloadMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    getClientExperienceContextMock.mockResolvedValue({
      isSignedInClient: true,
      isGuest: false,
      clientId: "client-runtime",
      viewer: {
        id: "profile-client",
        role: "client_user",
        email: "client@bvrb3r.app",
        canonicalFullName: "Phillip mcgee",
        name: "Phillip mcgee",
        phone: "",
        emailVerified: true,
        phoneVerified: false
      }
    });
    ensureClientProfileForUserMock.mockResolvedValue({
      clientId: "client-repaired"
    });
    getClientProfilePayloadMock.mockResolvedValue(clientProfilePayload());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders client_user profile pages after repair resolves", async () => {
    render(await profilePage());

    expect(ensureClientProfileForUserMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "profile-client",
      role: "client_user"
    }));
    expect(getClientProfilePayloadMock).toHaveBeenCalledWith("client-repaired");
    expect(screen.getByTestId("client-profile-screen")).toHaveTextContent("client-repaired");
  });

  it("keeps rendering when client repair fails during server render", async () => {
    ensureClientProfileForUserMock.mockRejectedValue(new Error("Only client accounts can repair client profile rows."));
    getClientProfilePayloadMock.mockResolvedValue(clientProfilePayload("client-runtime"));

    render(await profilePage());

    expect(console.warn).toHaveBeenCalledWith("[client-profile] repair_failed_nonfatal", expect.objectContaining({
      stage: "ensure_client_profile",
      role: "client_user"
    }));
    expect(getClientProfilePayloadMock).toHaveBeenCalledWith("client-runtime");
    expect(screen.getByTestId("client-profile-screen")).toHaveTextContent("client-runtime");
  });

  it("renders an empty client profile state when payload hydration fails", async () => {
    getClientProfilePayloadMock.mockRejectedValue(new Error("wallet unavailable"));

    render(await profilePage());

    expect(console.warn).toHaveBeenCalledWith("[client-profile] repair_failed_nonfatal", expect.objectContaining({
      stage: "profile_payload",
      role: "client_user"
    }));
    expect(screen.getByTestId("client-profile-screen")).toHaveTextContent("empty-profile");
  });

  it("skips repair safely for non-client signed-in roles", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      isSignedInClient: true,
      isGuest: false,
      clientId: "",
      viewer: {
        id: "profile-barber",
        role: "barber_user",
        email: "barber@bvrb3r.app",
        name: "Barber",
        phone: ""
      }
    });
    getClientProfilePayloadMock.mockResolvedValue(clientProfilePayload("empty"));

    render(await profilePage());

    expect(ensureClientProfileForUserMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[client-profile] repair_skipped", expect.objectContaining({
      stage: "role_guard",
      role: "barber_user"
    }));
    expect(screen.getByTestId("client-profile-screen")).toHaveTextContent("empty");
  });
});
