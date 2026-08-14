"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BarberTrustWorkspaceSummary, OwnerTrustWorkspaceSummary } from "@/types/trust";
import type { VerificationUploadView } from "@/types/activation";
import type { VerificationMePayload } from "@/types/trust";

export interface TrustApiError extends Error { status?: number; }

const requestJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as TrustApiError;
    error.status = response.status;
    throw error;
  }
  return body as T;
};

export function useBarberTrustSummary(enabled = true) {
  return useQuery({
    queryKey: ["trust", "barber", "verification"],
    queryFn: () => requestJson<{ summary: BarberTrustWorkspaceSummary }>("/api/trust/barber/verification"),
    select: (data) => data.summary,
    enabled,
    staleTime: 15_000
  });
}

export function useVerificationMe(enabled = true) {
  return useQuery({
    queryKey: ["verification", "me"],
    queryFn: () => requestJson<VerificationMePayload>("/api/verification/me"),
    enabled,
    staleTime: 15_000
  });
}

export function useOwnerTrustOverview(enabled = true) {
  return useQuery({
    queryKey: ["trust", "owner", "overview"],
    queryFn: () => requestJson<{ summary: OwnerTrustWorkspaceSummary }>("/api/trust/owner/overview"),
    select: (data) => data.summary,
    enabled,
    staleTime: 15_000
  });
}

export function useCreateVerificationUploadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      ownerType: "barber" | "shop";
      ownerId?: string;
      category: string;
      fileName: string;
      contentType: string;
      fileSizeBytes: number;
      expiresAt?: string;
    }) => requestJson<{ upload: VerificationUploadView }>("/api/trust/uploads", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trust", "barber", "verification"] }),
        queryClient.invalidateQueries({ queryKey: ["trust", "owner", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] })
      ]);
    }
  });
}

export async function uploadVerificationDocument(upload: VerificationUploadView, file: File) {
  if (file.type !== upload.contentType || file.size !== upload.fileSizeBytes) {
    throw new Error("The selected verification file no longer matches the secure upload request.");
  }

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const response = await fetch(upload.signedUploadUrl, {
    method: "PUT",
    body,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "x-upsert": "false" }
  });
  if (!response.ok) {
    throw new Error("Unable to upload verification evidence to secure storage.");
  }
  return upload.uploadId;
}

export function useSubmitBarberVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      category: "identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification";
      legalName: string;
      licenseType?: string;
      licenseNumber?: string;
      issuingState?: string;
      expirationDate?: string;
      uploadId?: string;
    }) => requestJson<{ verification: { id: string } }>("/api/trust/barber/verification", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trust"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}

export function useSubmitShopVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { shopId: string; category: "business_verification" | "ownership_verification"; businessName: string; uploadId: string }) =>
      requestJson<{ verification: { id: string } }>("/api/trust/owner/shop-verification", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trust"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] })
      ]);
    }
  });
}

export function useStartBarberIdentitySessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestJson<{
      profileId: string;
      sessionId: string;
      clientSecret: string | null;
      url: string | null;
      status: string;
      degraded: boolean;
    }>("/api/verification/barber/start-identity-session", { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["verification", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["trust"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] })
      ]);
    }
  });
}

export function useStartBarberConnectOnboardingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestJson<{
      profileId: string;
      url: string;
      account: Record<string, unknown>;
    }>("/api/verification/barber/start-connect-onboarding", { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["verification", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["trust"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] })
      ]);
    }
  });
}

export function useStartOwnerConnectOnboardingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: { shopId?: string | null }) =>
      requestJson<{
        profileId: string;
        url: string;
        account: Record<string, unknown>;
      }>("/api/verification/owner/start-connect-onboarding", { method: "POST", body: JSON.stringify(payload ?? {}) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["verification", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["trust"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["fintech"] })
      ]);
    }
  });
}

export function useSubmitSafetyReportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { subjectType: string; subjectId: string; category: string; details: string; locationId?: string; }) =>
      requestJson<{ report: { id: string } }>("/api/trust/reports", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement", "barber", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", "threads"] })
      ]);
    }
  });
}
