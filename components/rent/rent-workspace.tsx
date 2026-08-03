"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  FileCheck2,
  History,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  RentAgreementView,
  RentObligationView,
  RentWorkspacePayload
} from "@/lib/rent/service";
import { cn } from "@/lib/utils";

type RentView = "rent" | "autobooth" | "activity" | "agreement" | "invitation";

const tabs: Array<{ key: RentView; label: string }> = [
  { key: "rent", label: "My rent" },
  { key: "autobooth", label: "AutoBooth" },
  { key: "activity", label: "Activity" },
  { key: "agreement", label: "Agreement" },
  { key: "invitation", label: "Invitation" }
];

const emptyPayload = (viewer: "owner" | "barber"): RentWorkspacePayload => ({
  viewer,
  scope: { shopId: null },
  relationships: [],
  agreements: [],
  obligations: [],
  contributions: [],
  actions: [],
  autopay: [],
  paymentRequests: [],
  disputes: [],
  lifecycleRequests: [],
  warnings: []
});

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function statusTone(status: string) {
  if (["active", "accepted", "funded", "settled", "passed"].includes(status)) {
    return "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#dfffa2]";
  }
  if (["overdue", "failed", "canceled"].includes(status)) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  }
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
      statusTone(status)
    )}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function resolveAgreementForObligation(
  agreements: RentAgreementView[],
  obligation: RentObligationView
) {
  return agreements.find((agreement) => agreement.id === obligation.agreementId) ?? null;
}

function ProgressBar({ settled, total }: { settled: number; total: number }) {
  const progress = total <= 0 ? 0 : Math.min((settled / total) * 100, 100);
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-white/8"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={settled}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#8fb33f] to-[#C4F24E] transition-[width]"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function RentSummary({
  payload,
  viewer
}: {
  payload: RentWorkspacePayload;
  viewer: "owner" | "barber";
}) {
  const current = payload.obligations.find((item) => !["funded", "waived", "canceled"].includes(item.status))
    ?? payload.obligations[0];
  const agreement = current ? resolveAgreementForObligation(payload.agreements, current) : payload.agreements[0];

  if (!current) {
    return (
      <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#C4F24E]">Booth rent</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl" data-display="true">
          No rent is due.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
          {viewer === "owner"
            ? "A fixed rent obligation appears here only after the exact agreement version is accepted by both parties and becomes effective."
            : "Your earnings remain yours. Rent appears only after you and the owner accept the same prospective agreement version."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[30px] border border-[#C4F24E]/18 bg-[radial-gradient(circle_at_top_left,rgba(196,242,78,0.09),transparent_30%),rgba(255,255,255,0.025)] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/48">
            {viewer === "owner" ? "Rent funding · current period" : "My booth rent · current period"}
          </p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-white sm:text-7xl" data-display="true">
            {money(current.remainingCents)}
          </h2>
          <p className="mt-2 text-sm text-white/54">
            remaining of {money(current.obligationCents)} · due {dateLabel(current.dueAt)}
          </p>
        </div>
        <StatusPill status={current.status} />
      </div>
      <div className="mt-8">
        <ProgressBar settled={current.settledCents} total={current.obligationCents} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/62">
        <span className="rounded-full border border-white/10 px-3 py-2">
          Funded {money(current.settledCents)}
        </span>
        <span className="rounded-full border border-white/10 px-3 py-2">
          {agreement?.model === "autobooth_rent" ? "AutoBooth active" : "Full Booth Rent"}
        </span>
        {current.graceExpiresAt ? (
          <span className="rounded-full border border-amber-300/20 px-3 py-2 text-amber-100">
            Grace through {dateLabel(current.graceExpiresAt)}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function AgreementPanel({
  payload,
  viewer,
  onAccept,
  busyId
}: {
  payload: RentWorkspacePayload;
  viewer: "owner" | "barber";
  onAccept: (id: string) => Promise<void>;
  busyId: string | null;
}) {
  if (!payload.agreements.length) {
    return (
      <div className="rounded-[26px] border border-dashed border-white/12 p-6 text-white/60">
        No agreement version exists yet. The owner can draft a prospective invitation below.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {payload.agreements.map((agreement) => {
        const viewerAccepted = viewer === "owner"
          ? Boolean(agreement.ownerAcceptedAt)
          : Boolean(agreement.barberAcceptedAt);
        const canAccept = ["pending_acceptance", "accepted"].includes(agreement.status)
          && !viewerAccepted
          && new Date(agreement.effectiveAt).getTime() > Date.now();

        return (
          <article key={agreement.id} className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/44">
                  Version {agreement.version} · {agreement.termsHash.slice(0, 12)}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-white">
                  {agreement.model === "autobooth_rent" ? "AutoBooth Rent" : "Full Booth Rent"}
                </h3>
              </div>
              <StatusPill status={agreement.status} />
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <dt className="text-white/44">Fixed obligation</dt>
                <dd className="mt-2 font-bold text-white">{money(agreement.rentAmountCents)} / {agreement.billingFrequency}</dd>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <dt className="text-white/44">AutoBooth</dt>
                <dd className="mt-2 font-bold text-white">{agreement.autoBoothBasisPoints / 100}% of eligible service proceeds</dd>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <dt className="text-white/44">Effective</dt>
                <dd className="mt-2 font-bold text-white">{dateLabel(agreement.effectiveAt)}</dd>
              </div>
            </dl>
            <div className="mt-5 grid gap-2 text-xs text-white/58 sm:grid-cols-2">
              <p className="flex items-center gap-2">
                {agreement.ownerAcceptedAt ? <Check className="h-4 w-4 text-[#C4F24E]" /> : <History className="h-4 w-4" />}
                Owner {agreement.ownerAcceptedAt ? `accepted ${dateLabel(agreement.ownerAcceptedAt)}` : "acceptance pending"}
              </p>
              <p className="flex items-center gap-2">
                {agreement.barberAcceptedAt ? <Check className="h-4 w-4 text-[#C4F24E]" /> : <History className="h-4 w-4" />}
                Barber {agreement.barberAcceptedAt ? `accepted ${dateLabel(agreement.barberAcceptedAt)}` : "acceptance pending"}
              </p>
            </div>
            {canAccept ? (
              <Button
                type="button"
                className="mt-5 rounded-full bg-[#C4F24E] text-black hover:bg-[#d4ff6b]"
                disabled={busyId === agreement.id}
                onClick={() => void onAccept(agreement.id)}
              >
                {busyId === agreement.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                Accept this exact version
              </Button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function OwnerAgreementComposer({
  payload,
  onCreated
}: {
  payload: RentWorkspacePayload;
  onCreated: () => Promise<void>;
}) {
  const [relationshipId, setRelationshipId] = useState(payload.relationships[0]?.id ?? "");
  const [model, setModel] = useState<"booth_rent" | "autobooth_rent">("booth_rent");
  const [rentDollars, setRentDollars] = useState("250");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [autoPercent, setAutoPercent] = useState("40");
  const [lateFeeDollars, setLateFeeDollars] = useState("25");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relationshipId && payload.relationships[0]?.id) {
      setRelationshipId(payload.relationships[0].id);
    }
  }, [payload.relationships, relationshipId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rent/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationshipId,
          model,
          rentAmountCents: Math.round(Number(rentDollars) * 100),
          billingFrequency: frequency,
          autoBoothBasisPoints: model === "autobooth_rent"
            ? Math.round(Number(autoPercent) * 100)
            : 0,
          graceHours: 24,
          lateFeeCents: Math.round(Number(lateFeeDollars) * 100),
          cashSettlementMethod: "provider_transfer",
          termsSnapshot: {
            doctrine: "Full Booth Rent + AutoBooth Rent only",
            tipsExcluded: true,
            taxesExcluded: true,
            externalMoneyExcluded: true,
            cashRequiresTransferEvidence: true
          },
          effectiveAt: new Date(`${effectiveDate}T00:00:00`).toISOString()
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to create agreement.");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create agreement.");
    } finally {
      setBusy(false);
    }
  }

  if (!payload.relationships.length) {
    return (
      <div className="rounded-[26px] border border-dashed border-white/12 p-6">
        <p className="font-semibold text-white">No eligible shop–barber relationship</p>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Invite and approve a barber from Team before drafting rent. Identity remains separate from the money agreement.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#C4F24E]">New prospective version</p>
      <h3 className="mt-3 text-3xl font-semibold text-white" data-display="true">Invite both signatures.</h3>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-white/62">
          Relationship
          <Select className="mt-2" value={relationshipId} onChange={(event) => setRelationshipId(event.target.value)}>
            {payload.relationships.map((relationship) => (
              <option key={relationship.id} value={relationship.id}>
                Barber {relationship.barberId.slice(0, 8)} · {relationship.status}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm text-white/62">
          Model
          <Select className="mt-2" value={model} onChange={(event) => setModel(event.target.value as typeof model)}>
            <option value="booth_rent">Full Booth Rent</option>
            <option value="autobooth_rent">AutoBooth Rent</option>
          </Select>
        </label>
        <label className="text-sm text-white/62">
          Fixed rent dollars
          <Input className="mt-2" inputMode="decimal" value={rentDollars} onChange={(event) => setRentDollars(event.target.value)} />
        </label>
        <label className="text-sm text-white/62">
          Frequency
          <Select className="mt-2" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </label>
        {model === "autobooth_rent" ? (
          <label className="text-sm text-white/62">
            Approved AutoBooth percentage
            <Input className="mt-2" inputMode="decimal" value={autoPercent} onChange={(event) => setAutoPercent(event.target.value)} />
          </label>
        ) : null}
        <label className="text-sm text-white/62">
          One-time late fee dollars
          <Input className="mt-2" inputMode="decimal" value={lateFeeDollars} onChange={(event) => setLateFeeDollars(event.target.value)} />
        </label>
        <label className="text-sm text-white/62">
          Future effective date
          <Input className="mt-2" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
        </label>
      </div>
      <p className="mt-5 text-xs leading-6 text-white/48">
        Draft terms are versioned and immutable after acceptance. Tips, taxes, refunds, and external work never fund rent. This workflow records product terms; it is not a substitute for legal review.
      </p>
      {error ? <FeedbackBanner tone="error" message={error} className="mt-4" /> : null}
      <Button
        type="button"
        className="mt-5 rounded-full bg-[#C4F24E] text-black hover:bg-[#d4ff6b]"
        disabled={busy || !relationshipId || !effectiveDate}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Create version and invite barber
      </Button>
    </section>
  );
}

function RecoveryPanel({
  payload,
  onChanged
}: {
  payload: RentWorkspacePayload;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [waiverReasons, setWaiverReasons] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const open = payload.obligations.filter((item) => !["funded", "waived", "canceled"].includes(item.status));

  async function act(obligationId: string, action: string) {
    setBusy(`${obligationId}:${action}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/rent/obligations/${obligationId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "waive" ? waiverReasons[obligationId] : undefined
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Rent action failed.");
      setFeedback({ tone: "success", message: `${action.replaceAll("_", " ")} recorded in the rent audit.` });
      await onChanged();
    } catch (caught) {
      setFeedback({ tone: "error", message: caught instanceof Error ? caught.message : "Rent action failed." });
    } finally {
      setBusy(null);
    }
  }

  if (!open.length) {
    return <p className="rounded-[24px] border border-white/8 p-5 text-sm text-white/56">No rent recovery action is needed.</p>;
  }

  return (
    <div className="grid gap-4">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {open.map((obligation) => (
        <article key={obligation.id} className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-white">{money(obligation.remainingCents)} remaining</p>
              <p className="mt-1 text-xs text-white/50">Due {dateLabel(obligation.dueAt)} · settle-first balance survives relationship end</p>
            </div>
            <StatusPill status={obligation.status} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["remind", "Send reminder"],
              ["retry", "Retry payment"],
              ["grace", "Apply grace once"],
              ["late_fee", "Apply late fee once"]
            ].map(([action, label]) => (
              <Button
                key={action}
                type="button"
                variant="secondary"
                className="rounded-full"
                disabled={busy !== null}
                onClick={() => void act(obligation.id, action)}
              >
                {busy === `${obligation.id}:${action}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {label}
              </Button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={waiverReasons[obligation.id] ?? ""}
              onChange={(event) => setWaiverReasons((current) => ({
                ...current,
                [obligation.id]: event.target.value
              }))}
              placeholder="Required waiver reason"
              aria-label="Waiver reason"
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-full border-rose-300/25 text-rose-100"
              disabled={busy !== null || (waiverReasons[obligation.id]?.trim().length ?? 0) < 3}
              onClick={() => void act(obligation.id, "waive")}
            >
              Waive with reason
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RentWorkspace({
  viewer,
  initialView = "rent"
}: {
  viewer: "owner" | "barber";
  initialView?: RentView;
}) {
  const [view, setView] = useState<RentView>(initialView);
  const [payload, setPayload] = useState<RentWorkspacePayload>(emptyPayload(viewer));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/rent", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as RentWorkspacePayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load rent.");
    setPayload(body);
  }, []);

  useEffect(() => {
    let active = true;
    void load()
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load rent.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const activeAgreement = useMemo(
    () => payload.agreements.find((agreement) => agreement.status === "active")
      ?? payload.agreements[0],
    [payload.agreements]
  );
  const autoContributions = payload.contributions.filter((item) => item.kind.startsWith("autobooth"));

  async function accept(id: string) {
    setAccepting(id);
    setError(null);
    try {
      const response = await fetch(`/api/rent/agreements/${id}/accept`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to accept agreement.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to accept agreement.");
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div className="space-y-5" data-testid={`${viewer}-rent-workspace`}>
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#080a08] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-[#C4F24E]/25 bg-[#C4F24E]/10 text-[#C4F24E]">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/46">BVRB3R booth rent</p>
              <p className="mt-1 text-sm text-white/72">{viewer === "owner" ? "Owner rent-only view" : "Barber private view"}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/25 bg-[#C4F24E]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#dfffa2]">
            <ShieldCheck className="h-4 w-4" />
            Rent only
          </span>
        </div>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition",
                view === tab.key
                  ? "border-[#C4F24E]/40 bg-[#C4F24E]/12 text-[#e7ffba]"
                  : "border-white/10 text-white/54 hover:border-white/20 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {payload.warnings.map((warning) => (
        <FeedbackBanner key={warning} tone="info" message={warning} />
      ))}
      {error ? <FeedbackBanner tone="error" message={error} /> : null}

      {loading ? (
        <div className="grid min-h-64 place-items-center rounded-[30px] border border-white/8">
          <Loader2 className="h-7 w-7 animate-spin text-[#C4F24E]" aria-label="Loading rent truth" />
        </div>
      ) : null}

      {!loading && view === "rent" ? (
        <>
          <RentSummary payload={payload} viewer={viewer} />
          {viewer === "owner" ? (
            <section className="rounded-[30px] border border-white/10 bg-white/[0.02] p-6">
              <div className="mb-5 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-200" />
                <div>
                  <h3 className="font-semibold text-white">Overdue recovery</h3>
                  <p className="text-xs text-white/48">Every action is audited. Grace and late fees are once per obligation.</p>
                </div>
              </div>
              <RecoveryPanel payload={payload} onChanged={load} />
            </section>
          ) : null}
        </>
      ) : null}

      {!loading && view === "autobooth" ? (
        <section className="rounded-[30px] border border-[#C4F24E]/18 bg-white/[0.025] p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[28px] border border-[#C4F24E]/25 bg-[#C4F24E]/7 p-6">
              <Sparkles className="h-9 w-9 text-[#C4F24E]" />
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-[#C4F24E]">Five gates, all required</p>
              <h2 className="mt-3 text-4xl font-semibold text-white" data-display="true">Eligible service money only.</h2>
              <p className="mt-4 text-sm leading-7 text-white/58">
                Native transaction · active obligation · captured card or settled cash · approved percentage · remaining rent above zero.
              </p>
            </div>
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Model", activeAgreement?.model === "autobooth_rent" ? "AutoBooth active" : "Full Booth Rent"],
                  ["Approved portion", `${(activeAgreement?.autoBoothBasisPoints ?? 0) / 100}%`],
                  ["Tips", "100% excluded"],
                  ["Taxes & external work", "Excluded by design"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                    <p className="text-xs text-white/44">{label}</p>
                    <p className="mt-2 font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[22px] border border-white/8 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/44">Transaction detail</p>
                <div className="mt-3 grid gap-2">
                  {autoContributions.length ? autoContributions.slice(0, 8).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-white/58">{dateLabel(item.createdAt)} · {item.kind.replaceAll("_", " ")}</span>
                      <span className={item.status === "pending" ? "text-amber-200" : "text-[#C4F24E]"}>
                        {item.status === "pending" ? "pending " : ""}{money(item.appliedCents)}
                      </span>
                    </div>
                  )) : <p className="text-sm text-white/48">No AutoBooth contributions yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && view === "activity" ? (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-[#C4F24E]" />
            <h2 className="text-2xl font-semibold text-white">Audited activity</h2>
          </div>
          <div className="mt-5 divide-y divide-white/8">
            {payload.actions.length ? payload.actions.map((action) => (
              <div key={action.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                <div>
                  <p className="font-semibold text-white">{action.actionType.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-white/45">{action.actorRole.replaceAll("_", " ")} · {dateLabel(action.createdAt)}</p>
                </div>
                {action.reason ? <p className="max-w-md text-right text-xs text-white/55">{action.reason}</p> : null}
              </div>
            )) : <p className="py-5 text-sm text-white/48">No rent actions have been recorded.</p>}
          </div>
        </section>
      ) : null}

      {!loading && view === "agreement" ? (
        <section>
          <div className="mb-5 flex items-center gap-3">
            <ReceiptText className="h-5 w-5 text-[#C4F24E]" />
            <div>
              <h2 className="text-2xl font-semibold text-white">Versioned agreement</h2>
              <p className="text-xs text-white/48">Changes create a future version. Accepted terms are never rewritten.</p>
            </div>
          </div>
          <AgreementPanel payload={payload} viewer={viewer} onAccept={accept} busyId={accepting} />
        </section>
      ) : null}

      {!loading && view === "invitation" ? (
        viewer === "owner"
          ? <OwnerAgreementComposer payload={payload} onCreated={load} />
          : <AgreementPanel payload={payload} viewer={viewer} onAccept={accept} busyId={accepting} />
      ) : null}
    </div>
  );
}
