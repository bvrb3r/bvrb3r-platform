"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function ProfileBioEditModal({
  title,
  helper,
  value,
  isSaving,
  onClose,
  onSave
}: {
  title: string;
  helper: string;
  value: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function handleSave() {
    const next = draft.trim();
    if (next.length > 300) {
      setError("Keep public bios under 300 characters.");
      return;
    }
    setError(null);
    await onSave(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-6 backdrop-blur-md sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-[24px] border border-[#a3ff12]/24 bg-[#080808] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a3ff12]">Public bio</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/58">{helper}</p>
          </div>
          <button type="button" aria-label="Close bio editor" className="rounded-full border border-white/10 p-2 text-white/70" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-5 block text-sm font-bold text-white/72" htmlFor="profile-public-bio">Public bio</label>
        <textarea
          id="profile-public-bio"
          value={draft}
          rows={5}
          maxLength={300}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          className="mt-2 w-full resize-none rounded-[14px] border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-[#a3ff12]/50"
          placeholder="Add a public bio."
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold">
          <span className={error ? "text-red-200" : "text-white/38"}>{error ?? `${draft.trim().length}/300`}</span>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" className="min-h-11 rounded-[8px] border border-white/10 px-4 text-sm font-extrabold text-white/70" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="button" className="min-h-11 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
