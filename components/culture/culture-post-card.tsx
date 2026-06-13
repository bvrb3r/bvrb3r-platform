"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bookmark, Heart, ImageIcon, MessageCircle, MoreHorizontal, Scissors, Share2, ShieldCheck } from "lucide-react";
import type { CultureFeedItem } from "@/lib/culture/service";

type CultureSurface = "client" | "barber" | "shop";
type CulturePostAction = "like" | "unlike" | "save" | "unsave" | "share" | "report" | "profile_click";

function formatCultureDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "New";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "BV";
  }

  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function actionTitle(label: string, available: boolean) {
  if (available) {
    return `${label} this Culture post.`;
  }

  return `${label} is not available for this post yet.`;
}

function profileRoutePrefix(surface: CultureSurface) {
  if (surface === "barber") {
    return "/dashboard/barber/profile-view";
  }

  if (surface === "shop") {
    return "/dashboard/owner/profile-view";
  }

  return "/dashboard/client/profile-view";
}

function profileHrefForPost(post: CultureFeedItem, surface: CultureSurface) {
  if (!post.authorTarget) {
    return null;
  }

  return `${profileRoutePrefix(surface)}/${post.authorTargetKind}/${encodeURIComponent(post.authorTarget)}`;
}

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(typeof body?.error === "string" ? body.error : "Culture action failed.");
  }

  return body as T;
}

function CultureActionButton({
  available,
  icon,
  label,
  loading = false,
  active = false,
  onClick
}: {
  available: boolean;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!available || loading}
      onClick={onClick}
      aria-label={actionTitle(label, available)}
      title={actionTitle(label, available)}
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-black uppercase tracking-[0.12em]",
        active
          ? "border-[#d7ffab]/30 bg-[#d7ffab]/16 text-[#d7ffab]"
          : available
          ? "border-white/12 bg-white/[0.05] text-white/58"
          : "border-white/8 bg-white/[0.03] text-white/32"
      ].join(" ")}
    >
      {icon}
      <span>{loading ? "Saving" : label}</span>
    </button>
  );
}

export function CulturePostCard({
  post,
  surface = "client"
}: {
  post: CultureFeedItem;
  surface?: CultureSurface;
}) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaUrl = post.media?.url ?? post.media?.thumbnailUrl ?? null;
  const hasAttachedContext = Boolean(post.serviceName || post.shopName);
  const profileHref = useMemo(() => profileHrefForPost(post, surface), [post, surface]);

  async function runPostAction(action: CulturePostAction, extra?: Record<string, unknown>) {
    setLoadingAction(action);
    setError(null);
    setMessage(null);

    try {
      await postJson("/api/culture/engagements", {
        postId: post.id,
        action,
        ...extra
      });

      if (action === "like") {
        setLiked(true);
        setMessage("Liked.");
      } else if (action === "unlike") {
        setLiked(false);
        setMessage("Like removed.");
      } else if (action === "save") {
        setSaved(true);
        setMessage("Saved.");
      } else if (action === "unsave") {
        setSaved(false);
        setMessage("Removed from saved.");
      } else if (action === "report") {
        setReportOpen(false);
        setMessage("Report submitted.");
      } else if (action === "share") {
        setMessage("Share recorded.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Culture action failed.");
      throw actionError;
    } finally {
      setLoadingAction(null);
    }
  }

  async function toggleFollow() {
    const action = following ? "unfollow" : "follow";
    setLoadingAction(action);
    setError(null);
    setMessage(null);

    try {
      await postJson("/api/culture/follow", {
        targetProfileId: post.authorProfileId,
        action,
        sourcePostId: post.id
      });
      setFollowing(action === "follow");
      setMessage(action === "follow" ? "Following." : "Unfollowed.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Culture follow failed.");
    } finally {
      setLoadingAction(null);
    }
  }

  function recordProfileClick() {
    void runPostAction("profile_click").catch(() => undefined);
  }

  async function sharePost() {
    try {
      await runPostAction("share");
      const href = typeof window === "undefined"
        ? null
        : `${window.location.origin}/dashboard/client/culture?post=${encodeURIComponent(post.id)}`;
      if (!href) {
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: `BVRB3R Culture: ${post.authorDisplayName}`,
          text: post.caption || "Culture post from BVRB3R.",
          url: href
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(href);
        setMessage("Culture post link copied.");
      }
    } catch {
      // runPostAction already renders the actionable error.
    }
  }

  return (
    <article className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.92),rgba(6,6,6,0.96))] shadow-[0_22px_55px_rgba(0,0,0,0.24)]" data-testid="culture-post-card">
      <header className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#d7ffab]">
            {post.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black">
                {initialsFor(post.authorDisplayName)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {profileHref ? (
                <Link href={profileHref as Route} onClick={recordProfileClick} className="truncate text-sm font-black text-white transition hover:text-[#d7ffab]">
                  {post.authorDisplayName}
                </Link>
              ) : (
                <p className="truncate text-sm font-black text-white">{post.authorDisplayName}</p>
              )}
              {post.authorVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#d7ffab]/20 bg-[#d7ffab]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d7ffab]">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-white/48">
              {[post.authorUsername, post.authorRoleLabel, post.shopName].filter(Boolean).join(" - ")}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">{formatCultureDate(post.createdAt)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={loadingAction === "follow" || loadingAction === "unfollow"}
            onClick={toggleFollow}
            className={[
              "rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition",
              following
                ? "border-[#d7ffab]/28 bg-[#d7ffab]/14 text-[#d7ffab]"
                : "border-white/10 bg-white/[0.04] text-white/64 hover:border-[#d7ffab]/24 hover:text-[#d7ffab]"
            ].join(" ")}
            aria-label={following ? "Unfollow Culture author" : "Follow Culture author"}
            title={following ? "Unfollow this Culture author." : "Follow this Culture author."}
          >
            {loadingAction === "follow" || loadingAction === "unfollow" ? "Saving" : following ? "Following" : "Follow"}
          </button>
          <button
            type="button"
            onClick={() => setReportOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/64 transition hover:border-red-400/24 hover:text-red-100"
            aria-label="Open Culture report actions"
            title="Open Culture report actions."
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mx-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/40 sm:mx-5">
        <div className="aspect-[4/3] bg-[radial-gradient(circle_at_50%_28%,rgba(215,255,171,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.8))]">
          {mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full border border-[#d7ffab]/18 bg-black/36 p-5 text-[#d7ffab]">
                <ImageIcon className="h-8 w-8" />
              </div>
              <p className="max-w-[16rem] text-sm leading-6 text-white/44">Media will appear here when the post includes approved Culture media.</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <CultureActionButton
            available={post.canLike}
            active={liked}
            loading={loadingAction === "like" || loadingAction === "unlike"}
            icon={<Heart className="h-4 w-4" />}
            label={liked ? "Liked" : "Like"}
            onClick={() => void runPostAction(liked ? "unlike" : "like").catch(() => undefined)}
          />
          <CultureActionButton available={post.canComment} icon={<MessageCircle className="h-4 w-4" />} label="Comment" />
          <CultureActionButton
            available={post.canShare}
            loading={loadingAction === "share"}
            icon={<Share2 className="h-4 w-4" />}
            label="Share"
            onClick={() => void sharePost()}
          />
          <CultureActionButton
            available={post.canSave}
            active={saved}
            loading={loadingAction === "save" || loadingAction === "unsave"}
            icon={<Bookmark className="h-4 w-4" />}
            label={saved ? "Saved" : "Save"}
            onClick={() => void runPostAction(saved ? "unsave" : "save").catch(() => undefined)}
          />
          {post.canBook ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#d7ffab]/28 bg-[#d7ffab] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#050505]"
              aria-label="Book from Culture post is not active yet"
              title="Book-from-post will activate when Culture-to-booking routing is wired."
            >
              <Scissors className="h-4 w-4" />
              Book
            </button>
          ) : null}
        </div>

        {reportOpen ? (
          <div className="mt-4 rounded-[18px] border border-red-400/16 bg-red-500/8 p-4">
            <label className="block text-xs font-black uppercase tracking-[0.14em] text-red-100" htmlFor={`culture-report-${post.id}`}>
              Report post
            </label>
            <select
              id={`culture-report-${post.id}`}
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
            >
              <option value="spam">Spam or misleading</option>
              <option value="harassment">Harassment or hate</option>
              <option value="unsafe">Unsafe or harmful</option>
              <option value="other">Something else</option>
            </select>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/58"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingAction === "report"}
                onClick={() => void runPostAction("report", { reason: reportReason }).catch(() => undefined)}
                className="rounded-full border border-red-400/25 bg-red-500/12 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-100"
              >
                {loadingAction === "report" ? "Submitting" : "Submit report"}
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-xs font-semibold text-[#d7ffab]" role="status">{message}</p> : null}
        {error ? <p className="mt-3 text-xs font-semibold text-red-100" role="alert">{error}</p> : null}

        {hasAttachedContext ? (
          <div className="mt-4 rounded-[18px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d7ffab]">{post.serviceName ? "Attached service" : "Culture context"}</p>
            <p className="mt-1 text-sm font-semibold text-white">{post.serviceName ?? "Shop culture"}</p>
            {post.shopName ? <p className="mt-1 text-xs text-white/46">{post.shopName}</p> : null}
          </div>
        ) : null}

        {post.caption ? <p className="mt-4 text-sm leading-6 text-white/74">{post.caption}</p> : null}
        {post.canComment ? (
          <p className="mt-4 text-xs text-white/42">Comments are available when real approved comments exist.</p>
        ) : null}
      </div>
    </article>
  );
}
