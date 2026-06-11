"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { MoreSettingModalContent } from "@/components/dashboard/more/more-setting-modal-content";
import type { MoreSettingModalSpec } from "@/components/dashboard/more/more-setting-modal-registry";
import { cn } from "@/lib/utils";

export function MoreSettingModal({
  open,
  spec,
  href,
  onClose,
  onSave,
  onSaved,
  primaryLabel = "Save Changes",
  primaryEnabled = false,
  footerPrimary,
  children,
  closeLabel = "Close setting modal",
  testId,
  maxWidthClassName = "max-w-2xl",
  bodyClassName
}: {
  open: boolean;
  spec: MoreSettingModalSpec | null;
  href?: string;
  onClose: () => void;
  onSave?: (payload?: Record<string, unknown>) => Promise<void> | void;
  onSaved?: () => void;
  primaryLabel?: string;
  primaryEnabled?: boolean;
  footerPrimary?: ReactNode;
  children?: ReactNode;
  closeLabel?: string;
  testId?: string;
  maxWidthClassName?: string;
  bodyClassName?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirmDiscard(false);
      setIsSaving(false);
      setError(null);
      setPayload({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      setPortalRoot(null);
      return;
    }

    setPortalRoot(document.body);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, (window.innerWidth ?? 0) - document.documentElement.clientWidth);
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  if (!open || !spec) {
    return null;
  }

  const canSave = Boolean(onSave) && (primaryEnabled || (spec.mode === "editable" && dirty));

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
      await onSave?.(payload);
      setDirty(false);
      onSaved?.();
      onClose();
    } catch {
      setError("Couldn't save this setting. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-black/76 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 backdrop-blur-xl sm:items-center sm:p-6"
      role="presentation"
      data-testid="more-setting-modal-backdrop"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-setting-modal-title"
        data-testid={testId ?? "more-setting-modal-panel"}
        className={cn(
          "relative z-[10000] flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(3,3,3,0.99))] text-white shadow-[0_24px_80px_rgba(0,0,0,0.62)]",
          maxWidthClassName
        )}
      >
        <div className="sticky top-0 z-20 border-b border-white/10 bg-black/80 p-5 backdrop-blur-xl sm:p-6">
          <button
            type="button"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/70 hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
            onClick={requestClose}
            aria-label={closeLabel}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="pr-12 text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">{spec.eyebrow}</p>
          <h2 id="more-setting-modal-title" className="mt-2 pr-12 text-3xl font-black tracking-[-0.045em] text-white">{spec.title}</h2>
          <p className="mt-2 max-w-xl pr-12 text-sm leading-6 text-white/58">{spec.helper}</p>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto p-5 sm:p-6", bodyClassName)}>
          {children ?? <MoreSettingModalContent spec={spec} href={href} dirty={dirty} onDirtyChange={setDirty} onPayloadChange={setPayload} />}
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

        <footer
          className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-white/10 bg-black/86 p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:flex-row sm:justify-end sm:p-5"
          data-testid="more-setting-modal-footer"
        >
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

  return portalRoot ? createPortal(modal, portalRoot) : modal;
}
