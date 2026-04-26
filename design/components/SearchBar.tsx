import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const SearchBar = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchBar(
  { className, ...props },
  ref
) {
  return (
    <div className={cn("bvr-search-field flex items-center gap-3 px-4 text-[var(--text-primary)]", className)}>
      <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
      <input
        ref={ref}
        className="h-full min-h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] sm:text-sm"
        {...props}
      />
    </div>
  );
});
