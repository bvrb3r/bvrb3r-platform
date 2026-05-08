"use client";

import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "@/design/components";
import { cn } from "@/lib/utils";

export function ClientPrimarySearchBar({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Find a barber or shop",
  quickActions,
  compact = false,
  isSubmitting = false,
  className
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  quickActions?: Array<{ label: string; onSelect: () => void }>;
  compact?: boolean;
  isSubmitting?: boolean;
  className?: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.();
  }

  return (
    <div className={cn("rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.99))] p-4 shadow-[0_24px_50px_rgba(0,0,0,0.2)] sm:p-5", className)}>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <SearchBar
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn("flex-1", compact ? "min-h-12" : "min-h-14")}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full border border-[#c8f17f]/38 bg-[linear-gradient(180deg,#8ed62c_0%,#6fb61b_100%)] px-5 text-[14px] font-semibold text-[#050b03] ring-1 ring-[#d4ff96]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_30px_rgba(111,182,27,0.24)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_36px_rgba(111,182,27,0.3)]",
            isSubmitting ? "cursor-wait opacity-80 hover:translate-y-0" : "",
            compact ? "h-12" : "h-14"
          )}
        >
          {isSubmitting ? "Searching" : "Search"}
          <ArrowRight className={cn("h-4 w-4", isSubmitting ? "animate-pulse" : "")} />
        </button>
      </form>
      {quickActions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/48">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onSelect}
              className="rounded-full border border-white/8 bg-black/20 px-3 py-2 text-white/72 transition hover:border-[#7CFF00]/18 hover:text-[#d7ffab]"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
