"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessagingBroadcastAudience,
  MessagingBroadcastResult,
  MessagingCreateThreadInput,
  MessagingInboxPayload,
  MessagingParticipantSearchResult,
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
      requestJson<{ results: MessagingParticipantSearchResult[] }>(
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
