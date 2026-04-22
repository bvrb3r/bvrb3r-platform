import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  refreshMock,
  confirmMock,
  useBarberOverviewQueryMock,
  useBarberLifecycleMutationMock,
  useBarberCancelBookingMutationMock,
  useSaveBarberSubtypeMutationMock,
  useCreateMessageThreadMutationMock,
  useBarberTrustSummaryMock,
  useBarberFintechReadinessQueryMock,
  useBarberPayoutsQueryMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  confirmMock: vi.fn(),
  useBarberOverviewQueryMock: vi.fn(),
  useBarberLifecycleMutationMock: vi.fn(),
  useBarberCancelBookingMutationMock: vi.fn(),
  useSaveBarberSubtypeMutationMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useBarberTrustSummaryMock: vi.fn(),
  useBarberFintechReadinessQueryMock: vi.fn(),
  useBarberPayoutsQueryMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock
  })
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberOverviewQuery: useBarberOverviewQueryMock,
  useBarberLifecycleMutation: useBarberLifecycleMutationMock,
  useBarberCancelBookingMutation: useBarberCancelBookingMutationMock,
  useSaveBarberSubtypeMutation: useSaveBarberSubtypeMutationMock
}));

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

vi.mock("@/lib/trust/client", () => ({
  useBarberTrustSummary: useBarberTrustSummaryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useBarberFintechReadinessQuery: useBarberFintechReadinessQueryMock,
  useBarberPayoutsQuery: useBarberPayoutsQueryMock
}));

import { BarberWorkspace } from "@/components/operations/barber-workspace";

function buildOverview(overrides: Record<string, unknown> = {}) {
  return {
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
      nextAvailableAt: "2026-04-21T15:30:00.000Z",
      lastSeenAt: "2026-04-21T12:00:00.000Z",
      updatedAt: "2026-04-21T12:00:00.000Z",
      note: "Open for booked guests and walk-ins."
    },
    summary: {
      businessDate: "2026-04-21",
      activeCount: 1,
      serviceRevenueToday: 120,
      tipsToday: 18,
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
      start: "2026-04-21T14:00:00.000Z",
      end: "2026-04-21T14:45:00.000Z",
      chair: "Chair 2",
      addOnIds: [],
      depositAmount: 0,
      totalAmount: 60,
      balanceDue: 0,
      tipAmount: 0,
      note: "",
      source: "booking",
      revision: 2,
      updatedAt: "2026-04-21T13:45:00.000Z",
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
        start: "2026-04-21T10:00:00.000Z",
        end: "2026-04-21T10:30:00.000Z",
        chair: "Chair 2",
        addOnIds: [],
        depositAmount: 0,
        totalAmount: 45,
        balanceDue: 0,
        tipAmount: 12,
        note: "Likes a softer beard blend.",
        source: "booking",
        revision: 1,
        updatedAt: "2026-04-21T10:45:00.000Z",
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
        start: "2026-04-21T14:00:00.000Z",
        end: "2026-04-21T14:45:00.000Z",
        chair: "Chair 2",
        addOnIds: [],
        depositAmount: 0,
        totalAmount: 60,
        balanceDue: 0,
        tipAmount: 0,
        note: "",
        source: "booking",
        revision: 2,
        updatedAt: "2026-04-21T13:45:00.000Z",
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
    workingHours: [
      { locationId: "loc-ybor", locationLabel: "BVRB3R Ybor", weekday: 2, startTime: "09:00", endTime: "17:00" }
    ],
    blockedTimes: [],
    quickClients: [
      {
        clientId: "client-jordan",
        clientName: "Jordan Ellis",
        email: "jordan@example.com",
        phone: "555-0100",
        retentionTag: "repeat",
        totalAppointments: 4,
        completedAppointments: 3,
        activeAppointments: 1,
        cancelledAppointments: 0,
        lastVisitAt: "2026-04-05T14:00:00.000Z",
        nextVisitAt: "2026-04-21T14:00:00.000Z",
        latestServiceName: "Premium Fade",
        latestServiceId: "srv-fade",
        lifetimeGrossSales: 210,
        averageTicket: 70,
        relationshipLabel: "Repeat guest",
        favoriteRelationship: true,
        intelligence: {
          rebookingWindow: "scheduled",
          churnRisk: "low",
          loyaltySegment: "vip",
          nextBestAction: "Keep the cadence moving."
        },
        canMessage: true,
        messageAppointmentId: "appt-2",
        clientNotes: ["Prefers the tighter taper on the neckline."],
        lastAppointmentNote: "Keep the blend extra clean around the temple.",
        recentVisits: []
      }
    ],
    earnings: {
      businessDate: "2026-04-21",
      todayBookings: 2,
      clientsRebookedToday: 1,
      upcomingBookings: 1,
      completedServices: 1,
      grossSales: 105,
      tips: 12,
      averageTicket: 52.5,
      outstandingCheckoutCount: 0
    },
    ...overrides
  };
}

describe("barber workspace", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);

    useBarberLifecycleMutationMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    useBarberCancelBookingMutationMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    useSaveBarberSubtypeMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ lane: { role: "barber" }, degraded: false, nextPath: "/dashboard/barber" })
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ thread: { id: "thread-1" } })
    });
    useBarberTrustSummaryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        overallStatus: "verified",
        canonicalOverallStatus: "approved",
        verificationProgress: 100,
        trustScore: 94,
        completionRate: 100,
        publicBadgePreview: ["Verified barber"],
        verificationItems: [],
        openReports: 0,
        openDisputes: 0,
        activeRiskFlags: [],
        reminders: [],
        verificationDecision: {
          gates: {
            booking: { allowed: true, gate: "booking", codes: [], reasons: [], degraded: false },
            payout: { allowed: true, gate: "payout", codes: [], reasons: [], degraded: false }
          }
        }
      }
    });
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        connectedAccount: { operationalStatus: "payout_ready" },
        routingSummary: {
          readyForPayoutAmount: 78,
          blockedPaymentsCount: 0,
          blockedReasons: []
        }
      }
    });
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        recentExecutions: [
          { id: "payout-1", executionStatus: "executed" }
        ]
      }
    });
    useBarberOverviewQueryMock.mockReturnValue({
      data: buildOverview(),
      isLoading: false,
      error: null
    });
  });

  it("renders the Phase 5 today-first barber lane from canonical overview truth", () => {
    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" barberSubtype="blueprint" />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Next client")).toBeInTheDocument();
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getByText("Payout status")).toBeInTheDocument();
    expect(screen.getByText("Approval and payout posture")).toBeInTheDocument();
    expect(screen.getByText("Today's schedule")).toBeInTheDocument();
    expect(screen.queryByText("Home calendar")).not.toBeInTheDocument();
  });

  it("shows the barber setup prompt when subtype is missing and saves it", async () => {
    const saveSubtype = vi.fn().mockResolvedValue({ lane: { role: "barber" }, degraded: false, nextPath: "/dashboard/barber" });
    useSaveBarberSubtypeMutationMock.mockReturnValue({ isPending: false, mutateAsync: saveSubtype });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Barber" />);

    expect(screen.getByTestId("barber-subtype-setup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Commission/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save business model" }));

    await waitFor(() => {
      expect(saveSubtype).toHaveBeenCalledWith("commission");
    });
    expect(await screen.findByText("Business model saved. Your barber lane is ready to run on the live rails.")).toBeInTheDocument();
  });

  it("renders a clean empty state when the barber has no appointments today", () => {
    useBarberOverviewQueryMock.mockReturnValue({
      data: buildOverview({
        nextAppointment: null,
        todayAppointments: [],
        quickClients: [],
        earnings: {
          businessDate: "2026-04-21",
          todayBookings: 0,
          clientsRebookedToday: 0,
          upcomingBookings: 0,
          completedServices: 0,
          grossSales: 0,
          tips: 0,
          averageTicket: 0,
          outstandingCheckoutCount: 0
        }
      }),
      isLoading: false,
      error: null
    });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" barberSubtype="blueprint" />);

    expect(screen.getByText(/No appointments are on today's barber calendar yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No appointments are on this barber's live day sheet yet/i)).toBeInTheDocument();
  });

  it("renders booking and payout blockers when trust/compliance gates are not clear", () => {
    useBarberTrustSummaryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        overallStatus: "pending",
        canonicalOverallStatus: "under_review",
        verificationProgress: 65,
        trustScore: 62,
        completionRate: 100,
        publicBadgePreview: [],
        verificationItems: [],
        openReports: 0,
        openDisputes: 0,
        activeRiskFlags: [],
        reminders: ["Submit payout verification"],
        verificationDecision: {
          gates: {
            booking: { allowed: false, gate: "booking", codes: ["booking_not_enabled"], reasons: ["Booking access is still paused pending review."], degraded: false },
            payout: { allowed: false, gate: "payout", codes: ["payout_not_enabled"], reasons: ["Payouts are blocked until verification clears."], degraded: false }
          }
        }
      }
    });
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        connectedAccount: { operationalStatus: "restricted" },
        routingSummary: {
          readyForPayoutAmount: 0,
          blockedPaymentsCount: 2,
          blockedReasons: ["Provider payouts not ready"]
        }
      }
    });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" barberSubtype="blueprint" />);

    expect(screen.getAllByText("Booking access is still paused pending review.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payouts are blocked until verification clears.").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider payouts not ready")).toBeInTheDocument();
  });

  it("lets a barber cancel from the canonical booking action path", async () => {
    const cancelBooking = vi.fn().mockResolvedValue({});
    useBarberCancelBookingMutationMock.mockReturnValue({ isPending: false, mutateAsync: cancelBooking });

    render(<BarberWorkspace barberName="Blaze King" barberTitle="Booth-Rent Barber" barberSubtype="blueprint" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));

    await waitFor(() => {
      expect(cancelBooking).toHaveBeenCalledWith({
        appointmentId: "appt-2",
        expectedRevision: 2,
        reason: "Cancelled by barber"
      });
    });
  });
});
