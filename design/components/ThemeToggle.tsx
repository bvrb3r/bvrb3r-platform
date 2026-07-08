"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Segmented Night / Day switch. Drop it in headers, account settings, or the
 * onboarding chrome. Reads and writes the shared ThemeProvider.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const day = theme === "day";

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={cn("inline-flex items-center gap-1 rounded-full border border-[var(--border-soft,rgba(245,241,232,0.14))] bg-white/[0.04] p-[5px]", className)}
    >
      <button
        type="button"
        aria-pressed={!day}
        onClick={() => setTheme("night")}
        className={cn(
          "inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition",
          !day ? "bg-[var(--bvr-green)] text-[var(--bvr-green-ink,#0a0a0c)]" : "text-[var(--text-muted)]"
        )}
      >
        <Moon className="h-3.5 w-3.5" />
        Night
      </button>
      <button
        type="button"
        aria-pressed={day}
        onClick={() => setTheme("day")}
        className={cn(
          "inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition",
          day ? "bg-[var(--bvr-green)] text-[var(--bvr-green-ink,#0a0a0c)]" : "text-[var(--text-muted)]"
        )}
      >
        <Sun className="h-3.5 w-3.5" />
        Day
      </button>
    </div>
  );
}
