import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClientSectionBlock({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className,
  bare = false
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <section className={cn(bare ? "" : "bvr-glass-card rounded-[28px] p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          {eyebrow ? <p className="bvr-section-label">{eyebrow}</p> : null}
          <h2 className="mt-2 text-balance text-2xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-3xl" data-display="true">{title}</h2>
          {subtitle ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p> : null}
        </div>
        {action ? <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">{action}<ChevronRight className="h-4 w-4 text-[#d9f985]" /></div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
