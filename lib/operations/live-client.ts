"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import type { HaircutNowMatch, MarketplaceSourceKind } from "@/types/domain";
import {
  AppointmentLifecycleAction,
  BookingMutationInput,
  CheckoutMutationInput,
  LiveAppointmentRecord,
  LiveOperationsSnapshot
} from "@/lib/operations/live-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type OperationsView = "booking" | "front_desk" | "barber" | "owner" | "manager" | "client";

export interface OperationsApiError extends Error {
  status?: number;
  code?: string;
  latestAppointment?: LiveAppointmentRecord;
}

export interface BookAppointmentPayload extends BookingMutationInput {
  sourceKind?: MarketplaceSourceKind;
  matchedFrom?: HaircutNowMatch["matchedFrom"];
  discoveryQuery?: string;
  barberUsername?: string;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as OperationsApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    error.latestAppointment = body.latestAppointment as LiveAppointmentRecord | undefined;
    throw error;
  }

  return body as T;
}

function useOperationsRealtimeSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      return undefined;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return undefined;
    }

    const channel = supabase.channel("bvrb3r-live-operations");
    const tables = [
      "appointments",
      "waitlist_entries",
      "walk_in_queue",
      "workflow_events",
      "compensation_snapshots",
      "owner_daily_analytics"
    ];

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["operations"] });
        }
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useLiveOperationsSnapshot(view: OperationsView) {
  useOperationsRealtimeSubscription();

  return useQuery({
    queryKey: ["operations", view],
    queryFn: () => requestJson<LiveOperationsSnapshot>(`/api/operations/state?view=${view}`),
    staleTime: 5_000
  });
}

export function useBookAppointmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BookAppointmentPayload) =>
      requestJson<{ appointment: LiveAppointmentRecord }>("/api/operations/bookings", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations", "booking"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "front_desk"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}

export function useAppointmentTransitionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, expectedRevision, action }: { appointmentId: string; expectedRevision: number; action: AppointmentLifecycleAction }) =>
      requestJson<{ appointment: LiveAppointmentRecord }>(`/api/operations/appointments/${appointmentId}/transition`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision, action })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations", "front_desk"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "barber"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] })
      ]);
    }
  });
}

export function useCheckoutAppointmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, ...input }: Pick<CheckoutMutationInput, "appointmentId" | "expectedRevision" | "tipAmount" | "paymentMethod">) =>
      requestJson<{ appointment: LiveAppointmentRecord }>(`/api/operations/appointments/${appointmentId}/checkout`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations", "front_desk"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "barber"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
        queryClient.invalidateQueries({ queryKey: ["operations", "manager"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}
