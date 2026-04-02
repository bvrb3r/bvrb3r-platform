import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  useBarberOverviewQueryMock,
  useUpdateBarberStatusMutationMock,
  useBarberLifecycleMutationMock,
  useCreateMessageThreadMutationMock,
  useUpdateBarberScheduleMutationMock,
  useMarketplaceServiceCatalogMock,
  useCreateMarketplaceServiceMutationMock,
  useUpdateMarketplaceServiceMutationMock,
  useDeleteMarketplaceServiceMutationMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useBarberOverviewQueryMock: vi.fn(),
  useUpdateBarberStatusMutationMock: vi.fn(),
  useBarberLifecycleMutationMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useUpdateBarberScheduleMutationMock: vi.fn(),
  useMarketplaceServiceCatalogMock: vi.fn(),
  useCreateMarketplaceServiceMutationMock: vi.fn(),
  useUpdateMarketplaceServiceMutationMock: vi.fn(),
  useDeleteMarketplaceServiceMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
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

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberOverviewQuery: useBarberOverviewQueryMock,
  useUpdateBarberStatusMutation: useUpdateBarberStatusMutationMock,
  useBarberLifecycleMutation: useBarberLifecycleMutationMock,
  useUpdateBarberScheduleMutation: useUpdateBarberScheduleMutationMock
}));

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceServiceCatalog: useMarketplaceServiceCatalogMock,
  useCreateMarketplaceServiceMutation: useCreateMarketplaceServiceMutationMock,
  useUpdateMarketplaceServiceMutation: useUpdateMarketplaceServiceMutationMock,
  useDeleteMarketplaceServiceMutation: useDeleteMarketplaceServiceMutationMock
}));

import { BarberCommandWorkspace } from "@/components/operations/barber-command-workspace";

describe("barber command workspace", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useBarberOverviewQueryMock.mockReset();
    useUpdateBarberStatusMutationMock.mockReset();
    useBarberLifecycleMutationMock.mockReset();
    useCreateMessageThreadMutationMock.mockReset();
    useUpdateBarberScheduleMutationMock.mockReset();
    useMarketplaceServiceCatalogMock.mockReset();
    useCreateMarketplaceServiceMutationMock.mockReset();
    useUpdateMarketplaceServiceMutationMock.mockReset();
    useDeleteMarketplaceServiceMutationMock.mockReset();

    useUpdateBarberStatusMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useUpdateBarberScheduleMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCreateMarketplaceServiceMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useUpdateMarketplaceServiceMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useDeleteMarketplaceServiceMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useMarketplaceServiceCatalogMock.mockReturnValue({
      data: {
        canCreate: true,
        editableServices: [
          {
            service: {
              id: "srv-fade",
              name: "Premium Fade",
              category: "Signature",
              description: "",
              durationMin: 45,
              bufferMin: 10,
              price: 60,
              deposit: 0,
              styleTagIds: []
            }
          }
        ],
        readOnlyServices: [],
        styleTags: []
      }
    });

    useBarberOverviewQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        shops: [{ id: "loc-ybor", label: "BVRB3R Ybor" }],
        status: {
          barberId: "barber-blaze",
          currentShopId: "loc-ybor",
          currentShopLabel: "BVRB3R Ybor",
          liveStatus: "available",
          liveStatusLabel: "Available",
          isOnline: true,
          acceptsWalkIns: true,
          nextAvailableAt: "2026-03-26T15:30:00.000Z",
          lastSeenAt: "2026-03-26T12:00:00.000Z",
          updatedAt: "2026-03-26T12:00:00.000Z",
          note: "Open for booked guests and walk-ins."
        },
        summary: {
          businessDate: "2026-03-26",
          activeCount: 1,
          serviceRevenueToday: 120,
          tipsToday: 24,
          commissionToday: 60,
          projectedPayout: 60,
          completedPaidCount: 1,
          rentCoverageToday: 0,
          bookedCount: 2,
          checkedInCount: 1,
          inServiceCount: 0,
          completedCount: 1,
          cancelledCount: 0
        },
        nextAppointment: {
          id: "appt-2",
          locationId: "loc-ybor",
          barberId: "barber-blaze",
          clientId: "client-jordan",
          serviceId: "srv-fade",
          status: "checked_in",
          start: "2026-03-26T14:00:00.000Z",
          end: "2026-03-26T14:45:00.000Z",
          chair: "Chair 2",
          addOnIds: [],
          depositAmount: 0,
          totalAmount: 60,
          balanceDue: 0,
          tipAmount: 0,
          note: "",
          source: "booking",
          revision: 2,
          updatedAt: "2026-03-26T13:45:00.000Z",
          display: {
            clientName: "Jordan Ellis",
            serviceName: "Premium Fade",
            locationName: "BVRB3R Ybor",
            locationLabel: "BVRB3R Ybor",
            statusLabel: "Checked In",
            lifecycleDetail: "Client is checked in and ready for service."
          },
          financial: {
            latestStatus: "captured",
            latestStatusLabel: "Paid in full",
            authorizedAmount: 0,
            capturedAmount: 60,
            refundedAmount: 0,
            tipAmount: 0,
            outstandingBalance: 0
          }
        },
        todayAppointments: [],
        upcomingAppointments: [],
        workingHours: [],
        blockedTimes: [],
        quickClients: [
          {
            clientId: "client-jordan",
            clientName: "Jordan Ellis",
            email: "jordan@example.com",
            phone: "555-0101",
            retentionTag: "repeat",
            totalAppointments: 4,
            completedAppointments: 3,
            activeAppointments: 1,
            cancelledAppointments: 0,
            lastVisitAt: "2026-03-20T14:00:00.000Z",
            nextVisitAt: "2026-03-26T14:00:00.000Z",
            latestServiceName: "Premium Fade",
            lifetimeGrossSales: 180,
            averageTicket: 60,
            relationshipLabel: "Repeat guest",
            favoriteRelationship: true,
            intelligence: {
              rebookingWindow: "scheduled",
              churnRisk: "low",
              loyaltySegment: "repeat",
              nextBestAction: "Keep the cadence moving."
            },
            canMessage: true,
            messageAppointmentId: "appt-2"
          }
        ],
        earnings: {
          businessDate: "2026-03-26",
          todayBookings: 2,
          clientsRebookedToday: 1,
          upcomingBookings: 1,
          completedServices: 1,
          grossSales: 105,
          tips: 12,
          averageTicket: 52.5,
          outstandingCheckoutCount: 0
        }
      },
      isLoading: false,
      error: null
    });
  });

  it("renders the new operational command structure for barbers", () => {
    render(<BarberCommandWorkspace barberName="Blaze King" />);

    expect(screen.getByText("Barber Command")).toBeInTheDocument();
    expect(screen.getByText("Live chair status")).toBeInTheDocument();
    expect(screen.getByText("Next guest")).toBeInTheDocument();
    expect(screen.getByText("Today performance")).toBeInTheDocument();
    expect(screen.getByText("Weekly availability")).toBeInTheDocument();
    expect(screen.getByText("Service builder")).toBeInTheDocument();
    expect(screen.getAllByText("Duration (minutes)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Price ($)")[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message Client" })).toBeInTheDocument();
    expect(screen.queryByText("Chair pulse")).not.toBeInTheDocument();
    expect(screen.queryByText("Next available")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open full schedule" })).not.toBeInTheDocument();
  });
});
