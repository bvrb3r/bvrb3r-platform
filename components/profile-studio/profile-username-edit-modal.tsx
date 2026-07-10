"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const RESERVED_HANDLES = new Set([
  "admin",
  "support",
  "bvrb3r",
  "help",
  "payments",
  "system",
  "official",
  "login",
  "signup",
  "dashboard",
  "api",
  "client",
  "barber",
  "shop",
  "owner",
  "architect",
  "settings",
  "profile",
  "public"
]);

export function validateProfileHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Add a public username to save.";
  }
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    return "Use lowercase letters, numbers, hyphens, or underscores.";
  }
  if (RESERVED_HANDLES.has(trimmed)) {
    return "This username is reserved.";
  }
  return null;
}

export function ProfileUsernameEditModal({
  title,
  helper,
  value,
  isSaving = false,
  isSaved = false,
  saveError,
  availabilityMessage,
  availabilityTone = "success",
  saveDisabledReason,
  onChange,
  onClose,
  onSave
}: {
  title: string;
  helper: string;
  value: string;
  isSaving?: boolean;
  isSaved?: boolean;
  saveError?: string | null;
  availabilityMessage?: string | null;
  availabilityTone?: "success" | "warning";
  saveDisabledReason?: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const error = validateProfileHandle(value);
  const canSave = !error && !saveDisabledReason && !isSaving && !isSaved;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/72 px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl sm:items-center sm:py-5" role="dialog" aria-modal="true" aria-labelledby="profile-username-modal-title">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-[22px] border border-white/12 bg-[#070807]/95 shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
          <div>
            <p className="bvr-section-label">Public link</p>
            <h2 id="profile-username-modal-title" className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{helper}</p>
          </div>
          <button
            type="button"
            aria-label="Close username editor"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/72 transition hover:border-[#c4f24e]/30 hover:text-white"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <label className="block text-sm font-bold text-white/72">
            Username
            <input
              aria-label="Public username"
              value={value}
              onChange={(event) => onChange(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, ""))}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="text"
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-base font-black text-white outline-none transition placeholder:text-white/34 focus:border-[#c4f24e]/42"
              placeholder="public-username"
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-white/48">
            Lowercase letters, numbers, hyphens, or underscores. No spaces.
          </p>
          {saveError ? (
            <p className="mt-2 text-xs font-bold text-red-200">{saveError}</p>
          ) : isSaved ? (
            <p className="mt-2 text-xs font-bold text-[#c4f24e]">Username saved.</p>
          ) : error || saveDisabledReason ? (
            <p className="mt-2 text-xs font-bold text-yellow-200">{error ?? saveDisabledReason}</p>
          ) : availabilityMessage ? (
            <p className={`mt-2 text-xs font-bold ${availabilityTone === "warning" ? "text-yellow-200" : "text-[#c4f24e]"}`}>{availabilityMessage}</p>
          ) : (
            <p className="mt-2 text-xs font-bold text-[#c4f24e]">Username ready.</p>
          )}
        </div>

        <div className="shrink-0 border-t border-white/8 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] px-5 text-sm font-black text-white/72 transition hover:border-white/20 hover:text-white"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[8px] bg-[#c4f24e] px-5 text-sm font-black text-[#050505] transition hover:bg-[#e4f9b8] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#050505]/36 bvr-on-green"
            onClick={() => void onSave(value.trim())}
          >
            {isSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
