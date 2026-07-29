"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";

async function requestOwnerOperations(shopId?: string) {
  const query = shopId ? `?shopId=${encodeURIComponent(shopId)}` : "";
  const response = await fetch(`/api/owner/operations${query}`, {
    headers: { Accept: "application/json" }
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<OwnerOperationsResponse>;

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load owner operations.");
  }

  return body as OwnerOperationsResponse;
}

export function useOwnerOperationsQuery(shopId?: string) {
  return useQuery({
    queryKey: ["owner-operations", shopId ?? "primary"],
    queryFn: () => requestOwnerOperations(shopId),
    staleTime: 5_000
  });
}

async function mutateOwnerOperations<T>(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "Unable to change owner operations.");
  }
  return result;
}

function useOwnerOperationMutation<TInput extends Record<string, unknown>, TResult>(
  path: string,
  method: "POST" | "PATCH"
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => mutateOwnerOperations<TResult>(path, method, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner-operations"] });
    }
  });
}

export function useUpdateOwnerFloorMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    intakeOpen?: boolean;
    floorNote?: string | null;
    reason: string;
  }, { controls: unknown }>("/api/owner/operations/floor", "PATCH");
}

export function useSetOwnerKioskEmergencyMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    disabled: boolean;
    reason: string;
  }, { kiosk: unknown; activeSessionsRevoked: boolean }>(
    "/api/owner/operations/kiosk",
    "PATCH"
  );
}

export function useCreateOwnerChairMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    label: string;
    sortOrder: number;
    reason: string;
  }, { chair: unknown }>("/api/owner/operations/chairs", "POST");
}

export function useRetireOwnerChairMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    chairId: string;
    reason: string;
  }, { chair: unknown }>("/api/owner/operations/chairs", "PATCH");
}
