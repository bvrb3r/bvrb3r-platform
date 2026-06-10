"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import type { MoreSettingField, MoreSettingModalSpec } from "@/components/dashboard/more/more-setting-modal-registry";
import { cn } from "@/lib/utils";

type MoreHref = string;

function modeLabel(mode: MoreSettingModalSpec["mode"]) {
  switch (mode) {
    case "editable":
      return "Editable setting";
    case "read_only":
      return "Read-only detail";
    case "requirements":
      return "Requirements";
    case "ledger":
      return "Ledger detail";
    case "verification":
      return "Verification control";
    case "legal":
      return "Legal control";
    case "support":
      return "Support control";
  }
}

function privacyLabel(spec: MoreSettingModalSpec) {
  switch (spec.privacyLevel ?? "private") {
    case "public":
      return "Public-safe setting";
    case "private":
      return "Private account setting";
    case "financial":
      return "Private financial setting";
    case "compliance":
      return "Private compliance setting";
  }
}

function formatFieldValue(value: MoreSettingField["value"]) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }

  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return String(value);
}

function FieldControl({
  field,
  canEdit,
  onDirtyChange
}: {
  field: MoreSettingField;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const editable = canEdit && field.editable !== false;
  const baseLabel = (
    <span>
      <span className="block text-sm font-extrabold text-white">{field.label}</span>
      {field.helper ? <span className="mt-1 block text-sm leading-6 text-white/52">{field.helper}</span> : null}
      <span className="mt-2 flex flex-wrap gap-2">
        {field.private ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/38">Private</span> : null}
        {field.public ? <span className="rounded-full border border-[#A3FF12]/20 bg-[#A3FF12]/8 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#A3FF12]">Public-safe</span> : null}
        {field.required ? <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">Required</span> : null}
      </span>
    </span>
  );

  if (field.type === "toggle") {
    return (
      <label className="flex min-h-16 items-center justify-between gap-4 rounded-[18px] border border-white/10 bg-black/24 p-4">
        {baseLabel}
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[#A3FF12] disabled:opacity-45"
          defaultChecked={Boolean(field.value)}
          disabled={!editable}
          onChange={(event) => onDirtyChange(event.target.checked !== Boolean(field.value))}
        />
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block rounded-[18px] border border-white/10 bg-black/24 p-4">
        {baseLabel}
        <textarea
          className="mt-3 min-h-24 w-full rounded-[14px] border border-white/10 bg-black/35 px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/32 disabled:text-white/44"
          defaultValue={formatFieldValue(field.value)}
          disabled={!editable}
          onChange={() => onDirtyChange(true)}
        />
      </label>
    );
  }

  if (field.type === "select" || field.type === "multi_select") {
    return (
      <label className="block rounded-[18px] border border-white/10 bg-black/24 p-4">
        {baseLabel}
        <select
          className="mt-3 min-h-11 w-full rounded-[14px] border border-white/10 bg-black/35 px-3 text-sm font-semibold text-white outline-none disabled:text-white/44"
          defaultValue={field.options?.[0]?.value ?? "current"}
          disabled={!editable}
          onChange={() => onDirtyChange(true)}
        >
          {(field.options?.length ? field.options : [{ label: formatFieldValue(field.value), value: "current" }]).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "money" || field.type === "number" || field.type === "text" || field.type === "time_range") {
    return (
      <label className="block rounded-[18px] border border-white/10 bg-black/24 p-4">
        {baseLabel}
        <input
          type={field.type === "number" || field.type === "money" ? "number" : "text"}
          className="mt-3 min-h-11 w-full rounded-[14px] border border-white/10 bg-black/35 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/32 disabled:text-white/44"
          defaultValue={formatFieldValue(field.value)}
          disabled={!editable}
          onChange={() => onDirtyChange(true)}
        />
      </label>
    );
  }

  return (
    <div className="rounded-[18px] border border-white/10 bg-black/24 p-4">
      {baseLabel}
      <p className="mt-3 rounded-[14px] border border-white/8 bg-white/[0.025] px-3 py-3 text-sm font-semibold text-white/68">
        {formatFieldValue(field.value)}
      </p>
    </div>
  );
}

function MetadataList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-[18px] border border-white/10 bg-black/24 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/38">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm leading-5 text-white/58">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#A3FF12]/62" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MoreSettingModalContent({
  spec,
  href,
  onDirtyChange
}: {
  spec: MoreSettingModalSpec;
  href?: MoreHref;
  dirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const isLocked = spec.mode === "requirements";
  const canEdit = Boolean(spec.saveAction);
  const fields = spec.fields ?? [];
  const dataSources = spec.dataSources ?? [];
  const syncTargets = spec.syncTargets ?? [];
  const validations = spec.validations ?? [];
  const permissions = spec.permissions ?? [];

  return (
    <div className="space-y-5">
      <div className={cn(
        "rounded-[22px] border p-4",
        isLocked ? "border-amber-300/20 bg-amber-300/[0.06]" : "border-white/10 bg-white/[0.035]"
      )}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
            {isLocked ? <LockKeyhole className="h-5 w-5" aria-hidden="true" /> : <Settings2 className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white">{modeLabel(spec.mode)}</p>
            <p className="mt-1 text-sm leading-6 text-white/56">{spec.helper}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-white/42">{privacyLabel(spec)}</span>
              {spec.statusLabel ? <span className="rounded-full border border-[#A3FF12]/20 bg-[#A3FF12]/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-[#A3FF12]">{spec.statusLabel}</span> : null}
            </div>
          </div>
        </div>
      </div>

      {fields.length ? (
        <div className="space-y-3" data-testid="more-setting-contract-fields">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Current controls</p>
            <span className={cn(
              "rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em]",
              canEdit ? "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]" : "border-white/10 bg-white/[0.035] text-white/40"
            )}>
              {canEdit ? "Save action wired" : "Save disabled"}
            </span>
          </div>
          <div className="grid gap-3">
            {fields.map((field) => (
              <FieldControl key={field.key} field={field} canEdit={canEdit} onDirtyChange={onDirtyChange} />
            ))}
          </div>
        </div>
      ) : null}

      {spec.lockedReason ? (
        <div className="rounded-[18px] border border-amber-300/18 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-100/84">
          {spec.lockedReason}
        </div>
      ) : null}

      {spec.requirements?.length ? (
        <div className="space-y-3 rounded-[22px] border border-white/10 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Requirements</p>
          <div className="grid gap-2">
            {spec.requirements.map((requirement) => (
              <div key={requirement} className="flex items-center gap-3 text-sm text-white/64">
                <CheckCircle2 className="h-4 w-4 text-white/30" aria-hidden="true" />
                <span>{requirement}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {spec.missingSavePath ? (
        <div className="rounded-[18px] border border-amber-300/18 bg-amber-300/[0.045] p-4">
          <p className="text-sm font-extrabold text-amber-100">Canonical save path required</p>
          <p className="mt-1 text-sm leading-6 text-amber-100/72">{spec.missingSavePath}</p>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <MetadataList title="Source of truth" items={dataSources} />
        <MetadataList title="Sync targets" items={syncTargets} />
        <MetadataList title="Validations" items={validations} />
        <MetadataList title="Permissions" items={permissions} />
      </div>

      {(spec.auditEventName || spec.algorithmSignals?.length) ? (
        <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#A3FF12]" aria-hidden="true" />
            <div>
              <p className="text-sm font-extrabold text-white">Platform sync contract</p>
              {spec.auditEventName ? <p className="mt-1 text-sm leading-6 text-white/56">Audit event: <span className="font-bold text-white/72">{spec.auditEventName}</span></p> : null}
              {spec.algorithmSignals?.length ? <p className="mt-1 text-sm leading-6 text-white/56">Automation signals: {spec.algorithmSignals.join(", ")}.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {href ? (
        <Link
          href={href as never}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
        >
          Open full workspace
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}

      {!canEdit ? (
        <p className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/54">
          Save Changes is disabled here until this setting has a canonical role-safe save action. Current state, privacy rules, source records, and sync targets are still visible in this popup.
        </p>
      ) : null}
    </div>
  );
}
