"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { BarberSubtype, Client, WalkInEntry } from "@/types/domain";
import type { BarberMoneyDashboardView } from "@/types/fintech";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type { BarberRevenueIntelligenceView } from "@/types/monetization";
import { runGuardedAction } from "@/lib/mobile/action-guard";
import type {
  CompensationSnapshotRecord,
  OwnerAnalyticsSnapshotRecord,
  WorkflowEventRecord
} from "@/lib/operations/persistence";
import type {
  ShopTeamInviteDirectoryPayload,
  ShopTeamInviteView
} from "@/lib/operations/shop-team-invites";
import type { BarberQueuePayload } from "@/lib/queue/service";

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
  sourceProvider: "bvrb3r";
  paymentOwner: "bvrb3r_card" | "bvrb3r_cash" | "unpaid_manual";
  externalFinancialDataPrivate: false;
  financial: {
    latestStatus: string | null;
    latestStatusLabel: string;
    authorizedAmount: number;
    capturedAmount: number;
    refundedAmount: number;
    tipAmount: number;
    outstandingBalance: number;
    paymentMethodBrand?: string | null;
    paymentMethodLast4?: string | null;
    receiptNumber?: string | null;
    paidAt?: string | null;
    payoutReadinessStatus?: string | null;
    moneyRoutingStatus?: string | null;
    eligibleAt?: string | null;
    releasedAt?: string | null;
    barberPayoutAmount?: number | null;
    platformFeeAmount?: number | null;
    shopSplitAmount?: number | null;
  };
};

export interface BarberExternalAppointmentView {
  id: string;
  providerAppointmentId: string;
  sourceProvider: "booksy" | "square" | "thecut";
  sourceLabel: "Booksy" | "Square" | "theCut";
  locationId: string;
  locationLabel: string;
  clientName: string;
  serviceName: string;
  status: "booked" | "confirmed" | "checked_in" | "completed" | "canceled" | "no_show";
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  checkedInAt: string | null;
  queueEntryId: string | null;
  sourceUpdatedAt: string | null;
  readOnly: true;
}

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
  clientNotes?: string[];
  lastAppointmentNote?: string | null;
  recentVisits?: Array<{
    appointmentId: string;
    serviceName: string | null;
    startsAt: string;
    status: string;
    note: string | null;
    totalAmount: number;
  }>;
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
  activationSetup?: BarberActivationSetupView;
  quickClients: BarberClientRelationshipView[];
  earnings: BarberEarningsSummaryView;
}

export interface BarberActivationSetupView {
  hasAvailabilityDraft: boolean;
  hasServiceLocation: boolean;
  locationMode: "custom" | "shop" | "later" | null;
  serviceLocationLabel: string | null;
  requestedShopId: string | null;
  bookingLocation?: {
    name: string;
    address: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode?: string | null;
  } | null;
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
    externalAppointments: BarberExternalAppointmentView[];
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

interface BarberSubtypeSelectionResponse {
  lane: unknown;
  degraded: boolean;
  nextPath: string;
}

interface CreateShopTeamInviteResponse {
  invite: ShopTeamInviteView;
}

interface BarberTeamInvitesResponse {
  invites: ShopTeamInviteView[];
}

interface BarberActivationResponse {
  visibilityState: "public" | "featured" | "hidden";
  acceptsInstantBookings: boolean;
}

interface BarberActivationAvailabilityResponse {
  hasAvailabilityDraft: boolean;
  hasServiceLocation: boolean;
  locationMode: "custom" | "shop" | "later";
  serviceLocationLabel: string | null;
  requestedShopId: string | null;
}

export interface BarberJoinableShopView {
  shopId: string;
  shopReference: string | null;
  shopLabel: string;
  city: string | null;
  state: string | null;
  approvalStatus: string;
  liveStatusLabel: string;
  alreadyAssigned: boolean;
  inviteStatus: string | null;
  canRequest: boolean;
  readinessLabels: string[];
}

interface BarberJoinableShopDirectoryResponse {
  shops: BarberJoinableShopView[];
}

export interface BarberDashboardResponse {
  barberId: string;
  summary: {
    businessDate: string;
    activeCount: number;
    serviceRevenueToday: number;
    tipsToday: number;
    rentAppliedToday: number;
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

export interface UpdateOwnerTeamRelationshipResponse {
  relationship: {
    id: string;
    routing_model?: string | null;
    public_team_visible?: boolean | null;
    public_team_order?: number | string | null;
    featured_on_shop_profile?: boolean | null;
  };
}

export interface OwnerShopProfileResponse {
  shop: {
    id: string;
    name: string;
    brand_line?: string | null;
    public_bio?: string | null;
    cover_photo_url?: string | null;
    public_hours?: unknown;
    policies?: string | null;
    public_username?: string | null;
    shop_username?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    phone?: string | null;
    address?: string | null;
    profile_photo_path?: string | null;
    profile_photo_url?: string | null;
    app_approval_status?: string | null;
  };
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
  return appointments.find((appointment) => isUpcomingAppointmentStatus(appointment.status)) ?? null;
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

function useBarberCommandRealtimeSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      return undefined;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return undefined;
    }

    const channel = supabase.channel("product-pr24-barber-command");
    for (const table of ["appointments", "chairsync_appointments", "waitlist_entries", "barber_status"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
            queryClient.invalidateQueries({ queryKey: ["barber-command-queue"] }),
            queryClient.invalidateQueries({ queryKey: ["barber-overview"] })
          ]);
        }
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
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
        queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] })
      ]);
    }
  });
}

export function useBarberScheduleQuery(params: { viewMode?: BarberScheduleViewMode; anchorDate?: string } = {}) {
  useBarberCommandRealtimeSubscription();
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

export function useBarberQueueQuery() {
  return useQuery({
    queryKey: ["barber-command-queue"],
    queryFn: () => requestJson<BarberQueuePayload>("/api/barber/queue"),
    staleTime: 5_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
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
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] })
      ]);
    }
  });
}

export function useUpdateBarberActivationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      action: "set_visibility";
      visibilityState: "public" | "hidden";
      acceptsInstantBookings?: boolean;
    }) =>
      requestJson<BarberActivationResponse>("/api/barber/activation", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "map"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] }),
        queryClient.invalidateQueries({ queryKey: ["profile-media"] })
      ]);
    }
  });
}

export function useUpdateBarberActivationAvailabilityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      workingHours: Array<{
        weekday: number;
        startTime: string;
        endTime: string;
      }>;
      locationMode: "custom" | "shop" | "later";
      serviceLocation?: {
        name: string;
        address: string;
        city: string;
        state: string;
        postalCode?: string;
      };
      shopId?: string;
    }) =>
      requestJson<BarberActivationAvailabilityResponse>("/api/barber/activation", {
        method: "POST",
        body: JSON.stringify({
          action: "save_availability",
          ...payload
        })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["activation", "status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "map"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}

export function useUpdateBarberBookingLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      serviceLocation: {
        name: string;
        address: string;
        addressLine2?: string;
        city: string;
        state: string;
        postalCode?: string;
      };
    }) =>
      requestJson<BarberActivationAvailabilityResponse>("/api/barber/activation", {
        method: "POST",
        body: JSON.stringify({
          action: "save_booking_location",
          ...payload
        })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["activation", "status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-profile"] })
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

export function useBarberCancelBookingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      expectedRevision,
      reason
    }: {
      appointmentId: string;
      expectedRevision: number;
      reason?: string;
    }) =>
      runGuardedAction(`barber:cancel:${appointmentId}:${expectedRevision}`, () =>
        requestJson<{ appointment: LiveAppointmentRecord }>(`/api/bookings/${appointmentId}/cancel`, {
          method: "POST",
          body: JSON.stringify({ expectedRevision, reason })
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-clients"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] }),
        queryClient.invalidateQueries({ queryKey: ["points"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "barber"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] })
      ]);
    }
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

export function useSaveBarberSubtypeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (barberSubtype: BarberSubtype) =>
      requestJson<BarberSubtypeSelectionResponse>("/api/onboarding/barber/type", {
        method: "POST",
        body: JSON.stringify({ barberSubtype })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-status"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding-me"] }),
        queryClient.invalidateQueries({ queryKey: ["activation-status"] })
      ]);
    }
  });
}

export function useShopDashboardQuery() {
  return useQuery({
    queryKey: ["shop-dashboard"],
    queryFn: () => requestJson<ShopDashboardResponse>("/api/shop/dashboard"),
    staleTime: 5_000
  });
}

export function useOwnerShopProfileQuery() {
  return useQuery({
    queryKey: ["owner-shop-profile"],
    queryFn: () => requestJson<OwnerShopProfileResponse>("/api/owner/shop/profile")
  });
}

export function useUpdateOwnerShopProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      shopId?: string | null;
      name?: string;
      brandLine?: string | null;
      publicBio?: string | null;
      coverPhotoUrl?: string | null;
      publicHours?: unknown;
      policies?: string | null;
      shopUsername?: string | null;
      phone?: string | null;
      address?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      state?: string | null;
      profilePhotoUrl?: string | null;
      profilePhotoPath?: string | null;
    }) =>
      requestJson<OwnerShopProfileResponse>("/api/owner/shop/profile", {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owner-shop-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-team-invite-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["profile-media"] })
      ]);
    }
  });
}

export function useOwnerTeamInviteDirectoryQuery(search?: string, enabled = true) {
  const queryString = toQueryString({
    q: search?.trim() || undefined
  });

  return useQuery({
    queryKey: ["shop-team-invite-directory", search?.trim() ?? ""],
    queryFn: () => requestJson<ShopTeamInviteDirectoryPayload>(`/api/owner/team/invites${queryString ? `?${queryString}` : ""}`),
    staleTime: 5_000,
    enabled
  });
}

export function useCreateOwnerTeamInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      barberId: string;
      shopId?: string;
      message?: string;
      proposal?: {
        routingModel: "booth_rent";
        boothRentAmount: number;
        boothRentFrequency: "daily" | "weekly" | "monthly";
      } | {
        routingModel: "autobooth_rent";
        boothRentAmount: number;
        boothRentFrequency: "daily" | "weekly" | "monthly";
        /** Owner-approved portion (0..1) applied toward outstanding rent. */
        autoBoothPercent: number;
      };
    }) =>
      requestJson<CreateShopTeamInviteResponse>("/api/owner/team/invites", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shop-team-invite-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] })
      ]);
    }
  });
}

export function useRespondOwnerTeamJoinRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { inviteId: string; status: "accepted" | "rejected" }) =>
      requestJson<{ invite: ShopTeamInviteView }>("/api/owner/team/invites", {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shop-team-invite-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] })
      ]);
    }
  });
}

export function useUpdateOwnerTeamRelationshipMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      relationshipId: string;
      publicTeamVisible?: boolean;
      publicTeamOrder?: number;
      featuredOnShopProfile?: boolean;
    }) =>
      requestJson<UpdateOwnerTeamRelationshipResponse>("/api/owner/team/relationships", {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-team-invite-directory"] })
      ]);
    }
  });
}

export function useReleaseOwnerTeamRelationshipMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { relationshipId: string; reason?: string }) =>
      requestJson<{ relationshipId: string; effectiveRoutingModel: "freelance" }>("/api/owner/team/relationships", {
        method: "DELETE",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-team-invite-directory"] })
      ]);
    }
  });
}

export function useBarberTeamInvitesQuery() {
  return useQuery({
    queryKey: ["barber-team-invites"],
    queryFn: () => requestJson<BarberTeamInvitesResponse>("/api/barber/team-invites"),
    staleTime: 5_000
  });
}

export function useRespondBarberTeamInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { inviteId: string; status: "accepted" | "declined" }) =>
      requestJson<{ invite: ShopTeamInviteView }>("/api/barber/team-invites", {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-team-invites"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] }),
        queryClient.invalidateQueries({ queryKey: ["activation-status"] })
      ]);
    }
  });
}

export function useBarberJoinableShopsQuery(search?: string, enabled = true) {
  const queryString = toQueryString({
    q: search?.trim() || undefined
  });

  return useQuery({
    queryKey: ["barber-joinable-shops", search?.trim() ?? ""],
    queryFn: () => requestJson<BarberJoinableShopDirectoryResponse>(`/api/barber/shop-requests${queryString ? `?${queryString}` : ""}`),
    staleTime: 5_000,
    enabled
  });
}

export function useCreateBarberShopJoinRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { shopId: string; message?: string }) =>
      requestJson<{ invite: ShopTeamInviteView }>("/api/barber/shop-requests", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["barber-joinable-shops"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-team-invites"] }),
        queryClient.invalidateQueries({ queryKey: ["activation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-overview"] })
      ]);
    }
  });
}

export function useBarberLifecycleMutation() {
  const queryClient = useQueryClient();

  type BarberLifecycleActionResult = {
    appointment: LiveAppointmentRecord;
    warning?: string | null;
    routing?: {
      status?: string | null;
      payoutReadinessStatus?: string | null;
      moneyRoutingStatus?: string | null;
      eligibleAt?: string | null;
      releasedAt?: string | null;
      barberAmountCents?: number | null;
      shopAmountCents?: number | null;
      platformAmountCents?: number | null;
      barberPayoutAmount?: number | null;
      shopSplitAmount?: number | null;
      platformFeeAmount?: number | null;
    } | null;
  };

  return useMutation({
    mutationFn: ({
      appointmentId,
      expectedRevision,
      action,
      reason
    }: {
      appointmentId: string;
      expectedRevision: number;
      action: "check_in" | "service_start" | "service_complete" | "cancel" | "no_show";
      reason?: string;
    }) =>
      runGuardedAction(`barber:lifecycle:${action}:${appointmentId}:${expectedRevision}`, () => {
        const route = action === "check_in"
          ? `/api/barber/appointments/${appointmentId}/check-in`
          : action === "service_start"
            ? `/api/barber/appointments/${appointmentId}/start`
            : action === "service_complete"
              ? `/api/barber/appointments/${appointmentId}/complete`
              : action === "cancel"
                ? `/api/barber/appointments/${appointmentId}/cancel`
                : `/api/barber/appointments/${appointmentId}/no-show`;

        return requestJson<BarberLifecycleActionResult>(route, {
          method: "POST",
          body: JSON.stringify({ expectedRevision, reason })
        }).then((result) => ({
          ...result,
          appointment: {
            ...result.appointment,
            id: appointmentId
          }
        }));
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
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "barber"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] })
      ]);
    }
  });
}








