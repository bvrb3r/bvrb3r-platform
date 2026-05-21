"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  ArchitectReportDetailPayload,
  ArchitectReportsPayload,
  ArchitectReportView,
  ArchitectReportActionStatus
} from "@/lib/architect/reports/service";
import { cn } from "@/lib/utils";

type ApiError = {
  error?: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as T | ApiError;
  if (!response.ok) {
    throw new Error((body as ApiError).error ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "received") return "Open";
  if (status === "under_review") return "Under review";
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "resolved") return "border-[#7CFF00]/25 bg-[#7CFF00]/10 text-[#d7ffab]";
  if (status === "under_review") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (status === "dismissed") return "border-white/10 bg-white/[0.04] text-white/58";
  return "border-rose-400/25 bg-rose-400/10 text-rose-100";
}

function severityClass(severity: ArchitectReportView["severity"]) {
  if (severity === "high") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (severity === "medium") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-white/58";
}

function ReportCard({
  report,
  selected,
  onOpen
}: {
  report: ArchitectReportView;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={cn("rounded-lg border bg-black/24 p-4 transition", selected ? "border-[#7CFF00]/35" : "border-white/10")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">{report.concernType}</p>
          <h3 className="mt-2 truncate text-lg font-semibold text-white">{report.targetName}</h3>
          <p className="mt-1 text-sm text-white/58">Reporter: {report.reporterName}</p>
          {report.targetResolution === "unresolved" ? (
            <p className="mt-1 font-mono text-xs text-amber-100/72">Unresolved target: {report.targetReference}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", severityClass(report.severity))}>
            {report.severity}
          </span>
          <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusClass(report.status))}>
            {statusLabel(report.status)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/68">{report.notesPreview}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/42">{formatDate(report.createdAt)}</p>
        <Button type="button" variant="secondary" onClick={onOpen}>Open Report</Button>
      </div>
    </article>
  );
}

export function ArchitectReportsWorkspace() {
  const [payload, setPayload] = useState<ArchitectReportsPayload | null>(null);
  const [detail, setDetail] = useState<ArchitectReportDetailPayload | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updating, setUpdating] = useState<ArchitectReportActionStatus | null>(null);

  async function loadReports(preferredReportId?: string | null) {
    setLoading(true);
    try {
      const nextPayload = await requestJson<ArchitectReportsPayload>("/api/architect/reports");
      setPayload(nextPayload);
      setSelectedReportId((current) => preferredReportId ?? current ?? nextPayload.reports[0]?.id ?? null);
      setStatus(null);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Reports could not load." });
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(reportId: string) {
    setLoadingDetail(true);
    try {
      const nextDetail = await requestJson<ArchitectReportDetailPayload>(`/api/architect/reports/${reportId}`);
      setDetail(nextDetail);
      setStatus(null);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Report detail could not load." });
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  useEffect(() => {
    if (!selectedReportId) {
      setDetail(null);
      return;
    }

    void loadDetail(selectedReportId);
  }, [selectedReportId]);

  const selectedReport = useMemo(
    () => payload?.reports.find((report) => report.id === selectedReportId) ?? null,
    [payload?.reports, selectedReportId]
  );
  const activeReport = detail?.report ?? selectedReport;

  async function updateStatus(nextStatus: ArchitectReportActionStatus) {
    if (!selectedReportId) return;

    setUpdating(nextStatus);
    try {
      const nextDetail = await requestJson<ArchitectReportDetailPayload>(`/api/architect/reports/${selectedReportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      setDetail(nextDetail);
      await loadReports(selectedReportId);
      setStatus({ tone: "success", message: `Report marked ${statusLabel(nextStatus).toLowerCase()}.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Report status could not be updated." });
    } finally {
      setUpdating(null);
    }
  }

  return (
    <main className="px-2 py-6 sm:px-3 lg:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-white/10 bg-black/35 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Architect Reports
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Trust and safety cases</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Reports are the case record. Support messages stay conversational and link back to the reporter.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadReports(selectedReportId)} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>

          {status ? (
            <div
              className={cn(
                "mt-4 rounded-lg border px-4 py-3 text-sm",
                status.tone === "success" && "border-[#7CFF00]/25 bg-[#7CFF00]/10 text-[#d7ffab]",
                status.tone === "error" && "border-rose-400/25 bg-rose-400/10 text-rose-100",
                status.tone === "info" && "border-white/10 bg-white/[0.04] text-white/70"
              )}
            >
              {status.message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-white/10 bg-black/24 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/42">Total</p>
            <p className="mt-3 text-3xl font-black text-white">{payload?.summary.total ?? 0}</p>
          </Card>
          <Card className="border-rose-400/20 bg-rose-400/8 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-rose-100/72">Open</p>
            <p className="mt-3 text-3xl font-black text-white">{payload?.summary.received ?? 0}</p>
          </Card>
          <Card className="border-amber-300/20 bg-amber-300/8 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-100/72">Under Review</p>
            <p className="mt-3 text-3xl font-black text-white">{payload?.summary.underReview ?? 0}</p>
          </Card>
          <Card className="border-[#7CFF00]/20 bg-[#7CFF00]/8 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#d7ffab]">Resolved / Dismissed</p>
            <p className="mt-3 text-3xl font-black text-white">{(payload?.summary.resolved ?? 0) + (payload?.summary.dismissed ?? 0)}</p>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[25rem_1fr]">
          <Card className="border-white/10 bg-black/28 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">Latest reports</p>
                <p className="mt-1 text-sm text-white/62">Newest cases first</p>
              </div>
              <FileText className="h-5 w-5 text-[#d7ffab]" />
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">Loading reports...</p>
              ) : payload?.reports.length ? (
                payload.reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    selected={report.id === selectedReportId}
                    onOpen={() => setSelectedReportId(report.id)}
                  />
                ))
              ) : (
                <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">No reports yet.</p>
              )}
            </div>
          </Card>

          <Card className="border-white/10 bg-black/28 p-5">
            {activeReport ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-white/42">{activeReport.id}</p>
                    <h2 className="mt-2 text-2xl font-black text-white">{activeReport.concernType}</h2>
                    <p className="mt-2 text-sm text-white/60">{activeReport.targetType} report for {activeReport.targetName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", severityClass(activeReport.severity))}>
                      {activeReport.severity}
                    </span>
                    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", statusClass(activeReport.status))}>
                      {statusLabel(activeReport.status)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Target</p>
                    <p className="mt-2 text-sm font-semibold text-white">{activeReport.targetName}</p>
                    <p className="mt-1 text-xs text-white/50">Reference: {activeReport.targetReference}</p>
                    <p className="mt-1 text-xs text-white/50">Resolution: {activeReport.targetResolution}</p>
                    {activeReport.targetHref ? (
                      <Link href={activeReport.targetHref as Route} className="mt-3 inline-flex text-sm font-semibold text-[#d7ffab]">View target profile</Link>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Reporter</p>
                    <p className="mt-2 text-sm font-semibold text-white">{activeReport.reporterName}</p>
                    <p className="mt-1 text-xs text-white/50">{activeReport.reporterEmail ?? activeReport.reporterId ?? "No reporter reference"}</p>
                    {activeReport.reporterSupportThreadHref ? (
                      <Link href={activeReport.reporterSupportThreadHref as Route} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#d7ffab]">
                        <MessageCircle className="h-4 w-4" />
                        Message reporter
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/42">Full notes</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/72">{activeReport.details || "No notes provided."}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {(["under_review", "resolved", "dismissed", "received"] as ArchitectReportActionStatus[]).map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      type="button"
                      variant={nextStatus === "under_review" ? "primary" : "secondary"}
                      onClick={() => void updateStatus(nextStatus)}
                      disabled={Boolean(updating) || activeReport.status === nextStatus}
                    >
                      {updating === nextStatus ? "Updating" : nextStatus === "received" ? "Mark received" : `Mark ${statusLabel(nextStatus)}`}
                    </Button>
                  ))}
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle2 className="h-4 w-4 text-[#d7ffab]" />
                    <h3 className="text-sm font-semibold">Event history</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {loadingDetail ? (
                      <p className="text-sm text-white/58">Loading event history...</p>
                    ) : detail?.events.length ? (
                      detail.events.map((event) => (
                        <div key={event.id} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                          <p className="text-sm font-semibold text-white">{event.actionLabel}</p>
                          <p className="mt-1 text-xs text-white/42">{formatDate(event.createdAt)}</p>
                          {event.notes ? <p className="mt-2 text-sm text-white/62">{event.notes}</p> : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/58">No event history yet.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[32rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] p-8 text-center">
                <div>
                  <AlertTriangle className="mx-auto h-8 w-8 text-white/42" />
                  <p className="mt-4 text-lg font-semibold text-white">Select a report</p>
                  <p className="mt-2 text-sm text-white/58">Trust and safety case details open here.</p>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
