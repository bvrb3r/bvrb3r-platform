"use client";

import { useRef } from "react";
import { Pencil } from "lucide-react";

type PickerInput = HTMLInputElement & { showPicker?: () => void };

function openFilePicker(input: HTMLInputElement | null) {
  const picker = input as PickerInput | null;
  if (!picker) {
    return;
  }

  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return;
    } catch {
      // Browser-gated showPicker can still fail; click() remains the standard fallback.
    }
  }

  picker.click();
}

export function ProfileImageEditButton({
  label,
  disabled = false,
  onFileSelected,
  onUnavailable
}: {
  label: string;
  disabled?: boolean;
  onFileSelected?: (file: File) => void | Promise<void>;
  onUnavailable?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadEnabled = Boolean(onFileSelected);

  return (
    <>
      {uploadEnabled ? (
        <input
          ref={inputRef}
          aria-label={`${label} upload input`}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.currentTarget.value = "";
            if (file) {
              void onFileSelected?.(file);
            }
          }}
        />
      ) : null}
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className="absolute bottom-3 right-3 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-[#a3ff12] bg-[rgba(163,255,18,0.10)] text-[#a3ff12] shadow-[0_0_28px_rgba(163,255,18,0.25)] transition hover:bg-[rgba(163,255,18,0.16)] focus:outline-none focus:ring-2 focus:ring-[#a3ff12]/40 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (uploadEnabled) {
            openFilePicker(inputRef.current);
            return;
          }
          onUnavailable?.();
        }}
      >
        <Pencil className="h-5 w-5" />
      </button>
    </>
  );
}
