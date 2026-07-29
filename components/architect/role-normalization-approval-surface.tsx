"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { ActionButton, GlassCard, StatusBadge } from "@/design/components";
import {
  ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS,
  type RoleNormalizationApprovalDecision,
  type RoleNormalizationApprovalStatus
} from "@/lib/architect/role-normalization-approval";

type StatusPayload = {
  ok: boolean;
  status?: RoleNormalizationApprovalStatus;
  surfaceCommitSha?: string | null;
  error?: string;
};

function shortSha(value?: string | null) {
  return value ? value.slice(0, 12) : "unavailable";
}

export function RoleNormalizationApprovalSurface() {
  const [status, setStatus] = useState<RoleNormalizationApprovalStatus | null>(null);
  const [surfaceCommitSha, setSurfaceCommitSha] = useState<string | null>(null);
  const [decision, setDecision] = useState<RoleNormalizationApprovalDecision | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/architect/role-normalization-approval", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload = await response.json() as StatusPayload;
      if (!response.ok || !payload.status) {
        throw new Error(payload.error || "Approval status is unavailable.");
      }
      setStatus(payload.status);
      setSurfaceCommitSha(payload.surfaceCommitSha ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval status is unavailable.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const expectedConfirmation = decision
    ? ROLE_NORMALIZATION_APPROVAL_CONFIRMATIONS[decision]
    : null;

  const canSubmit = useMemo(() => Boolean(
    status
      && !status.approvalEvidencePresent
      && decision
      && reason.trim().length >= 8
      && confirmation === expectedConfirmation
      && !busy
  ), [busy, confirmation, decision, expectedConfirmation, reason, status]);

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !decision) return;

    setBusy(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/architect/role-normalization-approval", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          idempotencyKey: idempotencyKey.current,
          reason: reason.trim(),
          confirmation
        })
      });
      const payload = await response.json() as StatusPayload;
      if (!response.ok || !payload.status) {
        throw new Error(payload.error || "Approval evidence was not recorded.");
      }
      setStatus(payload.status);
      setSurfaceCommitSha(payload.surfaceCommitSha ?? null);
      setReason("");
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval evidence was not recorded.");
    } finally {
      setBusy(false);
    }
  }

  const stateTone = status?.approvalState === "approved"
    ? "green"
    : status?.approvalState === "rejected"
      ? "danger"
      : "neutral";

  return (
    <main className="px-2 pb-24 pt-4 sm:px-3 lg:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <GlassCard className="relative overflow-hidden rounded-[28px] p-5 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196,242,78,0.10),transparent_34%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[#e4f9b8]">
                <FileCheck2 className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-[0.18em]">PR 28 governance gate</span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
                Role normalization approval
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/62 sm:text-base">
                Review the redacted PR 26 dry-run packet and record one immutable approval
                or rejection against this exact deployment. This surface cannot update a
                profile, role, relationship, payment, or production workflow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={stateTone}>
                {status?.approvalState ?? (busy ? "loading" : "needs review")}
              </StatusBadge>
              <StatusBadge tone="neutral">role-normalization-v1</StatusBadge>
              <ActionButton
                type="button"
                variant="ghost"
                className="min-h-10 px-3"
                onClick={() => void loadStatus()}
                disabled={busy}
              >
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh
              </ActionButton>
            </div>
          </div>
        </GlassCard>

        {error ? (
          <div role="alert" className="rounded-[18px] border border-red-400/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Approval evidence summary">
          {[
            ["Profiles inspected", status?.approvalPacket.totalProfilesInspected],
            ["Eligible", status?.approvalPacket.eligibleCount],
            ["Blocked", status?.approvalPacket.blockedCount],
            ["No-op", status?.approvalPacket.noOpCount]
          ].map(([label, value]) => (
            <GlassCard key={String(label)} className="rounded-[22px] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{label}</p>
              <p className="mt-3 text-3xl font-black text-white">{value ?? "—"}</p>
            </GlassCard>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassCard className="rounded-[24px] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#e4f9b8]" />
              <div>
                <h2 className="text-lg font-black text-white">Connected safety proof</h2>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  The service accepts only a 10/10 certifiable aggregate packet. Rows,
                  identifiers, actor content, and profile content remain hidden.
                </p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Checks", status ? status.approvalPacket.passedCount + "/" + status.approvalPacket.checkCount : "—"],
                ["Canonical output", status?.approvalPacket.canonicalOutputOnly ? "Pass" : "Needs review"],
                ["Rollback packet", status?.approvalPacket.rollbackPacketPresent ? "Present" : "Missing"],
                ["Execution enabled", status?.executionEnabled ? "Yes" : "No"],
                ["Role mutation", status?.roleMutationExecuted ? "Executed" : "Not executed"],
                ["Surface commit", shortSha(surfaceCommitSha)]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[16px] border border-white/8 bg-black/22 p-3">
                  <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">{label}</dt>
                  <dd className="mt-1 text-sm font-bold text-white/82">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </GlassCard>

          <GlassCard className="rounded-[24px] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#e4f9b8]" />
              <div>
                <h2 className="text-lg font-black text-white">Immutable evidence state</h2>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  The private ledger is append-only and inaccessible to browser, anonymous,
                  and ordinary authenticated database roles.
                </p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3">
              <div className="flex items-center justify-between gap-4 rounded-[16px] border border-white/8 bg-black/22 p-3">
                <dt className="text-sm text-white/58">Evidence count</dt>
                <dd className="font-black text-white">{status?.evidenceCount ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[16px] border border-white/8 bg-black/22 p-3">
                <dt className="text-sm text-white/58">Latest evidence commit</dt>
                <dd className="font-mono text-xs text-white/82">{shortSha(status?.latestProductionCommitSha)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[16px] border border-white/8 bg-black/22 p-3">
                <dt className="text-sm text-white/58">Actor content exposed</dt>
                <dd className="font-black text-white">{status?.actorContentExposed ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </GlassCard>
        </section>

        <GlassCard className="rounded-[24px] p-5 sm:p-6">
          {status?.approvalEvidencePresent ? (
            <div data-testid="approval-recorded" className="flex items-start gap-3">
              {status.approvalState === "approved"
                ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#e4f9b8]" />
                : <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-300" />}
              <div>
                <h2 className="text-xl font-black text-white">
                  {status.approvalState === "approved" ? "Approval recorded" : "Rejection recorded"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  The decision is immutable. PR 29 remains a separate package and no role
                  mutation was executed here.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={submitDecision} className="grid gap-5" aria-label="Record role normalization decision">
              <div>
                <h2 className="text-xl font-black text-white">Record explicit decision</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Select a decision, provide a durable reason, and type the exact confirmation.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={decision === "approved"}
                  onClick={() => { setDecision("approved"); setConfirmation(""); }}
                  className="rounded-[18px] border border-[#C4F24E]/24 bg-[#C4F24E]/8 p-4 text-left text-white transition hover:bg-[#C4F24E]/12"
                >
                  <span className="font-black">Approve plan evidence</span>
                  <span className="mt-1 block text-sm text-white/56">Authorizes PR 29 planning only.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={decision === "rejected"}
                  onClick={() => { setDecision("rejected"); setConfirmation(""); }}
                  className="rounded-[18px] border border-red-400/22 bg-red-500/6 p-4 text-left text-white transition hover:bg-red-500/10"
                >
                  <span className="font-black">Reject plan evidence</span>
                  <span className="mt-1 block text-sm text-white/56">Keeps execution blocked.</span>
                </button>
              </div>

              <label className="grid gap-2 text-sm font-bold text-white/72">
                Decision reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={8}
                  maxLength={1000}
                  rows={4}
                  className="rounded-[16px] border border-white/12 bg-black/28 px-4 py-3 text-white outline-none focus:border-[#C4F24E]/42"
                  placeholder="Explain why this aggregate plan should proceed or remain blocked."
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-white/72">
                Exact confirmation
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="rounded-[16px] border border-white/12 bg-black/28 px-4 py-3 font-mono text-sm text-white outline-none focus:border-[#C4F24E]/42"
                  placeholder={expectedConfirmation ?? "Select approve or reject first"}
                  autoComplete="off"
                />
              </label>

              {expectedConfirmation ? (
                <p className="text-xs text-white/50">
                  Type exactly: <code className="text-[#e4f9b8]">{expectedConfirmation}</code>
                </p>
              ) : null}

              <ActionButton
                type="submit"
                variant={decision === "rejected" ? "danger" : "primary"}
                disabled={!canSubmit}
              >
                {busy ? "Recording immutable evidence…" : decision ? "Record " + decision + " evidence" : "Select a decision"}
              </ActionButton>
            </form>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
