"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Heart, MessageCircle, Scissors, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CultureFeedItem, CultureFeedResponse } from "@/lib/culture/service";
import styles from "./public-site.module.css";

const CLIENT_SIGNUP_HREF = "/signup?lane=client" as Route;
const cultureDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function mergeFeedItems(current: CultureFeedItem[], incoming: CultureFeedItem[]) {
  const seen = new Set<string>();

  return [...current, ...incoming].filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function actorFor(post: CultureFeedItem) {
  return {
    avatarUrl: post.displayActor?.avatarUrl ?? post.authorAvatarUrl,
    displayName: post.displayActor?.displayName ?? post.authorDisplayName,
    roleLabel: post.displayActor?.roleLabel ?? post.authorRoleLabel,
    route: post.displayActor?.publicRoute
      ?? (post.authorTargetKind === "shop" ? post.shopUrl : post.profileUrl),
    username: post.displayActor?.username
      ? `@${post.displayActor.username.replace(/^@/, "")}`
      : post.authorUsername
  };
}

function initialsFor(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "BV";
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "New";
  }

  return cultureDateFormatter.format(date);
}

function bookingHrefFor(post: CultureFeedItem): Route {
  if (post.bookingUrl) {
    return post.bookingUrl as Route;
  }

  const params = new URLSearchParams({
    entry: "guest",
    source: "culture",
    culturePostId: post.id
  });
  const discoveryQuery = post.serviceName?.trim() || post.caption.trim().slice(0, 80);
  if (discoveryQuery) {
    params.set("q", discoveryQuery);
  }

  return `/discover?${params.toString()}` as Route;
}

function PublicCultureCard({ post }: { post: CultureFeedItem }) {
  const actor = actorFor(post);
  const mediaUrl = post.media?.thumbnailUrl ?? post.media?.url;
  const identity = (
    <>
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c4f24e]/25 bg-[#c4f24e]/10 text-sm font-black text-[#e4f9b8]">
        {actor.avatarUrl ? (
          <Image
            src={actor.avatarUrl}
            alt=""
            fill
            sizes="48px"
            unoptimized
            className="object-cover"
          />
        ) : initialsFor(actor.displayName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-white">
          {actor.username ?? actor.displayName}
        </span>
        {actor.username ? (
          <span className="mt-0.5 block truncate text-xs text-white/48">{actor.displayName}</span>
        ) : null}
        <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
          {actor.roleLabel} · {dateLabel(post.createdAt)}
        </span>
      </span>
    </>
  );

  return (
    <article
      className={`${styles.cultureCard} overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.96),rgba(6,6,6,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.34)]`}
      data-testid="public-culture-post"
    >
      <header className="flex items-center justify-between gap-3 p-4 sm:p-5">
        {actor.route ? (
          <Link
            href={actor.route as Route}
            className="flex min-w-0 items-center gap-3 rounded-[18px] pr-3 transition hover:bg-white/[0.04]"
            aria-label={`Open ${actor.displayName} public profile`}
          >
            {identity}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">{identity}</div>
        )}
        <Link
          href={CLIENT_SIGNUP_HREF}
          className="shrink-0 rounded-full border border-white/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/72 transition hover:border-[#c4f24e]/35 hover:text-[#e4f9b8]"
        >
          Follow
        </Link>
      </header>

      <div className="px-3 sm:px-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(201,168,124,0.12),transparent_35%),linear-gradient(145deg,rgba(255,255,255,0.07),rgba(0,0,0,0.82))]">
          {mediaUrl ? (
            <Image
              src={mediaUrl}
              alt={`Culture post by ${actor.displayName}`}
              fill
              sizes="(max-width: 768px) calc(100vw - 2rem), 640px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              <span className="rounded-full border border-[#c4f24e]/20 bg-[#c4f24e]/10 p-5 text-[#e4f9b8]">
                <Sparkles className="h-8 w-8" aria-hidden="true" />
              </span>
              <p className="max-w-xs text-sm leading-6 text-white/50">Approved Culture work is on the way.</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Link
            href={CLIENT_SIGNUP_HREF}
            className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-xs font-bold text-white/68 transition hover:bg-white/[0.05] hover:text-[#e4f9b8]"
            aria-label="Like this Culture post"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
            Like
          </Link>
          <Link
            href={CLIENT_SIGNUP_HREF}
            className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-xs font-bold text-white/68 transition hover:bg-white/[0.05] hover:text-[#e4f9b8]"
            aria-label="Comment on this Culture post"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {post.commentSummary?.count ? post.commentSummary.count : "Comment"}
          </Link>
        </div>

        {post.caption ? <p className="mt-3 text-sm leading-6 text-white/76">{post.caption}</p> : null}

        <Link
          href={bookingHrefFor(post)}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c4f24e] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#050505] shadow-[0_16px_36px_rgba(196,242,78,0.18)] transition hover:bg-[#d4f97a] sm:w-auto"
          aria-label={`Book this look from ${actor.displayName}`}
        >
          <Scissors className="h-4 w-4" aria-hidden="true" />
          Book this look
        </Link>
      </div>
    </article>
  );
}

export function PublicCultureFeed({ initialFeed }: { initialFeed: CultureFeedResponse }) {
  const [items, setItems] = useState(initialFeed.items);
  const [cursor, setCursor] = useState(initialFeed.cursor);
  const [hasMore, setHasMore] = useState(initialFeed.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialFeed.error ?? null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedSessionId = initialFeed.feedSessionId ?? null;

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        role: "client",
        cursor,
        limit: "8"
      });
      if (feedSessionId) {
        params.set("sessionId", feedSessionId);
      }

      const response = await fetch(`/api/culture/feed?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(typeof body?.error === "string" ? body.error : "Unable to load more Culture posts.");
      }

      const nextFeed = body as CultureFeedResponse;
      setItems((current) => mergeFeedItems(current, nextFeed.items ?? []));
      setCursor(nextFeed.cursor ?? null);
      setHasMore(Boolean(nextFeed.hasMore));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load more Culture posts.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, feedSessionId, hasMore, loadingMore]);

  useEffect(() => {
    if (loadError || !hasMore || !cursor || loadingMore || typeof IntersectionObserver === "undefined") {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: "0px 0px 30% 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadError, loadMore, loadingMore]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6" data-testid="public-culture-feed">
      <header className="pb-10 pt-36 text-center sm:pb-12 sm:pt-40">
        <p className={`${styles.cultureKicker} text-[10px] font-bold uppercase tracking-[0.28em] text-[#c9a87c]`}>The feed that books</p>
        <h1 className={`${styles.cultureTitle} mt-5 text-5xl leading-[0.95] text-[#f5f1e8] sm:text-7xl`}>
          Culture<span className="text-[#c4f24e]">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/60 sm:text-base">
          See the work. Meet the barber behind it. Move from inspiration to a real chair.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/discover?entry=guest"
            className="inline-flex min-h-12 items-center rounded-full border border-white/14 px-5 text-xs font-black uppercase tracking-[0.12em] text-white/78 transition hover:border-white/28 hover:text-white"
          >
            Discover barbers
          </Link>
          <Link
            href={CLIENT_SIGNUP_HREF}
            className="inline-flex min-h-12 items-center rounded-full bg-[#c4f24e] px-5 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-[#d4f97a]"
          >
            Post to Culture
          </Link>
        </div>
      </header>

      {items.length ? (
        <div className="space-y-5">
          {items.map((post) => <PublicCultureCard key={post.id} post={post} />)}
        </div>
      ) : loadError ? (
        <section className="rounded-[28px] border border-red-300/20 bg-red-500/[0.08] px-6 py-12 text-center" role="alert">
          <Sparkles className="mx-auto h-8 w-8 text-[#fff6e6]" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold text-white">Culture is taking a breath.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">{loadError}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-12 items-center rounded-full border border-white/16 px-5 text-xs font-black uppercase tracking-[0.12em] text-white"
            >
              Try again
            </button>
            <Link
              href="/discover?entry=guest"
              className="inline-flex min-h-12 items-center rounded-full bg-[#c4f24e] px-5 text-xs font-black uppercase tracking-[0.12em] text-black"
            >
              Guest Discovery
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-white/10 bg-black/30 px-6 py-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#c4f24e]" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold text-white">The next look is being posted.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/54">
            Explore live barber and shop profiles while the public Culture feed grows.
          </p>
          <Link
            href="/discover?entry=guest"
            className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#c4f24e] px-5 text-xs font-black uppercase tracking-[0.12em] text-black"
          >
            Guest Discovery
          </Link>
        </section>
      )}

      {loadError && items.length > 0 ? (
        <div className="mt-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
          <p>{loadError}</p>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="mt-3 rounded-full border border-red-200/25 px-4 py-2 text-xs font-black uppercase tracking-[0.12em]"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {loadingMore ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-black/25 p-5" aria-label="Loading more Culture posts">
          <div className="h-4 w-1/3 animate-pulse rounded-full bg-white/10" />
          <div className="mt-4 aspect-[4/5] animate-pulse rounded-[20px] bg-white/[0.06]" />
        </div>
      ) : null}

      <div ref={sentinelRef} className="h-8" aria-hidden="true" data-testid="public-culture-sentinel" />

      {items.length > 0 && !hasMore ? (
        <div className="mt-8 rounded-[24px] border border-white/10 bg-black/25 px-5 py-7 text-center">
          <p className="text-sm text-white/54">You&apos;re caught up. The next look starts with the next post.</p>
          <Link href={CLIENT_SIGNUP_HREF} className="mt-4 inline-flex text-xs font-black uppercase tracking-[0.14em] text-[#c4f24e]">
            Join to post, like, and comment
          </Link>
        </div>
      ) : null}
    </div>
  );
}
