"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

export function AppIdShareButton({ scanUrl, disabled }: { scanUrl: string | null; disabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function share() {
    if (!scanUrl || disabled) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "BVRB3R App ID",
          text: "Open my signed BVRB3R App ID.",
          url: scanUrl
        });
        setStatus("shared");
      } else {
        await navigator.clipboard.writeText(scanUrl);
        setStatus("copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("failed");
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={!scanUrl || disabled}
        onClick={() => void share()}
        className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#C4F24E]/35 bg-[#C4F24E]/[0.06] px-5 text-sm font-bold text-[#C4F24E] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share
      </button>
      <p className="mt-2 text-center text-[11px] text-white/48" aria-live="polite">
        {status === "shared" ? "Shared" : status === "copied" ? "Secure scan link copied" : status === "failed" ? "Sharing failed" : ""}
      </p>
    </div>
  );
}
