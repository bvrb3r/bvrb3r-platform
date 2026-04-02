import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePwaMock,
  useBarberEarningsQueryMock,
  useBarberOverviewQueryMock,
  useBarberPayoutsQueryMock,
  usePointsBalanceQueryMock,
  usePointsHistoryQueryMock,
  useRequestPointsCashoutMutationMock
} = vi.hoisted(() => ({
  usePwaMock: vi.fn(),
  useBarberEarningsQueryMock: vi.fn(),
  useBarberOverviewQueryMock: vi.fn(),
  useBarberPayoutsQueryMock: vi.fn(),
  usePointsBalanceQueryMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn(),
  useRequestPointsCashoutMutationMock: vi.fn()
}));

vi.mock("@/components/pwa/pwa-provider", () => ({
  usePwa: usePwaMock
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useBarberEarningsQuery: useBarberEarningsQueryMock,
  useBarberOverviewQuery: useBarberOverviewQueryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useBarberPayoutsQuery: useBarberPayoutsQueryMock
}));

vi.mock("@/lib/points/client", () => ({
  usePointsBalanceQuery: usePointsBalanceQueryMock,
  usePointsHistoryQuery: usePointsHistoryQueryMock,
  useRequestPointsCashoutMutation: useRequestPointsCashoutMutationMock
}));

vi.mock("@/components/operations/barber-fintech-readiness-panel", () => ({
  BarberFintechReadinessPanel: () => <div data-testid="barber-fintech-readiness-stub">Fintech readiness</div>
}));

import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";

describe("barber earnings workspace", () => {
  beforeEach(() => {
    usePwaMock.mockReset();
    useBarberEarningsQueryMock.mockReset();
    useBarberOverviewQueryMock.mockReset();
    useBarberPayoutsQueryMock.mockReset();
    usePointsBalanceQueryMock.mockReset();
    usePointsHistoryQueryMock.mockReset();
    useRequestPointsCashoutMutationMock.mockReset();

    usePwaMock.mockReturnValue({ isOnline: true });
    useRequestPointsCashoutMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    usePointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 180,
        pendingPoints: 20,
        cashoutEligiblePoints: 120,
        reservedCashoutPoints: 0,
        cashoutValue: 8.4,
        inAppValue: 18,
        explanation: {
          progressLabel: "20 pts until $20.00 in-app value.",
          cashoutHint: "120 earned points are cash-out ready at $8.40, but worth $18.00 in-app."
        }
      }
    });
    usePointsHistoryQueryMock.mockReturnValue({
      data: {
        activity: [
          {
            id: "points-activity-1",
            title: "Qualified tip",
            detail: "Tip reward qualified on $9.00 gratuity.",
            amountLabel: "+6 pts",
            statusLabel: "pending",
            tone: "neutral"
          }
        ]
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
          nextAvailableAt: "2026-03-26T16:15:00.000Z",
          lastSeenAt: "2026-03-26T15:00:00.000Z",
          updatedAt: "2026-03-26T15:00:00.000Z",
          note: "Open for booked guests and walk-ins."
        },
        summary: {
          businessDate: "2026-03-26",
          activeCount: 0,
          serviceRevenueToday: 140,
          tipsToday: 18,
          commissionToday: 0,
          projectedPayout: 220,
          completedPaidCount: 2,
          rentCoverageToday: 0,
          bookedCount: 3,
          checkedInCount: 0,
          inServiceCount: 0,
          completedCount: 2,
          cancelledCount: 0
        },
        nextAppointment: null,
        todayAppointments: [],
        upcomingAppointments: [],
        workingHours: [],
        blockedTimes: [],
        quickClients: [
          {
            clientId: "client-jordan",
            clientName: "Jordan Ellis",
            email: "jordan@example.com",
            phone: "555-1212",
            retentionTag: "repeat",
            totalAppointments: 5,
            completedAppointments: 4,
            activeAppointments: 0,
            cancelledAppointments: 0,
            lastVisitAt: "2026-03-24T14:00:00.000Z",
            nextVisitAt: null,
            latestServiceName: "Premium Fade",
            latestServiceId: "srv-fade",
            lifetimeGrossSales: 320,
            averageTicket: 80,
            relationshipLabel: "Repeat guest",
            favoriteRelationship: true,
            intelligence: {
              rebookingWindow: "due_soon",
              churnRisk: "low",
              loyaltySegment: "vip",
              nextBestAction: "Invite the next visit."
            },
            canMessage: true,
            messageAppointmentId: "appt-2"
          }
        ],
        earnings: {
          businessDate: "2026-03-26",
          todayBookings: 3,
          clientsRebookedToday: 1,
          upcomingBookings: 1,
          completedServices: 2,
          grossSales: 140,
          tips: 18,
          averageTicket: 70,
          outstandingCheckoutCount: 0
        }
      },
      isLoading: false,
      error: null
    });
    useBarberPayoutsQueryMock.mockReturnValue({
      data: {
        summary: {
          executableRoutingRecords: 1,
          readyForPayoutAmount: 220,
          blockedExecutionRecords: 0,
          failedExecutionRecords: 0,
          executedTransferCount: 1,
          reversedExecutionCount: 0,
          executedAmount: 220,
          reversedAmount: 0
        },
        recentExecutions: [
          {
            id: "exec-1",
            routingRecordId: "route-1",
            paymentId: "pay-1",
            appointmentId: "appt-2",
            targetSubjectType: "barber",
            targetDisplayName: "Blaze King",
            barberName: "Blaze King",
            shopLabel: "BVRB3R Ybor",
            routingModel: "booth_rent",
            executionType: "standard_payout",
            executionStatus: "executed",
            reconciliationStatus: "reconciled",
            amount: 220,
            payoutReference: "payout-1",
            payoutSpeed: "instant",
            instantPayoutFeeAmount: 3.3,
            netTransferAmount: 216.7,
            currency: "usd",
            blockedReason: null,
            failureReason: null,
            processorTransferId: "tr_1",
            processorPayoutId: "po_1",
            processorReversalId: null,
            providerFeeAmount: 0,
            platformFeeAmount: 11,
            createdAt: "2026-03-26T14:30:00.000Z",
            executedAt: "2026-03-26T14:45:00.000Z",
            failedAt: null,
            reversedAt: null
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useBarberEarningsQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        summary: {
          businessDate: "2026-03-26",
          todayBookings: 3,
          clientsRebookedToday: 1,
          upcomingBookings: 2,
          completedServices: 2,
          grossSales: 140,
          tips: 18,
          averageTicket: 70,
          outstandingCheckoutCount: 0
        },
        growth: {
          weekRevenue: 520,
          weekTips: 76,
          weekCompletedServices: 8,
          weekAverageTicket: 65,
          weekRebookedClients: 3,
          previousWeekRevenue: 460,
          bestDayLabel: "Mar 24",
          bestDayRevenue: 210,
          monthRevenue: 1680,
          repeatClientRevenue: 840,
          repeatClientShare: 50,
          outstandingBalance: 0,
          averageTip: 9.5,
          trends: [],
          topClients: [],
          serviceMix: [],
          subscription: null
        },
        money: {
          todayEarnings: 140,
          pendingPayouts: 65,
          completedPayouts: 480,
          wallet: {
            pendingBalance: 60,
            availableBalance: 220,
            currency: "usd",
            updatedAt: "2026-03-26T14:00:00.000Z"
          },
          boothRent: {
            amount: 0,
            frequency: null,
            status: "not_applicable",
            periodLabel: null,
            dueDate: null,
            paidDate: null,
            overdueAmount: 0,
            lastAttemptedAt: null
          },
          pointsEarned: 40,
          pointsCashedOut: 10,
          tax: {
            role: "barber",
            subjectId: "barber-blaze",
            year: 2026,
            gross: 5200,
            fees: 240,
            net: 4960,
            payouts: 4200,
            refunds: 0,
            pointsIncentiveCost: 14,
            platformRevenue: 260,
            subscriptionRevenue: 0,
            generatedAt: "2026-03-26T14:00:00.000Z"
          },
          cashoutSummary: {
            requested: 1,
            underReview: 0,
            approved: 1,
            paid: 2,
            failed: 0,
            reversed: 0
          },
          payoutVisibility: [
            {
              appointmentId: "appt-2",
              paymentId: "pay-1",
              routingRecordId: "route-1",
              status: "pending",
              eligibleAmount: 220,
              thresholdAmount: 50,
              thresholdRemaining: 0,
              minimumThresholdMet: true,
              blockedReasons: [],
              stripeReady: true,
              disputeHold: false,
              refundHold: false,
              nextAction: "Ready for standard payout",
              executionCount: 0,
              lastUpdatedAt: "2026-03-26T14:00:00.000Z"
            }
          ],
          recentCashouts: [
            {
              requestId: "cashout-1",
              userId: "user-blaze",
              role: "barber",
              userLabel: "Blaze King",
              pointsRequested: 120,
              cashValue: 8.4,
              status: "paid",
              createdAt: "2026-03-26T12:00:00.000Z",
              processedAt: "2026-03-26T13:00:00.000Z",
              fraudFlags: [],
              reviewNote: "Approved",
              payoutReference: "cashout-ref",
              failureReason: null,
              auditLog: [],
              canReview: false,
              canApprove: false,
              canReject: false,
              canMarkPaid: false,
              canMarkFailed: false,
              canReverse: false
            }
          ]
        },
        recentAppointments: [
          {
            id: "appt-2",
            locationId: "loc-ybor",
            barberId: "barber-blaze",
            clientId: "client-jordan",
            serviceId: "srv-fade",
            status: "completed",
            start: "2026-03-26T14:00:00.000Z",
            end: "2026-03-26T14:45:00.000Z",
            chair: "Chair 2",
            addOnIds: [],
            depositAmount: 0,
            totalAmount: 60,
            balanceDue: 0,
            tipAmount: 12,
            note: "",
            source: "booking",
            revision: 2,
            updatedAt: "2026-03-26T13:45:00.000Z",
            display: {
              clientName: "Jordan Ellis",
              serviceName: "Premium Fade",
              locationName: "BVRB3R Ybor",
              locationLabel: "BVRB3R Ybor",
              statusLabel: "Completed",
              lifecycleDetail: "Completed and posted to the shop dashboard."
            },
            financial: {
              latestStatus: "captured",
              latestStatusLabel: "Paid in full",
              authorizedAmount: 0,
              capturedAmount: 60,
              refundedAmount: 0,
              tipAmount: 12,
              outstandingBalance: 0
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
  });

  it("renders a money-first earnings experience for barbers", () => {
    render(<BarberEarningsWorkspace barberName="Blaze King" />);

    expect(screen.getByText("Money tab")).toBeInTheDocument();
    expect(screen.getByText("Today earned")).toBeInTheDocument();
    expect(screen.getByText("Today goal")).toBeInTheDocument();
    expect(screen.getByText("Available now")).toBeInTheDocument();
    expect(screen.getByText("Payout readiness")).toBeInTheDocument();
    expect(screen.getByText("Weekly performance")).toBeInTheDocument();
    expect(screen.getByText("Opportunity")).toBeInTheDocument();
    expect(screen.getByText("Earnings activity")).toBeInTheDocument();
    expect(screen.getByText("Tax / fee visibility")).toBeInTheDocument();
    expect(screen.getByText("Quiet motivation")).toBeInTheDocument();
    expect(screen.getByText("Review clients")).toBeInTheDocument();
    expect(screen.getByText("Instant payout fee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request cash-out" })).toBeInTheDocument();
    expect(screen.getByText("Points position")).toBeInTheDocument();
    expect(screen.getByText("Recent point activity")).toBeInTheDocument();
    expect(screen.getByText("Qualified tip")).toBeInTheDocument();
    expect(screen.getByTestId("barber-fintech-readiness-stub")).toBeInTheDocument();
  });
});
