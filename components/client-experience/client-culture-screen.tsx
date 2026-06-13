"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, RefreshCw, Scissors, Search, Store, UsersRound } from "lucide-react";
import { StatusBadge } from "@/design/components";
import { CultureFeedHeader } from "@/components/culture/culture-feed-header";
import { CulturePostCard } from "@/components/culture/culture-post-card";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import type { CultureFeedItem, CultureFeedModule, CultureFeedResponse } from "@/lib/culture/service";

export type CultureCreatorRole = "client" | "barber" | "shop" | "architect";
type CultureSurface = "client" | "barber" | "shop";

export interface ClientCulturePost {
  id: string;
  creatorRole: CultureCreatorRole;
  creatorName: string;
  mediaUrl?: string | null;
  caption: string;
  linkedBarberHref?: Route | null;
  linkedShopHref?: Route | null;
  bookingHref?: Route | null;
  createdAtLabel: string;
}

function creatorRoleLabel(role: CultureCreatorRole) {
  switch (role) {
    case "barber":
      return "Barber";
    case "shop":
      return "Shop";
    case "architect":
      return "BVRB3R";
    default:
      return "Client";
  }
}

function emptyFeedCopy(surface: CultureSurface) {
  if (surface === "barber") {
    return "Barber posts, tutorials, and shop culture will appear here as the BVRB3R community grows.";
  }

  if (surface === "shop") {
    return "Shop posts, team highlights, and local barber culture will appear here as the BVRB3R community grows.";
  }

  return "Culture posts will appear here as the BVRB3R community grows.";
}

function apiRoleForSurface(surface: CultureSurface) {
  return surface === "shop" ? "owner" : surface;
}

function createFeedSessionId(existing?: string | null) {
  if (existing) {
    return existing;
  }

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `culture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeFeedItems(first: CultureFeedItem[], second: CultureFeedItem[]) {
  const seen = new Set<string>();
  const merged: CultureFeedItem[] = [];

  [...first, ...second].forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  });

  return merged;
}

function legacyPostToFeedItem(post: ClientCulturePost): CultureFeedItem {
  return {
    id: post.id,
    authorProfileId: post.id,
    authorTargetKind: post.creatorRole === "shop" ? "shop" : post.creatorRole === "barber" ? "barber" : "client",
    authorTarget: null,
    barberId: null,
    shopId: null,
    serviceId: null,
    authorDisplayName: post.creatorName,
    authorUsername: null,
    authorAvatarUrl: null,
    authorRoleLabel: creatorRoleLabel(post.creatorRole),
    authorVerified: false,
    caption: post.caption,
    postType: "style_inspiration",
    media: post.mediaUrl ? {
      id: `${post.id}-media`,
      url: post.mediaUrl,
      thumbnailUrl: post.mediaUrl,
      mediaType: "image",
      width: null,
      height: null,
      durationSeconds: null
    } : null,
    createdAt: post.createdAtLabel,
    serviceName: null,
    shopName: null,
    profileUrl: null,
    bookingUrl: null,
    shopUrl: null,
    canViewProfile: false,
    canViewShop: false,
    bookLabel: null,
    bookingDisabledReason: "Legacy Culture posts do not include booking attribution.",
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: Boolean(post.bookingHref),
    canComment: false,
    isPromoted: false,
    promotionLabel: null,
    reasonCodes: ["recent_public_post"],
    reasonLabel: "Recent from BVRB3R"
  };
}

function CultureDiscoveryGrid({ module }: { module: CultureFeedModule }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/10 bg-black/24 p-4" data-testid="culture-discovery-grid">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d7ffab]">More like this</p>
          <h3 className="mt-1 text-lg font-extrabold text-white">{module.moduleTitle}</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-white/50">{module.moduleSubtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/46">
          {module.reason}
        </span>
      </div>
      <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {module.items.map((item) => (
          <Link
            key={item.id}
            href={item.route as Route}
            className="block w-36 shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] transition hover:border-[#d7ffab]/28"
          >
            <div className="aspect-square bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-black text-white">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{item.subtitle}</p>
              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#d7ffab]">{item.ctaLabel}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function QuickActionLink({
  href,
  icon,
  title,
  subtitle
}: {
  href?: string | null;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  const content = (
    <>
      <div className="text-[#d7ffab]">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/46">{subtitle}</p>
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="flex min-w-[14rem] flex-1 items-center gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
        {content}
      </div>
    );
  }

  return (
    <Link href={href as Route} className="flex min-w-[14rem] flex-1 items-center gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4 transition hover:border-[#d7ffab]/28">
      {content}
    </Link>
  );
}

export function ClientCultureScreen({
  feed,
  posts = [],
  surface = "client"
}: {
  feed?: CultureFeedResponse;
  posts?: ClientCulturePost[];
  surface?: CultureSurface;
}) {
  const initialItems = useMemo(() => feed?.items ?? posts.map(legacyPostToFeedItem), [feed?.items, posts]);
  const [feedItems, setFeedItems] = useState<CultureFeedItem[]>(initialItems);
  const [feedModules, setFeedModules] = useState<CultureFeedModule[]>(feed?.modules ?? []);
  const [cursor, setCursor] = useState<string | null>(feed?.cursor ?? null);
  const [hasMore, setHasMore] = useState(Boolean(feed?.hasMore));
  const [feedSessionId, setFeedSessionId] = useState(() => createFeedSessionId(feed?.feedSessionId));
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(() => new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [pendingTopItems, setPendingTopItems] = useState<CultureFeedItem[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const feedError = feed?.error ?? null;
  const apiRole = apiRoleForSurface(surface);
  const discoverBarbersHref = surface === "client" ? CLIENT_PRIMARY_TAB_HREFS.search : "/discover";
  const viewShopsHref = surface === "client" ? `${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` : "/discover?type=shops";
  const discoverTitle = surface === "barber" ? "Discover styles" : "Discover barbers";
  const surfaceSubtitle = surface === "barber"
    ? "Cuts, styles, barbers, shops, and community."
    : surface === "shop"
      ? "Shops, teams, styles, barbers, and community."
      : "Cuts, shops, style, and community.";
  const roleContext = surface === "barber" ? "Barber Culture" : surface === "shop" ? "Shop Owner Culture" : "Client Culture";
  const postingTitle = surface === "barber"
    ? "Post your work"
    : surface === "shop"
      ? "Share Shop Culture"
      : "Share your next cut";
  const postingCopy = surface === "barber"
    ? "Create or edit Culture posts from approved barber media."
    : surface === "shop"
      ? "Share shop updates, walk-ins, team moments, and local culture."
      : "Client posting unlocks later.";
  const postingHref = surface === "barber"
    ? "/dashboard/barber/culture/new"
    : surface === "shop"
      ? "/dashboard/owner/culture/new"
      : null;
  const visibleFeedItems = useMemo(
    () => feedItems.filter((item) => !hiddenPostIds.has(item.id)),
    [feedItems, hiddenPostIds]
  );
  const hasPosts = visibleFeedItems.length > 0;
  const showDiscoveryModules = visibleFeedItems.length >= 5 && feedModules.length > 0;

  function updatePostVisibility(postId: string, hidden: boolean) {
    setHiddenPostIds((current) => {
      const next = new Set(current);
      if (hidden) {
        next.add(postId);
      } else {
        next.delete(postId);
      }

      return next;
    });
  }

  const fetchFeedPage = useCallback(async (nextCursor: string | null, limit = 8) => {
    const params = new URLSearchParams({
      role: apiRole,
      limit: String(limit),
      sessionId: feedSessionId
    });
    if (nextCursor) {
      params.set("cursor", nextCursor);
    }

    const response = await fetch(`/api/culture/feed?${params.toString()}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      throw new Error(typeof body?.error === "string" ? body.error : "Unable to load Culture feed. Try again.");
    }

    return body as CultureFeedResponse & { ok?: boolean };
  }, [apiRole, feedSessionId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || feedError || !cursor) {
      return;
    }

    setLoadingMore(true);
    setPaginationError(null);

    try {
      const nextPage = await fetchFeedPage(cursor, 8);
      setFeedItems((current) => mergeFeedItems(current, nextPage.items ?? []));
      setFeedModules((current) => nextPage.modules ?? current);
      setCursor(nextPage.cursor ?? null);
      setHasMore(Boolean(nextPage.hasMore));
      setFeedSessionId((current) => createFeedSessionId(nextPage.feedSessionId ?? current));
    } catch (error) {
      setPaginationError(error instanceof Error ? error.message : "Unable to load more Culture posts. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, feedError, fetchFeedPage, hasMore, loadingMore]);

  async function refreshTop() {
    if (refreshing || feedError) {
      return;
    }

    setRefreshing(true);
    setRefreshError(null);
    setRefreshMessage(null);

    try {
      const refreshed = await fetchFeedPage(null, 8);
      const existingIds = new Set(feedItems.map((item) => item.id));
      const nextNewItems = (refreshed.items ?? []).filter((item) => !existingIds.has(item.id));
      setFeedModules((current) => refreshed.modules ?? current);
      setFeedSessionId((current) => createFeedSessionId(refreshed.feedSessionId ?? current));

      if (!feedItems.length) {
        setFeedItems(refreshed.items ?? []);
        setCursor(refreshed.cursor ?? null);
        setHasMore(Boolean(refreshed.hasMore));
      }

      if (nextNewItems.length) {
        setPendingTopItems(nextNewItems);
        setRefreshMessage("New Culture posts");
      } else {
        setRefreshMessage("You're all caught up.");
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Unable to load Culture feed. Try again.");
    } finally {
      setRefreshing(false);
    }
  }

  function applyPendingTopItems() {
    if (!pendingTopItems.length) {
      return;
    }

    setFeedItems((current) => mergeFeedItems(pendingTopItems, current));
    setPendingTopItems([]);
    setRefreshMessage(null);
  }

  useEffect(() => {
    if (!hasMore || loadingMore || feedError || typeof IntersectionObserver === "undefined") {
      return;
    }

    const node = loadMoreRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: "0px 0px 25% 0px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [feedError, hasMore, loadMore, loadingMore]);

  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" data-testid="client-culture-screen">
      <CultureFeedHeader surface={surface} subtitle={surfaceSubtitle} roleContext={roleContext} />

      <section className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Culture shortcuts">
        <QuickActionLink
          href={discoverBarbersHref}
          icon={<Search className="h-5 w-5" />}
          title={discoverTitle}
          subtitle={surface === "shop" ? "Find barbers, styles, and team prospects." : "Find barbers, styles, and Culture signals."}
        />
        <QuickActionLink
          href={viewShopsHref}
          icon={<Store className="h-5 w-5" />}
          title="View shops"
          subtitle="Browse real shops and local Culture."
        />
        <QuickActionLink
          icon={<Bookmark className="h-5 w-5" />}
          title="Saved culture"
          subtitle="Saved and followed items use the engagement graph."
        />
        <QuickActionLink
          href={postingHref}
          icon={surface === "client" ? <UsersRound className="h-5 w-5" /> : <Scissors className="h-5 w-5" />}
          title={postingTitle}
          subtitle={postingCopy}
        />
      </section>

      <section className="mx-auto max-w-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="bvr-section-label">Feed</p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight text-white" data-display="true">Culture pulse</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingTopItems.length ? (
              <button
                type="button"
                onClick={applyPendingTopItems}
                className="rounded-full border border-[#d7ffab]/30 bg-[#d7ffab]/14 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#d7ffab]"
              >
                New Culture posts
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshTop()}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.12em] text-white/62 transition hover:border-[#d7ffab]/24 hover:text-[#d7ffab] disabled:opacity-60"
            >
              <RefreshCw className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
            <StatusBadge tone={feedError ? "danger" : hasPosts ? "green" : "neutral"}>{feedError ? "Feed error" : hasPosts ? "Live feed" : "Empty"}</StatusBadge>
          </div>
        </div>

        {refreshMessage && !pendingTopItems.length ? (
          <p className="mb-3 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/50" role="status">
            {refreshMessage}
          </p>
        ) : null}
        {refreshError ? (
          <p className="mb-3 rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100" role="alert">
            {refreshError}
          </p>
        ) : null}

        <div className="space-y-4">
          {feedError ? (
            <div className="rounded-[24px] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
              {feedError}
            </div>
          ) : hasPosts ? visibleFeedItems.map((post, index) => (
            <div key={post.id} className="space-y-4">
              <CulturePostCard
                post={post}
                surface={surface}
                position={index}
                feedSessionId={feedSessionId}
                onPostVisibilityChange={updatePostVisibility}
              />
              {showDiscoveryModules && index === 4 ? feedModules.map((module) => (
                <CultureDiscoveryGrid key={module.id} module={module} />
              )) : null}
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-white/12 bg-black/18 p-5 text-sm text-white/58">
              {emptyFeedCopy(surface)}
            </div>
          )}

          {hasPosts && visibleFeedItems.length < 5 ? (
            <p className="rounded-[20px] border border-white/10 bg-black/18 px-4 py-3 text-center text-xs font-semibold text-white/44">
              More culture is building.
            </p>
          ) : null}

          {loadingMore ? (
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-5" data-testid="culture-feed-loading-more">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-white/10" />
              <div className="mt-4 aspect-[4/5] animate-pulse rounded-[20px] bg-white/[0.06]" />
            </div>
          ) : null}

          {paginationError ? (
            <div className="rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
              <p>{paginationError}</p>
              <button
                type="button"
                onClick={() => void loadMore()}
                className="mt-3 rounded-full border border-red-300/24 px-3 py-2 text-xs font-black uppercase tracking-[0.12em]"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div ref={loadMoreRef} aria-hidden="true" className="h-6" data-testid="culture-feed-sentinel" />

          {hasPosts && !hasMore && !loadingMore ? (
            <p className="rounded-[20px] border border-white/10 bg-black/18 px-4 py-3 text-center text-xs font-semibold text-white/44">
              You&apos;re all caught up.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
