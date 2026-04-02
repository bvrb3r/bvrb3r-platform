"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Client, WalkInEntry } from "@/types/domain";
import type { BarberMoneyDashboardView } from "@/types/fintech";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type { BarberRevenueIntelligenceView } from "@/types/monetization";
import { runGuardedAction } from "@/lib/mobile/action-guard";
import type {
  CompensationSnapshotRecord,
  OwnerAnalyticsSnapshotRecord,
  WorkflowEventRecord
} from "@/lib/operations/persistence";

export interface BarberApiError extends Error {
  status?: number;
  code?: string;
  latestAppointment?: LiveAppointmentRecord;
}

type AppointmentServiceSnapshot = {
  appointment_reference: string;
  service_reference: string;
  service_name: string;
  category: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  add_on_references: string[] | null;
};

export type BarberDashboardAppointment = LiveAppointmentRecord & {
  serviceSnapshot: AppointmentServiceSnapshot | null;
  display: {
    clientName: string;
    clientProfilePhotoUrl?: string | null;
    serviceName: string;
    locationName: string;
    locationLabel: string;
    statusLabel: string;
    lifecycleDetail: string;
  };
};

export type BarberOperationalAppointment = BarberDashboardAppointment & {
  financial: {
    latestStatus: string | null;
    latestStatusLabel: string;
    authorizedAmount: number;
    capturedAmount: number;
    refundedAmount: number;
    tipAmount: number;
    outstandingBalance: number;
  };
};

export interface BarberStatusView {
  barberId: string;
  currentShopId: string | null;
  currentShopLabel: string | null;
  liveStatus: "offline" | "available" | "busy" | "on_break" | "away";
  liveStatusLabel: string;
  isOnline: boolean;
  acceptsWalkIns: boolean;
  nextAvailableAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string | null;
  note: string;
}

export interface BarberShopScopeView {
  id: string;
  label: string;
}

export interface BarberWorkingHoursView {
  locationId: string;
  locationLabel: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface BarberBlockedTimeView {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export type BarberScheduleViewMode = "day" | "week" | "month";

export interface BarberClientRelationshipView {
  clientId: string;
  clientName: string;
  email: string;
  phone: string;
  retentionTag: string;
  totalAppointments: number;
  completedAppointments: number;
  activeAppointments: number;
  cancelledAppointments: number;
  lastVisitAt: string | null;
  nextVisitAt: string | null;
  latestServiceName: string | null;
  latestServiceId: string | null;
  lifetimeGrossSales: number;
  averageTicket: number;
  relationshipLabel: string;
  favoriteRelationship: boolean;
  intelligence: {
    rebookingWindow: "building" | "on_track" | "due_soon" | "due_now" | "overdue" | "scheduled";
    churnRisk: "low" | "medium" | "high";
    loyaltySegment: "new" | "repeat" | "loyal" | "vip" | "at_risk";
    nextBestAction: string;
  };
  canMessage: boolean;
  messageAppointmentId: string | null;
}

export interface BarberEarningsSummaryView {
  businessDate: string;
  todayBookings: number;
  clientsRebookedToday: number;
  upcomingBookings: number;
  completedServices: number;
  grossSales: number;
  tips: number;
  averageTicket: number;
  outstandingCheckoutCount: number;
}

export interface BarberOverviewResponse {
  barberId: string;
  barberName: string;
  shops: BarberShopScopeView[];
  status: BarberStatusView;
  summary: BarberDashboardResponse["summary"];
  nextAppointment: BarberOperationalAppointment | null;
  todayAppointments: BarberOperationalAppointment[];
  upcomingAppointments: BarberOperationalAppointment[];
  workingHours: BarberWorkingHoursView[];
  blockedTimes: BarberBlockedTimeView[];
  quickClients: BarberClientRelationshipView[];
  earnings: BarberEarningsSummaryView;
}

export interface BarberScheduleResponse {
  barberId: string;
  barberName: string;
  businessDate: string;
  shops: BarberShopScopeView[];
  status: BarberStatusView;
  todayAppointments: BarberOperationalAppointment[];
  upcomingAppointments: BarberOperationalAppointment[];
  timeline: {
    viewMode: BarberScheduleViewMode;
    anchorDate: string;
    rangeStart: string;
    rangeEnd: string;
    rangeLabel: string;
    appointments: BarberOperationalAppointment[];
  };
  workingHours: BarberWorkingHoursView[];
  blockedTimes: BarberBlockedTimeView[];
}

export interface BarberClientsResponse {
  barberId: string;
  barberName: string;
  clients: BarberClientRelationshipView[];
}

export interface BarberEarningsResponse {
  barberId: string;
  barberName: string;
  summary: BarberEarningsSummaryView;
  growth: BarberRevenueIntelligenceView;
  money: BarberMoneyDashboardView;
  recentAppointments: BarberOperationalAppointment[];
}

interface NotifyBarberOpenSlotResponse {
  notificationsQueued: number;
  audienceCount: number;
  slotStartsAt: string;
}

export interface BarberDashboardResponse {
  barberId: string;
  summary: {
    businessDate: string;
    activeCount: number;
    serviceRevenueToday: number;
    tipsToday: number;
    commissionToday: number;
    projectedPayout: number;
    completedPaidCount: number;
    rentCoverageToday: number;
    bookedCount: number;
    checkedInCount: number;
    inServiceCount: number;
    completedCount: number;
    cancelledCount: number;
    nextRent?: {
      id: string;
      barberId: string;
      periodLabel: string;
      dueDate: string;
      amount: number;
      status: string;
      paidDate?: string;
    };
  };
  appointments: BarberDashboardAppointment[];
  clients: Client[];
  compensationSnapshots: CompensationSnapshotRecord[];
  upcomingAppointment: BarberDashboardAppointment | null;
}

export interface BarberAppointmentsResponse {
  appointments: BarberDashboardAppointment[];
  clients: Client[];
}

export interface ShopDashboardAppointmentDisplay {
  clientName: string;
  barberName: string;
  serviceName: string;
  locationName: string;
  locationLabel: string;
  statusLabel: string;
}

export type ShopDashboardAppointment = LiveAppointmentRecord & {
  display: ShopDashboardAppointmentDisplay;
};

export interface ShopDashboardBarberSummary {
  id: string;
  name: string;
  compensationModel: string;
  activeAppointmentCount: number;
  liveAppointmentCount: number;
  bookedCount: number;
  completedCount: number;
  utilization: number;
  nextAppointmentStart: string | null;
}

export interface ShopDashboardLocationSummary {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  label: string;
}

export type ShopDashboardWalkInRow = WalkInEntry & {
  position: number;
  display: {
    locationName: string;
    locationLabel: string;
    assignedBarberName?: string;
    statusLabel: string;
  };
};

export interface ShopDashboardResponse {
  summary: {
    businessDate?: string;
    latestDate?: string;
    revenueToday: number;
    completedServicesToday?: number;
    completedCount?: number;
    outstandingBalance?: number;
    bookedToday?: number;
    paidAppointmentsToday?: number;
    checkedInCount?: number;
    inServiceCount?: number;
    readyForCheckoutCount?: number;
    queueAverageMinutes?: number;
  };
  barbers: ShopDashboardBarberSummary[];
  activeBarbers: ShopDashboardBarberSummary[];
  appointments: ShopDashboardAppointment[];
  ownerAnalytics: OwnerAnalyticsSnapshotRecord[];
  walkIns: ShopDashboardWalkInRow[];
  locations: ShopDashboardLocationSummary[];
  workflowEvents: WorkflowEventRecord[];
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as BarberApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    error.latestAppointment = body.latestAppointment as LiveAppointmentRecord | undefined;
    throw error;
  }

  return body as T;
}

function toQueryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    params.set(key, value);
  });
  return params.toString();
}


function getNextActiveAppointment<T extends LiveAppointmentRecord>(appointments: T[]) {
  return appointments.find((appointment) => ["booked", "checked_in", "in_service"].includes(appointment.status)) ?? null;
}

function getBarberLifecycleDetail(status: string, balanceDue = 0) {
  if (status === "cancelled") {
    return "Cancelled before chair time.";
  }

  if (status === "completed") {
    return balanceDue > 0 ? "Waiting on checkout handoff." : "Completed and posted to the shop dashboard.";
  }

  if (status === "checked_in") {
    return "Client is checked in and ready for service.";
  }

  if (status === "in_service") {
    return "Service is in progress right now.";
  }

  return "Client is booked and still arriving for the chair.";
}

function getShopDashboardStatusLabel(status: string, balanceDue = 0) {
  if (status === "completed" && balanceDue > 0) {
    return "Ready for checkout";
  }

  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function replaceShopDashboardAppointments(appointments: ShopDashboardAppointment[], nextAppointment: LiveAppointmentRecord) {
  return appointments.map((appointment) => (
    appointment.id === nextAppointment.id
      ? {
          ...appointment,
          ...nextAppointment,
          display: {
            ...appointment.display,
            statusLabel: getShopDashboardStatusLabel(nextAppointment.status, nextAppointment.balanceDue)
          }
        }
      : appointment
  ));
}

function replaceBarberDashboardAppointments<T extends BarberDashboardAppointment>(appointments: T[], nextAppointment: LiveAppointmentRecord) {
  return appointments.map((appointment) => (
    appointment.id === nextAppointment.id
      ? {
          ...appointment,
          ...nextAppointment,
          display: {
            ...appointment.display,
            statusLabel: getShopDashboardStatusLabel(nextAppointment.status, nextAppointment.balanceDue),
            lifecycleDetail: getBarberLifecycleDetail(nextAppointment.status, nextAppointment.balanceDue)
          }
        }
      : appointment
  ));
}

export function useBarberDashboardQuery() {
  return useQuery({
    queryKey: ["barber-dashboard"],
    queryFn: () => requestJson<BarberDashboardResponse>("/api/barber/dashboard"),
    staleTime: 5_000
  });
}

export function useBarberAppointmentsQuery() {
  return useQuery({
    queryKey: ["barber-appointments"],
    queryFn: () => requestJson<BarberAppointmentsResponse>("/api/barber/appointments"),
    staleTime: 5_000
  });
}

export function useBarberOverviewQuery() {
  return useQuery({
    queryKey: ["barber-overview"],
    queryFn: () => requestJson<BarberOverviewResponse>("/api/barber/overview"),
    staleTime: 5_000
  });
}

export function useBarberStatusQuery() {
  return useQuery({
    queryKey: ["barber-status"],
    queryFn: () => requestJson<BarberStatusView>("/api/barber/status"),
    staleTime: 5_000
  });
}

export function useUpdateBarberStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      liveStatus: BarberStatusView["liveStatus"];
      isOnline?: boolean;
      acceptsWalkIns?: boolean;
      currentShopId?: string | null;
    }) =>
      requestJson<BarberStatusView>("/api/barber/status", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] })
      ]);
    }
  });
}

export function useBarberScheduleQuery(params: { viewMode?: BarberScheduleViewMode; anchorDate?: string } = {}) {
  const queryString = toQueryString({
    view: params.viewMode,
    date: params.anchorDate
  });

  return useQuery({
    queryKey: ["barber-schedule", params.viewMode ?? "day", params.anchorDate ?? ""],
    queryFn: () => requestJson<BarberScheduleResponse>(`/api/barber/schedule${queryString ? `?${queryString}` : ""}`),
    staleTime: 5_000
  });
}

export function useUpdateBarberScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      locationId: string;
      workingHours?: Array<{
        weekday: number;
        startTime: string;
        endTime: string;
      }>;
      blockedPeriod?: {
        startsAt: string;
        endsAt: string;
        reason?: string;
      };
    }) =>
      requestJson<BarberScheduleResponse>("/api/barber/schedule", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-status"] })
      ]);
    }
  });
}

export function useBarberClientsQuery() {
  return useQuery({
    queryKey: ["barber-clients"],
    queryFn: () => requestJson<BarberClientsResponse>("/api/barber/clients"),
    staleTime: 5_000
  });
}

export function useBarberEarningsQuery() {
  return useQuery({
    queryKey: ["barber-earnings"],
    queryFn: () => requestJson<BarberEarningsResponse>("/api/barber/earnings"),
    staleTime: 5_000
  });
}

export function useNotifyBarberOpenSlotMutation() {
  return useMutation({
    mutationFn: (input: {
      startsAt: string;
      locationId?: string | null;
      locationLabel?: string | null;
    }) =>
      runGuardedAction(`barber:open-slot:${input.startsAt}:${input.locationId ?? "none"}`, () =>
        requestJson<NotifyBarberOpenSlotResponse>("/api/barber/availability/open-slot", {
          method: "POST",
          body: JSON.stringify(input)
        })
      )
  });
}

export function useShopDashboardQuery() {
  return useQuery({
    queryKey: ["shop-dashboard"],
    queryFn: () => requestJson<ShopDashboardResponse>("/api/shop/dashboard"),
    staleTime: 5_000
  });
}

export function useBarberLifecycleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      expectedRevision,
      action
    }: {
      appointmentId: string;
      expectedRevision: number;
      action: "check_in" | "service_start" | "service_complete";
    }) =>
      runGuardedAction(`barber:lifecycle:${action}:${appointmentId}:${expectedRevision}`, () => {
      const route = action === "check_in"
        ? `/api/barber/appointments/${appointmentId}/check-in`
        : action === "service_start"
          ? `/api/barber/appointments/${appointmentId}/start`
          : `/api/barber/appointments/${appointmentId}/complete`;

      return requestJson<{ appointment: LiveAppointmentRecord }>(route, {
        method: "POST",
        body: JSON.stringify({ expectedRevision })
      });
      }),
    onSuccess: async ({ appointment }) => {
      queryClient.setQueryData<BarberDashboardResponse | undefined>(["barber-dashboard"], (current) => {
        if (!current) {
          return current;
        }

        const appointments = replaceBarberDashboardAppointments(current.appointments, appointment);
        return {
          ...current,
          appointments,
          upcomingAppointment: getNextActiveAppointment(appointments)
        };
      });

      queryClient.setQueryData<BarberAppointmentsResponse | undefined>(["barber-appointments"], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          appointments: replaceBarberDashboardAppointments(current.appointments, appointment)
        };
      });

      queryClient.setQueryData<ShopDashboardResponse | undefined>(["shop-dashboard"], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          appointments: replaceShopDashboardAppointments(current.appointments, appointment)
        };
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-clients"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "barber"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] })
      ]);
    }
  });
}














