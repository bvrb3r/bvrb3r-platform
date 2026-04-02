"use client";

import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { startTransition, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";

type SessionHealthResponse = {
  health: {
    authenticated: boolean;
    loginPath: string;
    reason?: string;
  };
};

function isProtectedPath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return pathname.startsWith("/dashboard")
    || pathname.startsWith("/booking")
    || pathname.startsWith("/bookings")
    || pathname.startsWith("/earnings")
    || pathname.startsWith("/reports")
    || pathname.startsWith("/profile")
    || pathname.startsWith("/referrals");
}

function buildKeysForPath(pathname: string | null) {
  if (!pathname) {
    return [["mobile", "activation"]];
  }

  if (pathname.startsWith("/dashboard/client") || pathname.startsWith("/bookings") || pathname.startsWith("/booking") || pathname.startsWith("/profile")) {
    return [
      ["client-home"],
      ["client-bookings"],
      ["client-membership"],
      ["client-billing"],
      ["points"],
      ["engagement", "client", "summary"],
      ["mobile", "activation"]
    ];
  }

  if (pathname.startsWith("/dashboard/barber") || pathname.startsWith("/earnings")) {
    return [
      ["barber-overview"],
      ["barber-schedule"],
      ["barber-earnings"],
      ["barber-status"],
      ["points"],
      ["mobile", "activation"]
    ];
  }

  if (pathname.startsWith("/reports") || pathname.startsWith("/dashboard/owner") || pathname.startsWith("/dashboard/manager")) {
    return [
      ["engagement", "owner", "intelligence"],
      ["mobile", "activation"],
      ["fintech", "scheduled-execution"],
      ["fintech", "anomalies"]
    ];
  }

  return [["mobile", "activation"]];
}

async function fetchSessionHealth() {
  const response = await fetch("/api/session/health", {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Session health failed with status ${response.status}`);
  }

  return response.json() as Promise<SessionHealthResponse>;
}

export function RuntimeResilienceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isOnline, runtimeMode } = usePwa();
  const [syncTick, setSyncTick] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loginPath, setLoginPath] = useState("/login");

  const protectedPath = useMemo(() => isProtectedPath(pathname), [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onResume = () => {
      startTransition(() => {
        setSyncTick((current) => current + 1);
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onResume();
      }
    };

    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const nativeAppPlugin = (window as Window & {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener?: (eventName: string, listener: (event: { isActive?: boolean }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
          };
        };
      };
    }).Capacitor?.Plugins?.App;

    let removeNativeListener: (() => void) | undefined;
    if (nativeAppPlugin?.addListener) {
      const maybeListener = nativeAppPlugin.addListener("appStateChange", (event) => {
        if (event.isActive) {
          onResume();
        }
      });

      Promise.resolve(maybeListener).then((listener) => {
        removeNativeListener = () => listener.remove();
      }).catch(() => {
        removeNativeListener = undefined;
      });
    }

    return () => {
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      removeNativeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!isOnline || !protectedPath) {
      return;
    }

    let cancelled = false;

    async function refreshRuntimeState() {
      try {
        const result = await fetchSessionHealth();
        if (cancelled) {
          return;
        }

        const expired = !result.health.authenticated && result.health.reason === "missing_session";
        setSessionExpired(expired);
        setLoginPath(result.health.loginPath || "/login");

        if (result.health.authenticated) {
          await Promise.all(
            buildKeysForPath(pathname).map((queryKey) =>
              queryClient.invalidateQueries({ queryKey })
            )
          );
        }
      } catch {
        if (!cancelled) {
          setSessionExpired(false);
        }
      }
    }

    void refreshRuntimeState();

    return () => {
      cancelled = true;
    };
  }, [isOnline, pathname, protectedPath, queryClient, runtimeMode, syncTick]);

  return (
    <>
      {children}
      {sessionExpired ? (
        <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.75rem)] z-50 flex justify-center sm:inset-x-6">
          <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-[24px] border border-rose-300/22 bg-[rgba(13,8,8,0.96)] px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur">
            <div className="rounded-full border border-rose-300/18 bg-rose-300/10 p-2 text-rose-200">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-200">Session needs attention</p>
              <p className="mt-1 text-sm text-white/74">Your session expired while the app was backgrounded or reopened. Sign back in to keep booking, finance, and dashboard actions safe.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => setSyncTick((current) => current + 1)}>
                <RefreshCcw className="h-4 w-4" />
                Retry
              </Button>
              <a
                href={loginPath}
                className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(124,255,0,0.32)] sm:text-[11px] sm:tracking-[0.22em]"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
