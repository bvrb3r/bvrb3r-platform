"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BarberFintechReadinessPayload,
  BarberPayoutsPayload,
  ConnectedAccountReadinessView,
  ExecuteFintechPayoutsResult,
  FintechManagementPayload,
  FintechPayoutsPayload,
  ArchitectStripePlatformDiagnosticsPayload,
  BarberPayoutReadinessApprovalResult,
  FreelancePayoutQueuePayload,
  FreelancePayoutReleaseEligibility,
  FreelancePayoutReleaseResult,
  LegalAcceptanceView,
  MembershipCompensationView,
  StripeConnectSessionResult
} from "@/lib/fintech/service";
import type {
  FinancialAnomalyQueueView,
  FinancialAnomalyView,
  ScheduledJobRunView,
  ScheduledJobStatusView
} from "@/types/fintech";

export interface FintechApiError extends Error {
  status?: number;
}

type BarberFintechReadinessResponse = BarberFintechReadinessPayload;
type BarberPayoutsResponse = BarberPayoutsPayload;
type FintechManagementResponse = FintechManagementPayload;
type FintechPayoutsResponse = FintechPayoutsPayload;
type FreelancePayoutQueueResponse = FreelancePayoutQueuePayload;
type ArchitectStripePlatformDiagnosticsResponse = ArchitectStripePlatformDiagnosticsPayload;
type FreelancePayoutValidationResponse = FreelancePayoutReleaseEligibility;
type FreelancePayoutReleaseResponse = FreelancePayoutReleaseResult;
type BarberPayoutReadinessApprovalResponse = BarberPayoutReadinessApprovalResult;
type StripeConnectSessionResponse = StripeConnectSessionResult;
type RefreshStripeAccountResponse = {
  account: ConnectedAccountReadinessView;
};
type LegalAcceptanceResponse = {
  acceptance: LegalAcceptanceView;
  accounts: ConnectedAccountReadinessView[];
};
type UpdateConnectedAccountResponse = {
  account: ConnectedAccountReadinessView;
};
type UpdateMembershipCompensationResponse = {
  membership: MembershipCompensationView;
};
type ExecuteFintechPayoutsResponse = ExecuteFintechPayoutsResult;
type ScheduledExecutionStatusResponse = {
  status: ScheduledJobStatusView;
};
type ScheduledExecutionRunResponse = {
  jobs: {
    status: ScheduledJobStatusView;
    recentRuns: ScheduledJobRunView[];
  };
};
type FinancialAnomalyQueueResponse = {
  anomalies: FinancialAnomalyQueueView;
};
type FinancialAnomalyMutationResponse = {
  anomaly: FinancialAnomalyView;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as FintechApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

function invalidateFintechQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["fintech"] }),
    queryClient.invalidateQueries({ queryKey: ["engagement", "owner", "intelligence"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-earnings"] }),
    queryClient.invalidateQueries({ queryKey: ["points"] })
  ]);
}

export function useBarberFintechReadinessQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "barber", "readiness"],
    queryFn: () => requestJson<BarberFintechReadinessResponse>("/api/fintech/readiness"),
    enabled,
    staleTime: 15_000
  });
}

export function useBarberPayoutsQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "barber", "payouts"],
    queryFn: () => requestJson<BarberPayoutsResponse>("/api/fintech/payouts"),
    enabled,
    staleTime: 15_000
  });
}

export function useFintechManagementQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "management"],
    queryFn: () => requestJson<FintechManagementResponse>("/api/operations/fintech"),
    enabled,
    staleTime: 15_000
  });
}

export function useFintechPayoutsQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "management", "payouts"],
    queryFn: () => requestJson<FintechPayoutsResponse>("/api/operations/fintech/payouts"),
    enabled,
    staleTime: 15_000
  });
}

export function useArchitectFreelancePayoutQueueQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "architect", "freelance-payouts"],
    queryFn: () => requestJson<FreelancePayoutQueueResponse>("/api/architect/payouts/queue"),
    enabled,
    staleTime: 10_000
  });
}

export function useArchitectStripePlatformDiagnosticsQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "architect", "stripe-platform-diagnostics"],
    queryFn: () => requestJson<ArchitectStripePlatformDiagnosticsResponse>("/api/architect/stripe/platform-diagnostics"),
    enabled,
    staleTime: 30_000
  });
}

export function useScheduledExecutionStatusQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "scheduled-execution"],
    queryFn: () => requestJson<ScheduledExecutionStatusResponse>("/api/operations/automation/status"),
    select: (data) => data.status,
    enabled,
    staleTime: 10_000
  });
}

export function useFinancialAnomalyQueueQuery(enabled = true) {
  return useQuery({
    queryKey: ["fintech", "anomalies"],
    queryFn: () => requestJson<FinancialAnomalyQueueResponse>("/api/operations/financial-anomalies"),
    select: (data) => data.anomalies,
    enabled,
    staleTime: 10_000
  });
}

export function useCreateStripeOnboardingLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { shopId?: string | null } = {}) =>
      requestJson<StripeConnectSessionResponse>("/api/fintech/connect/account-link", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useCreateBarberPayoutOnboardingLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestJson<StripeConnectSessionResponse>("/api/barber/payouts/onboarding-link", {
        method: "POST"
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useCreateStripeDashboardLinkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { shopId?: string | null } = {}) =>
      requestJson<StripeConnectSessionResponse>("/api/fintech/connect/dashboard-link", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useRefreshStripeConnectedAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { shopId?: string | null } = {}) =>
      requestJson<RefreshStripeAccountResponse>("/api/fintech/connect/sync", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useRecordLegalAcceptanceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      agreementType: "platform_terms" | "barber_agreement" | "shop_agreement" | "payout_tax_acknowledgment";
      agreementVersion?: string;
      shopId?: string;
    }) =>
      requestJson<LegalAcceptanceResponse>("/api/fintech/legal-acceptance", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useUpdateConnectedAccountStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      accountId: string;
      provider?: "stripe_connect" | "manual";
      providerAccountId?: string | null;
      onboardingStatus: "not_started" | "invited" | "pending" | "submitted" | "restricted" | "verified";
      taxReadinessStatus: "pending" | "submitted" | "verified";
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
      requirementsCurrentlyDue?: string[] | string | null;
      requirementsEventuallyDue?: string[] | string | null;
      requirementsPastDue?: string[] | string | null;
      disabledReason?: string | null;
    }) =>
      requestJson<UpdateConnectedAccountResponse>(`/api/operations/fintech/accounts/${input.accountId}/status`, {
        method: "POST",
        body: JSON.stringify({
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          onboardingStatus: input.onboardingStatus,
          taxReadinessStatus: input.taxReadinessStatus,
          chargesEnabled: input.chargesEnabled,
          payoutsEnabled: input.payoutsEnabled,
          requirementsCurrentlyDue: input.requirementsCurrentlyDue,
          requirementsEventuallyDue: input.requirementsEventuallyDue,
          requirementsPastDue: input.requirementsPastDue,
          disabledReason: input.disabledReason
        })
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useUpdateMembershipCompensationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      membershipId: string;
      routingModel: "freelance" | "commission" | "booth_rent";
      commissionRate?: number | null;
      boothRentAmount?: number | null;
      boothRentFrequency?: "weekly" | "monthly" | null;
      payoutBlockReason?: string | null;
    }) =>
      requestJson<UpdateMembershipCompensationResponse>(`/api/operations/fintech/memberships/${input.membershipId}/compensation`, {
        method: "POST",
        body: JSON.stringify({
          routingModel: input.routingModel,
          commissionRate: input.commissionRate,
          boothRentAmount: input.boothRentAmount,
          boothRentFrequency: input.boothRentFrequency,
          payoutBlockReason: input.payoutBlockReason
        })
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useExecuteFintechPayoutsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { mode?: "ready" | "retry_failed"; speed?: "standard" | "instant" }) =>
      requestJson<ExecuteFintechPayoutsResponse>("/api/operations/fintech/payouts/execute", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useValidateFreelancePayoutMutation() {
  return useMutation({
    mutationFn: (input: { routingRecordId: string }) =>
      requestJson<FreelancePayoutValidationResponse>("/api/architect/payouts/validate", {
        method: "POST",
        body: JSON.stringify(input)
      })
  });
}

export function useReleaseFreelancePayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { routingRecordId: string; dryRun?: boolean }) =>
      requestJson<FreelancePayoutReleaseResponse>("/api/architect/payouts/release", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["fintech", "architect", "freelance-payouts"] });
    }
  });
}

export function useApproveFreelancePayoutReadinessMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { routingRecordId: string }) =>
      requestJson<BarberPayoutReadinessApprovalResponse>("/api/architect/payouts/approve-readiness", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["fintech", "architect", "freelance-payouts"] });
    }
  });
}

export function useRunScheduledFintechJobsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: { locationIds?: string[] }) =>
      requestJson<ScheduledExecutionRunResponse>("/api/operations/automation/status", {
        method: "POST",
        body: JSON.stringify(input ?? {})
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useResolveFinancialAnomalyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { anomalyId: string; note?: string }) =>
      requestJson<FinancialAnomalyMutationResponse>(`/api/operations/financial-anomalies/${input.anomalyId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ note: input.note })
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}

export function useDismissFinancialAnomalyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { anomalyId: string; note?: string }) =>
      requestJson<FinancialAnomalyMutationResponse>(`/api/operations/financial-anomalies/${input.anomalyId}/dismiss`, {
        method: "POST",
        body: JSON.stringify({ note: input.note })
      }),
    onSuccess: async () => {
      await invalidateFintechQueries(queryClient);
    }
  });
}
