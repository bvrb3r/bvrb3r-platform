"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Armchair,
  Building2,
  Clock3,
  MonitorSmartphone,
  ShieldCheck,
  Users
} from "lucide-react";
import { GlassCard } from "@/design/components/GlassCard";
import { Button } from "@/components/ui/button";
import {
  useCreateOwnerChairMutation,
  useOwnerOperationsQuery,
  useRetireOwnerChairMutation,
  useSetOwnerKioskEmergencyMutation,
  useUpdateOwnerFloorMutation
} from "@/lib/owner-operations/client";
import type { OwnerOperationsResponse } from "@/lib/owner-operations/domain";
import { cn } from "@/lib/utils";

type OwnerOperationsTab = "home" | "floor" | "team" | "kiosk" | "chairs";

const tabOptions: Array<{
  id: OwnerOperationsTab;
  label: string;
}> = [
  { id: "home", label: "Home" },
  { id: "floor", label: "Floor Day" },
  { id: "team", label: "Team" },
  { id: "kiosk", label: "Kiosk" },
  { id: "chairs", label: "Chairs & Booths" }
];

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

function SummaryCard({
  label,
  value,
  detail
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <GlassCard className="p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p className="mt-4 text-4xl font-black tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-white/54">{detail}</p>
    </GlassCard>
  );
}

function HomePanel({ data }: { data: OwnerOperationsResponse }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Floor volume" value={data.summary.floorVolume} detail="Appointments and live walk-ins." />
        <SummaryCard label="Waiting" value={data.summary.waiting} detail="Guests awaiting a chair." />
        <SummaryCard label="Active barbers" value={data.summary.activeBarbers} detail="Open or currently serving." />
        <SummaryCard label="Open chairs" value={data.summary.openChairs} detail="Available floor capacity." />
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C4F24E]" />
          <div>
            <p className="font-black text-white">Owner privacy boundary</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{data.privacyNotice}</p>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard className="p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Source counts</p>
          <div className="mt-5 space-y-3">
            {data.sourceCounts.length ? data.sourceCounts.map((entry) => (
              <div key={entry.source} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
                <span className="font-bold text-white/78">{entry.label}</span>
                <span className="text-lg font-black text-white">{entry.count}</span>
              </div>
            )) : (
              <p className="text-sm leading-6 text-white/48">No floor sources have posted for this shop yet.</p>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Critical alerts</p>
          <div className="mt-5 space-y-3">
            {data.alerts.length ? data.alerts.map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.055] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="font-black text-white">{alert.title}</p>
                    <p className="mt-1 text-sm leading-6 text-white/56">{alert.detail}</p>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-sm leading-6 text-white/48">No critical floor alerts for this shop.</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function FloorPanel({ data }: { data: OwnerOperationsResponse }) {
  const [reason, setReason] = useState("");
  const floorMutation = useUpdateOwnerFloorMutation();
  const canSubmit = reason.trim().length >= 3 && !floorMutation.isPending;

  return (
    <div className="space-y-5">
      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Walk-in intake</p>
            <p className="mt-2 text-xl font-black text-white">
              {data.controls.floor.intakeOpen ? "Open" : "Closed"}
            </p>
            <p className="mt-2 text-sm text-white/48">
              {data.controls.floor.floorNote ?? "No floor note is posted."}
            </p>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
            <input
              aria-label="Floor change reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason required"
              className="min-h-12 flex-1 rounded-full border border-white/10 bg-black/50 px-4 text-sm text-white placeholder:text-white/30"
            />
            <Button
              type="button"
              variant={data.controls.floor.intakeOpen ? "secondary" : "primary"}
              disabled={!canSubmit}
              onClick={() => floorMutation.mutate({
                shopId: data.scope.shopId,
                intakeOpen: !data.controls.floor.intakeOpen,
                reason: reason.trim()
              })}
            >
              {data.controls.floor.intakeOpen ? "Close intake" : "Open intake"}
            </Button>
          </div>
        </div>
        {floorMutation.error ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {floorMutation.error instanceof Error ? floorMutation.error.message : "Unable to change intake."}
          </p>
        ) : null}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="text-xl font-black tracking-[-0.03em] text-white">Today’s lanes</p>
          <p className="mt-2 text-sm leading-6 text-white/52">
            Source and payment ownership stay visible. Service money and tips stay with the barber.
          </p>
        </div>
        <div className="divide-y divide-white/7">
          {data.floor.length ? data.floor.map((entry) => (
            <div key={`${entry.kind}-${entry.id}`} className="grid gap-3 p-5 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-white">{entry.clientDisplayName}</p>
                  <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/58">
                    {entry.sourceLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/52">{entry.serviceDisplayName}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-white/74">{entry.barberDisplayName ?? "Unassigned chair"}</p>
                <p className="mt-1 text-xs text-white/42">
                  {entry.waitMinutes !== null ? `${entry.waitMinutes} min wait` : formatTime(entry.startsAt)}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#C4F24E]">{statusLabel(entry.status)}</p>
                <p className="mt-1 text-xs text-white/38">
                  {entry.paymentOwner === "external_provider" ? "External provider owns payment" : entry.paymentOwner === "barber" ? "Barber-owned payment" : "Payment owner pending"}
                </p>
              </div>
            </div>
          )) : (
            <div className="p-8 text-center">
              <Clock3 className="mx-auto h-7 w-7 text-white/30" />
              <p className="mt-4 font-bold text-white/70">No floor activity has posted for this shop.</p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function TeamPanel({ data }: { data: OwnerOperationsResponse }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.team.length ? data.team.map((barber) => (
        <GlassCard key={barber.barberId} className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black text-white">{barber.name}</p>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-[#C4F24E]">
                {statusLabel(barber.floorState)}
              </p>
            </div>
            <Users className="h-5 w-5 text-white/38" />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            {[
              ["Booked", barber.booked],
              ["Live", barber.liveAppointments],
              ["Done", barber.completed]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-xl font-black text-white">{value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/38">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-white/48">Next: {formatTime(barber.nextAppointmentStart)}</p>
        </GlassCard>
      )) : (
        <GlassCard className="p-8 text-center md:col-span-2 xl:col-span-3">
          <Users className="mx-auto h-7 w-7 text-white/30" />
          <p className="mt-4 font-bold text-white/70">No active team relationship is attached to this shop.</p>
        </GlassCard>
      )}
    </div>
  );
}

function KioskPanel({ data }: { data: OwnerOperationsResponse }) {
  const [reason, setReason] = useState("");
  const mutation = useSetOwnerKioskEmergencyMutation();
  const kiosk = data.controls.kiosk;
  const disabled = Boolean(kiosk.emergencyDisabledAt) || !kiosk.enabled;
  const canSubmit = kiosk.paired && reason.trim().length >= 3 && !mutation.isPending;

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <MonitorSmartphone className="mt-0.5 h-7 w-7 shrink-0 text-[#C4F24E]" />
        <div>
          <p className="text-xl font-black tracking-[-0.03em] text-white">Kiosk controls</p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/56">
            Pairing: {kiosk.paired ? "paired" : "not paired"} · Health: {statusLabel(kiosk.healthStatus)} · Privacy reset: {kiosk.privacyMode && kiosk.autoResetEnabled ? "on" : "needs review"} · QR: {kiosk.qrEntryEnabled ? "on" : "off"} · NFC: {kiosk.nfcEntryEnabled ? "on" : "off"}.
          </p>
          <div className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row">
            <input
              aria-label="Kiosk emergency reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason required"
              className="min-h-12 flex-1 rounded-full border border-white/10 bg-black/50 px-4 text-sm text-white placeholder:text-white/30"
            />
            <Button
              type="button"
              variant={disabled ? "primary" : "secondary"}
              disabled={!canSubmit}
              onClick={() => mutation.mutate({
                shopId: data.scope.shopId,
                disabled: !disabled,
                reason: reason.trim()
              })}
            >
              {disabled ? "Restore kiosk" : "Emergency disable"}
            </Button>
          </div>
          {!kiosk.paired ? <p className="mt-3 text-sm text-amber-200">Pair this kiosk before emergency controls can run.</p> : null}
          {mutation.error ? <p role="alert" className="mt-3 text-sm text-red-300">{mutation.error instanceof Error ? mutation.error.message : "Unable to change kiosk."}</p> : null}
        </div>
      </div>
    </GlassCard>
  );
}

function ChairsPanel({ data }: { data: OwnerOperationsResponse }) {
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const createMutation = useCreateOwnerChairMutation();
  const retireMutation = useRetireOwnerChairMutation();
  const canCreate = label.trim().length > 0 && reason.trim().length >= 3 && !createMutation.isPending;

  return (
    <div className="space-y-5">
      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Armchair className="mt-0.5 h-7 w-7 shrink-0 text-[#C4F24E]" />
          <div className="w-full">
            <p className="text-xl font-black tracking-[-0.03em] text-white">Chair and booth registry</p>
            <p className="mt-2 text-sm leading-6 text-white/54">
              Retirement is settle-first. Outstanding shop-owned booth rent: ${(data.controls.boothRent.outstandingCents / 100).toFixed(2)}.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
              <input aria-label="New chair label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Chair label" className="min-h-12 rounded-full border border-white/10 bg-black/50 px-4 text-sm text-white placeholder:text-white/30" />
              <input aria-label="Chair change reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required" className="min-h-12 rounded-full border border-white/10 bg-black/50 px-4 text-sm text-white placeholder:text-white/30" />
              <Button
                type="button"
                disabled={!canCreate}
                onClick={() => createMutation.mutate({
                  shopId: data.scope.shopId,
                  label: label.trim(),
                  sortOrder: data.controls.chairs.length,
                  reason: reason.trim()
                })}
              >
                Add chair
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.controls.chairs.length ? data.controls.chairs.map((chair) => (
          <GlassCard key={chair.chairId} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-white">{chair.label}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.13em] text-white/40">
                  {chair.active ? chair.assignedBarberId ? "Filled" : "Open" : "Retired"}
                </p>
              </div>
              {chair.active ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={reason.trim().length < 3 || retireMutation.isPending}
                  onClick={() => retireMutation.mutate({
                    shopId: data.scope.shopId,
                    chairId: chair.chairId,
                    reason: reason.trim()
                  })}
                >
                  Retire
                </Button>
              ) : null}
            </div>
          </GlassCard>
        )) : (
          <GlassCard className="p-8 text-center md:col-span-2 xl:col-span-3">
            <Armchair className="mx-auto h-7 w-7 text-white/30" />
            <p className="mt-4 font-bold text-white/70">No chairs are registered for this shop yet.</p>
          </GlassCard>
        )}
      </div>
      {createMutation.error || retireMutation.error ? (
        <p role="alert" className="text-sm text-red-300">
          {(createMutation.error ?? retireMutation.error) instanceof Error
            ? (createMutation.error ?? retireMutation.error)?.message
            : "Unable to change this chair."}
        </p>
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

  return (
    <div className="space-y-5">
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#C4F24E]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black text-white">{query.data?.scope.shopName ?? "Shop operations"}</p>
              <p className="mt-0.5 text-xs text-white/42">{query.data?.scope.locationLabel ?? "One shop at a time"}</p>
            </div>
          </div>

          {uniqueShopIds.length > 1 ? (
            <label className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.13em] text-white/46">
              Shop
              <select
                value={selectedShopId}
                onChange={(event) => setSelectedShopId(event.target.value)}
                className="min-h-11 rounded-full border border-white/10 bg-black px-4 text-sm font-bold normal-case tracking-normal text-white"
              >
                {uniqueShopIds.map((shopId) => <option key={shopId} value={shopId}>{shopId}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </GlassCard>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-xs font-black uppercase tracking-[0.12em] transition",
              tab === option.id
                ? "border-[#C4F24E]/40 bg-[#C4F24E]/12 text-[#C4F24E]"
                : "border-white/9 bg-white/[0.025] text-white/50 hover:text-white"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <GlassCard className="p-8 text-center">
          <p className="font-bold text-white/62">Loading this shop’s operational truth…</p>
        </GlassCard>
      ) : query.error || !query.data ? (
        <GlassCard className="border-red-400/20 bg-red-400/[0.045] p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-red-300" />
          <p className="mt-4 font-black text-white">Owner operations could not open.</p>
          <p className="mt-2 text-sm text-white/52">{query.error instanceof Error ? query.error.message : "Try this shop again."}</p>
        </GlassCard>
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
  );
}
