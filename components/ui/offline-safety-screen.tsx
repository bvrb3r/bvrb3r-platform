"use client";

import { GlobalSafetyState } from "@/components/ui/global-safety-state";

export function OfflineSafetyScreen() {
  return (
    <GlobalSafetyState
      state="offline"
      detail="This device cannot reach the live service. Cached views may still be available."
      actionLabel="Try connection again"
      onAction={() => window.location.reload()}
      className="w-full max-w-[420px]"
    />
  );
}
