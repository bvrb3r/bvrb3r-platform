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
    mutationFn: () =>
      requestJson<PaymentSetupIntentView>("/api/payments/setup-intent", {
        method: "POST",
        body: JSON.stringify({ mode: "booking_inline" })
      })
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
