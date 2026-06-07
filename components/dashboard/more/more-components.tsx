"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
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
  status?: string;
  tone?: MoreTone;
  icon?: ReactNode;
};

export type MoreSectionGroup = {
  title: string;
  subtitle?: string;
  rows: MoreSectionRow[];
  id?: string;
};

function toneClasses(tone: MoreTone = "muted") {
  switch (tone) {
    case "green":
      return "border-[#A3FF12]/26 bg-[#A3FF12]/10 text-[#A3FF12]";
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
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/60",
    kind === "primary"
      ? "border border-[#A3FF12]/40 bg-[#A3FF12]/12 text-[#A3FF12] shadow-[0_0_28px_rgba(163,255,18,0.14)] hover:border-[#A3FF12]/70 hover:bg-[#A3FF12]/16"
      : "border border-white/10 bg-white/[0.035] text-white/78 hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
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
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A3FF12]">Control center</p>
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A3FF12]/45 to-transparent" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <Avatar
          src={imageUrl}
          alt={`${title} ${avatarLabel}`}
          initials={initials}
          className="h-24 w-24 rounded-[28px] border-2 border-[#A3FF12]/65 text-2xl shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_22px_54px_rgba(0,0,0,0.48)] sm:h-32 sm:w-32"
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">{title}</h2>
            <span className="rounded-full border border-[#A3FF12]/24 bg-[#A3FF12]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] text-[#A3FF12]">
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((tile) => {
          const content = (
            <>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">{tile.label}</p>
              <p className={cn("mt-3 text-lg font-extrabold", tile.tone === "green" ? "text-[#A3FF12]" : tile.tone === "yellow" ? "text-amber-200" : tile.tone === "red" ? "text-red-200" : "text-white")}>{tile.value}</p>
              {tile.helper ? <p className="mt-2 text-sm leading-5 text-white/52">{tile.helper}</p> : null}
            </>
          );

          const className = "rounded-[20px] border border-white/8 bg-black/25 p-4 transition hover:border-[#A3FF12]/20";

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
    </GlassCard>
  );
}

export function MoreActivationGate({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="space-y-3" data-testid="more-activation-gate">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">{title}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

export function MoreControlHub({
  title,
  subtitle,
  rows
}: {
  title: string;
  subtitle: string;
  rows: MoreSectionRow[];
}) {
  return (
    <GlassCard className="p-5 sm:p-6" data-testid="more-control-hub">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">{title}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">{subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <MoreSectionRowLink key={row.title} row={row} compact />
        ))}
      </div>
    </GlassCard>
  );
}

function MoreSectionRowLink({ row, compact = false }: { row: MoreSectionRow; compact?: boolean }) {
  const body = (
    <>
      {row.icon ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
          {row.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold tracking-[-0.025em] text-white">{row.title}</span>
        <span className="mt-1 block text-sm leading-5 text-white/52">{row.subtitle}</span>
      </span>
      {row.status ? <span className={cn("hidden rounded-full border px-3 py-1.5 text-xs font-extrabold sm:inline-flex", toneClasses(row.tone))}>{row.status}</span> : null}
      <ChevronRight className="h-5 w-5 shrink-0 text-white/36 transition group-hover:translate-x-0.5 group-hover:text-[#A3FF12]" aria-hidden="true" />
    </>
  );

  const className = cn(
    "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[20px] border border-white/8 bg-black/22 transition hover:border-[#A3FF12]/18 hover:bg-[#A3FF12]/[0.035]",
    compact ? "p-4" : "min-h-[76px] p-4 sm:p-5"
  );

  return row.href ? (
    <Link href={row.href as never} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function MoreSectionGroup({ group }: { group: MoreSectionGroup }) {
  return (
    <section id={group.id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.04em] text-white">{group.title}</h2>
        {group.subtitle ? <p className="mt-2 text-sm leading-6 text-white/54">{group.subtitle}</p> : null}
      </div>
      <GlassCard className="overflow-hidden p-0">
        <div className="divide-y divide-white/8">
          {group.rows.map((row) => (
            <div key={row.title} className="p-2">
              <MoreSectionRowLink row={row} />
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

export function MoreLogoutCard() {
  return (
    <section className="scroll-mt-6" data-testid="more-logout-card">
      <GlassCard className="border-red-500/20 bg-red-500/[0.025] p-4">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-red-300">
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Account session
        </div>
        <LogoutButton className="[&_button]:min-h-[60px] [&_button]:justify-center [&_button]:rounded-[18px] [&_button]:border [&_button]:border-red-500/35 [&_button]:bg-red-500/[0.04] [&_button]:text-lg [&_button]:font-black [&_button]:text-red-300 [&_button]:shadow-none [&_button]:hover:bg-red-500/10 [&_button_svg]:text-red-300" />
      </GlassCard>
    </section>
  );
}
