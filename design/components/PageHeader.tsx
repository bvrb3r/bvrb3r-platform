import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Editorial header signature: gold rule → Space Mono kicker → serif headline.
// Same API as before (label / title / subtitle / action) — purely a visual upgrade.
export function PageHeader({
  label,
  title,
  subtitle,
  action,
  className
}: {
  label?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <span className="accent-rule mb-3 block" aria-hidden="true" />
        {label ? <p className="bvr-section-label">{label}</p> : null}
        <h1 className="mt-2 font-serif text-4xl leading-[1.03] text-[var(--text-primary)] sm:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
