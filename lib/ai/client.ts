"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BarberAiSummary, ClientAiSummary, TrackAiRecommendationInput } from "@/types/ai";

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
    throw new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

export function useClientAiSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ["ai", "client", "summary"],
    queryFn: () => requestJson<ClientAiSummary>("/api/ai/client/summary"),
    enabled,
    staleTime: 15_000
  });
}

export function useBarberAiSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ["ai", "barber", "summary"],
    queryFn: () => requestJson<BarberAiSummary>("/api/ai/barber/summary"),
    enabled,
    staleTime: 15_000
  });
}

export function useTrackAiRecommendationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TrackAiRecommendationInput) =>
      requestJson<{ ok: boolean }>("/api/ai/recommendations/track", {
        method: "POST",
        body: JSON.stringify(payload),
        keepalive: true
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai", "client", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["ai", "barber", "summary"] })
      ]);
    }
  });
}
