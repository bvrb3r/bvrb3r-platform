"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  Pencil,
  Share2,
  Sparkles
} from "lucide-react";
import { GlassCard, StatusBadge } from "@/design/components";
import { cn } from "@/lib/utils";

export type ProfileStudioRole = "client" | "barber" | "shop_owner";
export type ProfileStudioSeverity = "good" | "warning" | "neutral";

export type ProfileStudioViewModel = {
  role: ProfileStudioRole;
  page: {
    title: string;
    subtitle: string;
    statusText?: string;
  };
  hero: {
    label: string;
    title: string;
    subtitle: string;
    publicName: string;
    username?: string | null;
    publicUrl?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    badge?: string | null;
    bio?: string | null;
    contextLine?: string | null;
    emptyTitle?: string;
    emptyBody?: string;
  };
  actions: {
    publicPreviewLabel: string;
    editProfileLabel: string;
    mediaLabel: string;
    shareLabel: string;
  };
  username: {
    title: string;
    value: string;
    helperText: string;
    canEdit: boolean;
    publicUrl?: string | null;
  };
  stats: Array<{
    label: string;
    value: string | number;
    helper?: string;
    visibility?: "public" | "private";
  }>;
  readiness: {
    title: string;
    subtitle: string;
    description: string;
    cards: Array<{
      title: string;
      value: string | number;
      helper: string;
      severity?: ProfileStudioSeverity;
    }>;
    needsAttention?: string[];
  };
  identity: {
    title: string;
    subtitle: string;
    description: string;
    cards: Array<{
      title: string;
      value: string | number;
      helper: string;
    }>;
  };
  media: {
    title: string;
    subtitle: string;
    addButtonLabel: string;
    emptyCopy: string;
    items: Array<{
      id: string;
      url?: string | null;
      caption?: string | null;
      featured?: boolean;
      type?: "image" | "video";
    }>;
  };
  preview: {
    title: string;
    subtitle: string;
    enabled: boolean;
    actions: string[];
  };
};

type ProfileStudioShellProps = {
  model: ProfileStudioViewModel;
  backHref: Route;
  backLabel: string;
  usernameValue: string;
  onUsernameChange?: (value: string) => void;
  editorSlot?: ReactNode;
  onPreview?: () => void;
  onEdit?: () => void;
  onMedia?: () => void;
  onShare?: () => void;
};

function initialsForName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "BV";
}

function severityClass(severity: ProfileStudioSeverity = "neutral") {
  if (severity === "good") {
    return "border-[#a3ff12]/20 bg-[rgba(163,255,18,0.08)]";
  }
  if (severity === "warning") {
    return "border-yellow-300/24 bg-yellow-300/8";
  }
  return "border-white/8 bg-black/20";
}

export function ProfileStudioShell({
  model,
  backHref,
  backLabel,
  usernameValue,
  onUsernameChange,
  editorSlot,
  onPreview,
  onEdit,
  onMedia,
  onShare
}: ProfileStudioShellProps) {
  const publicName = model.hero.publicName || model.hero.emptyTitle || "Finish profile";
  const publicUrl = model.username.publicUrl ?? model.hero.publicUrl;

  return (
    <div className="space-y-6" data-testid={`profile-studio-${model.role}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[2.65rem] font-black leading-none tracking-[-0.045em] text-white sm:text-6xl">
            {model.page.title}
          </h1>
          <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/60 sm:text-[17px]">
            {model.page.subtitle}
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#a3ff12]/30 hover:text-[#a3ff12]"
        >
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />
          {backLabel}
        </Link>
      </div>

      {model.page.statusText ? (
        <GlassCard className="flex items-center gap-3 rounded-[18px] p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold leading-6 text-white/68">{model.page.statusText}</p>
        </GlassCard>
      ) : null}

      <GlassCard active className="relative overflow-hidden rounded-[28px] p-0">
        <div
          className="h-44 border-b border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.18),transparent_34%),linear-gradient(135deg,rgba(163,255,18,0.10),rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.34))]"
          style={model.hero.coverUrl ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.48)), url(${model.hero.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="-mt-20 h-[178px] w-[178px] shrink-0 overflow-hidden rounded-[36px] border-[3px] border-white/15 bg-black text-5xl font-black text-[#a3ff12] shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_20px_60px_rgba(0,0,0,0.50)]">
            {model.hero.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.hero.avatarUrl} alt={`${publicName} public image`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">{initialsForName(publicName)}</div>
            )}
          </div>

          <div className="min-w-0">
            <p className="bvr-section-label">{model.hero.label}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="text-[2.35rem] font-black leading-[1.05] tracking-[-0.045em] text-white">
                {model.hero.title}
              </h2>
              {model.hero.badge ? (
                <StatusBadge tone={model.hero.badge.toLowerCase().includes("needed") ? "neutral" : "green"}>
                  {model.hero.badge}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-xl font-medium leading-[1.4] text-white/78">{model.hero.subtitle}</p>
            <p className="mt-5 text-3xl font-black tracking-[-0.045em] text-white">{publicName}</p>
            {model.hero.username ? <p className="mt-1 text-base font-bold text-white/54">@{model.hero.username}</p> : null}
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/58">
              {model.hero.bio || model.hero.emptyBody || "Add a public bio or story to complete this profile."}
            </p>
            {model.hero.contextLine ? <p className="mt-2 text-base font-semibold text-white/50">{model.hero.contextLine}</p> : null}
            {publicUrl ? (
              <a href={publicUrl} className="mt-3 inline-flex items-center gap-2 text-lg font-bold text-[#a3ff12] transition hover:text-[#cfff93]">
                <LinkIcon className="h-5 w-5" aria-hidden="true" />
                {publicUrl}
              </a>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-[#050505] transition hover:bg-[#d7ffab]" onClick={onPreview}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {model.actions.publicPreviewLabel}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={onEdit}>
                <Pencil className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                {model.actions.editProfileLabel}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={onMedia}>
                <ImagePlus className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                {model.actions.mediaLabel}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={onShare}>
                <Share2 className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                {model.actions.shareLabel}
              </button>
            </div>

            {model.stats.length ? (
              <div className="mt-6 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
                {model.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[30px] font-black leading-none tracking-[-0.03em] text-white">{stat.value}</p>
                    <p className="mt-1 text-[17px] font-medium text-white/60">{stat.label}</p>
                    {stat.helper ? <p className="mt-1 text-xs font-bold text-white/38">{stat.helper}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                Profile stats appear here once real public activity exists.
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-start gap-2 lg:flex-col">
            <button type="button" aria-label={model.actions.publicPreviewLabel} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14" onClick={onPreview}>
              <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button type="button" aria-label={model.actions.shareLabel} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14" onClick={onShare}>
              <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="rounded-[20px] p-5 sm:p-6">
        <p className="bvr-section-label">{model.username.title}</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block text-sm font-bold text-white/72">
            Public handle
            <input
              value={usernameValue}
              onChange={(event) => onUsernameChange?.(event.target.value.toLowerCase())}
              readOnly={!model.username.canEdit}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-sm font-bold text-white outline-none transition placeholder:text-white/34 focus:border-[#a3ff12]/42 read-only:text-white/54"
              placeholder="public-handle"
            />
          </label>
          <button type="button" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#a3ff12]/28 bg-[#a3ff12]/10 px-5 text-sm font-black text-[#a3ff12] transition hover:border-[#a3ff12]/46 hover:bg-[#a3ff12]/16">
            Save handle
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/48">{model.username.helperText}</p>
      </GlassCard>

      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Profile readiness</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{model.readiness.title}</h3>
              <p className="mt-2 text-sm text-white/58">{model.readiness.subtitle}</p>
              <p className="mt-2 text-sm leading-6 text-white/52">{model.readiness.description}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-[#a3ff12]" aria-hidden="true" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.readiness.cards.map((card) => (
              <div key={card.title} className={cn("rounded-[20px] border p-4", severityClass(card.severity))}>
                <p className="surface-label">{card.title}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
                <p className="mt-2 text-sm text-white/58">{card.helper}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Needs attention</p>
            <div className="mt-3 space-y-2 text-sm text-white/62">
              {model.readiness.needsAttention?.length ? model.readiness.needsAttention.map((item) => (
                <p key={item}>- {item}</p>
              )) : <p>This public profile has the core studio surfaces ready.</p>}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Public identity</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{model.identity.title}</h3>
              <p className="mt-2 text-sm text-white/58">{model.identity.subtitle}</p>
              <p className="mt-2 text-sm leading-6 text-white/52">{model.identity.description}</p>
            </div>
            <Camera className="h-5 w-5 text-[#a3ff12]" aria-hidden="true" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {model.identity.cards.map((card) => (
              <div key={card.title} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <Sparkles className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                  {card.title}
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{card.value}</p>
                <p className="mt-2 text-sm text-white/58">{card.helper}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.94fr_1.06fr]">
        <GlassCard className="p-5 sm:p-6">
          <p className="bvr-section-label">{model.media.title}</p>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{model.media.subtitle}</h3>
          <p className="mt-3 text-sm leading-7 text-white/62">{model.media.emptyCopy}</p>
          <button type="button" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#a3ff12]/24 bg-[#a3ff12]/10 px-4 text-sm font-black text-[#a3ff12]">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {model.media.addButtonLabel}
          </button>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="bvr-section-label">Gallery</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Public media grid</h3>
              <p className="mt-2 text-sm text-white/58">Only real uploaded media appears here.</p>
            </div>
          </div>
          {model.media.items.length ? (
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {model.media.items.slice(0, 9).map((item) => (
                <div key={item.id} className="group relative aspect-square overflow-hidden rounded-[12px] border border-white/10 bg-black/25">
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.caption || "Public profile media"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm text-white/42">Media unavailable</span>
                  )}
                  {item.featured ? <span className="absolute bottom-2 right-2 rounded-[8px] border border-[#a3ff12]/28 bg-black/55 px-1.5 py-0.5 text-[12px] font-black tracking-[0.04em] text-[#a3ff12]">Featured</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex aspect-[3/1] items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 p-5 text-center text-sm text-white/58">
              No public media yet. Add real media when uploads are available.
            </div>
          )}
        </GlassCard>
      </section>

      {editorSlot}

      <GlassCard className="p-5 sm:p-6">
        <p className="bvr-section-label">Public preview snapshot</p>
        <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">{model.preview.title}</h3>
        <p className="mt-2 text-sm text-white/58">{model.preview.subtitle}</p>
        <div className="mt-5 rounded-[26px] border border-white/10 bg-black/28 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-white/12 bg-black text-2xl font-black text-[#a3ff12]">
              {model.hero.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={model.hero.avatarUrl} alt={`${publicName} preview`} className="h-full w-full object-cover" />
              ) : initialsForName(publicName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black tracking-[-0.03em] text-white">{publicName}</p>
              {model.hero.username ? <p className="mt-1 text-sm font-bold text-white/52">@{model.hero.username}</p> : null}
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{model.hero.bio || model.hero.contextLine || model.hero.emptyBody}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {model.preview.actions.map((action, index) => (
              <button
                key={action}
                type="button"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-[8px] px-3 text-xs font-black",
                  index === 0 ? "bg-[#a3ff12] text-black" : "border border-white/10 bg-white/[0.035] text-white/72"
                )}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
