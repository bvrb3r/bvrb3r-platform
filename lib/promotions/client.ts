"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PromotionCreateInput,
  PromotionUpdateInput
} from "@/lib/promotions/domain";
import type {
  PromotionManagementPayload,
  PromotionPreviewView,
  PromotionQuoteView,
  ClientPromotionView
} from "@/lib/promotions/service";

export interface PromotionApiError extends Error {
  status?: number;
  code?: string;
}

export interface ClientPromotionsResponse {
  promotions: ClientPromotionView[];
  quote: PromotionQuoteView;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PromotionApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    throw error;
  }

  return body as T;
}

function toQueryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (!value) {
      continue;
    }
    params.set(key, value);
  }
  return params.toString();
}

export function useClientPromotionsQuery(params: {
  shopId?: string;
  serviceId?: string;
  addOnIds?: string[];
  barberId?: string;
}) {
  const queryString = toQueryString({
    shopId: params.shopId,
    serviceId: params.serviceId,
    addOnIds: params.addOnIds?.join(","),
    barberId: params.barberId
  });

  return useQuery({
    queryKey: ["client-promotions", params],
    queryFn: () => requestJson<ClientPromotionsResponse>(`/api/client/promotions${queryString ? `?${queryString}` : ""}`),
    enabled: Boolean(params.shopId && params.serviceId)
  });
}

export function useApplyPromotionMutation() {
  return useMutation({
    mutationFn: (payload: {
      shopId: string;
      serviceId: string;
      addOnIds: string[];
      barberId?: string;
      appointmentTime?: string;
      promotionId?: string;
      promotionCode?: string;
    }) =>
      requestJson<PromotionPreviewView>("/api/promotions/apply", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function usePromotionsManagementQuery() {
  return useQuery({
    queryKey: ["promotions-management"],
    queryFn: () => requestJson<PromotionManagementPayload>("/api/promotions")
  });
}

export function useCreatePromotionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PromotionCreateInput) =>
      requestJson<{ promotion: PromotionManagementPayload["promotions"][number] }>("/api/promotions", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["promotions-management"] });
      await queryClient.invalidateQueries({ queryKey: ["client-promotions"] });
    }
  });
}

export function useUpdatePromotionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ promotionId, payload }: { promotionId: string; payload: PromotionUpdateInput }) =>
      requestJson<{ promotion: PromotionManagementPayload["promotions"][number] }>(`/api/promotions/${promotionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["promotions-management"] });
      await queryClient.invalidateQueries({ queryKey: ["client-promotions"] });
    }
  });
}
