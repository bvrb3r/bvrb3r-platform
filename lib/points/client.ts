"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PointsBalanceView,
  PointsCampaignView,
  PointsCashoutRequestView,
  PointsHistoryView,
  PointsRedemptionCommitView,
  PointsRedemptionPurpose
} from "@/types/points";
import { runGuardedAction } from "@/lib/mobile/action-guard";

export interface PointsApiError extends Error {
  status?: number;
}

type PointsBalanceResponse = {
  balance: PointsBalanceView;
};

type PointsHistoryResponse = {
  history: PointsHistoryView;
};

type PointsCampaignsResponse = {
  campaigns: PointsCampaignView;
};

type PointsRedeemResponse = {
  redemption: PointsRedemptionCommitView;
};

type PointsCashoutResponse = {
  cashout: PointsCashoutRequestView;
};

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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as PointsApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function usePointsBalanceQuery(enabled = true) {
  return useQuery({
    queryKey: ["points", "balance"],
    queryFn: () => requestJson<PointsBalanceResponse>("/api/points/balance"),
    select: (data) => data.balance,
    enabled,
    staleTime: 15_000
  });
}

export function usePointsHistoryQuery(enabled = true) {
  return useQuery({
    queryKey: ["points", "history"],
    queryFn: () => requestJson<PointsHistoryResponse>("/api/points/history"),
    select: (data) => data.history,
    enabled,
    staleTime: 15_000
  });
}

export function usePointsCampaignsQuery(enabled = true) {
  return useQuery({
    queryKey: ["points", "campaigns"],
    queryFn: () => requestJson<PointsCampaignsResponse>("/api/points/campaigns"),
    select: (data) => data.campaigns,
    enabled,
    staleTime: 30_000
  });
}

export function useRedeemPointsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      purpose: PointsRedemptionPurpose;
      requestedPoints: number;
      orderTotal: number;
      sourceId: string;
      locationId?: string;
    }) =>
      runGuardedAction(
        `points:redeem:${input.purpose}:${input.sourceId}:${input.requestedPoints}:${input.orderTotal}`,
        () => requestJson<PointsRedeemResponse>("/api/points/redeem", {
          method: "POST",
          body: JSON.stringify(input)
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["points"] });
    }
  });
}

export function useRequestPointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestedPoints: number }) =>
      runGuardedAction(
        `points:cashout:${input.requestedPoints}`,
        () => requestJson<PointsCashoutResponse>("/api/points/cashout", {
          method: "POST",
          body: JSON.stringify(input)
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["points"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] })
      ]);
    }
  });
}

function invalidatePointsAndOwnerQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["points"] }),
    queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-earnings"] })
  ]);
}

export function useReviewPointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string; fraudFlags?: string[] }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/review", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}

export function useApprovePointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/approve", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}

export function useRejectPointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string; fraudFlags?: string[] }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/reject", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}

export function useMarkPaidPointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string; payoutReference?: string }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/mark-paid", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}

export function useMarkFailedPointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string; payoutReference?: string; fraudFlags?: string[] }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/mark-failed", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}

export function useReversePointsCashoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; note?: string; payoutReference?: string }) =>
      requestJson<{ cashout: unknown }>("/api/points/cashout/reverse", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidatePointsAndOwnerQueries(queryClient);
    }
  });
}
