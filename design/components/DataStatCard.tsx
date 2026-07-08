import type { ReactNode } from "react";
import { GlassCard } from "@/design/components/GlassCard";
import { cn } from "@/lib/utils";

// Stat cards read as "money / insight" surfaces — gold accent for the premium feel.
export function DataStatCard({
  label,
  value,
  detail,
  icon,
  className
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="bvr-section-label">{label}</p>
          <div className="mt-3 break-words text-2xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-3xl">{value}</div>
          {detail ? <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{detail}</p> : null}
        </div>
        {icon ? <div className="rounded-full border border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] p-2 text-[var(--bvr-gold-bright)]">{icon}</div> : null}
      </div>
    </GlassCard>
  );
}
