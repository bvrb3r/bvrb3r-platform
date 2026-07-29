"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  Check,
  Clock3,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Search,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import {
  useCreateOwnerChairMutation,
  useCreateOwnerTeamInviteMutation,
  useCreateOwnerWalkInMutation,
  useEndOwnerRelationshipMutation,
  useOwnerOperationsQuery,
  useOwnerTeamDirectoryQuery,
  usePairOwnerKioskMutation,
  useReassignOwnerWalkInMutation,
  useRespondOwnerJoinRequestMutation,
  useRetireOwnerChairMutation,
  useSaveOwnerKioskPinMutation,
  useSetOwnerKioskEmergencyMutation,
  useSetOwnerRelationshipPauseMutation,
  useUpdateOwnerFloorMutation,
  useUpdateOwnerKioskPolicyMutation
} from "@/lib/owner-operations/client";
import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";
import type { ShopTeamInviteDirectoryBarber } from "@/lib/operations/shop-team-invites";
import { cn } from "@/lib/utils";

type OwnerOperationsTab = "home" | "floor" | "team" | "kiosk" | "chairs";

const tabOptions: Array<{ id: OwnerOperationsTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "floor", label: "Floor Day" },
  { id: "team", label: "Team" },
  { id: "kiosk", label: "Kiosk" },
  { id: "chairs", label: "Chairs & Booths" }
];

const fieldClassName =
  "min-h-12 w-full rounded-[12px] border border-white/10 bg-black/55 px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-white/28 focus:border-[var(--bvr-green-border)]";
const selectClassName = `${fieldClassName} appearance-none`;
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string | null) {
  if (!value) return "No upcoming booking";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

function OwnerCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[18px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(20,20,24,0.96),rgba(8,8,10,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.34)]",
        className
      )}
    >
      {children}
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = "green",
  type = "button",
  className
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "green" | "quiet" | "danger" | "gold";
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-xs font-black uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-35",
        tone === "green" && "border-[var(--bvr-green)] bg-[var(--bvr-green)] text-[var(--bvr-green-ink)] shadow-[var(--shadow-green-action)]",
        tone === "gold" && "border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] text-[var(--bvr-gold-bright)]",
        tone === "quiet" && "border-white/12 bg-white/[0.035] text-white/72 hover:border-white/22 hover:text-white",
        tone === "danger" && "border-red-400/28 bg-red-400/[0.08] text-red-200",
        className
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/[0.07] py-4 last:border-b-0">
      <div>
        <p className="text-sm font-bold text-white/88">{label}</p>
        <p className="mt-1 text-xs leading-5 text-white/42">{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-35",
          checked
            ? "border-[var(--bvr-green-border)] bg-[var(--bvr-green)]"
            : "border-white/14 bg-white/[0.06]"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-[18px] w-[18px] rounded-full transition",
            checked
              ? "left-[25px] bg-[var(--bvr-green-ink)]"
              : "left-1 bg-white/55"
          )}
        />
      </button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "gold"
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "gold" | "green" | "blue";
}) {
  return (
    <OwnerCard className="min-h-44 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">{label}</p>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            tone === "gold" && "bg-[var(--bvr-gold-bright)]",
            tone === "green" && "bg-[var(--bvr-green)]",
            tone === "blue" && "bg-[#7FB5FF]"
          )}
        />
      </div>
      <p className="mt-6 font-serif text-5xl text-[var(--text-primary)]">{value}</p>
      <p className="mt-4 text-sm leading-6 text-white/45">{detail}</p>
    </OwnerCard>
  );
}

function HomePanel({ data }: { data: OwnerOperationsResponse }) {
  const bridge = data.controls.clientBridge;
  const critical = data.alerts[0];
  const billed = data.controls.boothRent.billedCents;
  const paid = data.controls.boothRent.paidCents;
  const fundedPercent = billed > 0 ? Math.min(Math.round((paid / billed) * 100), 100) : 0;
  const activeChairs = data.controls.chairs.filter((chair) => chair.active);
  const filledChairCount = activeChairs.filter((chair) => chair.assignedBarberId).length;

  return (
    <div className="pt-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--bvr-gold-bright)]">
        {weekdayFormatter.format(new Date(data.generatedAt))} · every chair, every source
      </p>
      <h2 className="mt-2 font-serif text-[44px] font-normal leading-[1.05] text-[var(--text-primary)]">
        The floor, in one look<span className="text-[var(--bvr-green)]">.</span>
      </h2>

      {critical ? (
        <OwnerCard className="mt-5 border-red-300/30 bg-red-300/[0.045] px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-300" />
            <p className="min-w-[240px] flex-1 text-sm text-white/72">
              <strong className="text-red-200">{critical.title}:</strong> {critical.detail}
            </p>
            <span className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/65">
              Open alerts <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </span>
          </div>
        </OwnerCard>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OwnerCard className="p-5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">Today’s book · all sources</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-[42px] leading-none">{data.summary.floorVolume}</span>
            <span className="font-mono text-[10px] text-white/48">appointments</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.sourceCounts.length ? data.sourceCounts.map((entry) => (
              <span
                key={entry.source}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase",
                  entry.source === "bvrb3r" && "border-[var(--bvr-green-border)] text-[var(--bvr-green)]",
                  entry.source === "booksy" && "border-[#7FB5FF]/35 text-[#7FB5FF]",
                  entry.source === "thecut" && "border-[#FFB37F]/35 text-[#FFB37F]",
                  !["bvrb3r", "booksy", "thecut"].includes(entry.source) && "border-white/20 text-white/65"
                )}
              >
                {entry.count} {entry.label}
              </span>
            )) : <span className="text-xs text-white/38">No source activity yet.</span>}
          </div>
        </OwnerCard>

        <OwnerCard className="p-5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">Team · queue</p>
          <p className="mt-3 text-sm font-bold text-white">
            {data.controls.chairs.length} chairs · {data.summary.inService} cutting · {data.summary.openChairs} open
          </p>
          <p className="mt-2 text-xs leading-5 text-white/52">
            Line: {data.summary.waiting} waiting · {data.summary.checkedIn} checked in · {data.summary.completed} completed
          </p>
          <p className="mt-3 font-mono text-[10px] text-[var(--bvr-green)]">
            Walk-ins {data.controls.floor.intakeOpen ? "ON" : "OFF"} · rotation: {statusLabel(data.controls.kiosk.rotationPolicy)}
          </p>
        </OwnerCard>

        <OwnerCard className="p-5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">Booth rent · AutoBooth</p>
          <p className="mt-3 text-sm font-bold text-white">
            {formatMoney(paid)} of {formatMoney(billed)} funded
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(201,168,124,0.5),#C9A87C)]" style={{ width: `${fundedPercent}%` }} />
          </div>
          <p className="mt-3 font-mono text-[10px] leading-5 text-white/48">
            AutoBooth · {filledChairCount} of {activeChairs.length} chairs · {data.controls.boothRent.overdueCount} overdue{" "}
            <span className="text-red-200">{formatMoney(data.controls.boothRent.outstandingCents)}</span>
          </p>
        </OwnerCard>

        <OwnerCard className="border-[var(--bvr-green-border)] bg-[linear-gradient(150deg,rgba(196,242,78,0.06),rgba(8,8,10,0.98))] p-5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">ClientBridge · this month</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-[42px] leading-none text-[#E4F9B8]">{bridge.claimed}</span>
            <span className="font-mono text-[10px] leading-4 text-white/48">conversions from {bridge.offered} external visits</span>
          </div>
          <p className="mt-3 font-mono text-[10px] text-[var(--bvr-gold-bright)]">
            {bridge.offered ? Math.round((bridge.claimed / bridge.offered) * 100) : 0}% convert · {bridge.consented} consented · full funnel <ArrowRight className="inline h-3 w-3" />
          </p>
        </OwnerCard>
      </div>

      <p className="mt-4 font-mono text-[10px] leading-5 text-white/38">
        Counts and sources only — external platform money and barber-private earnings never appear on this screen. ChairSync health, kiosk, and queue live-update.
      </p>
    </div>
  );
}

function FloorPanel({ data }: { data: OwnerOperationsResponse }) {
  const [reason, setReason] = useState("");
  const [floorNote, setFloorNote] = useState(data.controls.floor.floorNote ?? "");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInBarber, setWalkInBarber] = useState("");
  const [reassignEntryId, setReassignEntryId] = useState("");
  const [reassignBarberId, setReassignBarberId] = useState("");
  const [rotationBarberId, setRotationBarberId] = useState("");
  const [rotationHours, setRotationHours] = useState("2");
  const floorMutation = useUpdateOwnerFloorMutation();
  const walkInMutation = useCreateOwnerWalkInMutation();
  const reassignMutation = useReassignOwnerWalkInMutation(reassignEntryId || "missing");
  const canChange = reason.trim().length >= 3;

  const activeTeam = data.team.filter((barber) => barber.floorState !== "offline");
  const selectedEntry = data.floor.find((entry) => entry.id === reassignEntryId);

  function saveRotation() {
    const hours = Number(rotationHours);
    if (!rotationBarberId || !Number.isFinite(hours) || hours <= 0) return;
    floorMutation.mutate({
      shopId: data.scope.shopId,
      rotationOverrideBarberId: rotationBarberId,
      rotationOverrideExpiresAt: new Date(Date.now() + hours * 60 * 60_000).toISOString(),
      reason: reason.trim()
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 pt-5">
        {[
          "Floor overview",
          "Barber lane",
          "Native entry",
          "Imported entry",
          "Awaiting checkout",
          "Unassigned",
          "Failed assignment",
          "Schedule conflict",
          "Barber behind",
          "Reassign",
          "Override rotation",
          "Kiosk health",
          "Sync health",
          "Notification failure",
          "Add walk-in",
          data.controls.floor.intakeOpen ? "Close intake" : "Open intake"
        ].map((state, index) => (
          <span
            key={state}
            className={cn(
              "rounded-full border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em]",
              index === 0
                ? "border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] text-[#E4F9B8]"
                : "border-white/10 text-white/42"
            )}
          >
            {state}
          </span>
        ))}
      </div>

      <OwnerCard className="border-[var(--bvr-green-border)] px-5 py-10 text-center sm:py-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] font-serif text-4xl text-[var(--bvr-green)]">
          {data.controls.chairs.filter((chair) => chair.active).length || data.summary.activeBarbers}
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--bvr-gold-bright)]">Floor Day</p>
        <h2 className="mt-3 font-serif text-4xl text-white sm:text-5xl">
          Five lanes, one truth<span className="text-[var(--bvr-green)]">.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/52">
          Every chair as a lane—in-chair, line, and source mix. Reassignment remains cash-walk-in-only; every owner change is reasoned and audited.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <span className="rounded-full border border-white/12 px-3 py-2 font-mono text-[10px] text-white/62">
            {data.summary.inService} cutting · {data.summary.openChairs} open
          </span>
          <span className="rounded-full border border-[var(--bvr-green-border)] px-3 py-2 font-mono text-[10px] text-[#E4F9B8]">
            {data.summary.waiting} in line · {data.summary.checkedIn} awaiting chair
          </span>
        </div>
      </OwnerCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Booked", data.summary.booked],
          ["Waiting", data.summary.waiting],
          ["Checked in", data.summary.checkedIn],
          ["In service", data.summary.inService],
          ["Completed", data.summary.completed]
        ].map(([label, value], index) => (
          <OwnerCard key={String(label)} className={cn("p-4", index === 1 && "border-[var(--bvr-green-border)]")}>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/38">{label}</p>
            <p className="mt-3 font-serif text-4xl text-white">{value}</p>
          </OwnerCard>
        ))}
      </div>

      <OwnerCard className="p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className={cn("h-2.5 w-2.5 rounded-full", data.controls.floor.intakeOpen ? "bg-[var(--bvr-green)]" : "bg-red-300")} />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Walk-in intake · {data.controls.floor.intakeOpen ? "Open" : "Closed"}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/48">{data.controls.floor.floorNote ?? "No floor note is posted."}</p>
            {data.controls.floor.rotationOverrideBarberId ? (
              <p className="mt-3 rounded-[12px] border border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] p-3 text-xs leading-5 text-[var(--bvr-gold-bright)]">
                Rotation override active until {formatTime(data.controls.floor.rotationOverrideExpiresAt)} · {data.controls.floor.rotationOverrideReason}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input aria-label="Floor change reason" className={fieldClassName} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required for every floor change" />
            <ActionButton
              tone={data.controls.floor.intakeOpen ? "quiet" : "green"}
              disabled={!canChange || floorMutation.isPending}
              onClick={() => floorMutation.mutate({
                shopId: data.scope.shopId,
                intakeOpen: !data.controls.floor.intakeOpen,
                reason: reason.trim()
              })}
            >
              {data.controls.floor.intakeOpen ? "Close intake" : "Open intake"}
            </ActionButton>
            <input aria-label="Floor note" className={fieldClassName} value={floorNote} onChange={(event) => setFloorNote(event.target.value)} placeholder="Floor note for the operating team" />
            <ActionButton
              tone="quiet"
              disabled={!canChange || floorNote.trim().length < 3 || floorMutation.isPending}
              onClick={() => floorMutation.mutate({
                shopId: data.scope.shopId,
                floorNote: floorNote.trim(),
                reason: reason.trim()
              })}
            >
              Save note
            </ActionButton>
          </div>
        </div>
        {floorMutation.error ? <p role="alert" className="mt-4 text-sm text-red-300">{floorMutation.error.message}</p> : null}
      </OwnerCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <OwnerCard className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-green)]">Add walk-in</p>
              <p className="mt-2 text-sm text-white/45">Manual owner entry is created as BVRB3R cash and remains server-validated.</p>
            </div>
            <ActionButton tone="quiet" onClick={() => setWalkInOpen((value) => !value)}>
              {walkInOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {walkInOpen ? "Close" : "Add"}
            </ActionButton>
          </div>
          {walkInOpen ? (
            <div className="mt-5 grid gap-3">
              <input aria-label="Walk-in guest name" className={fieldClassName} value={walkInName} onChange={(event) => setWalkInName(event.target.value)} placeholder="Guest name" />
              <input aria-label="Walk-in guest phone" className={fieldClassName} inputMode="tel" value={walkInPhone} onChange={(event) => setWalkInPhone(event.target.value)} placeholder="Guest phone" />
              <select aria-label="Preferred walk-in barber" className={selectClassName} value={walkInBarber} onChange={(event) => setWalkInBarber(event.target.value)}>
                <option value="">Next eligible barber</option>
                {activeTeam.map((barber) => <option key={barber.barberId} value={barber.barberId}>{barber.name}</option>)}
              </select>
              <ActionButton
                disabled={walkInName.trim().length < 2 || walkInPhone.replace(/\D/g, "").length < 7 || walkInMutation.isPending}
                onClick={() => walkInMutation.mutate({
                  clientName: walkInName.trim(),
                  clientPhone: walkInPhone,
                  shopId: data.scope.shopId,
                  ...(walkInBarber ? { preferredBarberId: walkInBarber } : {}),
                  queueSource: "manual",
                  entryType: "walkin",
                  sourceProvider: "bvrb3r",
                  paymentOwner: "bvrb3r_cash",
                  notes: reason.trim() || "Owner added cash walk-in from Floor Day."
                })}
              >
                Add cash walk-in
              </ActionButton>
              {walkInMutation.error ? <p role="alert" className="text-sm text-red-300">{walkInMutation.error.message}</p> : null}
            </div>
          ) : null}
        </OwnerCard>

        <OwnerCard className="p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-gold-bright)]">Rotation override</p>
          <p className="mt-2 text-sm leading-6 text-white/45">Temporarily route the next eligible floor action to an active shop barber. Pausing that barber clears the override automatically.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_110px_auto]">
            <select aria-label="Rotation override barber" className={selectClassName} value={rotationBarberId} onChange={(event) => setRotationBarberId(event.target.value)}>
              <option value="">Choose active barber</option>
              {activeTeam.map((barber) => <option key={barber.barberId} value={barber.barberId}>{barber.name}</option>)}
            </select>
            <select aria-label="Rotation override duration" className={selectClassName} value={rotationHours} onChange={(event) => setRotationHours(event.target.value)}>
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="4">4 hours</option>
              <option value="8">8 hours</option>
            </select>
            <ActionButton disabled={!canChange || !rotationBarberId || floorMutation.isPending} onClick={saveRotation}>Override</ActionButton>
          </div>
          {data.controls.floor.rotationOverrideBarberId ? (
            <ActionButton
              tone="quiet"
              className="mt-3"
              disabled={!canChange || floorMutation.isPending}
              onClick={() => floorMutation.mutate({
                shopId: data.scope.shopId,
                rotationOverrideBarberId: null,
                rotationOverrideExpiresAt: null,
                reason: reason.trim()
              })}
            >
              Clear override
            </ActionButton>
          ) : null}
        </OwnerCard>
      </div>

      <OwnerCard>
        <div className="border-b border-white/[0.08] p-5 sm:p-6">
          <p className="font-serif text-3xl text-white">Today’s floor lanes<span className="text-[var(--bvr-gold-bright)]">.</span></p>
          <p className="mt-2 text-sm leading-6 text-white/45">Source and payment ownership stay visible. Service money and tips stay with the barber.</p>
        </div>
        <div className="divide-y divide-white/[0.07]">
          {data.floor.length ? data.floor.map((entry) => {
            const mayReassign = entry.kind === "walk_in"
              && entry.status === "assigned"
              && Boolean(entry.barberId);
            return (
              <div key={`${entry.kind}-${entry.id}`} className="grid gap-4 p-5 sm:px-6 lg:grid-cols-[1.15fr_0.85fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{entry.clientDisplayName}</p>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/52">{entry.sourceLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/44">{entry.serviceDisplayName}</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-white/72">{entry.barberDisplayName ?? "Unassigned chair"}</p>
                  <p className="mt-1 text-xs text-white/38">{entry.waitMinutes !== null ? `${entry.waitMinutes} min wait` : formatTime(entry.startsAt)}</p>
                </div>
                <div className="lg:text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bvr-green)]">{statusLabel(entry.status)}</p>
                  <p className="mt-1 text-xs text-white/34">
                    {entry.paymentOwner === "external_provider" ? "External provider owns payment" : entry.paymentOwner === "barber" ? "Barber-owned payment" : "Payment owner pending"}
                  </p>
                  {mayReassign ? (
                    <button type="button" onClick={() => {
                      setReassignEntryId(entry.id);
                      setReassignBarberId("");
                    }} className="mt-3 text-xs font-bold text-[var(--bvr-gold-bright)]">
                      Reassign cash walk-in
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }) : (
            <div className="p-10 text-center">
              <Clock3 className="mx-auto h-7 w-7 text-white/25" />
              <p className="mt-4 font-bold text-white/62">No floor activity has posted for this shop.</p>
            </div>
          )}
        </div>
      </OwnerCard>

      {selectedEntry ? (
        <OwnerCard className="border-[var(--bvr-gold-border)] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-gold-bright)]">Cash-only reassignment</p>
          <p className="mt-3 text-sm text-white/58">{selectedEntry.clientDisplayName} is currently assigned to {selectedEntry.barberDisplayName}. The server will reject booked, card, or external-provider work.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <select aria-label="Reassignment barber" className={selectClassName} value={reassignBarberId} onChange={(event) => setReassignBarberId(event.target.value)}>
              <option value="">Choose another barber</option>
              {activeTeam.filter((barber) => barber.barberId !== selectedEntry.barberId).map((barber) => (
                <option key={barber.barberId} value={barber.barberId}>{barber.name}</option>
              ))}
            </select>
            <input aria-label="Cash walk-in reassignment reason" className={fieldClassName} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Audit reason required" />
            <ActionButton
              disabled={!reassignBarberId || !canChange || reassignMutation.isPending}
              onClick={() => reassignMutation.mutate({
                barberId: reassignBarberId,
                reason: reason.trim()
              })}
            >
              Confirm reassignment
            </ActionButton>
          </div>
          {reassignMutation.error ? <p role="alert" className="mt-3 text-sm text-red-300">{reassignMutation.error.message}</p> : null}
        </OwnerCard>
      ) : null}
    </div>
  );
}

function TeamPanel({ data }: { data: OwnerOperationsResponse }) {
  const [search, setSearch] = useState("");
  const [selectedInvite, setSelectedInvite] = useState<ShopTeamInviteDirectoryBarber | null>(null);
  const [rentModel, setRentModel] = useState<"booth_rent" | "autobooth_rent">("booth_rent");
  const [rentAmount, setRentAmount] = useState("250");
  const [rentFrequency, setRentFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [autoBoothPercent, setAutoBoothPercent] = useState("25");
  const [message, setMessage] = useState("");
  const [relationshipReason, setRelationshipReason] = useState("");
  const directory = useOwnerTeamDirectoryQuery(data.scope.shopId, search);
  const inviteMutation = useCreateOwnerTeamInviteMutation();
  const respondMutation = useRespondOwnerJoinRequestMutation();
  const pauseMutation = useSetOwnerRelationshipPauseMutation();
  const endMutation = useEndOwnerRelationshipMutation();
  const barbers = directory.data?.barbers ?? [];
  const activeRelationships = barbers.filter((barber) => Boolean(barber.relationshipId));
  const incoming = barbers.filter((barber) => barber.inviteStatus === "requested" && barber.inviteId);
  const candidates = barbers.filter((barber) => barber.canInvite);

  function operationStats(barberId: string) {
    return data.team.find((entry) => entry.barberId === barberId);
  }

  function sendInvite() {
    if (!selectedInvite) return;
    const amount = Number(rentAmount);
    const percent = Number(autoBoothPercent);
    if (!Number.isFinite(amount) || amount <= 0) return;
    inviteMutation.mutate({
      barberId: selectedInvite.barberId,
      shopId: data.scope.shopId,
      message: message.trim() || undefined,
      proposal: rentModel === "autobooth_rent"
        ? {
          routingModel: "autobooth_rent",
          boothRentAmount: amount,
          boothRentFrequency: rentFrequency,
          autoBoothPercent: percent / 100
        }
        : {
          routingModel: "booth_rent",
          boothRentAmount: amount,
          boothRentFrequency: rentFrequency
        }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 pt-5">
        {[
          "Team overview",
          "Invite",
          "Join requests",
          "Barber detail",
          "Rent agreement",
          "AutoBooth permission",
          "Kiosk / walk-in",
          "ChairSync ✓",
          "ChairSync off",
          "Paused",
          "End relationship"
        ].map((state, index) => (
          <span
            key={state}
            className={cn(
              "rounded-full border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em]",
              index === 0
                ? "border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] text-[#E4F9B8]"
                : "border-white/10 text-white/42"
            )}
          >
            {state}
          </span>
        ))}
      </div>

      <OwnerCard className="border-[var(--bvr-green-border)] px-5 py-10 text-center sm:py-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] font-serif text-4xl text-[var(--bvr-green)]">
          {data.controls.chairs.filter((chair) => chair.active).length || data.summary.activeBarbers}
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--bvr-gold-bright)]">Team</p>
        <h2 className="mt-3 font-serif text-4xl text-white sm:text-5xl">
          Five chairs, five businesses<span className="text-[var(--bvr-green)]">.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/52">
          Each barber is their own business on your floor. You see operations—never their private money.
        </p>
        {activeRelationships.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {activeRelationships.map((barber) => (
              <span key={barber.barberId} className="rounded-full border border-[var(--bvr-green-border)] px-3 py-2 font-mono text-[10px] text-[#E4F9B8]">
                {barber.name} · {barber.routingModel ? statusLabel(barber.routingModel) : "rent pending"} · {barber.relationshipStatus === "paused" ? "paused" : "ChairSync ✓"}
              </span>
            ))}
          </div>
        ) : null}
      </OwnerCard>

      <OwnerCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-serif text-3xl text-white">Team invitations<span className="text-[var(--bvr-gold-bright)]">.</span></p>
            <p className="mt-2 text-sm text-white/44">Search approved barber accounts. Only Full Booth Rent and AutoBooth Rent are available.</p>
          </div>
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-white/28" />
            <input aria-label="Search approved barbers" className={cn(fieldClassName, "pl-11")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, handle, or service area" />
          </label>
        </div>
        {incoming.length ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {incoming.map((barber) => (
              <div key={barber.barberId} className="rounded-[14px] border border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] p-4">
                <p className="font-bold text-white">{barber.name}</p>
                <p className="mt-1 text-xs text-white/48">Requested to join this shop.</p>
                <div className="mt-4 flex gap-2">
                  <ActionButton disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ inviteId: barber.inviteId!, status: "accepted" })}><Check className="h-4 w-4" /> Accept</ActionButton>
                  <ActionButton tone="quiet" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ inviteId: barber.inviteId!, status: "rejected" })}><X className="h-4 w-4" /> Reject</ActionButton>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {search.trim().length >= 2 ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {candidates.length ? candidates.slice(0, 12).map((barber) => (
              <button key={barber.barberId} type="button" onClick={() => setSelectedInvite(barber)} className="rounded-[14px] border border-white/[0.08] bg-white/[0.025] p-4 text-left hover:border-[var(--bvr-green-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{barber.name}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--bvr-gold-bright)]">@{barber.username ?? barber.barberReference}</p>
                  </div>
                  <UserPlus className="h-4 w-4 text-[var(--bvr-green)]" />
                </div>
                <p className="mt-3 text-xs leading-5 text-white/42">{barber.readinessLabels.join(" · ")}</p>
              </button>
            )) : <p className="text-sm text-white/42">No eligible barber matches this search.</p>}
          </div>
        ) : null}
      </OwnerCard>

      {selectedInvite ? (
        <OwnerCard className="border-[var(--bvr-green-border)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-green)]">Invite {selectedInvite.name}</p>
              <p className="mt-2 text-sm text-white/48">The agreement becomes immutable when both sides accept. Future changes require ending it and creating a new agreement.</p>
            </div>
            <button type="button" aria-label="Close invite form" onClick={() => setSelectedInvite(null)} className="text-white/42"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select aria-label="Rent model" className={selectClassName} value={rentModel} onChange={(event) => setRentModel(event.target.value as typeof rentModel)}>
              <option value="booth_rent">Full Booth Rent</option>
              <option value="autobooth_rent">AutoBooth Rent</option>
            </select>
            <input aria-label="Booth rent amount" className={fieldClassName} inputMode="decimal" value={rentAmount} onChange={(event) => setRentAmount(event.target.value)} placeholder="Rent amount" />
            <select aria-label="Booth rent frequency" className={selectClassName} value={rentFrequency} onChange={(event) => setRentFrequency(event.target.value as typeof rentFrequency)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {rentModel === "autobooth_rent" ? <input aria-label="AutoBooth percentage" className={fieldClassName} inputMode="decimal" value={autoBoothPercent} onChange={(event) => setAutoBoothPercent(event.target.value)} placeholder="AutoBooth %" /> : <div className="hidden xl:block" />}
            <ActionButton disabled={inviteMutation.isPending} onClick={sendInvite}>Send invite <ArrowRight className="h-4 w-4" /></ActionButton>
          </div>
          <textarea aria-label="Invitation message" className={cn(fieldClassName, "mt-3 min-h-24 py-3")} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional invitation message" />
          {inviteMutation.error ? <p role="alert" className="mt-3 text-sm text-red-300">{inviteMutation.error.message}</p> : null}
        </OwnerCard>
      ) : null}

      <OwnerCard>
        <div className="border-b border-white/[0.08] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-serif text-3xl text-white">Active relationships<span className="text-[var(--bvr-gold-bright)]">.</span></p>
              <p className="mt-2 text-sm text-white/44">ChairSync reads eligibility, not barber money.</p>
            </div>
            <input aria-label="Relationship change reason" className={cn(fieldClassName, "max-w-md")} value={relationshipReason} onChange={(event) => setRelationshipReason(event.target.value)} placeholder="Reason required to pause, resume, or end" />
          </div>
        </div>
        <div className="divide-y divide-white/[0.07]">
          {activeRelationships.length ? activeRelationships.map((barber) => {
            const stats = operationStats(barber.barberId);
            const paused = barber.relationshipStatus === "paused";
            return (
              <div key={barber.relationshipId} className="grid gap-4 p-5 sm:px-6 xl:grid-cols-[1fr_0.85fr_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{barber.name}</p>
                    <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em]", paused ? "border-amber-300/25 text-amber-200" : "border-[var(--bvr-green-border)] text-[var(--bvr-green)]")}>{paused ? "Paused" : "ChairSync ready"}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/42">
                    {barber.routingModel === "autobooth_rent" ? "AutoBooth Rent" : "Full Booth Rent"}
                    {barber.boothRentAmount ? ` · $${barber.boothRentAmount}/${barber.boothRentFrequency ?? "period"}` : ""}
                    {barber.autoBoothPercent ? ` · ${Math.round(barber.autoBoothPercent * 100)}% auto-apply` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Booked", stats?.booked ?? 0],
                    ["Live", stats?.liveAppointments ?? 0],
                    ["Done", stats?.completed ?? 0]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-[12px] border border-white/[0.07] px-2 py-3">
                      <p className="font-serif text-2xl text-white">{value}</p>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/32">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <ActionButton
                    tone="quiet"
                    disabled={relationshipReason.trim().length < 3 || pauseMutation.isPending}
                    onClick={() => pauseMutation.mutate({
                      relationshipId: barber.relationshipId!,
                      paused: !paused,
                      reason: relationshipReason.trim()
                    })}
                  >
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? "Resume" : "Pause"}
                  </ActionButton>
                  <ActionButton
                    tone="danger"
                    disabled={paused || relationshipReason.trim().length < 3 || endMutation.isPending}
                    onClick={() => endMutation.mutate({
                      relationshipId: barber.relationshipId!,
                      reason: relationshipReason.trim()
                    })}
                  >
                    End
                  </ActionButton>
                </div>
                {paused ? <p className="text-xs text-amber-200/72 xl:col-span-3">Resume this relationship before ending it. Settle-first still applies.</p> : null}
              </div>
            );
          }) : (
            <div className="p-10 text-center">
              <Users className="mx-auto h-7 w-7 text-white/24" />
              <p className="mt-4 font-bold text-white/62">No active relationship is attached to this shop.</p>
            </div>
          )}
        </div>
      </OwnerCard>
      {directory.error || respondMutation.error || pauseMutation.error || endMutation.error ? (
        <p role="alert" className="text-sm text-red-300">
          {(directory.error ?? respondMutation.error ?? pauseMutation.error ?? endMutation.error)?.message}
        </p>
      ) : null}
    </div>
  );
}

function KioskPanel({ data }: { data: OwnerOperationsResponse }) {
  const kiosk = data.controls.kiosk;
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [rotationPolicy, setRotationPolicy] = useState(kiosk.rotationPolicy);
  const [guardrail, setGuardrail] = useState(String(kiosk.balanceGuardrailMinutes));
  const [paymentPolicy, setPaymentPolicy] = useState(kiosk.paymentCollectionPolicy);
  const [timeout, setTimeoutValue] = useState(String(kiosk.sessionTimeoutSeconds));
  const emergencyMutation = useSetOwnerKioskEmergencyMutation();
  const policyMutation = useUpdateOwnerKioskPolicyMutation();
  const pairMutation = usePairOwnerKioskMutation();
  const pinMutation = useSaveOwnerKioskPinMutation();
  const disabled = Boolean(kiosk.emergencyDisabledAt) || !kiosk.enabled;
  const canChange = reason.trim().length >= 3;

  function patchPolicy(patch: Record<string, boolean | string | number>) {
    policyMutation.mutate({
      shopId: data.scope.shopId,
      action: "policy",
      reason: reason.trim(),
      ...patch
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <span className={cn(
          "rounded-full border px-4 py-2 font-mono text-[10px] tracking-[0.12em]",
          kiosk.paired && !disabled
            ? "border-[var(--bvr-green-border)] text-[#9BE15D]"
            : "border-[var(--bvr-gold-border)] text-[var(--bvr-gold-bright)]"
        )}>
          {kiosk.paired && !disabled ? "HEALTH ✓" : statusLabel(kiosk.healthStatus)} · {kiosk.paired ? "paired" : "pair required"}
        </span>
        <ActionButton
          tone={disabled ? "green" : "danger"}
          disabled={!kiosk.paired || !canChange || emergencyMutation.isPending}
          onClick={() => emergencyMutation.mutate({
            shopId: data.scope.shopId,
            disabled: !disabled,
            reason: reason.trim()
          })}
        >
          {disabled ? "Restore kiosk" : "Emergency disable"}
        </ActionButton>
      </div>
      <h2 className="pt-3 font-serif text-[44px] font-normal leading-[1.05] text-white">
        The front door’s rulebook<span className="text-[var(--bvr-green)]">.</span>
      </h2>

      <OwnerCard className="p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <div className="flex items-start gap-4">
              <span className="rounded-[14px] border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] p-3 text-[var(--bvr-green)]">
                {kiosk.paired ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
              </span>
              <div>
                <p className="font-serif text-3xl text-white">Device pairing<span className="text-[var(--bvr-gold-bright)]">.</span></p>
                <p className="mt-2 text-sm leading-6 text-white/45">Issue a one-time pairing code, store only its hash, and bind this kiosk to the selected shop.</p>
              </div>
            </div>
            {pairMutation.data ? (
              <div className="mt-5 rounded-[14px] border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] p-5 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-green)]">One-time pairing code</p>
                <p className="mt-3 font-mono text-4xl tracking-[0.22em] text-white">{pairMutation.data.pairingCode}</p>
                <p className="mt-2 text-xs text-white/42">Expires at {formatTime(pairMutation.data.expiresAt)}.</p>
              </div>
            ) : null}
            <ActionButton className="mt-5" disabled={!canChange || pairMutation.isPending} onClick={() => pairMutation.mutate({ shopId: data.scope.shopId, reason: reason.trim() })}>
              <Link2 className="h-4 w-4" /> {kiosk.paired ? "Re-pair device" : "Pair device"}
            </ActionButton>
          </div>

          <div>
            <div className="flex items-start gap-4">
              <span className="rounded-[14px] border border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] p-3 text-[var(--bvr-gold-bright)]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <p className="font-serif text-3xl text-white">Kiosk PIN<span className="text-[var(--bvr-gold-bright)]">.</span></p>
                <p className="mt-2 text-sm leading-6 text-white/45">The four-digit operator PIN is hashed before storage.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input aria-label="Set kiosk PIN" className={fieldClassName} inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={kiosk.pinSet ? "PIN already set" : "0000"} />
              <ActionButton disabled={pin.length !== 4 || pinMutation.isPending} onClick={() => pinMutation.mutate({ shopId: data.scope.shopId, pin })}>Save PIN</ActionButton>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <input aria-label="Kiosk change reason" className={fieldClassName} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required for pairing, policy, and emergency changes" />
        </div>
      </OwnerCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <OwnerCard className="p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bvr-gold-bright)]">Privacy & entry</p>
          <Toggle label="Privacy mode" detail="Hide guest data between kiosk sessions." checked={kiosk.privacyMode} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ privacyMode: !kiosk.privacyMode })} />
          <Toggle label="Automatic reset" detail="Clear the previous guest’s session after completion or timeout." checked={kiosk.autoResetEnabled} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ autoResetEnabled: !kiosk.autoResetEnabled })} />
          <Toggle label="Guest check-in" detail="Allow guests to check in without borrowing a staff account." checked={kiosk.guestCheckinAllowed} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ guestCheckinAllowed: !kiosk.guestCheckinAllowed })} />
          <Toggle label="External check-in" detail="Allow scheduling-only provider guests to check in; external money stays external." checked={kiosk.externalCheckinEnabled} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ externalCheckinEnabled: !kiosk.externalCheckinEnabled })} />
          <Toggle label="QR entry" detail="Show the privacy-safe QR handoff." checked={kiosk.qrEntryEnabled} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ qrEntryEnabled: !kiosk.qrEntryEnabled })} />
          <Toggle label="NFC entry" detail="Enable NFC handoff only on supported hardware." checked={kiosk.nfcEntryEnabled} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ nfcEntryEnabled: !kiosk.nfcEntryEnabled })} />
        </OwnerCard>

        <OwnerCard className="p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7FB5FF]">Rotation & payment</p>
          <div className="mt-5 grid gap-4">
            <label>
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">Rotation policy</span>
              <select aria-label="Kiosk rotation policy" className={selectClassName} value={rotationPolicy} onChange={(event) => setRotationPolicy(event.target.value as typeof rotationPolicy)}>
                <option value="strict">Strict rotation</option>
                <option value="balanced">Balanced</option>
                <option value="fastest_available">Fastest available</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">Balance guardrail minutes</span>
              <input aria-label="Balance guardrail minutes" className={fieldClassName} inputMode="numeric" value={guardrail} onChange={(event) => setGuardrail(event.target.value)} />
            </label>
            <label>
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">Payment collection</span>
              <select aria-label="Kiosk payment collection policy" className={selectClassName} value={paymentPolicy} onChange={(event) => setPaymentPolicy(event.target.value as typeof paymentPolicy)}>
                <option value="barber_checkout">Barber checkout</option>
                <option value="prepay">Prepay at kiosk</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">Session timeout seconds</span>
              <input aria-label="Kiosk session timeout" className={fieldClassName} inputMode="numeric" value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} />
            </label>
            <ActionButton
              disabled={!canChange || policyMutation.isPending}
              onClick={() => patchPolicy({
                rotationPolicy,
                balanceGuardrailMinutes: Number(guardrail),
                paymentCollectionPolicy: paymentPolicy,
                sessionTimeoutSeconds: Number(timeout)
              })}
            >
              Save kiosk rules
            </ActionButton>
          </div>
          <div className="mt-6 border-t border-white/[0.08] pt-2">
            <Toggle label="ClientBridge prompt" detail="Offer account claim only after explicit guest consent." checked={kiosk.clientBridgePromptEnabled} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ clientBridgePromptEnabled: !kiosk.clientBridgePromptEnabled })} />
            <Toggle label="Failure escalation" detail="Escalate failed kiosk notifications to the operating team." checked={kiosk.notificationFailureEscalation} disabled={!canChange || policyMutation.isPending} onChange={() => patchPolicy({ notificationFailureEscalation: !kiosk.notificationFailureEscalation })} />
          </div>
        </OwnerCard>
      </div>

      {!kiosk.paired ? <p className="text-sm text-amber-200">Pair this kiosk before emergency controls can run.</p> : null}
      {emergencyMutation.error || policyMutation.error || pairMutation.error || pinMutation.error ? (
        <p role="alert" className="text-sm text-red-300">
          {(emergencyMutation.error ?? policyMutation.error ?? pairMutation.error ?? pinMutation.error)?.message}
        </p>
      ) : null}
    </div>
  );
}

function ChairsPanel({ data }: { data: OwnerOperationsResponse }) {
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const createMutation = useCreateOwnerChairMutation();
  const retireMutation = useRetireOwnerChairMutation();
  const activeChairs = data.controls.chairs.filter((chair) => chair.active);
  const filledChairs = activeChairs.filter((chair) => chair.assignedBarberId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div>
          <h2 className="font-serif text-4xl text-white">Chairs & booths</h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">
            {activeChairs.length} chairs · booth rent only · no commission {/* doctrine-allow: approved redesign copy states the permanent exclusion */}
          </p>
        </div>
        <span className="rounded-full border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bvr-green)]">
          Live registry
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Rent billed" value={formatMoney(data.controls.boothRent.billedCents)} detail="Shop-owned booth rent truth." />
        <MetricCard label="Filled" value={`${filledChairs.length} / ${activeChairs.length}`} detail="Chairs assigned through active relationships." tone="blue" />
        <MetricCard label="Open" value={Math.max(activeChairs.length - filledChairs.length, 0)} detail="Available floor stations." tone="green" />
      </div>

      <OwnerCard className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="rounded-[14px] border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] p-3 text-[var(--bvr-green)]">
            <Armchair className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-serif text-3xl text-white">Add a chair<span className="text-[var(--bvr-gold-bright)]">.</span></p>
            <p className="mt-2 text-sm leading-6 text-white/45">Chair labels are shop-scoped. Barber assignment stays unique within this floor.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
          <input aria-label="New chair label" className={fieldClassName} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Chair label" />
          <input aria-label="Chair change reason" className={fieldClassName} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required" />
          <ActionButton
            disabled={label.trim().length < 1 || reason.trim().length < 3 || createMutation.isPending}
            onClick={() => createMutation.mutate({
              shopId: data.scope.shopId,
              label: label.trim(),
              sortOrder: data.controls.chairs.length,
              reason: reason.trim()
            })}
          >
            <Plus className="h-4 w-4" /> Add chair
          </ActionButton>
        </div>
      </OwnerCard>

      <OwnerCard>
        <div className="border-b border-white/[0.08] p-5 sm:p-6">
          <p className="font-serif text-3xl text-white">Chairs & Booths<span className="text-[var(--bvr-gold-bright)]">.</span></p>
          <p className="mt-2 text-sm text-white/44">Manage and invite from Team. Retire only after open booth rent is settled.</p>
        </div>
        <div className="divide-y divide-white/[0.07]">
          {data.controls.chairs.length ? data.controls.chairs.map((chair) => (
            <div key={chair.chairId} className="grid gap-4 p-5 sm:px-6 md:grid-cols-[80px_1fr_auto] md:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-white/[0.09] bg-white/[0.025]">
                <Armchair className="h-6 w-6 text-white/48" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-white">{chair.label}</p>
                  <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em]", chair.active ? "border-[var(--bvr-green-border)] text-[var(--bvr-green)]" : "border-white/10 text-white/36")}>
                    {chair.active ? chair.assignedBarberId ? "Filled" : "Open" : "Retired"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/38">{chair.assignedBarberId ? "Assigned through the active team relationship." : "No barber assigned."}</p>
              </div>
              {chair.active ? (
                <ActionButton
                  tone="quiet"
                  disabled={reason.trim().length < 3 || retireMutation.isPending}
                  onClick={() => retireMutation.mutate({
                    shopId: data.scope.shopId,
                    chairId: chair.chairId,
                    reason: reason.trim()
                  })}
                >
                  Retire
                </ActionButton>
              ) : null}
            </div>
          )) : (
            <div className="p-10 text-center">
              <Armchair className="mx-auto h-7 w-7 text-white/24" />
              <p className="mt-4 font-bold text-white/62">No chairs are registered for this shop yet.</p>
            </div>
          )}
        </div>
      </OwnerCard>
      {createMutation.error || retireMutation.error ? (
        <p role="alert" className="text-sm text-red-300">{(createMutation.error ?? retireMutation.error)?.message}</p>
      ) : null}
    </div>
  );
}

export function OwnerOperationsWorkspace({
  shopIds,
  initialTab = "home"
}: {
  shopIds: string[];
  initialTab?: OwnerOperationsTab;
}) {
  const uniqueShopIds = useMemo(() => Array.from(new Set(shopIds.filter(Boolean))), [shopIds]);
  const [selectedShopId, setSelectedShopId] = useState(uniqueShopIds.length > 1 ? uniqueShopIds[0] : undefined);
  const [tab, setTab] = useState<OwnerOperationsTab>(initialTab);
  const query = useOwnerOperationsQuery(selectedShopId);
  const activeChairCount = query.data?.controls.chairs.reduce(
    (count, chair) => count + (chair.active ? 1 : 0),
    0
  ) ?? 0;
  const screenLabel = {
    home: "Owner Home · 3.1",
    floor: "Floor Day · P3 states & controls · 3.5",
    team: "Owner · Team · 3.2",
    kiosk: "Owner · Kiosk settings · 3.4",
    chairs: "Chairs & booths · floor registry"
  }[tab];

  return (
    <div className="min-h-screen bg-[#060708] pb-12 text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#060708]/95 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3">
          <p className="font-display text-sm font-black tracking-[0.22em] text-white">
            BVRB<span className="text-[var(--bvr-green)]">3</span>R
          </p>
          <label className="relative">
            <span className="sr-only">Owner screen</span>
            <select
              aria-label="Owner screen"
              value={tab}
              onChange={(event) => setTab(event.target.value as OwnerOperationsTab)}
              className="min-h-9 appearance-none rounded-full border border-[var(--bvr-gold-border)] bg-black px-4 pr-8 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--bvr-gold-bright)] outline-none focus:border-[var(--bvr-green)]"
            >
              {tabOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-3 top-2.5 text-[10px] text-[var(--bvr-gold-bright)]">⌄</span>
          </label>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.15em] text-white/34 sm:inline">
            {screenLabel}
          </span>

          {tab === "home" ? (
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#E4F9B8]">
                <span className={cn("h-2 w-2 rounded-full", query.data?.controls.floor.intakeOpen ? "bg-[var(--bvr-green)]" : "bg-red-300")} />
                {query.data?.controls.floor.intakeOpen ? "Open" : "Closed"} · {query.data?.summary.inService ?? 0} of {activeChairCount} chairs cutting
              </span>
            </div>
          ) : null}

          <span className="flex-1" />
          {tab === "home" ? (
            <>
              <span className={cn("rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em]", query.data?.controls.kiosk.paired ? "border-[var(--bvr-green-border)] text-[#9BE15D]" : "border-[var(--bvr-gold-border)] text-[var(--bvr-gold-bright)]")}>
                Kiosk {query.data?.controls.kiosk.paired ? "✓" : "unpaired"}
              </span>
              <span className="rounded-full border border-[var(--bvr-green-border)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9BE15D]">
                ChairSync ✓
              </span>
            </>
          ) : null}

          {uniqueShopIds.length > 1 ? (
            <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/42">
              Shop
              <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)} className="min-h-9 rounded-full border border-white/10 bg-black px-4 text-xs font-bold normal-case tracking-normal text-white">
                {uniqueShopIds.map((shopId) => <option key={shopId} value={shopId}>{shopId}</option>)}
              </select>
            </label>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/38">
              {query.data?.scope.shopName ?? "Shop"}
            </span>
          )}
          <Link
            href="/dashboard/owner/reports"
            className="inline-flex min-h-9 items-center rounded-full border border-[#C4F24E]/28 px-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#C4F24E]"
          >
            Reports
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1080px] px-4 sm:px-8">
        {query.isLoading ? (
          <OwnerCard className="mt-6 p-10 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/46">Loading this shop’s operational truth…</p>
          </OwnerCard>
        ) : query.error || !query.data ? (
          <OwnerCard className="mt-6 border-red-400/20 p-10 text-center">
            <AlertTriangle className="mx-auto h-7 w-7 text-red-300" />
            <p className="mt-4 font-bold text-white">Owner operations could not open.</p>
            <p className="mt-2 text-sm text-white/48">{query.error instanceof Error ? query.error.message : "Try this shop again."}</p>
          </OwnerCard>
        ) : tab === "home" ? (
          <HomePanel data={query.data} />
        ) : tab === "floor" ? (
          <FloorPanel data={query.data} />
        ) : tab === "team" ? (
          <TeamPanel data={query.data} />
        ) : tab === "kiosk" ? (
          <KioskPanel data={query.data} />
        ) : (
          <ChairsPanel data={query.data} />
        )}
      </div>
    </div>
  );
}
