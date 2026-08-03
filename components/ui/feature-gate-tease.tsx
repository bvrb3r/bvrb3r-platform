import { BarChart3, Sparkles } from "lucide-react";
import {
  RegisteredFeatureGate
} from "@/components/ui/feature-gate";
import type { FeatureGateKey, FeatureGateScale } from "@/lib/feature-gates";
import { cn } from "@/lib/utils";

type FeatureGateTeaseProps = {
  gateKey: FeatureGateKey;
  label: string;
  eyebrow?: string;
  detail?: string;
  scale?: FeatureGateScale;
  className?: string;
  reasonCopy?: string;
};

export function FeatureGateTease({
  gateKey,
  label,
  eyebrow = "Next layer",
  detail = "This surface will use verified live data when the door opens.",
  scale = "card",
  className,
  reasonCopy
}: FeatureGateTeaseProps) {
  return (
    <RegisteredFeatureGate
      gateKey={gateKey}
      scale={scale}
      label={label}
      reasonCopy={reasonCopy}
      className={cn("rounded-[22px]", className)}
    >
      <section className={cn(
        "h-full w-full rounded-[inherit] border border-white/10 bg-white/[0.025] text-left text-white",
        scale === "card" ? "min-h-[180px] p-5" : scale === "row" ? "min-h-16 p-4" : "min-h-11 px-4 py-2"
      )}>
        {scale === "button" ? (
          <button type="button" className="flex h-full w-full items-center justify-center gap-2 text-xs font-bold">
            <Sparkles className="h-4 w-4" />
            {label}
          </button>
        ) : (
          <div className={cn("flex h-full", scale === "card" ? "flex-col" : "items-center gap-4")}>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#D9B461]">{eyebrow}</p>
              <h3 className={cn("font-bold text-white", scale === "card" ? "mt-2 text-xl" : "text-sm")}>{label}</h3>
              <p className={cn("text-white/48", scale === "card" ? "mt-2 text-xs leading-5" : "mt-1 text-[11px]")}>{detail}</p>
            </div>
            {scale === "card" ? (
              <div className="mt-auto flex h-16 items-end gap-2 pt-5" aria-hidden="true">
                {[38, 64, 46, 78, 58, 88, 70].map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="w-full rounded-t bg-white/10"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            ) : (
              <BarChart3 className="h-5 w-5 shrink-0 text-white/26" />
            )}
          </div>
        )}
      </section>
    </RegisteredFeatureGate>
  );
}
