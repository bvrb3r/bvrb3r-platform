import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const toneMap = {
  success: {
    icon: CheckCircle2,
    className: "border-[#C4F24E]/18 bg-[#C4F24E]/8 text-white/82",
    iconClassName: "text-[#e4f9b8]"
  },
  error: {
    icon: AlertCircle,
    className: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    iconClassName: "text-rose-200"
  },
  info: {
    icon: Info,
    className: "border-white/10 bg-black/25 text-white/78",
    iconClassName: "text-[#d9f985]"
  }
} as const;

export function FeedbackBanner({
  tone = "info",
  message,
  className
}: {
  tone?: keyof typeof toneMap;
  message: string;
  className?: string;
}) {
  const Icon = toneMap[tone].icon;

  return (
    <div className={cn("rounded-[22px] border px-4 py-3 text-sm leading-6", toneMap[tone].className, className)} role={tone === "error" ? "alert" : "status"}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", toneMap[tone].iconClassName)} />
        <p>{message}</p>
      </div>
    </div>
  );
}