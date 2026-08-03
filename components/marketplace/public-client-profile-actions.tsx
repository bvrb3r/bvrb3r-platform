"use client";

import Link from "next/link";
import type { Route } from "next";
import { MessageCircle, Share2, UserPlus } from "lucide-react";
import { useState } from "react";

const actionClassName = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/24 px-5 text-sm font-extrabold text-white";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PublicClientProfileActions({
  profileId,
  profilePath,
  canFollow
}: {
  profileId: string | null;
  profilePath: string;
  canFollow: boolean;
}) {
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const profileReady = Boolean(profileId && UUID_PATTERN.test(profileId));

  async function toggleFollow() {
    if (!profileId || !profileReady || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/culture/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetProfileId: profileId,
          action: following ? "unfollow" : "follow",
          metadata: { source: "public_client_profile" }
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Follow could not be updated.");
      setFollowing((current) => !current);
      setStatus(following ? "Follow removed." : "Following.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Follow could not be updated.");
    } finally {
      setPending(false);
    }
  }

  async function share() {
    const url = new URL(profilePath, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: "BVRB3R Culture profile", url });
        setStatus("Shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("Profile link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Sharing failed. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canFollow && profileReady ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void toggleFollow()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/10 px-5 text-sm font-extrabold text-[#c4f24e] disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          {pending ? "Saving..." : following ? "Following" : "Follow"}
        </button>
      ) : canFollow ? (
        <span className={`${actionClassName} cursor-not-allowed text-white/45`} title="This profile is not available for following yet.">
          <UserPlus className="h-4 w-4" /> Follow unavailable
        </span>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(profilePath)}` as Route}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/10 px-5 text-sm font-extrabold text-[#c4f24e]"
        >
          <UserPlus className="h-4 w-4" /> Sign in to follow
        </Link>
      )}
      <span className={`${actionClassName} cursor-not-allowed text-white/45`} title="Client-to-client messaging is not available in this release.">
        <MessageCircle className="h-4 w-4" /> Message unavailable
      </span>
      <button type="button" onClick={() => void share()} className={actionClassName}>
        <Share2 className="h-4 w-4" /> Share
      </button>
      <p aria-live="polite" className="min-h-4 text-center text-xs text-white/48">{status}</p>
    </div>
  );
}
