"use client";

import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MoreSettingModal } from "@/components/dashboard/more/more-setting-modal";
import { resolveMoreSettingModalSpec, type MoreSettingRoleScope } from "@/components/dashboard/more/more-setting-modal-registry";
import { Avatar, GlassCard } from "@/design/components";
import { cn } from "@/lib/utils";

type MoreTone = "green" | "yellow" | "red" | "muted";
type MoreVariant = "client" | "barber" | "owner";
type MoreHref = string | ComponentProps<typeof Link>["href"];

export type MoreBadge = {
  label: string;
  tone?: MoreTone;
};

export type MoreAction = {
  label: string;
  href?: MoreHref;
  onClick?: () => void;
};

export type MoreReadinessTile = {
  label: string;
  value: string;
  helper?: string;
  tone?: MoreTone;
  href?: MoreHref;
};

export type MoreIdentityDetail = string | {
  label: string;
  value?: string | null;
};

export type MoreSectionRow = {
  title: string;
  subtitle: string;
  href?: MoreHref;
  onClick?: () => void;
  status?: string;
  tone?: MoreTone;
  icon?: ReactNode;
  needsAction?: boolean;
  testId?: string;
};

export type MoreSectionGroup = {
  title: string;
  subtitle?: string;
  rows: MoreSectionRow[];
  id?: string;
  roleScope?: MoreSettingRoleScope;
};

function toneClasses(tone: MoreTone = "muted") {
  switch (tone) {
    case "green":
      return "border-[#C4F24E]/26 bg-[#C4F24E]/10 text-[#C4F24E]";
    case "yellow":
      return "border-amber-300/26 bg-amber-300/10 text-amber-200";
    case "red":
      return "border-red-400/26 bg-red-500/10 text-red-200";
    case "muted":
      return "border-white/10 bg-white/[0.045] text-white/62";
  }
}

function actionClasses(kind: "primary" | "secondary") {
  return cn(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/60",
    kind === "primary"
      ? "border border-[#C4F24E]/40 bg-[#C4F24E]/12 text-[#C4F24E] shadow-[0_0_28px_rgba(196, 242, 78,0.14)] hover:border-[#C4F24E]/70 hover:bg-[#C4F24E]/16"
      : "border border-white/10 bg-white/[0.035] text-white/78 hover:border-[#C4F24E]/28 hover:text-[#C4F24E]"
  );
}

function MoreActionLink({ action, kind }: { action: MoreAction; kind: "primary" | "secondary" }) {
  if (action.href) {
    return (
      <Link href={action.href as never} className={actionClasses(kind)}>
        {action.label}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <button type="button" className={actionClasses(kind)} onClick={action.onClick}>
      {action.label}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function MorePageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="space-y-3">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#C4F24E]">Control center</p>
      <div>
        <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/62 sm:text-lg">{subtitle}</p>
      </div>
    </header>
  );
}

export function MoreIdentityReadinessCard({
  variant,
  imageUrl,
  initials,
  title,
  roleLabel,
  badges,
  metaLines,
  primaryAction,
  secondaryAction,
  tiles
}: {
  variant: MoreVariant;
  imageUrl?: string | null;
  initials?: string;
  title: string;
  subtitle?: string;
  roleLabel: string;
  badges: MoreBadge[];
  metaLines: MoreIdentityDetail[];
  primaryAction?: MoreAction;
  secondaryAction?: MoreAction;
  tiles: MoreReadinessTile[];
}) {
  const avatarLabel = "profile photo";

  return (
    <GlassCard active className="overflow-hidden p-5 sm:p-6" data-testid={`${variant}-more-identity-card`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C4F24E]/45 to-transparent" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <Avatar
          src={imageUrl}
          alt={`${title} ${avatarLabel}`}
          initials={initials}
          className="h-24 w-24 rounded-[28px] border-2 border-[#C4F24E]/65 text-2xl shadow-[0_0_0_2px_rgba(196, 242, 78,0.10),0_22px_54px_rgba(0,0,0,0.48)] sm:h-32 sm:w-32"
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">{title}</h2>
            <span className="rounded-full border border-[#C4F24E]/24 bg-[#C4F24E]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] text-[#C4F24E]">
              {roleLabel}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span key={badge.label} className={cn("rounded-full border px-3 py-1.5 text-xs font-extrabold", toneClasses(badge.tone))}>
                {badge.label}
              </span>
            ))}
          </div>
          {metaLines.length ? (
            <div className="mt-4 grid gap-2 text-sm leading-6 text-white/58 sm:grid-cols-2">
              {metaLines.map((line) => {
                const detail = typeof line === "string" ? { label: "", value: line } : line;
                const value = detail.value?.trim();
                if (!value) {
                  return null;
                }

                return (
                  <p key={`${detail.label}-${value}`} className="min-w-0">
                    {detail.label ? <span className="mr-2 font-black uppercase tracking-[0.12em] text-white/34">{detail.label}</span> : null}
                    <span className="break-words text-white/68">{value}</span>
                  </p>
                );
              })}
            </div>
          ) : null}
        </div>

        {(primaryAction || secondaryAction) ? (
          <div className="flex flex-wrap gap-3 lg:flex-col lg:items-stretch">
            {primaryAction ? <MoreActionLink action={primaryAction} kind="primary" /> : null}
            {secondaryAction ? <MoreActionLink action={secondaryAction} kind="secondary" /> : null}
          </div>
        ) : null}
      </div>

      {tiles.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {tiles.map((tile) => {
          const content = (
            <>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">{tile.label}</p>
              <p className={cn("mt-3 text-lg font-extrabold", tile.tone === "green" ? "text-[#C4F24E]" : tile.tone === "yellow" ? "text-amber-200" : tile.tone === "red" ? "text-red-200" : "text-white")}>{tile.value}</p>
              {tile.helper ? <p className="mt-2 text-sm leading-5 text-white/52">{tile.helper}</p> : null}
            </>
          );

          const className = "rounded-[20px] border border-white/8 bg-black/25 p-4 transition hover:border-[#C4F24E]/20";

          return tile.href ? (
            <Link key={tile.label} href={tile.href as never} className={className}>
              {content}
            </Link>
          ) : (
            <div key={tile.label} className={className}>
              {content}
            </div>
          );
        })}
        </div>
      ) : null}
    </GlassCard>
  );
}

export function MoreActivationGate({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="space-y-3" data-testid="more-activation-gate">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C4F24E]">{title}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

export function MoreControlHub({
  title,
  subtitle,
  rows,
  roleScope = "shared"
}: {
  title: string;
  subtitle: string;
  rows: MoreSectionRow[];
  roleScope?: MoreSettingRoleScope;
}) {
  return (
    <GlassCard className="p-5 sm:p-6" data-testid="more-control-hub">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C4F24E]">{title}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">{subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <MoreSectionRowLink key={row.title} row={row} compact sectionTitle={title} roleScope={roleScope} />
        ))}
      </div>
    </GlassCard>
  );
}

function MoreSectionRowLink({
  row,
  compact = false,
  sectionTitle,
  roleScope = "shared"
}: {
  row: MoreSectionRow;
  compact?: boolean;
  sectionTitle?: string;
  roleScope?: MoreSettingRoleScope;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const href = typeof row.href === "string" ? row.href : undefined;
  const modalSpec = resolveMoreSettingModalSpec({ row, roleScope, sectionTitle });
  const handleOpen = () => setModalOpen(true);
  const handleSaved = () => {
    row.onClick?.();
  };
  const handleModalSave = modalSpec.saveEndpoint && modalSpec.saveAction
    ? async (values?: Record<string, unknown>) => {
      const requestBody = modalSpec.saveEndpoint === "/api/support/issue-intake"
        ? {
            ...modalSpec.savePayload,
            ...(values ?? {})
          }
        : {
            action: modalSpec.saveAction,
            ...modalSpec.savePayload,
            values: values ?? {}
          };
      const response = await fetch(modalSpec.saveEndpoint as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "Unable to save More setting.");
      }
    }
    : undefined;
  const body = (
    <>
      {row.icon ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#C4F24E]">
          {row.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold tracking-[-0.025em] text-white">{row.title}</span>
        <span className="mt-1 block text-sm leading-5 text-white/52">{row.subtitle}</span>
      </span>
      {row.status ? <span className={cn("hidden rounded-full border px-3 py-1.5 text-xs font-extrabold sm:inline-flex", toneClasses(row.tone))}>{row.status}</span> : null}
      {row.needsAction ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C4F24E] shadow-[0_0_14px_rgba(196, 242, 78,0.65)]"
          aria-label={`${row.title} needs action`}
        />
      ) : null}
      <ChevronRight className="h-5 w-5 shrink-0 text-white/36 transition group-hover:translate-x-0.5 group-hover:text-[#C4F24E]" aria-hidden="true" />
    </>
  );

  const className = cn(
    "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[20px] border border-white/8 bg-black/22 transition hover:border-[#C4F24E]/18 hover:bg-[#C4F24E]/[0.035]",
    compact ? "p-4" : "min-h-[76px] p-4 sm:p-5"
  );

  const modal = (
    <MoreSettingModal
      open={modalOpen}
      spec={modalSpec}
      href={href}
      onClose={() => setModalOpen(false)}
      onSave={handleModalSave}
      onSaved={handleSaved}
      primaryLabel={modalSpec.primaryLabel}
    />
  );

  if (row.href) {
    return (
      <>
        <Link
          href={row.href as never}
          className={className}
          data-testid={row.testId}
          onClick={(event) => {
            event.preventDefault();
            handleOpen();
          }}
        >
          {body}
        </Link>
        {modal}
      </>
    );
  }

  if (row.onClick) {
    return (
      <button type="button" className={cn(className, "w-full text-left")} onClick={row.onClick} data-testid={row.testId}>
        {body}
      </button>
    );
  }

  return (
    <>
      <button type="button" className={cn(className, "w-full text-left")} onClick={handleOpen} data-testid={row.testId}>
        {body}
      </button>
      {modal}
    </>
  );
}

export function MoreSectionGroup({ group }: { group: MoreSectionGroup }) {
  return (
    <section id={group.id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#C4F24E]">{group.title}</h2>
        {group.subtitle ? <p className="mt-2 text-sm leading-6 text-white/54">{group.subtitle}</p> : null}
      </div>
      <GlassCard className="overflow-hidden p-0">
        <div className="divide-y divide-white/8">
          {group.rows.map((row) => (
            <div key={row.title} className="p-2">
              <MoreSectionRowLink row={row} sectionTitle={group.title} roleScope={group.roleScope} />
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

export function MoreLogoutCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const logoutSpec = {
    key: "shared-account-session-log-out",
    roleScope: "shared" as const,
    sectionKey: "account-session",
    title: "Log Out",
    eyebrow: "Account session",
    helper: "End this session on the current device.",
    mode: "read_only" as const
  };

  return (
    <section className="scroll-mt-6" data-testid="more-logout-card">
      <GlassCard className="border-red-500/20 bg-red-500/[0.025] p-4">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-red-300">
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Account session
        </div>
        <button
          type="button"
          className="min-h-[60px] w-full justify-center rounded-[18px] border border-red-500/35 bg-red-500/[0.04] text-lg font-black text-red-300 shadow-none hover:bg-red-500/10"
          onClick={() => setModalOpen(true)}
        >
          Log out
        </button>
      </GlassCard>
      <MoreSettingModal
        open={modalOpen}
        spec={logoutSpec}
        onClose={() => setModalOpen(false)}
        primaryLabel="Log Out"
        footerPrimary={
          <LogoutButton className="[&_button]:min-h-12 [&_button]:rounded-full [&_button]:border [&_button]:border-red-500/35 [&_button]:bg-red-500/10 [&_button]:px-5 [&_button]:text-sm [&_button]:font-extrabold [&_button]:text-red-200 [&_button]:hover:bg-red-500/15" />
        }
      />
    </section>
  );
}
