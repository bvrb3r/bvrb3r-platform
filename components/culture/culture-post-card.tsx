"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bookmark, EyeOff, Flag, Heart, ImageIcon, Info, MessageCircle, MoreHorizontal, Scissors, Share2, ShieldCheck, X } from "lucide-react";
import type { CultureFeedItem, CultureFeedReasonCode } from "@/lib/culture/service";

type CultureSurface = "client" | "barber" | "shop";
type CulturePostAction = "like" | "unlike" | "save" | "unsave" | "share" | "report" | "profile_click" | "book_click" | "shop_click" | "not_interested";

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

function safeReasonLabel(reason: CultureFeedReasonCode) {
  switch (reason) {
    case "following_author":
      return "Because you follow this creator";
    case "saved_similar":
      return "Because you saved or liked similar work";
    case "barber_work":
      return "Recent barber work";
    case "shop_culture":
      return "Shop culture";
    case "popular_saved":
      return "Saved by the community";
    case "promoted_native":
      return "Promoted";
    case "bookable_barber":
      return "Bookable barber";
    case "recent_public_post":
    default:
      return "Recent Culture post";
  }
}

function postTypeLabel(value: string) {
  switch (value) {
    case "barber_cut":
      return "Fresh cut";
    case "barber_before_after":
      return "Before and after";
    case "barber_availability":
      return "Availability";
    case "barber_tutorial":
      return "Tutorial";
    case "shop_update":
      return "Shop update";
    case "shop_walkins":
      return "Walk-ins";
    case "shop_team":
      return "Team highlight";
    case "shop_open_chair":
      return "Open chair";
    case "bvrb3r_official":
      return "BVRB3R";
    default:
      return "Culture";
  }
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
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-black uppercase tracking-[0.12em] transition",
        active
          ? "border-[#d7ffab]/30 bg-[#d7ffab]/16 text-[#d7ffab]"
          : available
            ? "border-white/12 bg-white/[0.05] text-white/70 hover:border-[#d7ffab]/24 hover:text-[#d7ffab]"
            : "border-white/8 bg-white/[0.03] text-white/32"
      ].join(" ")}
    >
      {icon}
      <span>{loading ? "Saving" : label}</span>
    </button>
  );
}

function CultureMedia({
  mediaUrl,
  authorDisplayName,
  onOpen
}: {
  mediaUrl: string | null;
  authorDisplayName: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/40 text-left"
      aria-label="Open Culture post detail"
    >
      <div className="aspect-[4/5] bg-[radial-gradient(circle_at_50%_28%,rgba(215,255,171,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.8))]">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt={`Culture post by ${authorDisplayName}`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full border border-[#d7ffab]/18 bg-black/36 p-5 text-[#d7ffab]">
              <ImageIcon className="h-8 w-8" />
            </div>
            <p className="max-w-[16rem] text-sm leading-6 text-white/44">This post is waiting on approved Culture media.</p>
          </div>
        )}
      </div>
    </button>
  );
}

export function CulturePostCard({
  post,
  surface = "client",
  feedSessionId = null,
  position = 0,
  onPostVisibilityChange
}: {
  post: CultureFeedItem;
  surface?: CultureSurface;
  feedSessionId?: string | null;
  position?: number;
  onPostVisibilityChange?: (postId: string, hidden: boolean) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const impressionSentRef = useRef(false);
  const impressionTimerRef = useRef<number | null>(null);
  const mediaUrl = post.media?.url ?? post.media?.thumbnailUrl ?? null;
  const profileHref = useMemo(() => post.profileUrl ?? profileHrefForPost(post, surface), [post, surface]);
  const reasonLabels = useMemo(
    () => (post.reasonCodes?.length ? post.reasonCodes.map(safeReasonLabel) : [post.reasonLabel ?? "Recent Culture post"]),
    [post.reasonCodes, post.reasonLabel]
  );
  const tags = [post.serviceName, post.shopName, postTypeLabel(post.postType)].filter(Boolean);

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
        setMoreOpen(false);
        setMessage("Report submitted.");
      } else if (action === "share") {
        setMessage("Share recorded.");
      } else if (action === "book_click") {
        setMessage("Opening booking.");
      } else if (action === "profile_click") {
        setMessage("Opening profile.");
      } else if (action === "shop_click") {
        setMessage("Opening shop.");
      } else if (action === "not_interested") {
        setMessage("Post hidden.");
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

  const recordFeedEvent = useCallback((eventType: string, metadata?: Record<string, unknown>) => {
    if (!feedSessionId) {
      return;
    }

    void postJson("/api/culture/events", {
      action: "feed_event",
      eventType,
      postId: post.id,
      feedSessionId,
      surface: "culture_feed",
      position,
      reasonCodes: post.reasonCodes ?? [],
      metadata: {
        source: "culture",
        ...(metadata ?? {})
      }
    }).catch(() => undefined);
  }, [feedSessionId, position, post.id, post.reasonCodes]);

  function recordProfileClick() {
    void runPostAction("profile_click", {
      metadata: {
        cta: "view_profile"
      }
    }).catch(() => undefined);
  }

  function recordBookClick() {
    void runPostAction("book_click", {
      metadata: {
        cta: post.serviceId ? "book_service" : "book_barber"
      }
    }).catch(() => undefined);
  }

  function recordShopClick() {
    void runPostAction("shop_click", {
      metadata: {
        cta: "view_shop"
      }
    }).catch(() => undefined);
  }

  function openDetail() {
    setDetailOpen(true);
    recordFeedEvent("post_view", {
      opened_from: "post_card"
    });
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

  async function markNotInterested() {
    onPostVisibilityChange?.(post.id, true);

    try {
      await runPostAction("not_interested", {
        metadata: {
          cta: "not_interested"
        }
      });
    } catch {
      onPostVisibilityChange?.(post.id, false);
    }
  }

  useEffect(() => {
    if (!feedSessionId || impressionSentRef.current || typeof IntersectionObserver === "undefined") {
      return;
    }

    const node = cardRef.current;
    if (!node) {
      return;
    }

    const clearImpressionTimer = () => {
      if (impressionTimerRef.current) {
        window.clearTimeout(impressionTimerRef.current);
        impressionTimerRef.current = null;
      }
    };

    const observer = new IntersectionObserver((entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (isVisible && !impressionSentRef.current && !impressionTimerRef.current) {
        impressionTimerRef.current = window.setTimeout(() => {
          impressionSentRef.current = true;
          impressionTimerRef.current = null;
          recordFeedEvent("post_impression", {
            dwell_ms: 1000,
            visibility_threshold: 0.5
          });
        }, 1000);
      } else if (!isVisible) {
        clearImpressionTimer();
      }
    }, { threshold: [0, 0.5, 1] });

    observer.observe(node);

    return () => {
      clearImpressionTimer();
      observer.disconnect();
    };
  }, [feedSessionId, recordFeedEvent]);

  return (
    <>
      <article
        ref={cardRef}
        className="overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.92),rgba(6,6,6,0.96))] shadow-[0_22px_55px_rgba(0,0,0,0.24)]"
        data-testid="culture-post-card"
      >
        <header className="flex items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#d7ffab]">
              {post.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.authorAvatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
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
                {post.isPromoted ? (
                  <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
                    {post.promotionLabel ?? "Promoted"}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-white/48">
                {[post.authorUsername, post.authorRoleLabel].filter(Boolean).join(" - ")}
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
              onClick={() => setMoreOpen((value) => !value)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/64 transition hover:border-[#d7ffab]/24 hover:text-[#d7ffab]"
              aria-label="Open Culture post actions"
              title="Open Culture post actions."
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="px-3 sm:px-4">
          <CultureMedia mediaUrl={mediaUrl} authorDisplayName={post.authorDisplayName} onOpen={openDetail} />
        </div>

        <div className="p-4">
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
          </div>

          {post.caption ? (
            <button type="button" onClick={openDetail} className="mt-4 block w-full text-left text-sm leading-6 text-white/78">
              {post.caption}
            </button>
          ) : null}

          {tags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white/52">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {post.canViewProfile || post.canBook || post.canViewShop ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.canViewProfile && post.profileUrl ? (
                <Link
                  href={post.profileUrl as Route}
                  onClick={recordProfileClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:border-[#d7ffab]/28 hover:text-[#d7ffab]"
                >
                  {post.authorTargetKind === "shop" ? "View Shop" : "View Profile"}
                </Link>
              ) : null}
              {post.canBook && post.bookingUrl ? (
                <Link
                  href={post.bookingUrl as Route}
                  onClick={recordBookClick}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d7ffab]/30 bg-[#d7ffab] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#050505] transition hover:bg-[#c6f79b]"
                >
                  <Scissors className="h-4 w-4" />
                  {post.bookLabel ?? "Book This Barber"}
                </Link>
              ) : null}
              {post.canViewShop && post.shopUrl ? (
                <Link
                  href={post.shopUrl as Route}
                  onClick={recordShopClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:border-[#d7ffab]/28 hover:text-[#d7ffab]"
                >
                  View Shop
                </Link>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-xs font-semibold text-white/38">{post.isPromoted ? "Promoted" : reasonLabels[0]}</p>

          {moreOpen ? (
            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/36 p-4" data-testid="culture-post-more-menu">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWhyOpen((value) => !value)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-white/62"
                >
                  <Info className="h-4 w-4" />
                  Why this post
                </button>
                <button
                  type="button"
                  onClick={() => void markNotInterested()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-white/62"
                >
                  <EyeOff className="h-4 w-4" />
                  Not interested
                </button>
                <button
                  type="button"
                  onClick={() => void sharePost()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-white/62"
                >
                  <Share2 className="h-4 w-4" />
                  Copy/share link
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen((value) => !value)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-400/20 px-3 text-xs font-black uppercase tracking-[0.12em] text-red-100"
                >
                  <Flag className="h-4 w-4" />
                  Report
                </button>
              </div>

              {whyOpen ? (
                <div className="mt-3 rounded-[16px] border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/46">Why this post</p>
                  <ul className="mt-2 space-y-1 text-sm text-white/68">
                    {reasonLabels.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {reportOpen ? (
                <div className="mt-3 rounded-[16px] border border-red-400/16 bg-red-500/8 p-4">
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
            </div>
          ) : null}

          {message ? <p className="mt-3 text-xs font-semibold text-[#d7ffab]" role="status">{message}</p> : null}
          {error ? <p className="mt-3 text-xs font-semibold text-red-100" role="alert">{error}</p> : null}
          {!post.canComment ? <p className="mt-3 text-xs text-white/34">Comments are coming soon.</p> : null}
        </div>
      </article>

      {detailOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/72 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Culture post detail">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-white/10 bg-[#080808] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#d7ffab]">
                  {post.authorAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.authorAvatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-black">
                      {initialsFor(post.authorDisplayName)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{post.authorDisplayName}</p>
                  <p className="truncate text-xs text-white/46">{[post.authorUsername, post.authorRoleLabel].filter(Boolean).join(" - ")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70"
                aria-label="Close Culture post detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <CultureMedia mediaUrl={mediaUrl} authorDisplayName={post.authorDisplayName} onOpen={() => undefined} />
              {post.caption ? <p className="mt-4 text-sm leading-6 text-white/78">{post.caption}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <CultureActionButton
                  available={post.canLike}
                  active={liked}
                  loading={loadingAction === "like" || loadingAction === "unlike"}
                  icon={<Heart className="h-4 w-4" />}
                  label={liked ? "Liked" : "Like"}
                  onClick={() => void runPostAction(liked ? "unlike" : "like").catch(() => undefined)}
                />
                <CultureActionButton available={post.canComment} icon={<MessageCircle className="h-4 w-4" />} label="Comment" />
                <CultureActionButton available={post.canShare} loading={loadingAction === "share"} icon={<Share2 className="h-4 w-4" />} label="Share" onClick={() => void sharePost()} />
                <CultureActionButton
                  available={post.canSave}
                  active={saved}
                  loading={loadingAction === "save" || loadingAction === "unsave"}
                  icon={<Bookmark className="h-4 w-4" />}
                  label={saved ? "Saved" : "Save"}
                  onClick={() => void runPostAction(saved ? "unsave" : "save").catch(() => undefined)}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {post.canViewProfile && post.profileUrl ? (
                  <Link href={post.profileUrl as Route} onClick={recordProfileClick} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:border-[#d7ffab]/28 hover:text-[#d7ffab]">
                    {post.authorTargetKind === "shop" ? "View Shop" : "View Profile"}
                  </Link>
                ) : null}
                {post.canBook && post.bookingUrl ? (
                  <Link href={post.bookingUrl as Route} onClick={recordBookClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d7ffab]/30 bg-[#d7ffab] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#050505] transition hover:bg-[#c6f79b]">
                    <Scissors className="h-4 w-4" />
                    {post.bookLabel ?? "Book This Barber"}
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/46">Why this post</p>
                <ul className="mt-2 space-y-1 text-sm text-white/68">
                  {reasonLabels.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void markNotInterested()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-white/62"
                  >
                    <EyeOff className="h-4 w-4" />
                    Not interested
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailOpen(false);
                      setMoreOpen(true);
                      setReportOpen(true);
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-400/20 px-3 text-xs font-black uppercase tracking-[0.12em] text-red-100"
                  >
                    <Flag className="h-4 w-4" />
                    Report
                  </button>
                </div>
              </div>
              {!post.canComment ? <p className="mt-3 text-xs text-white/34">Comments are coming soon.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
