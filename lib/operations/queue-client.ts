"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type {
  QueueEntryView,
  QueueWorkspacePayload
} from "@/lib/queue/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface QueueApiError extends Error {
  status?: number;
  code?: string;
  latestAppointment?: LiveAppointmentRecord;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as QueueApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    error.latestAppointment = body.latestAppointment as LiveAppointmentRecord | undefined;
    throw error;
  }

  return body as T;
}

async function invalidateQueueQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["operations-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["operations", "front_desk"] }),
    queryClient.invalidateQueries({ queryKey: ["operations", "owner"] }),
    queryClient.invalidateQueries({ queryKey: ["operations", "manager"] }),
    queryClient.invalidateQueries({ queryKey: ["shop-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-overview"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-schedule"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["barber-appointments"] })
  ]);
}

function useQueueRealtimeSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      return undefined;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return undefined;
    }

    const channel = supabase.channel("bvrb3r-queue-operations");
    for (const table of ["waitlist_entries", "appointments", "barber_status"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["operations-queue"] });
        }
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useQueueOperationsQuery() {
  useQueueRealtimeSubscription();

  return useQuery({
    queryKey: ["operations-queue"],
    queryFn: () => requestJson<QueueWorkspacePayload>("/api/operations/queue"),
    staleTime: 5_000
  });
}

export function useCreateQueueEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      clientId?: string;
      clientName: string;
      clientPhone: string;
      clientEmail?: string;
      shopId: string;
      serviceId?: string;
      preferredBarberId?: string;
      preferredDate?: string;
      preferredStartTime?: string;
      preferredEndTime?: string;
      flexibilityMinutes?: number;
      queueSource?: "walk_in" | "cancellation_fill" | "manual" | "app" | "kiosk";
      notes?: string;
    }) =>
      requestJson<{ entry: QueueEntryView }>("/api/operations/queue", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await invalidateQueueQueries(queryClient);
    }
  });
}

export function useQueueEntryActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      entryId: string;
      action: "call" | "assign" | "convert" | "cancel";
      barberId?: string;
      serviceId?: string;
      appointmentTime?: string;
      reason?: string;
    }) => {
      const route = payload.action === "call"
        ? `/api/operations/queue/${payload.entryId}/call`
        : payload.action === "assign"
          ? `/api/operations/queue/${payload.entryId}/assign`
          : payload.action === "convert"
            ? `/api/operations/queue/${payload.entryId}/convert`
            : `/api/operations/queue/${payload.entryId}/cancel`;

      const body = payload.action === "call"
        ? {}
        : payload.action === "assign"
          ? { barberId: payload.barberId }
          : payload.action === "convert"
            ? {
              barberId: payload.barberId,
              serviceId: payload.serviceId,
              appointmentTime: payload.appointmentTime
            }
            : { reason: payload.reason };

      return requestJson<{ entry: QueueEntryView; appointment?: LiveAppointmentRecord }>(route, {
        method: "POST",
        body: JSON.stringify(body)
      });
    },
    onSuccess: async () => {
      await invalidateQueueQueries(queryClient);
    }
  });
}
