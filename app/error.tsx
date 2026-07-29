"use client";

import { useEffect } from "react";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] verified route boundary failed", {
      digest: error.digest ?? "unavailable"
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-4 py-10 text-[#F5F1E8]">
      <GlobalSafetyState
        state="server_error"
        incidentReference={error.digest ? `BVR-${error.digest}` : undefined}
        actionLabel="Try this screen again"
        onAction={reset}
        className="w-full max-w-[420px]"
      />
    </main>
  );
}
