"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveryFilters, DiscoveryResult, HaircutNowMatch, MapDiscoveryMarker, MarketplaceSourceKind } from "@/types/domain";
import type { PublicBarberProfileView, ServiceCatalogView, ServiceMutationInput } from "@/lib/marketplace/engine";

export interface MarketplaceApiError extends Error {
  status?: number;
}

interface DiscoveryResponse {
  results: DiscoveryResult[];
}

interface MapResponse {
  markers: MapDiscoveryMarker[];
}

interface HaircutNowResponse {
  match: HaircutNowMatch | null;
}

interface ServiceMutationResponse {
  service: ServiceCatalogView["editableServices"][number]["service"];
}

interface WaitlistResponse {
  waitlist: { id: string };
}

export interface MarketplaceAnalyticsPayload {
  eventType: "booking_cta_clicked" | "profile_shared" | "referral_shared";
  barberId?: string;
  username?: string;
  locationId?: string;
  sourceKind: MarketplaceSourceKind;
  sourceReference?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MarketplaceWaitlistPayload {
  barberId?: string;
  serviceId: string;
  locationId: string;
  query?: string;
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as MarketplaceApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

function toQueryString(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  return params.toString();
}

export function useMarketplaceDiscovery(filters: DiscoveryFilters, clientId?: string) {
  const queryString = toQueryString({
    query: filters.query,
    locationId: filters.locationId,
    styleTagId: filters.styleTagId,
    minRating: filters.minRating,
    maxPrice: filters.maxPrice,
    availability: filters.availability,
    specialty: filters.specialty,
    maxDistanceMiles: filters.maxDistanceMiles,
    clientId
  });

  return useQuery({
    queryKey: ["marketplace", "discover", filters, clientId],
    queryFn: () => requestJson<DiscoveryResponse>(`/api/marketplace/discover${queryString ? `?${queryString}` : ""}`),
    select: (data) => data.results
  });
}

export function useMarketplaceMap(filters: DiscoveryFilters) {
  const queryString = toQueryString({
    query: filters.query,
    locationId: filters.locationId,
    styleTagId: filters.styleTagId,
    minRating: filters.minRating,
    maxPrice: filters.maxPrice,
    availability: filters.availability,
    specialty: filters.specialty,
    maxDistanceMiles: filters.maxDistanceMiles
  });

  return useQuery({
    queryKey: ["marketplace", "map", filters],
    queryFn: () => requestJson<MapResponse>(`/api/marketplace/map${queryString ? `?${queryString}` : ""}`),
    select: (data) => data.markers
  });
}

export function useHaircutNowMatch(clientId?: string, locationId?: string) {
  const queryString = toQueryString({ clientId, locationId });

  return useQuery({
    queryKey: ["marketplace", "haircut-now", clientId, locationId],
    queryFn: () => requestJson<HaircutNowResponse>(`/api/marketplace/haircut-now${queryString ? `?${queryString}` : ""}`),
    select: (data) => data.match
  });
}

export function useMarketplaceServiceCatalog() {
  return useQuery({
    queryKey: ["marketplace", "services"],
    queryFn: () => requestJson<ServiceCatalogView>("/api/marketplace/services")
  });
}

export function useCreateMarketplaceServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ServiceMutationInput) =>
      requestJson<ServiceMutationResponse>("/api/marketplace/services", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "map"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}

export function useUpdateMarketplaceServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId, ...input }: Partial<ServiceMutationInput> & { serviceId: string }) =>
      requestJson<ServiceMutationResponse>(`/api/marketplace/services/${serviceId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "map"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}

export function useDeleteMarketplaceServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId }: { serviceId: string }) =>
      requestJson<ServiceMutationResponse>(`/api/marketplace/services/${serviceId}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "discover"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "map"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "haircut-now"] })
      ]);
    }
  });
}

export function useMarketplaceAnalyticsMutation() {
  return useMutation({
    mutationFn: (payload: MarketplaceAnalyticsPayload) =>
      requestJson<{ ok: true }>("/api/marketplace/analytics", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function useMarketplaceWaitlistMutation() {
  return useMutation({
    mutationFn: (payload: MarketplaceWaitlistPayload) =>
      requestJson<WaitlistResponse>("/api/marketplace/waitlist", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export async function fetchPublicBarberProfile(username: string) {
  return requestJson<PublicBarberProfileView>(`/api/marketplace/barbers/${username}`);
}

