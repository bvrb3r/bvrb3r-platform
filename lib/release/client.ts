"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReleaseReadinessSummary } from "@/lib/release/readiness";

export interface ReleaseApiError extends Error {
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
    const error = new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`) as ReleaseApiError;
    error.status = response.status;
    throw error;
  }

  return body as T;
}

export function useReleaseReadinessQuery(enabled = true) {
  return useQuery({
    queryKey: ["release", "readiness"],
    queryFn: () => requestJson<{ readiness: ReleaseReadinessSummary }>("/api/release/readiness"),
    select: (data) => data.readiness,
    enabled,
    staleTime: 30_000
  });
}
