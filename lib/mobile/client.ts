"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileActivationSummary } from "@/types/mobile";
import type { RecordDeepLinkInput, SyncMobileDeviceInput } from "@/lib/mobile/engine";

export interface MobileApiError extends Error {
  status?: number;
}

interface MobileSummaryResponse {
  summary: MobileActivationSummary;
  devices: Array<{
    deviceId: string;
    deviceLabel: string;
    runtimeMode: string;
    platform: string;
    lastSeenAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    deviceId: string;
    provider: string;
    status: string;
    lastSeenAt: string;
  }>;
}

interface PushSyncResponse {
  summary: MobileActivationSummary;
}

interface DeepLinkResponse {
  bundle: {
    route: string;
    label: string;
    webUrl: string;
    appUrl: string;
    webProtocolUrl: string;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as MobileApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useMobileActivationSummary(enabled = true) {
  return useQuery({
    queryKey: ["mobile", "activation", "summary"],
    queryFn: () => requestJson<MobileSummaryResponse>("/api/mobile/push/subscriptions"),
    select: (data) => data.summary,
    staleTime: 15_000,
    enabled
  });
}

export function useSyncPushSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SyncMobileDeviceInput) =>
      requestJson<PushSyncResponse>("/api/mobile/push/subscriptions", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement"] })
      ]);
    }
  });
}

export function useRevokePushSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { deviceId: string }) =>
      requestJson<PushSyncResponse>(`/api/mobile/push/subscriptions?deviceId=${encodeURIComponent(input.deviceId)}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement"] })
      ]);
    }
  });
}

export function useDeepLinkBundle(route?: string, label?: string, enabled = true) {
  return useQuery({
    queryKey: ["mobile", "deep-link", route, label],
    queryFn: () => requestJson<DeepLinkResponse>(`/api/mobile/deep-links?route=${encodeURIComponent(route ?? "/")}${label ? `&label=${encodeURIComponent(label)}` : ""}`),
    select: (data) => data.bundle,
    enabled: enabled && Boolean(route),
    staleTime: 60_000
  });
}

export function useRecordDeepLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordDeepLinkInput) =>
      requestJson<{ record: { id: string; route: string } }>("/api/mobile/deep-links", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] });
    }
  });
}
