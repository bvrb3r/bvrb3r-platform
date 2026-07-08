import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StatusBadge({
  tone = "green",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "green" | "neutral" | "danger" }) {
  return (
    <span
      className={cn(
        "bvr-status-badge",
        tone === "green" && "border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] text-[var(--bvr-green-bright)]",
        tone === "neutral" && "border border-white/10 bg-white/[0.06] text-[var(--text-secondary)]",
        tone === "danger" && "border border-[#f0563c]/30 bg-[#f0563c]/12 text-[#f0563c]",
        className
      )}
      {...props}
    />
  );
}
