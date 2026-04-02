import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClientSectionBlock({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,16,16,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          {eyebrow ? <p className="text-[10px] uppercase tracking-[0.24em] text-[#cfff93]">{eyebrow}</p> : null}
          <h2 className="mt-2 text-balance text-2xl font-semibold sm:text-3xl" data-display="true">{title}</h2>
          {subtitle ? <p className="mt-3 text-sm leading-7 text-white/62">{subtitle}</p> : null}
        </div>
        {action ? <div className="inline-flex items-center gap-2 text-sm text-white/70">{action}<ChevronRight className="h-4 w-4 text-[#baff69]" /></div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
