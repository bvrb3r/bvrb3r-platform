"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";
import type {
  ShopTeamInviteDirectoryPayload,
  ShopTeamInviteView
} from "@/lib/operations/shop-team-invites";

async function requestOwnerOperations(shopId?: string) {
  const query = shopId ? `?shopId=${encodeURIComponent(shopId)}` : "";
  const response = await fetch(`/api/owner/operations${query}`, {
    headers: { Accept: "application/json" }
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<OwnerOperationsResponse>;

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load owner operations.");
  }

  return body as OwnerOperationsResponse;
}

export function useOwnerOperationsQuery(shopId?: string) {
  return useQuery({
    queryKey: ["owner-operations", shopId ?? "primary"],
    queryFn: () => requestOwnerOperations(shopId),
    staleTime: 5_000
  });
}

async function mutateOwnerOperations<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "Unable to change owner operations.");
  }
  return result;
}

function useOwnerOperationMutation<TInput extends Record<string, unknown>, TResult>(
  path: string,
  method: "POST" | "PATCH" | "DELETE"
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => mutateOwnerOperations<TResult>(path, method, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner-operations"] });
    }
  });
}

export function useUpdateOwnerFloorMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    intakeOpen?: boolean;
    floorNote?: string | null;
    rotationOverrideBarberId?: string | null;
    rotationOverrideExpiresAt?: string | null;
    reason: string;
  }, { controls: unknown }>("/api/owner/operations/floor", "PATCH");
}

export function useSetOwnerKioskEmergencyMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    disabled: boolean;
    reason: string;
  }, { kiosk: unknown; activeSessionsRevoked: boolean }>(
    "/api/owner/operations/kiosk",
    "PATCH"
  );
}

export function useUpdateOwnerKioskPolicyMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    action: "policy";
    privacyMode?: boolean;
    autoResetEnabled?: boolean;
    externalCheckinEnabled?: boolean;
    guestCheckinAllowed?: boolean;
    clientBridgePromptEnabled?: boolean;
    clientBridgePromptFrequency?: "once_per_visit" | "once_per_30_days" | "never";
    qrEntryEnabled?: boolean;
    nfcEntryEnabled?: boolean;
    notificationFailureEscalation?: boolean;
    rotationPolicy?: "strict" | "balanced" | "fastest_available";
    balanceGuardrailMinutes?: number;
    paymentCollectionPolicy?: "barber_checkout" | "prepay";
    sessionTimeoutSeconds?: number;
    reason: string;
  }, { kiosk: unknown }>("/api/owner/operations/kiosk", "PATCH");
}

export function usePairOwnerKioskMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    reason: string;
  }, {
    kiosk: unknown;
    pairingCode: string;
    expiresAt: string;
  }>("/api/owner/operations/kiosk", "POST");
}

export function useSaveOwnerKioskPinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { shopId: string; pin: string }) =>
      mutateOwnerOperations<{
        enabled: boolean;
        pinSet: boolean;
      }>("/api/kiosk/settings", "POST", {
        scope: "shop",
        targetReference: input.shopId,
        pin: input.pin
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner-operations"] });
    }
  });
}

export function useCreateOwnerChairMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    label: string;
    sortOrder: number;
    reason: string;
  }, { chair: unknown }>("/api/owner/operations/chairs", "POST");
}

export function useRetireOwnerChairMutation() {
  return useOwnerOperationMutation<{
    shopId: string;
    chairId: string;
    reason: string;
  }, { chair: unknown }>("/api/owner/operations/chairs", "PATCH");
}

export function useCreateOwnerWalkInMutation() {
  return useOwnerOperationMutation<{
    clientName: string;
    clientPhone: string;
    shopId: string;
    preferredBarberId?: string;
    queueSource: "manual";
    entryType: "walkin";
    sourceProvider: "bvrb3r";
    paymentOwner: "bvrb3r_cash";
    notes?: string;
  }, { entry: unknown }>("/api/operations/queue", "POST");
}

export function useReassignOwnerWalkInMutation(entryId: string) {
  return useOwnerOperationMutation<{
    barberId: string;
    reason: string;
  }, { entry: unknown }>(`/api/operations/queue/${entryId}/reassign`, "POST");
}

async function requestOwnerTeamDirectory(shopId: string, search: string) {
  const params = new URLSearchParams({ shopId });
  if (search.trim()) {
    params.set("q", search.trim());
  }
  const response = await fetch(`/api/owner/team/invites?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });
  const body = (await response.json().catch(() => ({}))) as ShopTeamInviteDirectoryPayload & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load the shop team.");
  }
  return body;
}

export function useOwnerTeamDirectoryQuery(
  shopId: string,
  search = "",
  enabled = true
) {
  return useQuery({
    queryKey: ["owner-operations-team", shopId, search.trim()],
    queryFn: () => requestOwnerTeamDirectory(shopId, search),
    staleTime: 5_000,
    enabled: enabled && Boolean(shopId)
  });
}

function useOwnerTeamMutation<TInput extends Record<string, unknown>, TResult>(
  path: string,
  method: "POST" | "PATCH" | "DELETE"
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => mutateOwnerOperations<TResult>(path, method, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owner-operations"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-operations-team"] })
      ]);
    }
  });
}

export function useCreateOwnerTeamInviteMutation() {
  return useOwnerTeamMutation<{
    barberId: string;
    shopId: string;
    message?: string;
    proposal: {
      routingModel: "booth_rent";
      boothRentAmount: number;
      boothRentFrequency: "daily" | "weekly" | "monthly";
    } | {
      routingModel: "autobooth_rent";
      boothRentAmount: number;
      boothRentFrequency: "daily" | "weekly" | "monthly";
      autoBoothPercent: number;
    };
  }, { invite: ShopTeamInviteView }>("/api/owner/team/invites", "POST");
}

export function useRespondOwnerJoinRequestMutation() {
  return useOwnerTeamMutation<{
    inviteId: string;
    status: "accepted" | "rejected";
  }, { invite: ShopTeamInviteView }>("/api/owner/team/invites", "PATCH");
}

export function useSetOwnerRelationshipPauseMutation() {
  return useOwnerTeamMutation<{
    relationshipId: string;
    paused: boolean;
    reason: string;
  }, { relationshipId: string; status: "active" | "paused" }>(
    "/api/owner/team/relationships",
    "PATCH"
  );
}

export function useEndOwnerRelationshipMutation() {
  return useOwnerTeamMutation<{
    relationshipId: string;
    reason: string;
  }, { relationshipId: string; effectiveRoutingModel: "freelance" }>(
    "/api/owner/team/relationships",
    "DELETE"
  );
}
