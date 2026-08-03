"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";
import {
  buildOwnerReportPack,
  buildOwnerReportPackCsv,
  type OwnerReportRange
} from "@/lib/rent/report-domain";
import { cn } from "@/lib/utils";

export function OwnerReportPack({ shopIds }: { shopIds: string[] }) {
  const uniqueShopIds = useMemo(
    () => [...new Set(shopIds.filter(Boolean))],
    [shopIds]
  );
  const [shopId, setShopId] = useState(uniqueShopIds[0] ?? "");
  const [range, setRange] = useState<OwnerReportRange>("weekly");
  const [payload, setPayload] = useState<OwnerOperationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/owner/operations?shopId=${encodeURIComponent(shopId)}`, {
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as OwnerOperationsResponse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Reports could not load.");
    setPayload(body);
  }, [shopId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Reports could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const reports = useMemo(
    () => payload ? buildOwnerReportPack(payload, range) : [],
    [payload, range]
  );

  function exportAll() {
    if (!reports.length) return;
    const blob = new Blob([buildOwnerReportPackCsv(reports, range)], {
      type: "text/csv;charset=utf-8"
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bvrb3r-report-pack-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
    setExported(true);
  }

  return (
    <main className="min-h-screen bg-[#060708] px-4 py-5 text-[#F5F1E8] sm:px-7" data-screen-label="Owner Report Pack">
      <header className="mx-auto max-w-7xl border-b border-white/8 pb-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">
              Shop owner · Operational reports
            </p>
            <h1 className="mt-3 text-5xl font-normal tracking-[-0.045em] sm:text-6xl" data-display="true">
              Reports.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/46">
              Sixteen shop-safe views · booth rent and operational counts only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {uniqueShopIds.length > 1 ? (
              <select
                value={shopId}
                onChange={(event) => setShopId(event.target.value)}
                aria-label="Choose one shop"
                className="min-h-11 rounded-full border border-white/12 bg-black px-4 text-xs"
              >
                {uniqueShopIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            ) : null}
            {(["daily", "weekly", "monthly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRange(value);
                  setExported(false);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.14em]",
                  range === value
                    ? "border-[#C4F24E]/40 bg-[#C4F24E]/10 text-[#E4F9B8]"
                    : "border-white/10 text-white/42"
                )}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              onClick={exportAll}
              disabled={!reports.length}
              className="flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/35 px-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#C4F24E] disabled:opacity-35"
            >
              <Download className="h-4 w-4" />
              {exported ? "Exported ✓" : "Export pack (CSV)"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-white/45"
              aria-label="Refresh reports"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-7xl">
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <FeatureGateTease
            gateKey="owner.analytics.forecasting"
            label="Forecasting"
            eyebrow="Owner analytics"
            detail="Forecast operating demand from shop-safe counts without importing barber earnings or tips."
          />
          <FeatureGateTease
            gateKey="owner.reports.custom_builder"
            label="Custom report builder"
            eyebrow="Reports"
            detail="Compose Pro reports from approved shop-operational measures and rent-only money fields."
          />
        </div>
        {loading ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#C4F24E]" aria-label="Loading reports" />
          </div>
        ) : null}
        {error ? (
          <GlobalSafetyState
            state="failed"
            detail={error}
            actionLabel="Retry reports"
            onAction={() => void load()}
          />
        ) : null}
        {!loading && !error ? (
          <section className="grid gap-px overflow-hidden rounded-[24px] border border-white/8 bg-white/8 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((report) => (
              <article key={report.id} className="min-h-44 bg-[#090A0B] p-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">
                    {report.label}
                  </p>
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/28">
                    {report.ownership}
                  </span>
                </div>
                <p className="mt-6 text-4xl tracking-[-0.04em] text-white" data-display="true">
                  {report.value}
                </p>
                <p className="mt-3 text-xs leading-5 text-white/42">{report.detail}</p>
              </article>
            ))}
          </section>
        ) : null}
        <p className="mt-4 font-mono text-[8.5px] leading-5 text-white/30">
          Money reports show shop-operational volume and rent only · barber service revenue is theirs · external-provider amounts are never imported · exports are CSV
        </p>
      </div>
    </main>
  );
}
