import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  useBarberClientsQueryMock,
  useCreateMessageThreadMutationMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useBarberClientsQueryMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberClientsQuery: useBarberClientsQueryMock
}));

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

import { BarberClientsWorkspace } from "@/components/operations/barber-clients-workspace";

describe("barber clients workspace", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useBarberClientsQueryMock.mockReset();
    useCreateMessageThreadMutationMock.mockReset();

    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });

    useBarberClientsQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        clients: [
          {
            clientId: "client-a",
            clientName: "Alex Stone",
            email: "alex@example.com",
            phone: "555-1111",
            retentionTag: "repeat",
            totalAppointments: 6,
            completedAppointments: 5,
            activeAppointments: 1,
            cancelledAppointments: 0,
            lastVisitAt: "2026-03-24T15:00:00.000Z",
            nextVisitAt: "2026-04-02T15:00:00.000Z",
            latestServiceName: "Premium Fade",
            latestServiceId: "srv-fade",
            lifetimeGrossSales: 360,
            averageTicket: 72,
            relationshipLabel: "Repeat guest",
            favoriteRelationship: true,
            intelligence: {
              rebookingWindow: "scheduled",
              churnRisk: "low",
              loyaltySegment: "vip",
              nextBestAction: "Keep the cadence moving."
            },
            canMessage: true,
            messageAppointmentId: "appt-a"
          },
          {
            clientId: "client-b",
            clientName: "Brian Cole",
            email: "brian@example.com",
            phone: "555-2222",
            retentionTag: "new",
            totalAppointments: 1,
            completedAppointments: 1,
            activeAppointments: 0,
            cancelledAppointments: 0,
            lastVisitAt: "2026-03-20T12:00:00.000Z",
            nextVisitAt: null,
            latestServiceName: "Line Up",
            latestServiceId: "srv-lineup",
            lifetimeGrossSales: 35,
            averageTicket: 35,
            relationshipLabel: "New guest",
            favoriteRelationship: false,
            intelligence: {
              rebookingWindow: "building",
              churnRisk: "low",
              loyaltySegment: "new",
              nextBestAction: "Invite the next visit."
            },
            canMessage: false,
            messageAppointmentId: null
          }
        ]
      },
      isLoading: false,
      error: null
    });
  });

  it("renders a list-style roster with the requested client fields", () => {
    render(<BarberClientsWorkspace barberName="Blaze King" />);

    expect(screen.getByText("Alex Stone")).toBeInTheDocument();
    expect(screen.getByText("Brian Cole")).toBeInTheDocument();
    expect(screen.getByText("$360")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("Repeat")).toBeInTheDocument();
  });

  it("supports spend and retention sorting without leaving the roster", () => {
    render(<BarberClientsWorkspace barberName="Blaze King" />);

    fireEvent.change(screen.getByDisplayValue("A-Z"), { target: { value: "highest_spend" } });
    expect(screen.getAllByText(/Alex Stone|Brian Cole/)[0]).toHaveTextContent("Alex Stone");

    fireEvent.change(screen.getByDisplayValue("Highest spend"), { target: { value: "most_visits" } });
    expect(screen.getAllByText(/Alex Stone|Brian Cole/)[0]).toHaveTextContent("Alex Stone");
  });

  it("opens relationship history and supports book-again routing", () => {
    render(<BarberClientsWorkspace barberName="Blaze King" />);

    fireEvent.click(screen.getAllByRole("button", { name: "View history" })[0]);

    const dialog = screen.getByRole("dialog", { name: /Relationship history for Alex Stone/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Next best action")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Book again" })[0]);
    expect(pushMock).toHaveBeenCalledWith("/booking/new?barberId=barber-blaze&serviceId=srv-fade");
  });
});
