"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Snapshot = {
  mission: string;
  generatedAt: string;
  reconciliationDeltaCents: number;
  checkCount: number;
  passedCount: number;
  certifiable: boolean;
  checks: Array<{ key: string; passed: boolean; detail: string }>;
};

type ReleaseCertificate = {
  id: string;
  commitSha: string;
  deploymentId: string;
  reconciliationDeltaCents: number;
  issuedAt: string;
};

export function ArchitectRentConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [certificate, setCertificate] = useState<ReleaseCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/architect/pr22-release", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as Snapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load release truth.");
      setSnapshot(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load release truth.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const issueCertificate = useCallback(async () => {
    setIssuing(true);
    setError(null);
    try {
      const response = await fetch("/api/architect/pr22-release", {
        method: "POST",
        cache: "no-store"
      });
      const body = await response.json().catch(() => ({})) as ReleaseCertificate & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to issue the release certificate.");
      setCertificate(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to issue the release certificate.");
    } finally {
      setIssuing(false);
    }
  }, []);

  return (
    <div className="space-y-5" data-testid="architect-rent-console">
      <section className="rounded-[34px] border border-white/10 bg-[#080a08] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#C4F24E]">
              Lifecycle validation · {snapshot?.passedCount ?? 0} of {snapshot?.checkCount ?? 12} systems green
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-white sm:text-7xl" data-display="true">
              {snapshot?.certifiable ? "All systems green." : "One system needs eyes."}
            </h1>
          </div>
          <Button type="button" variant="secondary" className="rounded-full" disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-run checks
          </Button>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <span className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/58">
            Reconciliation ${((snapshot?.reconciliationDeltaCents ?? 0) / 100).toFixed(2)}
          </span>
          <span className={`rounded-full border px-4 py-2 text-xs ${
            snapshot?.certifiable
              ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#e3ffad]"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100"
          }`}>
            {snapshot?.certifiable ? "Certificate gate open" : "Certificate gate closed"}
          </span>
        </div>
      </section>

      {error ? (
        <div className="rounded-[22px] border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100" role="alert">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(snapshot?.checks ?? []).map((check) => (
          <article key={check.key} className={`rounded-[24px] border p-5 ${
            check.passed
              ? "border-[#C4F24E]/18 bg-[#C4F24E]/5"
              : "border-amber-300/25 bg-amber-300/7"
          }`}>
            {check.passed
              ? <CheckCircle2 className="h-5 w-5 text-[#C4F24E]" />
              : <AlertTriangle className="h-5 w-5 text-amber-200" />}
            <h2 className="mt-4 font-semibold capitalize text-white">{check.key.replaceAll("_", " ")}</h2>
            <p className="mt-2 text-xs leading-6 text-white/48">{check.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/20 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[#C4F24E]" />
          <div>
            <h2 className="font-semibold text-white">Release certificate policy</h2>
            <p className="mt-1 text-xs leading-6 text-white/48">
              A certificate can be issued only when all 12 checks pass, the two rent ledgers reconcile to exactly $0.00, and the certificate is bound to the deployed commit and deployment ID.
            </p>
          </div>
          </div>
          <Button
            type="button"
            className="rounded-full bg-[#C4F24E] text-black hover:bg-[#d7ff75]"
            disabled={!snapshot?.certifiable || issuing}
            onClick={() => void issueCertificate()}
          >
            {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Issue deployment certificate
          </Button>
        </div>
        {certificate ? (
          <div className="mt-5 rounded-[20px] border border-[#C4F24E]/20 bg-[#C4F24E]/8 p-4 text-xs text-[#e3ffad]">
            <p className="font-semibold">Certificate issued · {new Date(certificate.issuedAt).toLocaleString()}</p>
            <p className="mt-2 break-all font-mono text-[#e3ffad]/70">{certificate.commitSha}</p>
            <p className="mt-1 break-all font-mono text-[#e3ffad]/70">{certificate.deploymentId}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
