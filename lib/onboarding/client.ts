"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import type {
  ActivationStatusPayload,
  ContactVerificationStatusPayload,
  OnboardingMePayload,
  RoleSelectionPayload
} from "@/types/onboarding";

export interface OnboardingApiError extends Error {
  status?: number;
}

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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as OnboardingApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
};

export function useOnboardingMe(enabled = true) {
  return useQuery({
    queryKey: ["onboarding", "me"],
    queryFn: () => requestJson<OnboardingMePayload>("/api/onboarding/me"),
    enabled,
    staleTime: 10_000
  });
}

export function useActivationStatus(enabled = true) {
  return useQuery({
    queryKey: ["activation", "status"],
    queryFn: () => requestJson<ActivationStatusPayload>("/api/activation-status"),
    enabled,
    staleTime: 10_000
  });
}

export function useContactVerificationStatus(enabled = true) {
  return useQuery({
    queryKey: ["auth", "verification-status"],
    queryFn: () => requestJson<ContactVerificationStatusPayload>("/api/auth/verification-status"),
    enabled,
    staleTime: 5_000
  });
}

export function useInitializeRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoleSelectionPayload) =>
      requestJson<{ nextPath: Route }>("/api/onboarding/role", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["activation"] }),
        queryClient.invalidateQueries({ queryKey: ["verification", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "verification-status"] })
      ]);
    }
  });
}

export function useSendPhoneVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { phone: string }) =>
      requestJson<ContactVerificationStatusPayload>("/api/auth/phone/send", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "verification-status"] });
    }
  });
}

export function useUpdateContactVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { firstName: string; lastName: string; phone: string; email?: string }) =>
      requestJson<ContactVerificationStatusPayload>("/api/auth/contact", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth", "verification-status"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["activation"] })
      ]);
    }
  });
}

export function useVerifyPhoneVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string }) =>
      requestJson<ContactVerificationStatusPayload>("/api/auth/phone/verify", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth", "verification-status"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["activation"] })
      ]);
    }
  });
}

export function useOnboardingStepMutation(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      requestJson<{ nextPath: Route }>(path, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["activation"] }),
        queryClient.invalidateQueries({ queryKey: ["verification", "me"] })
      ]);
    }
  });
}
