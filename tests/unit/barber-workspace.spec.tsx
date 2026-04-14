import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  useBarberOverviewQueryMock,
  useBarberLifecycleMutationMock,
  useNotifyBarberOpenSlotMutationMock,
  useSaveBarberSubtypeMutationMock,
  useCreateMessageThreadMutationMock,
  useMarketplaceServiceCatalogMock,
  useCreateQueueEntryMutationMock,
  useQueueEntryActionMutationMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useBarberOverviewQueryMock: vi.fn(),
  useBarberLifecycleMutationMock: vi.fn(),
  useNotifyBarberOpenSlotMutationMock: vi.fn(),
  useSaveBarberSubtypeMutationMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useMarketplaceServiceCatalogMock: vi.fn(),
  useCreateQueueEntryMutationMock: vi.fn(),
  useQueueEntryActionMutationMock: vi.fn()
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
  useBarberLifecycleMutation: useBarberLifecycleMutationMock,
  useNotifyBarberOpenSlotMutation: useNotifyBarberOpenSlotMutationMock,
  useSaveBarberSubtypeMutation: useSaveBarberSubtypeMutationMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceServiceCatalog: useMarketplaceServiceCatalogMock
}));

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

vi.mock("@/lib/operations/queue-client", () => ({
  useCreateQueueEntryMutation: useCreateQueueEntryMutationMock,
  useQueueEntryActionMutation: useQueueEntryActionMutationMock
}));

import { BarberWorkspace } from "@/components/operations/barber-workspace";

describe("barber workspace", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useBarberOverviewQueryMock.mockReset();
    useBarberLifecycleMutationMock.mockReset();
    useNotifyBarberOpenSlotMutationMock.mockReset();
    useSaveBarberSubtypeMutationMock.mockReset();
    useCreateMessageThreadMutationMock.mockReset();
    useMarketplaceServiceCatalogMock.mockReset();
    useCreateQueueEntryMutationMock.mockReset();
    useQueueEntryActionMutationMock.mockReset();

    useBarberLifecycleMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useNotifyBarberOpenSlotMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        notificationsQueued: 2,
        audienceCount: 2,
        slotStartsAt: "2026-03-26T14:45:00.000Z"
      })
    });
    useSaveBarberSubtypeMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        lane: { role: "barber" },
        degraded: false,
        nextPath: "/dashboard/barber"
      })
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
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
    useCreateQueueEntryMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ entry: { id: "queue-1" } })
    });
    useQueueEntryActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({})
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
        todayAppointments: [
          {
            id: "appt-1",
            locationId: "loc-ybor",
            barberId: "barber-blaze",
            clientId: "client-nova",
            serviceId: "srv-beard",
            status: "completed",
            start: "2026-03-26T10:00:00.000Z",
            end: "2026-03-26T10:30:00.000Z",
            chair: "Chair 2",
            addOnIds: [],
            depositAmount: 0,
            totalAmount: 45,
            balanceDue: 0,
            tipAmount: 12,
            note: "",
            source: "booking",
            revision: 1,
            updatedAt: "2026-03-26T10:45:00.000Z",
            display: {
              clientName: "Nova Bennett",
              serviceName: "Beard Sculpt",
              locationName: "BVRB3R Ybor",
              locationLabel: "BVRB3R Ybor",
              statusLabel: "Completed",
              lifecycleDetail: "Completed and posted to the shop dashboard."
            },
            financial: {
              latestStatus: "captured",
              latestStatusLabel: "Paid in full",
              authorizedAmount: 0,
              capturedAmount: 45,
              refundedAmount: 0,
              tipAmount: 12,
              outstandingBalance: 0
            }
          },
          {
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
          }
        ],
        upcomingAppointments: [],
        workingHours: [],
        blockedTimes: [],
        quickClients: [
          {
            clientId: "client-jordan",
            clientName: "Jordan Ellis",
            retentionTag: "repeat",
            relationshipLabel: "Repeat guest"
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

  it("renders a schedule-first day view with quick chair operations", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" />);

    expect(screen.getByText("Today's bookings")).toBeInTheDocument();
    expect(screen.getByText("Clients rebooked today")).toBeInTheDocument();
    expect(screen.getByText("Home calendar")).toBeInTheDocument();
    expect(screen.getByText("Run the day from the chair.")).toBeInTheDocument();
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getByText("Premium Fade")).toBeInTheDocument();
    expect(screen.queryByText("What matters now")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open command" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Create walk-in booking at/i }).length).toBeGreaterThan(0);
  });

  it("shows an in-dashboard setup prompt when the barber subtype is missing", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Barber" />);

    expect(screen.getByTestId("barber-subtype-setup")).toBeInTheDocument();
    expect(screen.getByText("Complete your barber setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Freelance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Commission/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Booth rent \/ Blueprint/i })).toBeInTheDocument();
  });

  it("saves the barber subtype from the dashboard setup prompt", async () => {
    const saveSubtype = vi.fn().mockResolvedValue({
      lane: { role: "barber" },
      degraded: false,
      nextPath: "/dashboard/barber"
    });
    useSaveBarberSubtypeMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: saveSubtype
    });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Barber" />);

    fireEvent.click(screen.getByRole("button", { name: /Commission/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save business model" }));

    await waitFor(() => {
      expect(saveSubtype).toHaveBeenCalledWith("commission");
    });
    expect(await screen.findByText("Business model saved. Your barber dashboard is ready to keep moving.")).toBeInTheDocument();
    expect(screen.queryByTestId("barber-subtype-setup")).not.toBeInTheDocument();
  });

  it("does not show the subtype setup prompt after subtype is saved", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Freelance Barber" barberSubtype="freelance" />);

    expect(screen.queryByTestId("barber-subtype-setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete your barber setup")).not.toBeInTheDocument();
    expect(screen.getByTestId("barber-subtype-settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update business model" })).toBeInTheDocument();
  });

  it("lets a barber update their subtype later from dashboard settings", async () => {
    const saveSubtype = vi.fn().mockResolvedValue({
      lane: { role: "barber" },
      degraded: false,
      nextPath: "/dashboard/barber"
    });
    useSaveBarberSubtypeMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: saveSubtype
    });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Freelance Barber" barberSubtype="freelance" />);

    fireEvent.click(screen.getByRole("button", { name: "Update business model" }));
    fireEvent.click(screen.getByRole("button", { name: /Booth rent \/ Blueprint/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save business model" }));

    await waitFor(() => {
      expect(saveSubtype).toHaveBeenCalledWith("blueprint");
    });
    expect(await screen.findByText("Business model saved. Your barber dashboard is ready to keep moving.")).toBeInTheDocument();
  });

  it("opens a one-stop appointment detail drawer from the calendar", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" />);

    fireEvent.click(screen.getByRole("button", { name: /Open appointment details for Jordan Ellis/i }));

    const dialog = screen.getByRole("dialog", { name: /Appointment details for Jordan Ellis/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Appointment detail")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Paid in full").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("$60")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Start Service" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Message client" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open clients" })).toBeInTheDocument();
  });

  it("opens a walk-in booking modal from an empty slot", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" />);

    fireEvent.click(screen.getAllByRole("button", { name: /Create walk-in booking at/i })[0]);

    const dialog = screen.getByRole("dialog", { name: /Create walk-in booking for/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Guest name")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Phone")).toBeInTheDocument();
    expect(within(dialog).getByText("Collect card with tap to pay")).toBeInTheDocument();
  });

  it("suggests the next open slot after service completion", async () => {
    const lifecycleMutateAsync = vi.fn().mockResolvedValue({});
    useBarberLifecycleMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: lifecycleMutateAsync
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
          liveStatus: "busy",
          liveStatusLabel: "Busy",
          isOnline: true,
          acceptsWalkIns: true,
          nextAvailableAt: "2026-03-26T15:00:00.000Z",
          lastSeenAt: "2026-03-26T12:00:00.000Z",
          updatedAt: "2026-03-26T12:00:00.000Z",
          note: "Busy on the chair."
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
          checkedInCount: 0,
          inServiceCount: 1,
          completedCount: 1,
          cancelledCount: 0
        },
        nextAppointment: null,
        todayAppointments: [
          {
            id: "appt-2",
            locationId: "loc-ybor",
            barberId: "barber-blaze",
            clientId: "client-jordan",
            serviceId: "srv-fade",
            status: "in_service",
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
            revision: 3,
            updatedAt: "2026-03-26T14:05:00.000Z",
            display: {
              clientName: "Jordan Ellis",
              serviceName: "Premium Fade",
              locationName: "BVRB3R Ybor",
              locationLabel: "BVRB3R Ybor",
              statusLabel: "In Service",
              lifecycleDetail: "Service is in progress right now."
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
          }
        ],
        upcomingAppointments: [],
        workingHours: [],
        blockedTimes: [],
        quickClients: [],
        earnings: {
          businessDate: "2026-03-26",
          todayBookings: 1,
          clientsRebookedToday: 0,
          upcomingBookings: 0,
          completedServices: 0,
          grossSales: 60,
          tips: 0,
          averageTicket: 60,
          outstandingCheckoutCount: 0
        }
      },
      isLoading: false,
      error: null
    });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" />);

    fireEvent.click(screen.getByRole("button", { name: /Open appointment details for Jordan Ellis/i }));
    fireEvent.click(screen.getByRole("button", { name: "Complete Service" }));

    await waitFor(() => {
      expect(lifecycleMutateAsync).toHaveBeenCalled();
    });

    expect(await screen.findByText("Chair reopened")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notify eligible clients" })).toBeInTheDocument();
  });
});
