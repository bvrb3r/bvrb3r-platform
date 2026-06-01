"use client";

import { useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildClientProfileStudioViewModel } from "@/components/profile-studio/adapters/client-profile-studio-adapter";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { GlassCard } from "@/design/components";
import type { UserAccount } from "@/types/domain";

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function ClientPublicProfileEditor({ user }: { user: UserAccount }) {
  const model = useMemo(() => buildClientProfileStudioViewModel(user), [user]);
  const [usernameDraft, setUsernameDraft] = useState(model.username.value);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);

  function scrollTo(target: HTMLDivElement | null) {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div data-testid="client-public-profile-editor">
      <ProfileStudioShell
        model={{
          ...model,
          hero: {
            ...model.hero,
            username: usernameDraft || model.hero.username,
            publicUrl: usernameDraft ? `/client/${usernameDraft}` : model.hero.publicUrl
          },
          username: {
            ...model.username,
            value: usernameDraft,
            publicUrl: usernameDraft ? `/client/${usernameDraft}` : model.username.publicUrl
          }
        }}
        backHref={"/dashboard/client/more" as Route}
        backLabel="Back to More"
        usernameValue={usernameDraft}
        onUsernameChange={(value) => setUsernameDraft(suggestHandle(value))}
        onEdit={() => scrollTo(editorRef.current)}
        onMedia={() => scrollTo(mediaRef.current)}
        onPreview={() => window.alert?.("Public client preview opens when Culture profile routing is connected.")}
        onShare={() => void navigator.clipboard?.writeText(`${window.location.origin}/client/${usernameDraft || model.username.value}`)}
        editorSlot={(
          <div ref={editorRef} className="scroll-mt-6">
            <GlassCard className="p-5 sm:p-6">
              <div className="mb-5">
                <p className="bvr-section-label">Edit profile</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] text-white">Culture profile studio</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">
                  Client profile controls stay public-safe and social. Account, payment, and private contact details stay in Edit Account.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-bold text-white/72">
                  Public display name
                  <Input defaultValue={model.hero.publicName} className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  @username
                  <Input value={usernameDraft} onChange={(event) => setUsernameDraft(suggestHandle(event.target.value))} className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72 md:col-span-2">
                  Public bio
                  <textarea
                    placeholder="Share what you like in cuts, shops, culture, and style."
                    className="mt-2 min-h-28 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/32 focus:border-[#a3ff12]/45 focus:ring-2 focus:ring-[#a3ff12]/18"
                  />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  City/location display
                  <Input placeholder="Tampa, FL" className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  Culture profile visibility
                  <select className="mt-2 min-h-12 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none focus:border-[#a3ff12]/45 focus:ring-2 focus:ring-[#a3ff12]/18">
                    <option>Culture only</option>
                    <option>Hidden</option>
                  </select>
                </label>
              </div>

              <div ref={mediaRef} className="mt-5 scroll-mt-6 rounded-[22px] border border-dashed border-white/10 bg-black/24 p-5">
                <p className="text-sm font-black text-white">Culture posts and media</p>
                <p className="mt-2 text-sm leading-6 text-white/56">
                  Upload real photos or videos when Culture publishing is connected. This studio does not show fake posts.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl border-white/10 bg-white/[0.035] text-white/76 hover:border-[#a3ff12]/30 hover:text-white">
                  Cancel
                </Button>
                <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#a3ff12] text-black hover:bg-[#8de300]" disabled>
                  Save
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/42">
                Saving activates when the Culture profile API is connected. The public studio remains separate from marketplace profiles.
              </p>
            </GlassCard>
          </div>
        )}
      />
    </div>
  );
}
