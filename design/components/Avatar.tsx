import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  alt,
  initials,
  className
}: {
  src?: string | null;
  alt: string;
  initials?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[linear-gradient(135deg,var(--bvr-green-soft),rgba(12,12,12,0.96))] text-sm font-extrabold text-[var(--bvr-green-bright)]",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover contrast-[1.05] saturate-[0.95]" />
      ) : initials ? (
        initials
      ) : (
        <UserRound className="h-5 w-5" aria-hidden="true" />
      )}
    </div>
  );
}
