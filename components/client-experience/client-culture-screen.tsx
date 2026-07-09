"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, StatusBadge } from "@/design/components";
import { CulturePostCard } from "@/components/culture/culture-post-card";
import type { CultureFeedItem, CultureFeedModule, CultureFeedResponse } from "@/lib/culture/service";
import type { ClientPaywallSummary } from "@/lib/entitlements/client-paywall";

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
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e4f9b8]">More like this</p>
          <h3 className="mt-1 text-lg font-extrabold text-white">{module.moduleTitle}</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-white/50">{module.moduleSubtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/46">
          {module.reason}
        </span>
      </div>
      <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {module.items.filter((item) => Boolean(item.route)).map((item) => (
          <Link
            key={item.id}
            href={item.route as Route}
            className="block w-36 shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] transition hover:border-[#e4f9b8]/28"
          >
            <div className="aspect-square bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-black text-white">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{item.subtitle}</p>
              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#e4f9b8]">{item.ctaLabel}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function storyInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Story-avatars row derived from real feed authors (unique posters, newest first).
// No dedicated stories source exists, so this reuses the top feed authors — never
// fabricated names.
function CultureStoryRail({ items }: { items: CultureFeedItem[] }) {
  const seen = new Set<string>();
  const authors: CultureFeedItem[] = [];
  for (const item of items) {
    if (seen.has(item.authorProfileId)) {
      continue;
    }
    seen.add(item.authorProfileId);
    authors.push(item);
    if (authors.length >= 10) {
      break;
    }
  }

  if (!authors.length) {
    return null;
  }

  return (
    <div className="mb-4 flex gap-4 overflow-x-auto hide-scrollbar pb-1" data-testid="culture-story-rail">
      {authors.map((author) => {
        const displayName = author.authorDisplayName?.trim() || author.authorRoleLabel || "BVRB3R";
        const username = author.authorUsername?.trim().replace(/^@+/, "");
        const label = username || displayName;
        const cardClassName = "flex w-20 shrink-0 flex-col items-center gap-1.5";
        const avatar = (
          <>
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-[#c4f24e]/55 bg-black/40 text-sm font-semibold text-white">
              {author.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={author.authorAvatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                storyInitials(displayName)
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] text-white/64">{label}</span>
          </>
        );

        // next/link throws on href={null}; only link authors that have a real
        // profile route, otherwise render a plain (non-linked) avatar.
        return author.profileUrl ? (
          <Link key={author.authorProfileId} href={author.profileUrl as Route} className={cardClassName}>
            {avatar}
          </Link>
        ) : (
          <div key={author.authorProfileId} className={cardClassName}>
            {avatar}
          </div>
        );
      })}
    </div>
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
  paywallSummary?: ClientPaywallSummary;
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
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingTopItems, setPendingTopItems] = useState<CultureFeedItem[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const feedItemsRef = useRef<CultureFeedItem[]>(initialItems);
  const refreshingRef = useRef(false);
  const feedError = feed?.error ?? null;
  const apiRole = apiRoleForSurface(surface);
  const visibleFeedItems = useMemo(
    () => feedItems.filter((item) => !hiddenPostIds.has(item.id)),
    [feedItems, hiddenPostIds]
  );
  const hasPosts = visibleFeedItems.length > 0;
  const showDiscoveryModules = visibleFeedItems.length >= 5 && feedModules.length > 0;

  useEffect(() => {
    feedItemsRef.current = feedItems;
  }, [feedItems]);

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

  const refreshTop = useCallback(async () => {
    if (refreshingRef.current || feedError) {
      return;
    }

    refreshingRef.current = true;
    setRefreshError(null);

    try {
      const refreshed = await fetchFeedPage(null, 8);
      const currentItems = feedItemsRef.current;
      const existingIds = new Set(currentItems.map((item) => item.id));
      const nextNewItems = (refreshed.items ?? []).filter((item) => !existingIds.has(item.id));
      setFeedModules((current) => refreshed.modules ?? current);
      setFeedSessionId((current) => createFeedSessionId(refreshed.feedSessionId ?? current));

      if (!currentItems.length) {
        setFeedItems(refreshed.items ?? []);
        setCursor(refreshed.cursor ?? null);
        setHasMore(Boolean(refreshed.hasMore));
        setPendingTopItems([]);
        return;
      }

      if (nextNewItems.length) {
        const nearTop = typeof window === "undefined" || window.scrollY < 240;
        if (nearTop) {
          setFeedItems((current) => mergeFeedItems(nextNewItems, current));
          setCursor(refreshed.cursor ?? null);
          setHasMore(Boolean(refreshed.hasMore));
          setPendingTopItems([]);
        } else {
          setPendingTopItems((current) => mergeFeedItems(current, nextNewItems));
        }
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Unable to load Culture feed. Try again.");
    } finally {
      refreshingRef.current = false;
    }
  }, [feedError, fetchFeedPage]);

  function applyPendingTopItems() {
    if (!pendingTopItems.length) {
      return;
    }

    setFeedItems((current) => mergeFeedItems(pendingTopItems, current));
    setPendingTopItems([]);
  }

  useEffect(() => {
    void refreshTop();

    const handleFocus = () => {
      void refreshTop();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshTop();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTop]);

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
      <section className="mx-auto max-w-2xl">
        <PageHeader
          className="mb-6"
          label="The Feed"
          title="Culture."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {pendingTopItems.length ? (
                <button
                  type="button"
                  onClick={applyPendingTopItems}
                  className="rounded-full border border-[#e4f9b8]/30 bg-[#e4f9b8]/14 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#e4f9b8]"
                >
                  New Culture posts
                </button>
              ) : null}
              <StatusBadge tone={feedError ? "danger" : hasPosts ? "green" : "neutral"}>{feedError ? "Feed error" : hasPosts ? "Live feed" : "Empty"}</StatusBadge>
            </div>
          }
        />

        <CultureStoryRail items={visibleFeedItems} />

        {refreshError ? (
          <p className="mb-3 rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100" role="alert">
            {refreshError}
          </p>
        ) : null}

        <div className="space-y-4">
          {showDiscoveryModules ? feedModules.map((module) => (
            <CultureDiscoveryGrid key={module.id} module={module} />
          )) : null}

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
