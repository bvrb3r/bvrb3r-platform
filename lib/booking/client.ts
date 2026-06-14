"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiRecommendationType } from "@/types/ai";
import type { DiscoveryResult, HaircutNowMatch, RecommendedShopView } from "@/types/domain";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type { AppointmentViewModel } from "@/lib/utils/operations";
import type { PublicBarberProfileView } from "@/lib/marketplace/engine";
import type { ClientMembershipExecutionView, ClientMembershipValueView } from "@/types/monetization";
import type { PointsBalanceView } from "@/types/points";
import type { BillingHistoryView, BillingInvoiceView, BookingMoneyTimelineView, BookingReceiptView, BookingTransactionBreakdownView } from "@/types/fintech";
import { runGuardedAction } from "@/lib/mobile/action-guard";

export interface BookingApiError extends Error {
  status?: number;
  code?: string;
  latestAppointment?: LiveAppointmentRecord;
}

export interface CancelBookingResponse {
  ok: true;
  appointment: LiveAppointmentRecord;
  refund_status: "not_applied" | "pending_review" | "refunded" | "partially_refunded";
}

type RawCancelBookingResponse = Partial<Omit<CancelBookingResponse, "appointment">> & {
  status?: string | null;
  appointment?: Partial<LiveAppointmentRecord> | null;
};

export interface ClientHomeResponse {
  client: {
    clientReference: string;
    fullName: string;
    phone: string;
    email: string;
    favoriteBarberReference?: string;
    favoriteShopReference?: string;
    preferredLocation?: {
      city: string;
      state: string;
      postalCode?: string;
    };
    loyaltyPoints: number;
    retentionTag: string;
    notes: string[];
  } | null;
  shops: Array<{
    id: string;
    name: string;
    brandLine: string;
    neighborhood: string;
    city: string;
    state: string;
    phone: string;
    address: string;
    kind: string;
    latitude?: number;
    longitude?: number;
  }>;
  trustedBarbers: DiscoveryResult[];
  recommendedBarbers: DiscoveryResult[];
  recommendedShops: RecommendedShopView[];
  favoriteBarber: DiscoveryResult | null;
  nextAvailableChair: HaircutNowMatch | null;
  defaultPaymentMethod?: ClientPaymentMethodSummary | null;
  locationId: string;
  hasResolvedLocation: boolean;
}

export interface BarberSearchResponse {
  mode: "browse" | "search";
  query: string;
  category: string;
  shops: ClientHomeResponse["shops"];
  barbers: DiscoveryResult[];
}

export interface BarberAvailabilityResponse {
  barberId: string;
  locationId: string;
  timezone?: string;
  service: {
    id: string;
    name: string;
    durationMin: number;
    bufferMin: number;
    price: number;
    deposit: number;
    fullPrepay: boolean;
  } | null;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    label: string;
    locationId: string;
    barberId: string;
    serviceId?: string;
  }>;
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

export type RoutineCadenceId = "weekly" | "biweekly" | "monthly";

export interface ClientRoutineResponse {
  cadenceId: RoutineCadenceId;
  label: string;
  averageCycleDays: number;
  confidence: string;
  barberReference?: string;
  serviceReference?: string;
  lastCompletedAt: string | null;
  nextSuggestedAt: string | null;
  updatedAt: string;
}

export interface ClientPaymentMethodSummary {
  id: string;
  provider: "stripe" | "mock";
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt: string;
  label: string;
}

export interface ClientAppointmentReviewSummary {
  id: string;
  rating: number;
  message: string;
  createdAt: string;
}

export interface ClientPosReceiptView {
  id: string;
  barberId: string | null;
  barberName: string;
  serviceLabel: string;
  paidAt: string;
  amountCents: number;
  paymentMethodLabel: string;
  statusLabel: string;
  note: string | null;
  paymentId: string | null;
}

export interface AppointmentPaymentSummaryResponse {
  appointmentId: string;
  outstandingBalance: number;
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  tipAmount: number;
  latestBookingPayment: {
    id: string;
    amount: number;
    currency: string;
    provider: "stripe" | "mock" | null;
    paymentStatus: "pending" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded" | "voided";
    paymentType: "booking" | "tip" | "add_on" | "booth_rent" | "subscription";
    paidAt: string | null;
    createdAt: string;
  } | null;
  defaultPaymentMethod: ClientPaymentMethodSummary | null;
}

export interface ClientBookingsResponse {
  client: ClientHomeResponse["client"];
  favoriteBarber: PublicBarberProfileView | null;
  upcoming: Array<LiveAppointmentRecord & {
    serviceSnapshot: AppointmentServiceSnapshot | null;
    view: AppointmentViewModel;
    receipt?: BookingReceiptView | null;
    breakdown?: BookingTransactionBreakdownView | null;
    moneyTimeline?: BookingMoneyTimelineView | null;
  }>;
  nextAppointment: (LiveAppointmentRecord & {
    serviceSnapshot: AppointmentServiceSnapshot | null;
    view: AppointmentViewModel;
    receipt?: BookingReceiptView | null;
    breakdown?: BookingTransactionBreakdownView | null;
    moneyTimeline?: BookingMoneyTimelineView | null;
  }) | null;
  history: Array<LiveAppointmentRecord & {
    serviceSnapshot: AppointmentServiceSnapshot | null;
    view: AppointmentViewModel;
    review: ClientAppointmentReviewSummary | null;
    canReview: boolean;
    receipt?: BookingReceiptView | null;
    breakdown?: BookingTransactionBreakdownView | null;
    moneyTimeline?: BookingMoneyTimelineView | null;
  }>;
  posReceipts?: ClientPosReceiptView[];
  routine: ClientRoutineResponse | null;
  membershipValue: ClientMembershipValueView | null;
  membershipExecution: ClientMembershipExecutionView | null;
  nextAppointmentPayment: AppointmentPaymentSummaryResponse | null;
}

export interface ClientMembershipResponse {
  membership: ClientMembershipExecutionView;
}

export interface ClientMembershipSubscribeResponse extends ClientMembershipResponse {
  checkoutUrl: string | null;
  sessionId: string;
}

export interface ClientBillingHistoryResponse {
  billing: BillingHistoryView;
}

export interface ClientBillingInvoicesResponse {
  invoices: BillingInvoiceView[];
}

export interface ClientBillingRetryResponse {
  retry: {
    recoveryUrl: string;
    invoice: BillingInvoiceView;
  };
}

export interface SaveFavoriteBarberPayload {
  barberReference: string;
}

export interface SaveFavoriteShopPayload {
  shopReference: string;
}

export interface SaveClientRoutinePayload {
  cadenceId: RoutineCadenceId;
  barberReference?: string;
  serviceReference?: string;
  anchorStartAt?: string;
  lastCompletedAt?: string;
}

export interface SubmitClientReviewPayload {
  appointmentId: string;
  rating: number;
  message?: string;
}

export interface ClientPointsBalanceResponse {
  balance: PointsBalanceView;
}

export interface CreateBookingPayload {
  locationId: string;
  barberId: string;
  serviceId: string;
  addOnIds: string[];
  appointmentTime: string;
  clientName: string;
  clientPhone: string;
  paymentMethodId?: string;
  pointsToRedeem?: number;
  sourceKind?: "direct" | "discovery" | "public_profile" | "haircut_now" | "client_dashboard";
  matchedFrom?: "favorite_barber" | "favorite_shop" | "nearby" | "available_now";
  discoveryQuery?: string;
  barberUsername?: string;
  barberName?: string;
  serviceName?: string;
  aiRecommendationId?: string;
  aiRecommendationType?: AiRecommendationType;
  promotionId?: string;
  promotionCode?: string;
  cultureAttribution?: {
    source: "culture";
    culturePostId?: string;
    cultureAuthorId?: string;
    cultureSurface?: string;
    cta?: string;
  };
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as BookingApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    error.latestAppointment = body.latestAppointment as LiveAppointmentRecord | undefined;
    throw error;
  }

  return body as T;
}

function invalidateBookingQueriesQuietly(queryClient: ReturnType<typeof useQueryClient>, queryKeys: unknown[][]) {
  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey }).catch((error) => {
      console.warn("[booking-client] cache_refresh_failed", {
        queryKey,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    });
  }
}

function toQueryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
}

function isCancelledAppointmentStatus(status?: string | null) {
  return status === "cancelled" || status === "canceled";
}

function normalizeCancelBookingResponse(result: RawCancelBookingResponse, appointmentId: string): CancelBookingResponse {
  const appointment = result.appointment ?? {};
  const status = appointment.status ?? result.status ?? "cancelled";

  return {
    ok: true,
    appointment: {
      ...appointment,
      id: appointment.id ?? appointmentId,
      status: isCancelledAppointmentStatus(status) ? "cancelled" : status
    } as LiveAppointmentRecord,
    refund_status: result.refund_status ?? "not_applied"
  };
}

function refreshClientCancellationViews(queryClient: ReturnType<typeof useQueryClient>) {
  for (const queryKey of [
    ["client-bookings"],
    ["client-home"],
    ["points"],
    ["ai", "client", "summary"],
    ["ai", "barber", "summary"],
    ["operations"]
  ]) {
    void queryClient.invalidateQueries({ queryKey }).catch((error) => {
      console.warn("[client-bookings] cancellation_refetch_failed", {
        queryKey,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    });
  }
}

export function useClientHomeQuery() {
  return useQuery({
    queryKey: ["client-home"],
    queryFn: () => requestJson<ClientHomeResponse>("/api/client/home")
  });
}

export function useBarberSearchQuery(params: { query?: string; category?: string }) {
  const queryString = toQueryString({ q: params.query, category: params.category });
  return useQuery({
    queryKey: ["barber-search", params],
    queryFn: () => requestJson<BarberSearchResponse>(`/api/barbers/search${queryString ? `?${queryString}` : ""}`)
  });
}

export function useBarberProfileQuery(barberId?: string) {
  return useQuery({
    queryKey: ["barber-profile", barberId],
    queryFn: () => requestJson<PublicBarberProfileView>(`/api/barbers/${barberId}`),
    enabled: Boolean(barberId)
  });
}

export function useBarberAvailabilityQuery(params: { barberId?: string; serviceId?: string; locationId?: string; startDate?: string; days?: number; timeZone?: string }) {
  const queryString = toQueryString({
    serviceId: params.serviceId,
    locationId: params.locationId,
    startDate: params.startDate,
    days: params.days,
    timeZone: params.timeZone
  });
  return useQuery({
    queryKey: ["barber-availability", params],
    queryFn: () => requestJson<BarberAvailabilityResponse>(`/api/barbers/${params.barberId}/availability${queryString ? `?${queryString}` : ""}`),
    enabled: Boolean(params.barberId && params.serviceId)
  });
}

export function useClientBookingsQuery(enabled = true) {
  return useQuery({
    queryKey: ["client-bookings"],
    queryFn: () => requestJson<ClientBookingsResponse>("/api/client/bookings"),
    enabled
  });
}

export function useClientMembershipQuery(enabled = true) {
  return useQuery({
    queryKey: ["client-membership"],
    queryFn: () => requestJson<ClientMembershipResponse>("/api/client/membership"),
    select: (data) => data.membership,
    enabled
  });
}

export function useClientPointsBalanceQuery(enabled = true) {
  return useQuery({
    queryKey: ["points", "balance"],
    queryFn: () => requestJson<ClientPointsBalanceResponse>("/api/points/balance"),
    select: (data) => data.balance,
    staleTime: 15_000,
    enabled
  });
}

export function useClientBillingHistoryQuery(enabled = true) {
  return useQuery({
    queryKey: ["client-billing", "history"],
    queryFn: () => requestJson<ClientBillingHistoryResponse>("/api/billing/history"),
    select: (data) => data.billing,
    enabled,
    staleTime: 15_000
  });
}

export function useClientBillingInvoicesQuery(enabled = true) {
  return useQuery({
    queryKey: ["client-billing", "invoices"],
    queryFn: () => requestJson<ClientBillingInvoicesResponse>("/api/billing/invoices"),
    select: (data) => data.invoices,
    enabled,
    staleTime: 15_000
  });
}

export function useRetryClientBillingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      runGuardedAction(
        "client-billing:retry",
        () => requestJson<ClientBillingRetryResponse>("/api/billing/retry", {
          method: "POST",
          body: JSON.stringify({})
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-billing"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-home"] })
      ]);
    }
  });
}

export function useCreateBookingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBookingPayload) =>
      runGuardedAction(
        `booking:create:${payload.locationId}:${payload.barberId}:${payload.serviceId}:${payload.appointmentTime}:${payload.clientPhone}`,
        () => requestJson<{ appointment: LiveAppointmentRecord }>("/api/bookings", {
          method: "POST",
          body: JSON.stringify(payload)
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-membership"] }),
        queryClient.invalidateQueries({ queryKey: ["points"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "referrals"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "client", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-search"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-availability"] }),
        queryClient.invalidateQueries({ queryKey: ["operations"] })
      ]);
    }
  });
}

export function useCancelBookingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, expectedRevision }: { appointmentId: string; expectedRevision: number }) =>
      runGuardedAction(
        `booking:cancel:${appointmentId}:${expectedRevision}`,
        () => requestJson<RawCancelBookingResponse>(`/api/bookings/${appointmentId}/cancel`, {
          method: "POST",
          body: JSON.stringify({ expectedRevision })
        }).then((result) => normalizeCancelBookingResponse(result, appointmentId))
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<ClientBookingsResponse | undefined>(["client-bookings"], (current) => {
        if (!current) {
          return current;
        }

        const cancelledAppointmentId = result.appointment.id;
        const removedUpcoming = current.upcoming.find((appointment) => appointment.id === cancelledAppointmentId)
          ?? (current.nextAppointment?.id === cancelledAppointmentId ? current.nextAppointment : null);
        const nextUpcoming = current.upcoming.filter((appointment) => appointment.id !== cancelledAppointmentId);
        const nextHistory = current.history.some((appointment) => appointment.id === cancelledAppointmentId)
          ? current.history.map((appointment) => (
            appointment.id === cancelledAppointmentId
              ? { ...appointment, ...result.appointment, review: appointment.review, canReview: false }
              : appointment
          ))
          : removedUpcoming
            ? [{
              ...removedUpcoming,
              ...result.appointment,
              review: null,
              canReview: false
            }, ...current.history]
            : current.history;

        return {
          ...current,
          upcoming: nextUpcoming,
          nextAppointment: current.nextAppointment?.id === cancelledAppointmentId ? null : current.nextAppointment,
          history: nextHistory,
          nextAppointmentPayment: current.nextAppointment?.id === cancelledAppointmentId ? null : current.nextAppointmentPayment
        };
      });
      refreshClientCancellationViews(queryClient);
    }
  });
}

export function useSaveFavoriteBarberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveFavoriteBarberPayload) =>
      requestJson<{
        ok?: true;
        saved?: true;
        favoriteBarberReference?: string;
        client: ClientHomeResponse["client"];
        favoriteBarber: PublicBarberProfileView | null;
      }>("/api/client/favorite-barber", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      invalidateBookingQueriesQuietly(queryClient, [
        ["client-home"],
        ["client-bookings"],
        ["barber-search"],
        ["engagement", "client", "summary"],
        ["marketplace"]
      ]);
    }
  });
}

export function useSaveFavoriteShopMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveFavoriteShopPayload) =>
      requestJson<{
        client: ClientHomeResponse["client"];
        favoriteShop: unknown;
      }>("/api/client/favorite-shop", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-search"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}

export function useSubscribeClientMembershipMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { planCode: string }) =>
      requestJson<ClientMembershipSubscribeResponse>("/api/client/membership", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-membership"] }),
        queryClient.invalidateQueries({ queryKey: ["client-billing"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["points"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "summary"] })
      ]);
    }
  });
}

export function useCancelClientMembershipMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestJson<ClientMembershipResponse>("/api/client/membership", {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-membership"] }),
        queryClient.invalidateQueries({ queryKey: ["client-billing"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["points"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "summary"] })
      ]);
    }
  });
}


export function useSaveClientRoutineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveClientRoutinePayload) =>
      requestJson<{ routine: ClientRoutineResponse }>("/api/client/routine", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-home"] })
      ]);
    }
  });
}

export function useSubmitClientReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SubmitClientReviewPayload) =>
      requestJson<{ review: ClientAppointmentReviewSummary }>("/api/client/reviews", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-profile"] })
      ]);
    }
  });
}
