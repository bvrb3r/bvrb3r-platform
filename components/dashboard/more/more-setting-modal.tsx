"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { MoreSettingModalContent } from "@/components/dashboard/more/more-setting-modal-content";
import type { MoreSettingModalSpec } from "@/components/dashboard/more/more-setting-modal-registry";
import { cn } from "@/lib/utils";

export function MoreSettingModal({
  open,
  spec,
  href,
  onClose,
  onSaved,
  primaryLabel = "Save Changes",
  primaryEnabled = false,
  footerPrimary
}: {
  open: boolean;
  spec: MoreSettingModalSpec | null;
  href?: string;
  onClose: () => void;
  onSaved?: () => void;
  primaryLabel?: string;
  primaryEnabled?: boolean;
  footerPrimary?: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirmDiscard(false);
      setIsSaving(false);
      setError(null);
    }
  }, [open]);

  if (!open || !spec) {
    return null;
  }

  const canSave = primaryEnabled || (spec.mode === "editable" && dirty);

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }

    onClose();
  }

  async function handleSave() {
    if (!canSave || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 180));
      setDirty(false);
      onSaved?.();
      onClose();
    } catch {
      setError("Couldn’t save this setting. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/72 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-6 backdrop-blur-md sm:items-center sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-setting-modal-title"
        className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(3,3,3,0.99))] text-white shadow-[0_24px_80px_rgba(0,0,0,0.62)]"
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-black/80 p-5 backdrop-blur-xl sm:p-6">
          <button
            type="button"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/70 hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
            onClick={requestClose}
            aria-label="Close setting modal"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="pr-12 text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">{spec.eyebrow}</p>
          <h2 id="more-setting-modal-title" className="mt-2 pr-12 text-3xl font-black tracking-[-0.045em] text-white">{spec.title}</h2>
          <p className="mt-2 max-w-xl pr-12 text-sm leading-6 text-white/58">{spec.helper}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <MoreSettingModalContent spec={spec} href={href} dirty={dirty} onDirtyChange={setDirty} />
          {confirmDiscard ? (
            <div className="mt-5 rounded-[18px] border border-amber-300/20 bg-amber-300/[0.06] p-4">
              <p className="text-sm font-extrabold text-amber-100">Discard unsaved changes?</p>
              <p className="mt-1 text-sm leading-6 text-amber-100/70">Your edits in this modal will not be saved.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="min-h-11 rounded-full border border-white/10 px-4 text-sm font-extrabold text-white/70" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
                <button type="button" className="min-h-11 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-extrabold text-amber-100" onClick={onClose}>Discard changes</button>
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-4 rounded-[18px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</p> : null}
        </div>

        <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-white/10 bg-black/86 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] backdrop-blur-xl sm:flex-row sm:justify-end sm:p-5">
          <button
            type="button"
            className="min-h-12 rounded-full border border-white/10 bg-white/[0.035] px-5 text-sm font-extrabold text-white/74 hover:border-white/20"
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          {footerPrimary ?? (
            <button
              type="button"
              className={cn(
                "min-h-12 rounded-full border px-5 text-sm font-extrabold",
                canSave ? "border-[#A3FF12]/45 bg-[#A3FF12] text-black hover:bg-[#8de300]" : "border-white/10 bg-white/[0.04] text-white/34"
              )}
              onClick={() => void handleSave()}
              disabled={!canSave || isSaving}
              aria-disabled={!canSave || isSaving}
            >
              {isSaving ? "Saving..." : primaryLabel}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
