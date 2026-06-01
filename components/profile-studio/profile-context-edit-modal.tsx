"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type ProfileContextField = {
  name: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
};

export function ProfileContextEditModal({
  title,
  helper,
  fields,
  isSaving,
  onClose,
  onSave
}: {
  title: string;
  helper: string;
  fields: ProfileContextField[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.value]))
  );
  const [error, setError] = useState<string | null>(null);
  const [localSaving, setLocalSaving] = useState(false);
  const saving = Boolean(isSaving || localSaving);

  useEffect(() => {
    setDraft(Object.fromEntries(fields.map((field) => [field.name, field.value])));
  }, [fields]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleSave() {
    const nextValues = Object.fromEntries(
      fields.map((field) => [field.name, (draft[field.name] ?? "").trim()])
    );
    const tooLong = fields.find((field) => (nextValues[field.name] ?? "").length > (field.maxLength ?? 120));
    if (tooLong) {
      setError(`${tooLong.label} is too long.`);
      return;
    }
    setError(null);
    setLocalSaving(true);
    try {
      await onSave(nextValues);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "Unable to update public context.");
    } finally {
      setLocalSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-black/72 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-md sm:items-center sm:py-6">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[calc(100dvh-3rem-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-[#a3ff12]/24 bg-[#080808] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a3ff12]">Public context</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/58">{helper}</p>
          </div>
          <button type="button" aria-label="Close context editor" className="rounded-full border border-white/10 p-2 text-white/70" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.name} className={field.name === "address" ? "sm:col-span-2" : ""}>
                <span className="block text-sm font-bold text-white/72">{field.label}</span>
                <input
                  value={draft[field.name] ?? ""}
                  maxLength={field.maxLength ?? 120}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, [field.name]: event.target.value }));
                    setError(null);
                  }}
                  className="mt-2 h-12 w-full rounded-[12px] border border-white/10 bg-black/35 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#a3ff12]/50"
                  placeholder={field.placeholder}
                  disabled={saving}
                />
              </label>
            ))}
          </div>
          {error ? <p className="mt-3 text-sm font-bold text-red-200">{error}</p> : null}
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-white/10 bg-[#080808]/96 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
          <button type="button" className="min-h-11 rounded-[8px] border border-white/10 px-4 text-sm font-extrabold text-white/70" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="min-h-11 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
