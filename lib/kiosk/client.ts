"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KIOSK_DEVICE_COOKIE, KIOSK_DEVICE_COOKIE_MAX_AGE, parseKioskDeviceCookieValue, serializeKioskDeviceCookieValue } from "@/lib/kiosk/device";
import type {
  KioskBookingInput,
  KioskBookingResult,
  KioskClientSearchResult,
  KioskPayload,
  KioskWaitlistInput,
  KioskWaitlistResult
} from "@/types/kiosk";
import type {
  AppointmentLookupKind,
  AppointmentLookupResult
} from "@/lib/clientbridge/service";

export interface KioskApiError extends Error {
  status?: number;
  code?: string;
}

const KIOSK_DEVICE_STORAGE_KEY = "bvrb3r-kiosk-device:v1";
const KIOSK_USERNAME_SEARCH_DELAY_MS = 300;

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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as KioskApiError;
    error.status = response.status;
    error.code = body.code as string | undefined;
    throw error;
  }

  return body as T;
}

export function useSaveKioskPinMutation() {
  return useMutation({
    mutationFn: (payload: { scope: "shop" | "barber"; targetReference: string; pin: string }) =>
      requestJson<{ pinSet: boolean; enabled: boolean }>("/api/kiosk/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function useVerifyKioskPinMutation() {
  return useMutation({
    mutationFn: (payload: { scope: "shop" | "barber"; targetReference: string; pin: string }) =>
      requestJson<{ ok: boolean }>("/api/kiosk/verify-pin", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function useKioskPayloadQuery(shopId?: string, scope: "shop" | "barber" = "shop") {
  return useQuery({
    queryKey: ["kiosk", scope, shopId],
    enabled: Boolean(shopId),
    queryFn: () => requestJson<KioskPayload>(scope === "barber" ? `/api/kiosk/barber/${shopId}` : `/api/kiosk/${shopId}`),
    staleTime: 10_000
  });
}

function normalizeKioskUsernameQuery(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

export function useKioskClientSearchQuery(query: string) {
  const normalizedQuery = normalizeKioskUsernameQuery(query);
  const debouncedQuery = useDebouncedValue(normalizedQuery, KIOSK_USERNAME_SEARCH_DELAY_MS);
  return useQuery({
    queryKey: ["kiosk-client-search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: () => requestJson<{ results: KioskClientSearchResult[] }>(`/api/kiosk/client-search?q=${encodeURIComponent(debouncedQuery)}`),
    staleTime: 10_000
  });
}

export function useKioskBookingMutation(shopId: string, scope: "shop" | "barber" = "shop") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: KioskBookingInput) =>
      requestJson<KioskBookingResult>(scope === "barber" ? `/api/kiosk/barber/${shopId}/booking` : `/api/kiosk/${shopId}/booking`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kiosk", scope, shopId] });
    }
  });
}

export function useKioskWaitlistMutation(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: KioskWaitlistInput) =>
      requestJson<KioskWaitlistResult>(`/api/kiosk/${shopId}/waitlist`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kiosk", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["operations-queue"] });
    }
  });
}

export function useKioskAppointmentSearchMutation(shopId: string) {
  return useMutation({
    mutationFn: (payload: {
      kind: AppointmentLookupKind;
      value: string;
      appointmentTime?: string;
    }) =>
      requestJson<{ results: AppointmentLookupResult[] }>(`/api/kiosk/${shopId}/appointments/search`, {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function useKioskAppointmentCheckInMutation(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      appointmentId: string;
      sourceProvider: "bvrb3r" | "booksy" | "square" | "thecut";
      idempotencyKey: string;
      operationalSmsConsent: boolean;
      contactPhone?: string;
      contactEmail?: string;
    }) =>
      requestJson<{
        queue: {
          id: string;
          position: number | null;
          estimatedWaitMinutes: number | null;
          waitReason?: string;
          sourceProvider: "bvrb3r" | "booksy" | "square" | "thecut";
          paymentOwner: string;
        };
        publicQueueToken: string | null;
        duplicate: boolean;
        sourceProvider: "bvrb3r" | "booksy" | "square" | "thecut";
        paymentOwner: string;
      }>(`/api/kiosk/${shopId}/appointments/check-in`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kiosk", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["operations-queue"] });
    }
  });
}

export function useKioskClientBridgeMutation(shopId: string) {
  return useMutation({
    mutationFn: (payload: {
      waitlistEntryId: string;
      contactChannel: "sms" | "email";
      contactValue: string;
      consentGranted: true;
    }) =>
      requestJson<{
        invitationId: string;
        status: string;
        expiresAt: string | null;
        suppressionReason: string | null;
      }>(`/api/kiosk/${shopId}/clientbridge`, {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

type KioskDeviceState = {
  activeShopId?: string;
  activatedAt?: string;
};

function readKioskCookieValue() {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${KIOSK_DEVICE_COOKIE}=`));

  return parseKioskDeviceCookieValue(match?.slice(KIOSK_DEVICE_COOKIE.length + 1));
}

function writeKioskCookieValue(shopId?: string) {
  if (typeof document === "undefined") {
    return;
  }

  if (!shopId) {
    document.cookie = `${KIOSK_DEVICE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }

  document.cookie = `${KIOSK_DEVICE_COOKIE}=${serializeKioskDeviceCookieValue(shopId)}; path=/; max-age=${KIOSK_DEVICE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function readKioskDeviceState(): KioskDeviceState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as KioskDeviceState;
    const state = typeof parsed === "object" && parsed ? parsed : {};
    const cookieShopId = readKioskCookieValue();
    if (cookieShopId && state.activeShopId !== cookieShopId) {
      return {
        ...state,
        activeShopId: cookieShopId
      };
    }

    return state;
  } catch {
    const cookieShopId = readKioskCookieValue();
    return cookieShopId ? { activeShopId: cookieShopId } : {};
  }
}

function writeKioskDeviceState(state: KioskDeviceState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(KIOSK_DEVICE_STORAGE_KEY, JSON.stringify(state));
}

export function clearKioskDeviceState() {
  writeKioskCookieValue(undefined);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(KIOSK_DEVICE_STORAGE_KEY);
}

export function useKioskDeviceState() {
  const [state, setState] = useState<KioskDeviceState>({});

  useEffect(() => {
    setState(readKioskDeviceState());
  }, []);

  const helpers = useMemo(() => ({
    activate(shopId: string) {
      const nextState = {
        activeShopId: shopId,
        activatedAt: new Date().toISOString()
      };
      writeKioskCookieValue(shopId);
      writeKioskDeviceState(nextState);
      setState(nextState);
    },
    deactivate() {
      clearKioskDeviceState();
      setState({});
    }
  }), []);

  return {
    state,
    isActive: Boolean(state.activeShopId),
    ...helpers
  };
}
