"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BarberEngagementSummary, ClientBarberFollowState, ClientEngagementSummary, ClientReferralSummary, OwnerIntelligenceSummary } from "@/types/engagement";
import type { RecordEngagementEventInput } from "@/lib/engagement/engine";

export interface EngagementApiError extends Error {
  status?: number;
}

interface ClientSummaryResponse {
  summary: ClientEngagementSummary;
}

interface BarberSummaryResponse {
  summary: BarberEngagementSummary;
}

interface OwnerIntelligenceResponse {
  summary: OwnerIntelligenceSummary;
}

interface ProcessAutomationResponse {
  summary: OwnerIntelligenceSummary["automation"];
  processed: {
    completed: number;
    failed: number;
    retried: number;
    due: number;
  };
}

interface FollowMutationResponse {
  ok: true;
  follow?: {
    barberId: string;
    notifyOnAvailability: boolean;
    notifyOnPortfolio: boolean;
  };
  followState: ClientBarberFollowState;
  action?: "followed" | "already_following" | "unfollowed" | "already_not_following";
}

interface FollowStateResponse {
  followState: ClientBarberFollowState;
}

interface ReferralSummaryResponse {
  summary: ClientReferralSummary;
}

interface ReferralInviteResponse {
  referral: {
    id: string;
    referredClientEmail: string;
  };
}

interface RecordEventResponse {
  event: {
    eventType: RecordEngagementEventInput["eventType"];
    targetId: string;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as EngagementApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

function invalidateQueriesQuietly(queryClient: ReturnType<typeof useQueryClient>, queryKeys: unknown[][]) {
  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey }).catch((error) => {
      console.warn("[engagement-client] cache_refresh_failed", {
        queryKey,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    });
  }
}

export function useClientEngagementSummary(enabled = true) {
  return useQuery({
    queryKey: ["engagement", "client", "summary"],
    queryFn: () => requestJson<ClientSummaryResponse>("/api/engagement/client/summary"),
    select: (data) => data.summary,
    staleTime: 15_000,
    enabled
  });
}

export function useBarberEngagementSummary() {
  return useQuery({
    queryKey: ["engagement", "barber", "summary"],
    queryFn: () => requestJson<BarberSummaryResponse>("/api/engagement/barber/summary"),
    select: (data) => data.summary,
    staleTime: 15_000
  });
}

export function useOwnerEngagementIntelligence() {
  return useQuery({
    queryKey: ["engagement", "owner", "intelligence"],
    queryFn: () => requestJson<OwnerIntelligenceResponse>("/api/engagement/owner/intelligence"),
    select: (data) => data.summary,
    staleTime: 15_000
  });
}

export function useProcessOwnerAutomationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestJson<ProcessAutomationResponse>("/api/engagement/owner/automations/process", {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] })
      ]);
    }
  });
}

export function useBarberFollowState(barberId?: string, enabled = true) {
  return useQuery({
    queryKey: ["engagement", "client", "follow-state", barberId],
    queryFn: () => requestJson<FollowStateResponse>(`/api/engagement/follows?barberId=${encodeURIComponent(barberId ?? "")}`),
    select: (data) => data.followState,
    enabled: enabled && Boolean(barberId),
    staleTime: 15_000
  });
}

export function useClientReferralSummary(enabled = true) {
  return useQuery({
    queryKey: ["engagement", "client", "referrals"],
    queryFn: () => requestJson<ReferralSummaryResponse>("/api/engagement/referrals"),
    select: (data) => data.summary,
    enabled,
    staleTime: 15_000
  });
}

export function useFollowBarberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { barberId: string; notifyOnAvailability?: boolean; notifyOnPortfolio?: boolean }) =>
      requestJson<FollowMutationResponse>("/api/engagement/follows", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<FollowStateResponse>(["engagement", "client", "follow-state", variables.barberId], {
        followState: data.followState
      });
      invalidateQueriesQuietly(queryClient, [
        ["engagement", "client", "summary"],
        ["engagement", "client", "referrals"],
        ["engagement", "client", "follow-state", variables.barberId],
        ["engagement", "barber", "summary"],
        ["engagement", "owner", "intelligence"],
        ["marketplace"]
      ]);
    }
  });
}

export function useUnfollowBarberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { barberId: string }) =>
      requestJson<FollowMutationResponse & { unfollowedBarberId: string }>(`/api/engagement/follows?barberId=${encodeURIComponent(input.barberId)}`, {
        method: "DELETE"
      }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<FollowStateResponse>(["engagement", "client", "follow-state", variables.barberId], {
        followState: data.followState
      });
      invalidateQueriesQuietly(queryClient, [
        ["engagement", "client", "summary"],
        ["engagement", "client", "follow-state", variables.barberId],
        ["engagement", "barber", "summary"],
        ["engagement", "owner", "intelligence"],
        ["marketplace"]
      ]);
    }
  });
}

export function useCreateReferralInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { referredClientEmail: string }) =>
      requestJson<ReferralInviteResponse>("/api/engagement/referrals", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "client", "referrals"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] })
      ]);
    }
  });
}

export function useRecordEngagementEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordEngagementEventInput) =>
      requestJson<RecordEventResponse>("/api/engagement/events", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement"] }),
        queryClient.invalidateQueries({ queryKey: ["operations"] })
      ]);
    }
  });
}
