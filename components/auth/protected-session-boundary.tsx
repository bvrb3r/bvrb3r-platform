"use client";

import { useEffect } from "react";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";

async function verifyServerSession() {
  try {
    const response = await fetch("/api/session/health", {
      cache: "no-store",
      credentials: "include"
    });
    if (!response.ok) {
      return;
    }

    const payload = await response.json() as { health?: { authenticated?: boolean } };
    if (payload.health?.authenticated) {
      return;
    }

    clearBrowserAccountState();
    window.location.replace("/login?session=expired");
  } catch {
    // A transient network miss should not eject an active user from an already server-guarded page.
  }
}

export function ProtectedSessionBoundary() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void verifyServerSession();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void verifyServerSession();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
