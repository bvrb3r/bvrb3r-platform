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
        tone === "green" && "border border-[rgba(163,255,18,0.25)] bg-[rgba(163,255,18,0.12)] text-[#a3ff12]",
        tone === "neutral" && "border border-white/10 bg-white/[0.06] text-[#c7c7c7]",
        tone === "danger" && "border border-red-400/25 bg-red-500/10 text-[#ff4d4d]",
        className
      )}
      {...props}
    />
  );
}
