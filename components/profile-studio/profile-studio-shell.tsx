"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronRight,
  Eye,
  ImagePlus,
  Lock,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2
} from "lucide-react";
import { GlassCard, StatusBadge } from "@/design/components";
import { cn } from "@/lib/utils";
import { ProfileUsernameEditModal } from "@/components/profile-studio/profile-username-edit-modal";

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
    contextEditable?: boolean;
    contextLocked?: boolean;
    contextActionLabel?: string;
    emptyTitle?: string;
    emptyBody?: string;
  };
  actions: {
    publicPreviewLabel: string;
    mediaLabel: string;
    shareLabel: string;
  };
  username: {
    title: string;
    value: string;
    helperText: string;
    canEdit: boolean;
    publicUrl?: string | null;
    modalTitle?: string;
    modalHelper?: string;
    saveUnavailableReason?: string | null;
  };
  stats: Array<{
    label: string;
    value: string | number;
    helper?: string;
    visibility?: "public" | "private";
  }>;
  trustCards: Array<{
    title: string;
    value: string | number;
    helper: string;
    status?: ProfileStudioSeverity;
  }>;
  dashboardSummary: {
    title: string;
    text: string;
  };
  highlights: Array<{
    label: string;
    type: "new" | "collection";
    imageUrl?: string | null;
  }>;
  work: {
    title: string;
    countLabel: string;
    addLabel: string;
    emptyCopy: string;
    items: Array<{
      id: string;
      imageUrl?: string | null;
      alt: string;
      caption?: string | null;
    }>;
  };
};

type ProfileStudioShellProps = {
  model: ProfileStudioViewModel;
  backHref: Route;
  backLabel: string;
  usernameValue: string;
  onUsernameChange?: (value: string) => void;
  onUsernameSave?: (value: string) => void | Promise<void>;
  photoControl?: ReactNode;
  onPreview?: () => void;
  onMedia?: () => void;
  onShare?: () => void;
  onContextEdit?: () => void;
  onDeleteMedia?: (id: string) => void;
  isSavingUsername?: boolean;
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
  onUsernameSave,
  photoControl,
  onPreview,
  onMedia,
  onShare,
  onContextEdit,
  onDeleteMedia,
  isSavingUsername
}: ProfileStudioShellProps) {
  const publicName = model.hero.publicName || model.hero.emptyTitle || "Finish profile";
  const workSectionRef = useRef<HTMLElement | null>(null);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(usernameValue);
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);
  const usernameModalTitle = model.username.modalTitle ?? (model.role === "shop_owner" ? "Edit public shop username" : "Edit public username");
  const usernameModalHelper = model.username.modalHelper ?? "This is how people find and share this public profile.";
  const mediaButtonLabel = model.work.addLabel;

  useEffect(() => {
    if (!isUsernameModalOpen) {
      setUsernameDraft(usernameValue);
    }
  }, [isUsernameModalOpen, usernameValue]);

  function handleMediaAction() {
    if (onMedia) {
      onMedia();
      return;
    }
    workSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleUsernameSave(value: string) {
    onUsernameChange?.(value);
    await onUsernameSave?.(value);
    setUsernameFeedback(onUsernameSave ? "Handle updated." : "Handle saving is not connected yet.");
    setIsUsernameModalOpen(false);
  }

  return (
    <div className="space-y-6" data-testid={`profile-studio-${model.role}`}>
      <GlassCard className="flex flex-wrap items-start justify-between gap-4 rounded-[22px] p-5 sm:p-6">
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
      </GlassCard>

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
          <div className="relative -mt-20 h-[148px] w-[148px] shrink-0 overflow-hidden rounded-[28px] border-[3px] border-white/15 bg-black text-4xl font-black text-[#a3ff12] shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_20px_60px_rgba(0,0,0,0.50)] sm:h-[178px] sm:w-[178px] sm:rounded-[36px] sm:text-5xl">
            {model.hero.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.hero.avatarUrl} alt={`${publicName} public image`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">{initialsForName(publicName)}</div>
            )}
            {photoControl}
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
            {model.hero.username ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-white/54">@{model.hero.username}</p>
                <button
                  type="button"
                  aria-label={usernameModalTitle}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#a3ff12] transition hover:border-[#a3ff12]/30 hover:bg-[#a3ff12]/10"
                  onClick={() => setIsUsernameModalOpen(true)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {usernameFeedback ? <span className="text-xs font-bold text-[#a3ff12]">{usernameFeedback}</span> : null}
              </div>
            ) : null}
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/58">
              {model.hero.bio || model.hero.emptyBody || "Add a public bio or story to complete this profile."}
            </p>
            {model.hero.contextLine ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-base font-semibold text-white/50">
                <span>{model.hero.contextLine}</span>
                {model.hero.contextEditable ? (
                  <button
                    type="button"
                    aria-label={model.hero.contextActionLabel ?? "Edit public context"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#a3ff12] transition hover:border-[#a3ff12]/30 hover:bg-[#a3ff12]/10"
                    onClick={onContextEdit}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : model.hero.contextLocked ? (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/44" aria-label="Public context locked">
                    <Lock className="h-4 w-4" />
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-[#050505] transition hover:bg-[#d7ffab]" onClick={onPreview}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {model.actions.publicPreviewLabel}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={handleMediaAction}>
                <ImagePlus className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                {model.actions.mediaLabel}
              </button>
              <button type="button" aria-label={model.actions.shareLabel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={onShare}>
                <Share2 className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                Share
              </button>
            </div>

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

      <GlassCard className="overflow-hidden rounded-[20px] p-0">
        <div className="grid sm:grid-cols-3">
          {model.stats.map((stat, index) => (
            <div key={stat.label} className={cn("min-h-[128px] p-5", index > 0 && "border-t border-white/10 sm:border-l sm:border-t-0")}>
              <p className="text-[30px] font-black leading-none tracking-[-0.03em] text-white">{stat.value}</p>
              <p className="mt-2 text-lg font-medium text-white/72">{stat.label}</p>
              {stat.helper ? <p className="mt-1 text-[15px] font-bold text-[#a3ff12]">{stat.helper}</p> : null}
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-3">
        {model.trustCards.slice(0, 3).map((card) => (
          <GlassCard key={card.title} className={cn("rounded-[20px] p-5", severityClass(card.status))}>
            <p className="text-[30px] font-black leading-tight tracking-[-0.03em] text-white">{card.value}</p>
            <p className="mt-1 text-lg font-medium text-white/72">{card.title}</p>
            <p className="mt-1 text-[15px] font-bold text-[#a3ff12]">{card.helper}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="flex min-h-[106px] items-center justify-between gap-4 rounded-[18px] p-[22px]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[rgba(163,255,18,0.08)] text-[#a3ff12]">
            <Sparkles className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] font-black tracking-[-0.03em] text-white">{model.dashboardSummary.title}</p>
            <p className="mt-1 text-[17px] text-white/60">{model.dashboardSummary.text}</p>
          </div>
        </div>
        <ChevronRight className="h-6 w-6 shrink-0 text-white/85" />
      </GlassCard>

      <section className="overflow-hidden" aria-label="Profile highlights">
        <div className="hide-scrollbar flex gap-5 overflow-x-auto pb-2">
          {model.highlights.map((highlight) => (
            <button key={`${highlight.type}-${highlight.label}`} type="button" className="flex w-[112px] shrink-0 flex-col items-center" onClick={highlight.type === "new" ? handleMediaAction : undefined}>
              {highlight.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={highlight.imageUrl} alt={highlight.label} className="h-[112px] w-[112px] rounded-full border-[3px] border-white/20 object-cover" />
              ) : (
                <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-[3px] border-white/15 bg-white/[0.018] text-[54px] font-light leading-none text-[#a3ff12]">
                  {highlight.type === "new" ? "+" : highlight.label.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="mt-2 max-w-full truncate text-center text-base font-medium text-white/70">{highlight.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section ref={workSectionRef} className="space-y-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.03em] text-white">{model.work.title}</h3>
            <p className="mt-1 text-lg font-medium text-white/60">{model.work.countLabel}</p>
          </div>
          <button type="button" aria-label={mediaButtonLabel} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-sm font-black text-[#a3ff12] transition hover:bg-[#a3ff12]/16" onClick={handleMediaAction}>
            <Plus className="h-5 w-5" />
            {mediaButtonLabel}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {model.work.items.length ? model.work.items.slice(0, 9).map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-[12px] border border-white/10 bg-black/25">
              <button type="button" className="h-full w-full" onClick={handleMediaAction}>
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.alt} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-white/42">Image unavailable</span>
              )}
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.alt}`}
                className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/40 bg-black/72 text-white shadow-lg transition hover:border-red-300/40 hover:text-red-200"
                onClick={() => onDeleteMedia?.(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )) : (
            <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 p-5 text-center text-sm text-white/58">
              {model.work.emptyCopy}
            </div>
          )}
        </div>
      </section>

      {isUsernameModalOpen ? (
        <ProfileUsernameEditModal
          title={usernameModalTitle}
          helper={usernameModalHelper}
          value={usernameDraft}
          isSaving={isSavingUsername}
          saveDisabledReason={model.username.saveUnavailableReason ?? (!onUsernameSave ? "Handle saving is not connected yet." : null)}
          onChange={setUsernameDraft}
          onClose={() => setIsUsernameModalOpen(false)}
          onSave={handleUsernameSave}
        />
      ) : null}
    </div>
  );
}
