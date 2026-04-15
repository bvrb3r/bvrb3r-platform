"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

async function readLogoutError(response: Response) {
  try {
    const payload = await response.json() as { message?: string; error?: string };
    return payload.message ?? payload.error ?? `Logout failed with status ${response.status}.`;
  } catch {
    return `Logout failed with status ${response.status}.`;
  }
}

export function LogoutButton({
  className,
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await readLogoutError(response));
      }

      const supabase = createSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) {
          console.warn("[auth] browser local signOut returned a non-fatal error", {
            message: error.message
          });
        }
      }

      queryClient.clear();
      clearBrowserAccountState();
      router.replace("/login?logged_out=1");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to log out.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant={compact ? "ghost" : "secondary"}
        className={compact ? "min-h-11 w-full justify-start px-3" : "w-full"}
        onClick={handleLogout}
        disabled={isLoggingOut}
      >
        <LogOut className="h-4 w-4" />
        {isLoggingOut ? "Logging out..." : "Log out"}
      </Button>
      {errorMessage ? (
        <p className="text-xs leading-5 text-red-200" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
