"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, LockKeyhole, Settings2 } from "lucide-react";
import type { MoreSettingModalSpec } from "@/components/dashboard/more/more-setting-modal-registry";
import { cn } from "@/lib/utils";

type MoreHref = string;

function modeLabel(mode: MoreSettingModalSpec["mode"]) {
  switch (mode) {
    case "editable":
      return "Editable setting";
    case "read_only":
      return "Read-only detail";
    case "requirements":
      return "Requirements";
    case "coming_soon":
      return "Focused setup";
  }
}

export function MoreSettingModalContent({
  spec,
  href,
  dirty,
  onDirtyChange
}: {
  spec: MoreSettingModalSpec;
  href?: MoreHref;
  dirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const isLocked = spec.mode === "requirements";
  const isEditable = spec.mode === "editable";

  return (
    <div className="space-y-5">
      <div className={cn(
        "rounded-[22px] border p-4",
        isLocked ? "border-amber-300/20 bg-amber-300/[0.06]" : "border-white/10 bg-white/[0.035]"
      )}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
            {isLocked ? <LockKeyhole className="h-5 w-5" aria-hidden="true" /> : <Settings2 className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white">{modeLabel(spec.mode)}</p>
            <p className="mt-1 text-sm leading-6 text-white/56">{spec.helper}</p>
            {spec.statusLabel ? <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-[#A3FF12]">{spec.statusLabel}</p> : null}
          </div>
        </div>
      </div>

      {spec.lockedReason ? (
        <div className="rounded-[18px] border border-amber-300/18 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-100/84">
          {spec.lockedReason}
        </div>
      ) : null}

      {spec.requirements?.length ? (
        <div className="space-y-3 rounded-[22px] border border-white/10 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Requirements</p>
          <div className="grid gap-2">
            {spec.requirements.map((requirement) => (
              <div key={requirement} className="flex items-center gap-3 text-sm text-white/64">
                <CheckCircle2 className="h-4 w-4 text-white/30" aria-hidden="true" />
                <span>{requirement}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isEditable ? (
        <label className="block rounded-[22px] border border-white/10 bg-black/24 p-4">
          <span className="text-sm font-extrabold text-white">Enable this preference</span>
          <span className="mt-1 block text-sm leading-6 text-white/52">Changes are held until Save Changes is selected.</span>
          <input
            type="checkbox"
            className="mt-4 h-5 w-5 accent-[#A3FF12]"
            checked={dirty}
            onChange={(event) => onDirtyChange(event.target.checked)}
          />
        </label>
      ) : null}

      {href ? (
        <Link
          href={href as never}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
        >
          Open attached destination
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}

      {spec.mode === "coming_soon" ? (
        <p className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/54">
          This focused control is being prepared. No changes were saved.
        </p>
      ) : null}
    </div>
  );
}
