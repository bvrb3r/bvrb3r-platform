import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";

const {
  pushMock,
  useBarberLifecycleMutationMock,
  useBarberScheduleQueryMock,
  useCreateMessageThreadMutationMock,
  useUpdateBarberScheduleMutationMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useBarberLifecycleMutationMock: vi.fn(),
  useBarberScheduleQueryMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useUpdateBarberScheduleMutationMock: vi.fn()
}));

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TEST_DATE_KEY = getLocalDateKey(new Date());
const TEST_WEEKDAY = new Date(`${TEST_DATE_KEY}T12:00:00`).getDay();
const locationAssignMock = vi.fn();

Object.defineProperty(window, "location", {
  configurable: true,
  value: {
    ...window.location,
    assign: locationAssignMock
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

vi.mock("@/lib/operations/barber-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/operations/barber-client")>();
  return {
    ...actual,
    useBarberLifecycleMutation: useBarberLifecycleMutationMock,
    useBarberScheduleQuery: useBarberScheduleQueryMock,
    useUpdateBarberScheduleMutation: useUpdateBarberScheduleMutationMock
  };
});

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

function buildSchedulePayload() {
  return {
    barberId: "barber-1",
    barberName: "Blaze King",
    businessDate: TEST_DATE_KEY,
    shops: [
      {
        id: "loc-ybor",
        label: "The BVRB3R Shop"
      }
    ],
    status: {
      barberId: "barber-1",
      currentShopId: "loc-ybor",
      currentShopLabel: "The BVRB3R Shop",
      liveStatus: "available",
      liveStatusLabel: "Available",
      isOnline: true,
      acceptsWalkIns: true,
      nextAvailableAt: null,
      lastSeenAt: null,
      updatedAt: null,
      note: ""
    },
    todayAppointments: [],
    upcomingAppointments: [],
    timeline: {
      viewMode: "day",
      anchorDate: TEST_DATE_KEY,
      rangeStart: `${TEST_DATE_KEY}T00:00:00.000Z`,
      rangeEnd: `${TEST_DATE_KEY}T23:59:59.000Z`,
      rangeLabel: "Today",
      appointments: []
    },
    workingHours: [],
    blockedTimes: []
  };
}

function buildAppointment(
  status = "confirmed",
  overrides: {
    id?: string;
    start?: string;
    end?: string;
    totalAmount?: number;
    grandTotal?: number;
    balanceDue?: number;
    status?: string;
    display?: Record<string, unknown>;
    financial?: Record<string, unknown>;
  } = {}
) {
  const payoutEligible = status === "completed";
  const statusLabel = status === "checked_in"
    ? "Checked in"
    : status === "completed"
      ? "Completed"
      : status === "no_show"
        ? "No-show"
        : status === "cancelled"
          ? "Canceled"
          : "Confirmed";
  const appointment = {
    id: "172b11d3-9319-536c-adb5-f548ae8fc775",
    locationId: "loc-ybor",
    barberId: "barber-1",
    clientId: "client-1",
    serviceId: "srv-test",
    status,
    source: "booking",
    bookingSource: "public_profile",
    start: `${TEST_DATE_KEY}T14:00:00.000Z`,
    end: `${TEST_DATE_KEY}T14:15:00.000Z`,
    chair: "Phils chair",
    addOnIds: [],
    depositAmount: 5,
    serviceTotal: 5,
    addOnTotal: 0,
    subtotal: 5,
    discountTotal: 0,
    taxTotal: 0,
    totalAmount: 5,
    grandTotal: 5,
    balanceDue: 0,
    tipAmount: 0,
    note: "",
    revision: status === "confirmed" ? 1 : 2,
    updatedAt: `${TEST_DATE_KEY}T13:55:00.000Z`,
    display: {
      clientName: "Phillip mcgee",
      clientProfilePhotoUrl: null,
      serviceName: "test cut",
      locationName: "Phils chair",
      locationLabel: "Phils chair",
      statusLabel,
      lifecycleDetail: "Ready"
    },
    serviceSnapshot: null,
    financial: {
      latestStatus: "captured",
      latestStatusLabel: "Paid in full",
      authorizedAmount: 0,
      capturedAmount: 5,
      refundedAmount: 0,
      tipAmount: 0,
      outstandingBalance: 0,
      paymentMethodBrand: "visa",
      paymentMethodLast4: "4242",
      receiptNumber: "Receipt 4242",
      paidAt: `${TEST_DATE_KEY}T13:55:00.000Z`,
      payoutReadinessStatus: payoutEligible ? "eligible" : "needs_attention",
      moneyRoutingStatus: "pending",
      eligibleAt: payoutEligible ? `${TEST_DATE_KEY}T14:16:00.000Z` : null,
      releasedAt: null,
      barberPayoutAmount: payoutEligible ? 4.75 : null,
      platformFeeAmount: payoutEligible ? 0.25 : null,
      shopSplitAmount: 0
    }
  };

  return {
    ...appointment,
    ...overrides,
    display: {
      ...appointment.display,
      ...overrides.display
    },
    financial: {
      ...appointment.financial,
      ...overrides.financial
    }
  };
}

function getStatCard(label: string) {
  const card = screen.getByText(label).closest(".bvr-glass-card");
  expect(card).not.toBeNull();
  return within(card as HTMLElement);
}

describe("BarberScheduleWorkspace", () => {
  beforeEach(() => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: buildSchedulePayload(),
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useUpdateBarberScheduleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    locationAssignMock.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pinSet: true, enabled: true })
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults the calendar to today and shows one clean empty state without blank hour cards", () => {
    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    expect(useBarberScheduleQueryMock).toHaveBeenLastCalledWith(expect.objectContaining({
      anchorDate: TEST_DATE_KEY
    }));
    expect(screen.queryByText("Your calendar, chair status, money posture, and next move.")).not.toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.getAllByText("Chair Command Calendar").length).toBeGreaterThan(0);
    const barberAddAppointment = screen.getByRole("button", { name: /Add Appointment/i });
    expect(barberAddAppointment).toBeInTheDocument();
    expect(barberAddAppointment).toHaveClass("min-h-11");
    expect(barberAddAppointment).toHaveClass("w-full");
    expect(barberAddAppointment).toHaveClass("bg-[#A3FF12]");
    expect(barberAddAppointment).toHaveClass("text-[#050505]");
    const barberKioskAction = screen.getByRole("button", { name: /Kiosk Mode/i });
    expect(barberKioskAction).toBeInTheDocument();
    expect(barberKioskAction).toHaveClass("min-h-11");
    expect(barberKioskAction).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: /Open Culture/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Block Time$/i })).toBeInTheDocument();
    expect(screen.getByText("No chair activity on this day")).toBeInTheDocument();
    expect(screen.queryByLabelText(/No appointments at/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Working hours and blocked time")).not.toBeInTheDocument();
    expect(screen.queryByText("Availability control")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open Culture/i }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard/barber/culture");
  });

  it("opens barber kiosk directly when kiosk PIN is already set", async () => {
    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Kiosk Mode/i }));

    await waitFor(() => {
      expect(locationAssignMock).toHaveBeenCalledWith("/kiosk/barber/barber-1");
    });
    expect(screen.queryByRole("dialog", { name: "Enter kiosk PIN" })).not.toBeInTheDocument();
  });

  it("renders availability controls only on the More surface", () => {
    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="availability"
      />
    );

    expect(screen.getByText("Working hours and blocked time")).toBeInTheDocument();
    expect(screen.queryByText("Hour-by-hour chair control")).not.toBeInTheDocument();
  });

  it("routes open slot booking through the canonical booking flow", () => {
    vi.useFakeTimers({ now: new Date(`${TEST_DATE_KEY}T08:00:00`) });
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        workingHours: [
          {
            locationId: "loc-ybor",
            locationLabel: "The BVRB3R Shop",
            weekday: TEST_WEEKDAY,
            startTime: "09:00",
            endTime: "10:00"
          }
        ]
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Book this slot/i }));

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/booking/new?"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("barberId=barber-1"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("locationId=loc-ybor"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("appointmentTime="));
  });

  it("keeps cancelled appointments visible while releasing their calendar slot", () => {
    vi.useFakeTimers({ now: new Date(`${TEST_DATE_KEY}T08:00:00`) });
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        workingHours: [
          {
            locationId: "loc-ybor",
            locationLabel: "The BVRB3R Shop",
            weekday: TEST_WEEKDAY,
            startTime: "10:00",
            endTime: "10:15"
          }
        ],
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("cancelled")]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Book this slot/i })).toBeInTheDocument();
    expect(screen.getAllByText("10:00 AM - 10:15 AM")).toHaveLength(2);
    expect(getStatCard("Appointments").getByText("0")).toBeInTheDocument();
    expect(getStatCard("Day Utilization").getByText("0%")).toBeInTheDocument();
  });

  it("shows zero estimated earnings when every appointment is cancelled", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [
            buildAppointment("cancelled", { id: "appt-cancelled-1", start: `${TEST_DATE_KEY}T14:00:00.000Z`, end: `${TEST_DATE_KEY}T14:15:00.000Z` }),
            buildAppointment("cancelled", { id: "appt-cancelled-2", start: `${TEST_DATE_KEY}T15:00:00.000Z`, end: `${TEST_DATE_KEY}T15:15:00.000Z` })
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getAllByText("Canceled")).toHaveLength(2);
    expect(getStatCard("Est. Earnings").getByText("$0")).toBeInTheDocument();
    expect(getStatCard("Appointments").getByText("0")).toBeInTheDocument();
  });

  it("counts completed earnings while excluding cancelled appointments", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [
            buildAppointment("completed", { id: "appt-completed-1", start: `${TEST_DATE_KEY}T14:00:00.000Z`, end: `${TEST_DATE_KEY}T14:15:00.000Z` }),
            buildAppointment("cancelled", { id: "appt-cancelled-1", start: `${TEST_DATE_KEY}T15:00:00.000Z`, end: `${TEST_DATE_KEY}T15:15:00.000Z` })
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(getStatCard("Est. Earnings").getByText("$5")).toBeInTheDocument();
    expect(getStatCard("Appointments").getByText("1")).toBeInTheDocument();
  });

  it("counts confirmed earnings while excluding cancelled appointments", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [
            buildAppointment("confirmed", { id: "appt-confirmed-1", start: `${TEST_DATE_KEY}T14:00:00.000Z`, end: `${TEST_DATE_KEY}T14:15:00.000Z` }),
            buildAppointment("cancelled", { id: "appt-cancelled-1", start: `${TEST_DATE_KEY}T15:00:00.000Z`, end: `${TEST_DATE_KEY}T15:15:00.000Z` })
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(getStatCard("Est. Earnings").getByText("$5")).toBeInTheDocument();
    expect(getStatCard("Appointments").getByText("1")).toBeInTheDocument();
  });

  it("opens appointment details from the calendar card", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.queryByRole("button", { name: /Check in/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));

    expect(await screen.findByText("Appointment Details")).toBeInTheDocument();
    expect(screen.getAllByText("Phillip mcgee")[0]).toBeInTheDocument();
    expect(screen.getAllByText("test cut")[0]).toBeInTheDocument();
    expect(screen.getByText("Visa 4242")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Transaction/i })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Appointment Details" })).getByRole("button", { name: /Complete Service/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel Appointment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mark as No-Show/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book Next/i })).toBeInTheDocument();
  });

  it("shows Complete Service directly on confirmed paid appointment cards", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("confirmed")]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getByRole("button", { name: /^Complete Service$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Details/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Message$/i })).toBeInTheDocument();
  });

  it("routes confirmed unpaid appointment cards to checkout instead of primary completion", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("confirmed", {
            balanceDue: 35,
            financial: {
              capturedAmount: 0,
              outstandingBalance: 35,
              latestStatusLabel: "Payment due"
            }
          })]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.queryByRole("button", { name: /^Complete Service$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Checkout$/i }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard/barber/checkout?appointmentId=172b11d3-9319-536c-adb5-f548ae8fc775");
  });

  it("does not show active card completion for completed, canceled, or no-show appointments", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [
            buildAppointment("completed", { id: "appt-completed", start: `${TEST_DATE_KEY}T14:00:00.000Z`, end: `${TEST_DATE_KEY}T14:15:00.000Z` }),
            buildAppointment("cancelled", { id: "appt-cancelled", start: `${TEST_DATE_KEY}T15:00:00.000Z`, end: `${TEST_DATE_KEY}T15:15:00.000Z` }),
            buildAppointment("no_show", { id: "appt-no-show", start: `${TEST_DATE_KEY}T16:00:00.000Z`, end: `${TEST_DATE_KEY}T16:15:00.000Z` })
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.queryByRole("button", { name: /^Complete Service$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.getByText("No-show")).toBeInTheDocument();
  });

  it("confirms and completes service directly from the appointment card", async () => {
    let payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const refetchMock = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("completed")]
        }
      };
      return { data: payload };
    });
    const mutateAsync = vi.fn(async () => ({
      ok: true,
      appointment: buildAppointment("completed"),
      routing: {
        status: "eligible",
        payoutReadinessStatus: "eligible",
        moneyRoutingStatus: "pending",
        eligibleAt: `${TEST_DATE_KEY}T14:16:00.000Z`,
        releasedAt: null,
        barberAmountCents: 475,
        platformAmountCents: 25,
        shopAmountCents: 0,
        barberPayoutAmount: 4.75,
        platformFeeAmount: 0.25,
        shopSplitAmount: 0
      }
    }));
    useBarberScheduleQueryMock.mockImplementation(() => ({
      data: payload,
      isLoading: false,
      error: null,
      refetch: refetchMock
    }));
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /^Complete Service$/i }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this service?" });
    expect(within(dialog).getByText("This will mark the appointment completed and make the payment eligible for routing according to BVRB3R rules.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Complete Service$/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      appointmentId: "172b11d3-9319-536c-adb5-f548ae8fc775",
      expectedRevision: 1,
      action: "service_complete",
      reason: undefined
    });
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Complete this service?" })).not.toBeInTheDocument());
    expect(await screen.findByText("Service completed. Payout is now eligible.")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Complete Service$/i })).not.toBeInTheDocument();
  });

  it("keeps the card unchanged and shows an error when card completion fails", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Unable to write the payment routing ledger.")),
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /^Complete Service$/i }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this service?" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Complete Service$/i }));

    expect(await screen.findByText("Couldn't complete service. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Complete this service?" })).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("completes service directly from a confirmed appointment", async () => {
    let payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const refetchMock = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("completed")]
        }
      };
      return { data: payload };
    });
    const mutateAsync = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("completed")]
        }
      };
      return {
        ok: true,
        appointment: buildAppointment("completed"),
        routing: {
          status: "eligible",
          payoutReadinessStatus: "eligible",
          moneyRoutingStatus: "pending",
          eligibleAt: `${TEST_DATE_KEY}T14:16:00.000Z`,
          releasedAt: null,
          barberAmountCents: 475,
          platformAmountCents: 25,
          shopAmountCents: 0,
          barberPayoutAmount: 4.75,
          platformFeeAmount: 0.25,
          shopSplitAmount: 0
        }
      };
    });
    useBarberScheduleQueryMock.mockImplementation(() => ({
      data: payload,
      isLoading: false,
      error: null,
      refetch: refetchMock
    }));
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Appointment Details" })).getByRole("button", { name: /Complete Service/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      appointmentId: "172b11d3-9319-536c-adb5-f548ae8fc775",
      expectedRevision: 1,
      action: "service_complete",
      reason: undefined
    }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Appointment Details")).not.toBeInTheDocument());
    expect(await screen.findByText("Service completed. Payout is now eligible.")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Payout eligible")).toBeInTheDocument();
  });

  it("closes details and shows a routing review warning when completion needs repair", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const refetchMock = vi.fn(async () => ({ data: payload }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: refetchMock
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(async () => ({
        ok: true,
        warning: "Service completed. Payout routing requires review.",
        appointment: buildAppointment("completed"),
        routing: {
          status: "repair_required",
          payoutReadinessStatus: "repair_required",
          moneyRoutingStatus: "manual_review",
          eligibleAt: null,
          releasedAt: null,
          barberAmountCents: 0,
          platformAmountCents: 0,
          shopAmountCents: 0
        }
      })),
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Appointment Details" })).getByRole("button", { name: /Complete Service/i }));

    await waitFor(() => expect(screen.queryByText("Appointment Details")).not.toBeInTheDocument());
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Service completed. Payout routing requires review.")).toBeInTheDocument();
  });

  it("shows a visible error when a details action fails", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Unable to write the payment routing ledger.")),
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Appointment Details" })).getByRole("button", { name: /Complete Service/i }));

    expect(await screen.findByText("Couldn't complete service. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Appointment Details")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Appointment Details" })).getByRole("button", { name: /Complete Service/i })).toBeInTheDocument();
  });

  it("hides Complete Service and shows payout state for completed details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("completed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getByText("Payout eligible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));

    expect(await screen.findByText("Service complete")).toBeInTheDocument();
    expect(screen.getByText("Payout eligible - Expected payout $4.75")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete Service/i })).not.toBeInTheDocument();
  });

  it("opens transaction details with safe receipt and refund placeholders", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /View Transaction/i }));

    expect(await screen.findByText("Transaction Details")).toBeInTheDocument();
    expect(screen.getByText("Card Payment")).toBeInTheDocument();
    expect(screen.getByText(/Visa 4242/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New Receipt/i }));
    expect(await screen.findByText("Receipt resend is coming soon.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Issue Refund/i }));
    expect(await screen.findByText("Refunds are not available from this screen yet.")).toBeInTheDocument();
  });

  it("confirms cancel from details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const mutateAsync = vi.fn(async (input: { action: string }) => ({ ok: true, appointment: buildAppointment(input.action === "cancel" ? "cancelled" : "no_show") }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancel Appointment/i }));
    const cancelButtons = screen.getAllByRole("button", { name: /^Cancel appointment$/i });
    fireEvent.click(cancelButtons[0]);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      action: "cancel",
      reason: "Canceled by barber"
    })));
  });

  it("confirms no-show from details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const mutateAsync = vi.fn(async () => ({ ok: true, appointment: buildAppointment("no_show") }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark as No-Show/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Mark no-show$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      action: "no_show",
      reason: "Marked no-show by barber"
    })));
  });
});
