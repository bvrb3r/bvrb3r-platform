import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useOwnerOperationsQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/owner-operations/client", () => ({
  useOwnerOperationsQuery: useOwnerOperationsQueryMock,
  useUpdateOwnerFloorMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useCreateOwnerWalkInMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useReassignOwnerWalkInMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useSetOwnerKioskEmergencyMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useUpdateOwnerKioskPolicyMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  usePairOwnerKioskMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null, data: null
  }),
  useSaveOwnerKioskPinMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useCreateOwnerChairMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useRetireOwnerChairMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useOwnerTeamDirectoryQuery: () => ({
    data: { shop: { id: "shop-one", label: "Shop One" }, barbers: [] },
    error: null
  }),
  useCreateOwnerTeamInviteMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useRespondOwnerJoinRequestMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useSetOwnerRelationshipPauseMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  }),
  useEndOwnerRelationshipMutation: () => ({
    mutate: vi.fn(), isPending: false, error: null
  })
}));

import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";

describe("Product PR25 owner operations workspace", () => {
  beforeEach(() => {
    useOwnerOperationsQueryMock.mockReset();
    useOwnerOperationsQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        scope: { shopId: "shop-one", shopName: "Shop One", locationLabel: "Detroit" },
        generatedAt: "2026-07-29T12:00:00.000Z",
        summary: {
          floorVolume: 2,
          booked: 1,
          waiting: 1,
          checkedIn: 0,
          inService: 0,
          completed: 0,
          activeBarbers: 1,
          openChairs: 1
        },
        sourceCounts: [{ source: "square", label: "Square", count: 1 }],
        team: [{
          barberId: "barber-one",
          name: "Alex",
          booked: 1,
          completed: 0,
          liveAppointments: 0,
          nextAppointmentStart: "2026-07-29T15:00:00.000Z",
          floorState: "open"
        }],
        floor: [{
          id: "appointment-one",
          kind: "appointment",
          status: "booked",
          clientDisplayName: "Guest A",
          serviceDisplayName: "Cut",
          barberId: "barber-one",
          barberDisplayName: "Alex",
          source: "square",
          sourceLabel: "Square",
          paymentOwner: "external_provider",
          startsAt: "2026-07-29T15:00:00.000Z",
          waitMinutes: null,
          position: null
        }],
        alerts: [],
        controls: {
          floor: {
            intakeOpen: true,
            floorNote: null,
            rotationOverrideBarberId: null,
            rotationOverrideReason: null,
            rotationOverrideExpiresAt: null,
            version: 1
          },
          kiosk: {
            paired: false,
            pinSet: false,
            enabled: false,
            healthStatus: "unpaired",
            emergencyDisabledAt: null,
            privacyMode: true,
            autoResetEnabled: true,
            externalCheckinEnabled: false,
            guestCheckinAllowed: true,
            qrEntryEnabled: true,
            nfcEntryEnabled: false,
            clientBridgePromptEnabled: true,
            clientBridgePromptFrequency: "once_per_visit",
            notificationFailureEscalation: true,
            rotationPolicy: "balanced",
            balanceGuardrailMinutes: 20,
            paymentCollectionPolicy: "barber_checkout",
            sessionTimeoutSeconds: 75
          },
          chairs: [],
          boothRent: { billedCents: 0, paidCents: 0, outstandingCents: 0, overdueCount: 0 },
          clientBridge: { offered: 0, consented: 0, invitations: 0, claimed: 0, optedOut: 0 }
        },
        privacyNotice: "Floor volume — barbers’ money, not the shop’s. Shop-owned money is limited to booth rent billed, paid, and outstanding."
      }
    });
  });

  it("renders operational counts without a revenue or tip card", () => {
    render(<OwnerOperationsWorkspace shopIds={["shop-one"]} />);
    expect(screen.getByText("Today’s book · all sources")).toBeInTheDocument();
    expect(screen.getByText(/external platform money and barber-private earnings never appear/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Owner screen" }), {
      target: { value: "chairs" }
    });
    expect(screen.getByText(/Full Booth Rent \+ AutoBooth Rent only/i)).toBeInTheDocument();
    expect(screen.queryByText(/today revenue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tips/i)).not.toBeInTheDocument();
  });

  it("shows source and external payment ownership on Floor Day", () => {
    render(<OwnerOperationsWorkspace shopIds={["shop-one"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Owner screen" }), {
      target: { value: "floor" }
    });
    expect(screen.getByText("Guest A")).toBeInTheDocument();
    expect(screen.getByText("Square")).toBeInTheDocument();
    expect(screen.getByText("External provider owns payment")).toBeInTheDocument();
  });

  it("keeps emergency controls disabled until a kiosk is paired", () => {
    render(<OwnerOperationsWorkspace shopIds={["shop-one"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Owner screen" }), {
      target: { value: "kiosk" }
    });
    expect(screen.getByText(/pair this kiosk/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore kiosk" })).toBeDisabled();
  });
});
