import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { MessageCircle, Share2, Sparkles, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { isSupabaseEnabled, runtimeConfig } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ReportBlockSheet } from "@/components/trust/report-block-sheet";

export type PublicClientProfile = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
  contextLine?: string | null;
  posts: Array<{ id: string; imageUrl: string }>;
};

export function cleanPublicClientUsername(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

function displayNameFromUsername(username: string) {
  return username
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "BVRB3R client";
}

function initialsForName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function publicMediaUrl(storagePath?: string | null, imageUrl?: string | null) {
  if (imageUrl) {
    return imageUrl;
  }

  if (!storagePath || !isSupabaseEnabled()) {
    return storagePath ?? null;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return storagePath;
  }

  return supabase.storage.from(runtimeConfig.mediaBucket).getPublicUrl(storagePath).data.publicUrl || storagePath;
}

export async function readPublicClientProfile(username: string): Promise<PublicClientProfile | null> {
  const supabase = isSupabaseEnabled() ? createSupabaseAdminClient() : null;
  if (!supabase) {
    const displayName = displayNameFromUsername(username);
    return {
      id: username,
      displayName,
      username,
      bio: null,
      contextLine: "Culture and social identity",
      posts: []
    };
  }

  const profilesResult = await supabase
    .from("profiles")
    .select("id, full_name, public_username, profile_photo_path, profile_photo_url, public_bio, public_city, public_state")
    .limit(300);

  if (profilesResult.error) {
    return null;
  }

  const profiles = (profilesResult.data ?? []) as Array<{
    id: string;
    full_name?: string | null;
    public_username?: string | null;
    profile_photo_path?: string | null;
    profile_photo_url?: string | null;
    public_bio?: string | null;
    public_city?: string | null;
    public_state?: string | null;
  }>;
  const profile = profiles.find((entry) => {
    const displayName = entry.full_name?.trim() || "";
    return entry.id === username || entry.public_username === username || suggestHandle(displayName) === username;
  });

  if (!profile) {
    return null;
  }

  const mediaResult = await supabase
    .from("media_assets")
    .select("id, storage_path")
    .eq("owner_profile_id", profile.id)
    .eq("asset_type", "client_profile_post")
    .order("created_at", { ascending: false });

  const displayName = profile.full_name?.trim() || displayNameFromUsername(username);
  const contextLine = [profile.public_city, profile.public_state].filter(Boolean).join(", ") || "Culture and social identity";
  return {
    id: profile.id,
    displayName,
    username: profile.public_username ?? username,
    avatarUrl: publicMediaUrl(profile.profile_photo_path, profile.profile_photo_url),
    bio: profile.public_bio ?? null,
    contextLine,
    posts: ((mediaResult.data ?? []) as Array<{ id: string; storage_path: string }>).map((item) => ({
      id: item.id,
      imageUrl: publicMediaUrl(item.storage_path) ?? item.storage_path
    }))
  };
}

export function getPublicClientDisplayName(profile: PublicClientProfile | null, username: string) {
  return profile?.displayName ?? displayNameFromUsername(username);
}

export function PublicClientProfileContent({
  profile,
  username,
  backHref = "/",
  backLabel = "BVRB3R",
  viewerCanReport = false
}: {
  profile: PublicClientProfile | null;
  username: string;
  backHref?: Route | string;
  backLabel?: string;
  viewerCanReport?: boolean;
}) {
  const displayName = getPublicClientDisplayName(profile, username);
  const publicUsername = profile?.username ?? username;
  const posts = profile?.posts ?? [];

  return (
    <div className="min-h-screen bg-[#050505] px-4 py-6 text-white sm:px-6 lg:px-8" data-testid="public-client-profile">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link href={backHref as Route} className="inline-flex text-sm font-black uppercase tracking-[0.18em] text-[#c4f24e]">
          {backLabel}
        </Link>

        <Card className="overflow-hidden rounded-[36px] border border-white/10 bg-black/40 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="-mx-6 -mt-6 mb-6 h-44 border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(196, 242, 78,0.18),transparent_35%),linear-gradient(135deg,rgba(196, 242, 78,0.10),rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.34))] sm:-mx-8 sm:-mt-8" />
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <div className="-mt-20 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[32px] border-[3px] border-white/15 bg-black text-4xl font-black text-[#c4f24e] shadow-[0_20px_60px_rgba(0,0,0,0.50)]">
              {profile?.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={`${displayName} public profile`}
                  width={128}
                  height={128}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : initialsForName(displayName)}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c4f24e]">Culture profile</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-white sm:text-6xl">Public Profile</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">
                {profile?.bio?.trim() || "No public bio yet."}
              </p>
              <p className="mt-5 text-3xl font-black tracking-[-0.04em] text-white">{displayName}</p>
              <p className="mt-1 text-sm font-bold text-[#c4f24e]">@{publicUsername}</p>
              <p className="mt-2 text-sm font-semibold text-white/50">{profile?.contextLine ?? "Culture and social identity"}</p>
            </div>

            <div className="flex flex-col gap-3">
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#c4f24e]/35 bg-[#c4f24e]/10 px-5 text-sm font-extrabold text-[#c4f24e]">
                <UserPlus className="h-4 w-4" />
                Follow
              </button>
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/24 px-5 text-sm font-extrabold text-white">
                <MessageCircle className="h-4 w-4" />
                Message
              </button>
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/24 px-5 text-sm font-extrabold text-white">
                <Share2 className="h-4 w-4" />
                Share
              </button>
              {viewerCanReport && profile ? (
                <ReportBlockSheet
                  targetProfileId={profile.id}
                  targetLabel={displayName}
                  source="public_profile"
                  triggerLabel="Safety"
                  triggerClassName="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-red-400/20 bg-red-500/8 px-5 text-sm font-extrabold text-red-100"
                />
              ) : null}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [posts.length.toString(), "Posts"],
            ["0", "Followers"],
            ["0", "Following"]
          ].map(([value, label]) => (
            <Card key={label} className="rounded-[24px] border border-white/10 bg-black/30 p-5">
              <p className="text-3xl font-black text-white">{value}</p>
              <p className="mt-2 text-sm font-bold text-white/60">{label}</p>
            </Card>
          ))}
        </div>

        <Card className="rounded-[28px] border border-white/10 bg-black/24 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c4f24e]">Culture posts</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">Public media</h2>
            </div>
            <Sparkles className="h-8 w-8 text-[#c4f24e]" />
          </div>
          {posts.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {posts.map((post) => (
                <Image
                  key={post.id}
                  src={post.imageUrl}
                  alt={`${displayName} Culture post`}
                  width={360}
                  height={360}
                  unoptimized
                  className="aspect-square rounded-[20px] object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-white/58">No public Culture posts are visible yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
