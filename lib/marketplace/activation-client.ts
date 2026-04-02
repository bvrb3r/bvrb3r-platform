"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ActivationApiError extends Error {
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as ActivationApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useCreateBoostCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      scopeType: "barber" | "shop";
      scopeId?: string;
      placementLabel: string;
      placementScope: "discover_hero" | "discover_city" | "discover_category" | "leaderboard";
      citySlug?: string;
      categorySlug?: string;
      dailyBudgetCents: number;
      spendCents: number;
    }) => requestJson<{ campaign: { id: string } }>("/api/marketplace/boosts", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}

export function useCreateFeaturedPlacementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      scopeType: "barber" | "shop";
      scopeId: string;
      label: string;
      placementScope: "discover_hero" | "discover_city" | "discover_category" | "leaderboard";
      citySlug?: string;
      categorySlug?: string;
      priority: number;
      startsAt: string;
      endsAt: string;
    }) => requestJson<{ placement: { id: string } }>("/api/marketplace/featured", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}

export function useUpdateCityRolloutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { citySlug: string; activationState?: string; launchVisible?: boolean; densityScore?: number; marketNotes?: string }) =>
      requestJson<{ rollout: { citySlug: string } }>("/api/marketplace/cities", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}
