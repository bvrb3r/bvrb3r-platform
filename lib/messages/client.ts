"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessagingBroadcastAudience,
  MessagingBroadcastResult,
  MessagingCreateThreadInput,
  MessagingInboxPayload,
  MessagingParticipantSearchPayload,
  MessagingThreadPayload
} from "@/lib/messages/service";

export interface MessagingApiError extends Error {
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as MessagingApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useMessageThreadsQuery() {
  return useQuery({
    queryKey: ["messages", "threads"],
    queryFn: () => requestJson<MessagingInboxPayload>("/api/messages/threads")
  });
}

export function useMessageThreadQuery(threadId?: string) {
  return useQuery({
    queryKey: ["messages", "threads", threadId],
    queryFn: () => requestJson<MessagingThreadPayload>(`/api/messages/threads/${threadId}`),
    enabled: Boolean(threadId)
  });
}

export function useMessageParticipantSearchQuery(query: string, enabled = true) {
  const normalizedQuery = query.trim();

  return useQuery({
    queryKey: ["messages", "participants", normalizedQuery],
    queryFn: () =>
      requestJson<MessagingParticipantSearchPayload>(
        `/api/messages/participants/search?query=${encodeURIComponent(normalizedQuery)}`
      ),
    enabled: enabled && normalizedQuery.length >= 2
  });
}

export function useCreateMessageThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MessagingCreateThreadInput) =>
      requestJson<MessagingThreadPayload>("/api/messages/threads", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", "threads"] }),
        queryClient.setQueryData(["messages", "threads", payload.thread?.id], payload)
      ]);
    }
  });
}

export function useMarkMessageThreadReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) =>
      requestJson<{ threadId: string; lastReadAt: string }>(`/api/messages/threads/${threadId}/read`, {
        method: "PATCH"
      }),
    onSuccess: async (_, threadId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", "threads"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", "threads", threadId] })
      ]);
    }
  });
}

export function useSendMessageMutation(threadId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body }: { body: string }) =>
      requestJson<{ message: MessagingThreadPayload["messages"][number] }>(`/api/messages/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", "threads"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", "threads", threadId] })
      ]);
    }
  });
}

function invalidateMessageThreads(queryClient: ReturnType<typeof useQueryClient>, threadId?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["messages", "threads"] }),
    queryClient.invalidateQueries({ queryKey: ["messages", "threads", threadId] }),
    queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
    queryClient.invalidateQueries({ queryKey: ["fintech", "barber", "payouts"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-earnings"] })
  ]);
}

export function useApprovePosPaymentRequestMutation(threadId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentRequestId: string) =>
      requestJson<{ ok: true; message?: string }>(`/api/client/pos-payment-requests/${paymentRequestId}/approve`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: async () => {
      await invalidateMessageThreads(queryClient, threadId);
    }
  });
}

export function useDeclinePosPaymentRequestMutation(threadId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentRequestId: string) =>
      requestJson<{ ok: true; message?: string }>(`/api/client/pos-payment-requests/${paymentRequestId}/decline`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: async () => {
      await invalidateMessageThreads(queryClient, threadId);
    }
  });
}

export function useSendMessageBroadcastMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ locationId, audience, body }: { locationId: string; audience: MessagingBroadcastAudience; body: string }) =>
      requestJson<{ broadcast: MessagingBroadcastResult }>("/api/messages/broadcasts", {
        method: "POST",
        body: JSON.stringify({ locationId, audience, body })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", "threads"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] })
      ]);
    }
  });
}
