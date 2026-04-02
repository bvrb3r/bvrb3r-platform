"use client";

import { useQuery } from "@tanstack/react-query";
import type { ShopManagerPayload } from "@/types/shop-manager";

export interface ShopManagerApiError extends Error {
  status?: number;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as ShopManagerApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useShopManagerQuery() {
  return useQuery({
    queryKey: ["shop-manager"],
    queryFn: () => requestJson<ShopManagerPayload>("/api/operations/shop-manager"),
    staleTime: 10_000
  });
}
