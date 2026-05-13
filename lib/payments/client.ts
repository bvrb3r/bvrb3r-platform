"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runGuardedAction } from "@/lib/mobile/action-guard";

export interface ClientPaymentMethodView {
  id: string;
  provider: "stripe";
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  nickname?: string | null;
  isDefault: boolean;
  createdAt: string;
  label: string;
}

export interface PaymentRecordView {
  id: string;
  appointmentId: string | null;
  amount: number;
  currency: string;
  provider: "stripe" | null;
  paymentStatus: "pending" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded" | "voided";
  paymentType: "booking" | "tip" | "add_on" | "booth_rent" | "subscription";
  paidAt: string | null;
  createdAt: string;
}

export interface AppointmentPaymentSummaryView {
  appointmentId: string;
  outstandingBalance: number;
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  tipAmount: number;
  latestBookingPayment: PaymentRecordView | null;
  defaultPaymentMethod: ClientPaymentMethodView | null;
}

export interface PaymentApiError extends Error {
  status?: number;
}

export interface PaymentSetupIntentView {
  provider: "stripe";
  mode: "setup";
  clientSecret: string;
  customerId?: string;
  publishableKey?: string;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PaymentApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

function getPublishableKeyPrefix(publishableKey?: string) {
  if (!publishableKey) {
    return "missing";
  }

  if (publishableKey.startsWith("pk_test_")) {
    return "pk_test";
  }

  if (publishableKey.startsWith("pk_live_")) {
    return "pk_live";
  }

  return "invalid";
}

async function createSavedPaymentMethodSetup(): Promise<PaymentSetupIntentView> {
  console.log("[payments] setup_intent_request_started", {
    reference: "setup_intent_request_started",
    route: "/api/payments/setup-intent"
  });

  const response = await fetch("/api/payments/setup-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ mode: "booking_inline" })
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  console.log("[payments] setup_intent_response_status", {
    reference: "setup_intent_response_status",
    route: "/api/payments/setup-intent",
    ok: response.ok,
    status: response.status,
    hasClientSecret: typeof body.clientSecret === "string" && body.clientSecret.length > 0,
    hasPublishableKey: typeof body.publishableKey === "string" && body.publishableKey.length > 0,
    publishableKeyPrefix: getPublishableKeyPrefix(body.publishableKey as string | undefined)
  });

  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PaymentApiError;
    error.status = response.status;
    throw error;
  }

  return body as unknown as PaymentSetupIntentView;
}

export function usePaymentMethodsQuery(
  initialData?: { methods: ClientPaymentMethodView[] },
  enabled = true
) {
  return useQuery({
    queryKey: ["payments", "methods"],
    queryFn: () => requestJson<{ methods: ClientPaymentMethodView[] }>("/api/payments/methods"),
    initialData,
    enabled
  });
}

export function useAddPaymentMethodMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      provider: "stripe";
      providerCustomerId?: string;
      providerPaymentMethodId: string;
      brand?: string;
      last4?: string;
      expMonth?: number;
      expYear?: number;
      nickname?: string | null;
      isDefault?: boolean;
    }) =>
      requestJson<{ method: ClientPaymentMethodView }>("/api/payments/methods", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", "methods"] });
    }
  });
}

export function useCreateSavedPaymentMethodSetupMutation() {
  return useMutation({
    mutationFn: createSavedPaymentMethodSetup
  });
}

export function useSetDefaultPaymentMethodMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      requestJson<{ method: ClientPaymentMethodView }>(`/api/payments/methods/${paymentMethodId}/default`, {
        method: "POST"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", "methods"] });
    }
  });
}

export function useRenamePaymentMethodMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentMethodId, nickname }: { paymentMethodId: string; nickname: string }) =>
      requestJson<{ method: ClientPaymentMethodView }>(`/api/payments/methods/${paymentMethodId}`, {
        method: "PATCH",
        body: JSON.stringify({ nickname })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", "methods"] });
    }
  });
}

export function useRemovePaymentMethodMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      requestJson<{ ok: boolean }>(`/api/payments/methods/${paymentMethodId}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", "methods"] });
    }
  });
}

export function useCreateAppointmentPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      paymentMethodId,
      provider
    }: {
      appointmentId: string;
      paymentMethodId?: string;
      provider?: "stripe";
    }) =>
      runGuardedAction(
        `payments:appointment:${appointmentId}:${paymentMethodId ?? provider ?? "default"}`,
        () => requestJson<{ payment: PaymentRecordView; summary: AppointmentPaymentSummaryView | null }>(`/api/payments/appointments/${appointmentId}/create`, {
          method: "POST",
          body: JSON.stringify({ paymentMethodId, provider })
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["payments", "methods"] }),
        queryClient.invalidateQueries({ queryKey: ["operations"] })
      ]);
    }
  });
}
