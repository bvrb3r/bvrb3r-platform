"use client";

import { useCallback, useEffect, useRef } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import type { KioskCopy } from "@/lib/kiosk/locale";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

/**
 * Staff PIN prompt shown over every kiosk surface.
 *
 * This is the one escape hatch out of a locked-down public device, so its
 * keyboard contract has to be exact: focus lands inside the dialog on open,
 * Tab cannot wander back to the kiosk behind it, Escape dismisses it, and
 * dismissing returns focus to the control that opened it. The trigger is
 * captured at mount — the dialog only mounts while it is open, and React has
 * not moved focus yet at that point, so `document.activeElement` is still the
 * button the client or staff member just pressed.
 */
export function KioskExitDialog({
  copy,
  pin,
  onPinChange,
  pinError,
  isPending,
  onCancel,
  onSubmit
}: {
  copy: KioskCopy;
  pin: string;
  onPinChange: (value: string) => void;
  pinError: string | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pinInputRef.current?.focus();

    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiosk-exit-title"
      aria-describedby="kiosk-exit-description"
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      <div className="w-full max-w-md rounded-[26px] border border-white/10 bg-[#0b0c0d] p-6">
        <h2 id="kiosk-exit-title" className="font-serif text-3xl">{copy.staffExit}</h2>
        <p id="kiosk-exit-description" className="mt-2 text-sm text-white/45">{copy.staffExitHint}</p>
        <div className="mt-5">
          <Input
            ref={pinInputRef}
            aria-label={copy.pinLabel}
            value={pin}
            onChange={(event) => onPinChange(event.target.value)}
            placeholder={copy.pinPlaceholder}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        {pinError ? <div className="mt-4"><FeedbackBanner tone="error" message={pinError} /></div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#f5f1e8] transition hover:border-white/30 motion-reduce:transition-none"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            disabled={!pin || isPending}
            onClick={onSubmit}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c4f24e] px-6 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[#050505] transition hover:brightness-105 disabled:opacity-40 motion-reduce:transition-none"
          >
            {isPending ? copy.checking : copy.exit}
          </button>
        </div>
      </div>
    </div>
  );
}
