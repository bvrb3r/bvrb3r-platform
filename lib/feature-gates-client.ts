"use client";

import { useSyncExternalStore } from "react";
import {
  applyFeatureFlagRows,
  GATES,
  type FeatureGateDefinition,
  type FeatureGateKey,
  type FeatureGateReason
} from "@/lib/feature-gates";

export type ResolvedFeatureGate = FeatureGateDefinition & {
  enabled: boolean;
  planRequired: string | null;
};

type FeatureGatePayload = {
  gates?: Partial<Record<FeatureGateKey, ResolvedFeatureGate>>;
};

const registryDefaults = applyFeatureFlagRows([]);
let runtimeGates: Record<FeatureGateKey, ResolvedFeatureGate> = registryDefaults;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

async function loadRuntimeGates() {
  if (loadPromise) return loadPromise;

  loadPromise = fetch("/api/feature-gates", {
    cache: "no-store",
    headers: { accept: "application/json" }
  })
    .then(async (response) => {
      if (!response.ok) return;
      const body = await response.json().catch(() => ({})) as FeatureGatePayload;
      const next = { ...runtimeGates };

      Object.entries(body.gates ?? {}).forEach(([key, value]) => {
        if (!(key in GATES) || !value) return;
        const gateKey = key as FeatureGateKey;
        next[gateKey] = {
          ...next[gateKey],
          ...value,
          reason: value.reason as FeatureGateReason
        };
      });

      runtimeGates = next;
      publish();
    })
    .catch(() => {
      // Registry defaults are the fail-closed contract when runtime flags are unavailable.
    });

  return loadPromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadRuntimeGates();
  return () => {
    listeners.delete(listener);
  };
}

export function useResolvedFeatureGate(gateKey: FeatureGateKey) {
  return useSyncExternalStore(
    subscribe,
    () => runtimeGates[gateKey],
    () => registryDefaults[gateKey]
  );
}
