"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function RoadReferralCode({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyCode() {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="min-h-12 flex-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 font-mono text-sm tracking-[0.16em] text-[var(--text-primary)]">
        {code ?? "Code preparing from server truth"}
      </code>
      <button
        type="button"
        disabled={!code}
        onClick={() => void copyCode()}
        className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#C4F24E]/35 bg-[#C4F24E]/10 px-5 text-xs font-bold text-[#C4F24E] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied ✓" : copyFailed ? "Copy failed" : "Copy code"}
      </button>
    </div>
  );
}
