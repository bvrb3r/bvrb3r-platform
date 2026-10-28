"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { PasswordRecoveryRedirectGuard } from "@/components/auth/password-reset-workspace";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { RuntimeResilienceProvider } from "@/components/providers/runtime-resilience-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The Square welcome page is public and collects no platform identity.
  // Keep account recovery, push/install prompts, and device sync off this entry.
  if (pathname === "/kiosk") {
    return <>{children}</>;
  }
  return <PlatformProviders>{children}</PlatformProviders>;
}

function PlatformProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry(failureCount, error) {
          const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
            ? (error as { status: number }).status
            : null;

          if (status && [400, 401, 403, 404, 409, 422].includes(status)) {
            return false;
          }

          return failureCount < 1;
        }
      },
      mutations: {
        retry: 0
      }
    }
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <PasswordRecoveryRedirectGuard />
      <ThemeProvider>
        <PwaProvider>
          <RuntimeResilienceProvider>{children}</RuntimeResilienceProvider>
        </PwaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
