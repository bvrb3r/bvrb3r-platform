"use client";

import { useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { buildClientProfileStudioViewModel } from "@/components/profile-studio/adapters/client-profile-studio-adapter";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import type { UserAccount } from "@/types/domain";

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function ClientPublicProfileEditor({ user }: { user: UserAccount }) {
  const model = useMemo(() => buildClientProfileStudioViewModel(user), [user]);
  const [usernameDraft, setUsernameDraft] = useState(model.username.value);
  const studioRef = useRef<HTMLDivElement | null>(null);

  function scrollToStudio() {
    studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={studioRef} data-testid="client-public-profile-editor">
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
        onEdit={scrollToStudio}
        onMedia={scrollToStudio}
        onPreview={() => window.alert?.("Public client preview opens when Culture profile routing is connected.")}
        onShare={() => void navigator.clipboard?.writeText(`${window.location.origin}/client/${usernameDraft || model.username.value}`)}
      />
    </div>
  );
}
