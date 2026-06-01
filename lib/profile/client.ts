"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProfileMediaMutationInput,
  ProfileMediaWorkspacePayload
} from "@/lib/profile/service";

export interface ProfileMediaApiError extends Error {
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as ProfileMediaApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useProfileMediaWorkspaceQuery(enabled = true) {
  return useQuery({
    queryKey: ["profile-media"],
    queryFn: () => requestJson<ProfileMediaWorkspacePayload>("/api/profile/media"),
    enabled,
    staleTime: 10_000
  });
}

export function useMutateProfileMediaMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProfileMediaMutationInput) =>
      requestJson<ProfileMediaWorkspacePayload>("/api/profile/media", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async (payload) => {
      queryClient.setQueryData(["profile-media"], payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-home"] }),
        queryClient.invalidateQueries({ queryKey: ["client-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["barber-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-shop-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] })
      ]);
    }
  });
}
