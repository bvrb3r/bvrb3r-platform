import Link from "next/link";
import { MessageCircle, Share2, Sparkles, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";

function cleanUsername(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
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

export default async function PublicClientProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username: rawUsername } = await params;
  const username = cleanUsername(rawUsername) || "client";
  const displayName = displayNameFromUsername(username);

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link href="/" className="inline-flex text-sm font-black uppercase tracking-[0.18em] text-[#a3ff12]">
          BVRB3R
        </Link>

        <Card className="overflow-hidden rounded-[36px] border border-white/10 bg-black/40 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="-mx-6 -mt-6 mb-6 h-44 border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.18),transparent_35%),linear-gradient(135deg,rgba(163,255,18,0.10),rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.34))] sm:-mx-8 sm:-mt-8" />
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <div className="-mt-20 flex h-32 w-32 items-center justify-center rounded-[32px] border-[3px] border-white/15 bg-black text-4xl font-black text-[#a3ff12] shadow-[0_20px_60px_rgba(0,0,0,0.50)]">
              {initialsForName(displayName)}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a3ff12]">Culture profile</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-white sm:text-6xl">Public Profile</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">
                Culture posts, follows, comments, likes, and message context live here.
              </p>
              <p className="mt-5 text-3xl font-black tracking-[-0.04em] text-white">{displayName}</p>
              <p className="mt-1 text-sm font-bold text-[#a3ff12]">@{username}</p>
            </div>

            <div className="flex flex-col gap-3">
              <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#a3ff12]/35 bg-[#a3ff12]/10 px-5 text-sm font-extrabold text-[#a3ff12]">
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
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["0", "Posts"],
            ["0", "Followers"],
            ["0", "Following"]
          ].map(([value, label]) => (
            <Card key={label} className="rounded-[24px] border border-white/10 bg-black/30 p-5">
              <p className="text-3xl font-black text-white">{value}</p>
              <p className="mt-2 text-sm font-bold text-white/60">{label}</p>
            </Card>
          ))}
        </div>

        <Card className="rounded-[28px] border border-dashed border-white/10 bg-black/24 p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#a3ff12]" />
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Culture posts</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">
            No public Culture posts are visible yet.
          </p>
        </Card>
      </div>
    </main>
  );
}
