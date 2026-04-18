"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ArchitectAccountDetailPayload,
  ArchitectAccountDirectoryFilters,
  ArchitectAccountDirectoryPayload,
  ArchitectVerificationActionInput,
  ArchitectVerificationDetailPayload,
  ArchitectVerificationQueueFilters,
  ArchitectVerificationQueuePayload,
  PlatformAdminActionInput,
  PlatformAdminConsolePayload
} from "@/types/platform-admin";

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

function buildVerificationQuery(filters: ArchitectVerificationQueueFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.role && filters.role !== "all") params.set("role", filters.role);
  if (filters.overallStatus && filters.overallStatus !== "all") params.set("overallStatus", filters.overallStatus);
  if (filters.identityStatus && filters.identityStatus !== "all") params.set("identityStatus", filters.identityStatus);
  if (filters.licenseStatus && filters.licenseStatus !== "all") params.set("licenseStatus", filters.licenseStatus);
  if (filters.businessStatus && filters.businessStatus !== "all") params.set("businessStatus", filters.businessStatus);
  if (filters.payoutStatus && filters.payoutStatus !== "all") params.set("payoutStatus", filters.payoutStatus);
  if (filters.complianceStatus && filters.complianceStatus !== "all") params.set("complianceStatus", filters.complianceStatus);
  if (filters.submittedOnly) params.set("submittedOnly", "true");

  const query = params.toString();
  return query ? `/api/architect/verifications?${query}` : "/api/architect/verifications";
}

function buildAccountDirectoryQuery(filters: ArchitectAccountDirectoryFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.role && filters.role !== "all") params.set("role", filters.role);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);

  const query = params.toString();
  return query ? `/api/architect/accounts?${query}` : "/api/architect/accounts";
}

export function usePlatformAdminConsoleQuery(initialData?: PlatformAdminConsolePayload) {
  return useQuery({
    queryKey: ["architect-console"],
    queryFn: () => requestJson<PlatformAdminConsolePayload>("/api/architect/console"),
    initialData,
    staleTime: 5_000
  });
}

export function usePlatformAdminActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlatformAdminActionInput) =>
      requestJson<{ ok: boolean }>("/api/architect/actions", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["architect-console"] });
    }
  });
}

export function useArchitectAccountDirectoryQuery(filters: ArchitectAccountDirectoryFilters, initialData?: ArchitectAccountDirectoryPayload) {
  return useQuery({
    queryKey: ["architect-accounts", filters],
    queryFn: () => requestJson<ArchitectAccountDirectoryPayload>(buildAccountDirectoryQuery(filters)),
    initialData,
    staleTime: 5_000
  });
}

export function useArchitectAccountDetailQuery(profileId: string, initialData?: ArchitectAccountDetailPayload) {
  return useQuery({
    queryKey: ["architect-account-detail", profileId],
    queryFn: () => requestJson<ArchitectAccountDetailPayload>(`/api/architect/accounts/${profileId}`),
    initialData,
    staleTime: 5_000
  });
}

export function useArchitectAccountActionMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlatformAdminActionInput) =>
      requestJson<{ ok: boolean }>("/api/architect/actions", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["architect-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["architect-account-detail", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["architect-console"] })
      ]);
    }
  });
}

export function useArchitectVerificationQueueQuery(filters: ArchitectVerificationQueueFilters, initialData?: ArchitectVerificationQueuePayload) {
  return useQuery({
    queryKey: ["architect-verifications", filters],
    queryFn: () => requestJson<ArchitectVerificationQueuePayload>(buildVerificationQuery(filters)),
    initialData,
    staleTime: 5_000
  });
}

export function useArchitectVerificationDetailQuery(profileId: string, initialData?: ArchitectVerificationDetailPayload) {
  return useQuery({
    queryKey: ["architect-verification-detail", profileId],
    queryFn: () => requestJson<ArchitectVerificationDetailPayload>(`/api/architect/verifications/${profileId}`),
    initialData,
    staleTime: 5_000
  });
}

export function useArchitectVerificationActionMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, input }: { action: "approve" | "reject" | "request-update" | "suspend" | "reactivate"; input: ArchitectVerificationActionInput }) =>
      requestJson<{ ok: boolean; profileId: string }>(`/api/architect/verifications/${profileId}/${action}`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["architect-verifications"] }),
        queryClient.invalidateQueries({ queryKey: ["architect-verification-detail", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["architect-console"] })
      ]);
    }
  });
}

export function useVerificationDocumentSignedUrlMutation(profileId: string) {
  return useMutation({
    mutationFn: (documentId: string) =>
      requestJson<{ url: string }>(`/api/architect/verifications/${profileId}/documents/${documentId}/signed-url`, {
        method: "POST"
      })
  });
}
