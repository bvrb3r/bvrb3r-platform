import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  active = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div
      className={cn(
        "bvr-glass-card min-w-0 transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(163,255,18,0.25)]",
        active && "bvr-glass-card-active",
        className
      )}
      {...props}
    />
  );
}
