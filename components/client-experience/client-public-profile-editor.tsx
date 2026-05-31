"use client";

import Link from "next/link";
import { ArrowLeft, Eye, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/design/components";
import type { UserAccount } from "@/types/domain";

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function ClientPublicProfileEditor({ user }: { user: UserAccount }) {
  const displayName = user.canonicalFullName ?? user.name ?? "Client";
  const handle = suggestHandle(displayName) || "client";

  return (
    <div className="space-y-5" data-testid="client-public-profile-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A3FF12]">Culture profile</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">Public Profile</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            Shape the client identity that can appear in Culture, comments, likes, follows, and message context.
          </p>
        </div>
        <Link
          href="/dashboard/client/more"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to More
        </Link>
      </div>

      <GlassCard active className="overflow-hidden p-0">
        <div className="h-36 border-b border-white/8 bg-[linear-gradient(135deg,rgba(163,255,18,0.18),rgba(255,255,255,0.04)_38%,rgba(0,0,0,0.25))]" />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="-mt-16 flex h-32 w-32 items-center justify-center rounded-[32px] border-2 border-[#A3FF12]/55 bg-black text-3xl font-black text-[#A3FF12] shadow-[0_22px_60px_rgba(0,0,0,0.48)]">
            {displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BV"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Preview</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-white">{displayName}</h2>
            <p className="mt-1 text-sm font-bold text-white/54">@{handle}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              Client public profiles are scoped to Culture and social interactions. They do not appear in barber or shop marketplace search.
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-white/72">
            Public display name
            <Input defaultValue={displayName} className="mt-2" />
          </label>
          <label className="block text-sm font-bold text-white/72">
            @username
            <Input defaultValue={handle} className="mt-2" />
          </label>
          <label className="block text-sm font-bold text-white/72 md:col-span-2">
            Bio
            <textarea
              defaultValue=""
              placeholder="Share what you like in cuts, shops, culture, and style."
              className="mt-2 min-h-28 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/32 focus:border-[#A3FF12]/45 focus:ring-2 focus:ring-[#A3FF12]/18"
            />
          </label>
          <label className="block text-sm font-bold text-white/72">
            City/location display
            <Input placeholder="Tampa, FL" className="mt-2" />
          </label>
          <label className="block text-sm font-bold text-white/72">
            Culture profile visibility
            <select className="mt-2 min-h-12 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none focus:border-[#A3FF12]/45 focus:ring-2 focus:ring-[#A3FF12]/18">
              <option>Culture only</option>
              <option>Hidden</option>
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-3 rounded-[22px] border border-white/8 bg-black/24 p-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-black text-white">Avatar and cover</p>
              <p className="mt-1 text-sm leading-5 text-white/54">Use the existing profile media rails when uploads are available.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
              <Eye className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-black text-white">Culture preview</p>
              <p className="mt-1 text-sm leading-5 text-white/54">Posts and feed previews will appear here when Culture publishing is live.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/client/more" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]">
            Cancel
          </Link>
          <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled>
            Save
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/42">
          Saving will activate when the Culture profile API is connected. This page is intentionally separate from marketplace profiles.
        </p>
      </GlassCard>
    </div>
  );
}
