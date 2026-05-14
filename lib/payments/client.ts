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
  setupIntentStatusCode?: number;
}

export type AddPaymentMethodPayload = {
  provider: "stripe";
  providerCustomerId?: string;
  providerPaymentMethodId: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  nickname?: string | null;
  isDefault?: boolean;
};

export type AddPaymentMethodResult = {
  method: ClientPaymentMethodView;
  defaultPaymentMethodId?: string | null;
  savePaymentStatusCode?: number;
  clientPreferencesUpdated?: boolean;
};

export type PaymentMethodsResponse = {
  methods: ClientPaymentMethodView[];
  defaultPaymentMethodId?: string | null;
  loadMethodsStatusCode?: number;
};

export function getResolvedDefaultPaymentMethod(
  methods: ClientPaymentMethodView[],
  defaultPaymentMethodId?: string | null
) {
  if (!methods.length) {
    return null;
  }

  if (defaultPaymentMethodId) {
    const matchedDefault = methods.find((method) => method.id === defaultPaymentMethodId);
    if (matchedDefault) {
      return matchedDefault;
    }
  }

  return methods.find((method) => method.isDefault)
    ?? (methods.length === 1 ? methods[0] : null);
}

export function normalizeClientPaymentMethodDefaults(
  methods: ClientPaymentMethodView[],
  defaultPaymentMethodId?: string | null
) {
  const defaultMethod = getResolvedDefaultPaymentMethod(methods, defaultPaymentMethodId);
  if (!defaultMethod) {
    return methods.map((method) => ({ ...method, isDefault: false }));
  }

  return methods.map((method) => ({
    ...method,
    isDefault: method.id === defaultMethod.id
  }));
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

function getClientSecretPrefix(clientSecret?: string) {
  if (!clientSecret) {
    return "missing";
  }

  if (clientSecret.startsWith("seti_")) {
    return "seti";
  }

  if (clientSecret.startsWith("pi_")) {
    return "pi";
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
    clientSecretPrefix: getClientSecretPrefix(body.clientSecret as string | undefined),
    clientSecretStartsWithSeti: typeof body.clientSecret === "string" && body.clientSecret.startsWith("seti_"),
    hasPublishableKey: typeof body.publishableKey === "string" && body.publishableKey.length > 0,
    publishableKeyPrefix: getPublishableKeyPrefix(body.publishableKey as string | undefined)
  });

  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PaymentApiError;
    error.status = response.status;
    throw error;
  }

  return {
    ...(body as unknown as PaymentSetupIntentView),
    setupIntentStatusCode: response.status
  };
}

async function addSavedPaymentMethod(payload: AddPaymentMethodPayload): Promise<AddPaymentMethodResult> {
  console.log("[payments] save_payment_method_request_started", {
    reference: "save_payment_method_request_started",
    route: "/api/payments/methods",
    providerPaymentMethodIdPresent: Boolean(payload.providerPaymentMethodId),
    providerCustomerIdPresent: Boolean(payload.providerCustomerId),
    nicknamePresent: Boolean(payload.nickname),
    isDefault: Boolean(payload.isDefault)
  });

  const response = await fetch("/api/payments/methods", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  console.log("[payments] save_payment_method_response_status", {
    reference: "save_payment_method_response_status",
    route: "/api/payments/methods",
    ok: response.ok,
    status: response.status,
    methodPresent: Boolean(body.method),
    errorPresent: typeof body.error === "string"
  });

  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PaymentApiError;
    error.status = response.status;
    throw error;
  }

  return {
    method: (body as { method: ClientPaymentMethodView }).method,
    defaultPaymentMethodId: typeof body.defaultPaymentMethodId === "string" ? body.defaultPaymentMethodId : null,
    savePaymentStatusCode: response.status,
    clientPreferencesUpdated: Boolean((body as { clientPreferencesUpdated?: boolean }).clientPreferencesUpdated)
  };
}

async function loadSavedPaymentMethods(): Promise<PaymentMethodsResponse> {
  const response = await fetch("/api/payments/methods", {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  console.log("[payments] load_payment_methods_response_status", {
    reference: "load_payment_methods_response_status",
    route: "/api/payments/methods",
    ok: response.ok,
    status: response.status,
    methodsPresent: Array.isArray(body.methods),
    errorPresent: typeof body.error === "string"
  });

  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PaymentApiError;
    error.status = response.status;
    throw error;
  }

  return {
    methods: Array.isArray(body.methods) ? (body.methods as ClientPaymentMethodView[]) : [],
    defaultPaymentMethodId: typeof body.defaultPaymentMethodId === "string" ? body.defaultPaymentMethodId : null,
    loadMethodsStatusCode: response.status
  };
}

export function usePaymentMethodsQuery(
  initialData?: { methods: ClientPaymentMethodView[] },
  enabled = true
) {
  return useQuery({
    queryKey: ["payments", "methods"],
    queryFn: loadSavedPaymentMethods,
    initialData: initialData ? {
      ...initialData,
      defaultPaymentMethodId: getResolvedDefaultPaymentMethod(initialData.methods)?.id ?? null,
      loadMethodsStatusCode: 200
    } : undefined,
    enabled
  });
}

export function useAddPaymentMethodMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addSavedPaymentMethod,
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
      requestJson<{ method: ClientPaymentMethodView; defaultPaymentMethodId?: string | null }>(`/api/payments/methods/${paymentMethodId}/default`, {
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
