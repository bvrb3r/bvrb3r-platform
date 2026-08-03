"use client";

import { useId, useState } from "react";
import { Flag, ShieldBan, X } from "lucide-react";
import {
  buildPr31ReportDetails,
  PR31_REPORT_REASON_OPTIONS,
  type Pr31ReportReason,
  type Pr31ReportSource,
  toTrustReportCategory
} from "@/lib/trust/product-pr31-report-block";

type ReportReceipt = {
  reference?: string;
  report?: { id?: string };
  error?: string;
};

async function postJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({})) as ReportReceipt;
  if (!response.ok) {
    throw new Error(body.error ?? "This safety action could not be completed.");
  }
  return body;
}

export function ReportBlockSheet({
  targetProfileId,
  targetLabel,
  postId,
  reviewId,
  source,
  canBlock = Boolean(targetProfileId),
  triggerLabel = "Report",
  triggerClassName,
  onBlocked
}: {
  targetProfileId?: string | null;
  targetLabel: string;
  postId?: string | null;
  reviewId?: string | null;
  source: Pr31ReportSource;
  canBlock?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
  onBlocked?: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Pr31ReportReason>("spam");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [busy, setBusy] = useState<"report" | "block" | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setConfirmBlock(false);
    setError(null);
  }

  async function submitReport() {
    setBusy("report");
    setError(null);
    try {
      const details = buildPr31ReportDetails({ reason, source, evidenceDescription });
      const body = reviewId
        ? await postJson("/api/trust/reports", {
            subjectType: "review",
            subjectId: reviewId,
            category: toTrustReportCategory(reason),
            details
          })
        : await postJson("/api/culture/safety-controls", {
            action: "report",
            reportedProfileId: targetProfileId,
            postId: postId ?? null,
            reason,
            evidenceDescription: evidenceDescription.trim() || null,
            sourceSurface: source
          });
      setReceipt(body.reference ?? body.report?.id ?? "received");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This report could not be submitted.");
    } finally {
      setBusy(null);
    }
  }

  async function blockAccount() {
    if (!targetProfileId) return;
    setBusy("block");
    setError(null);
    try {
      await postJson("/api/culture/safety-controls", {
        action: "block",
        targetProfileId,
        active: true,
        reason: `Blocked from ${source}.`
      });
      setReceipt((current) => current ?? "blocked");
      setConfirmBlock(false);
      onBlocked?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This account could not be blocked.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReceipt(null);
          setError(null);
        }}
        className={triggerClassName ?? "inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/8 px-3 text-xs font-black uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-500/14"}
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/76 p-3 backdrop-blur-sm sm:items-center" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/12 bg-[#080908] p-5 text-white shadow-[0_32px_100px_rgba(0,0,0,0.72)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c4f24e]">Safety control</p>
                <h2 id={titleId} className="mt-2 text-2xl font-black">Report {targetLabel}</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">Choose one reason. Reports create a moderation case and never silently remove content.</p>
              </div>
              <button type="button" onClick={close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/64" aria-label="Close safety controls">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {receipt ? (
              <div className="mt-6 rounded-[18px] border border-[#c4f24e]/25 bg-[#c4f24e]/8 p-4">
                <p className="font-black text-[#e4f9b8]">Report received</p>
                <p className="mt-2 text-sm leading-6 text-white/62">Reference {receipt}. We review within 24h. You can also block this account immediately.</p>
              </div>
            ) : (
              <>
                <fieldset className="mt-6 grid gap-2">
                  <legend className="mb-2 text-sm font-black">What happened?</legend>
                  {PR31_REPORT_REASON_OPTIONS.map((option) => (
                    <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-white/78">
                      <input
                        type="radio"
                        name={`report-reason-${titleId}`}
                        value={option.value}
                        checked={reason === option.value}
                        onChange={() => setReason(option.value)}
                        className="accent-[#c4f24e]"
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>
                <label className="mt-5 block text-sm font-black">
                  Evidence description <span className="font-normal text-white/42">(optional)</span>
                  <textarea
                    value={evidenceDescription}
                    onChange={(event) => setEvidenceDescription(event.target.value)}
                    maxLength={2000}
                    placeholder="Describe what happened. Do not include passwords or payment-card details."
                    className="mt-2 min-h-28 w-full resize-y rounded-[16px] border border-white/10 bg-black/38 px-3 py-3 text-sm font-normal text-white outline-none placeholder:text-white/30 focus:border-[#c4f24e]/40"
                  />
                </label>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void submitReport()}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#c4f24e] px-5 text-sm font-black text-black disabled:opacity-50"
                >
                  {busy === "report" ? "Submitting…" : "Submit report"}
                </button>
              </>
            )}

            {canBlock && targetProfileId ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                {confirmBlock ? (
                  <div className="rounded-[16px] border border-red-400/20 bg-red-500/8 p-4">
                    <p className="text-sm font-black text-red-100">Block {targetLabel}?</p>
                    <p className="mt-1 text-xs leading-5 text-white/54">You will no longer see each other in public discovery or messaging. You can undo this in Settings → Privacy.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={Boolean(busy)} onClick={() => void blockAccount()} className="min-h-10 rounded-full bg-red-200 px-4 text-xs font-black text-red-950 disabled:opacity-50">
                        {busy === "block" ? "Blocking…" : "Confirm block"}
                      </button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => setConfirmBlock(false)} className="min-h-10 rounded-full border border-white/10 px-4 text-xs font-black text-white/62">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmBlock(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-red-400/20 text-xs font-black uppercase tracking-[0.12em] text-red-100">
                    <ShieldBan className="h-4 w-4" aria-hidden="true" />
                    Block account
                  </button>
                )}
              </div>
            ) : null}

            {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-100">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
