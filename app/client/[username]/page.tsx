import {
  cleanPublicClientUsername,
  PublicClientProfileContent,
  readPublicClientProfile
} from "@/components/marketplace/public-client-profile";
import { notFound } from "next/navigation";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { areProfilesCultureBlocked } from "@/lib/trust/product-pr31-blocks";

export default async function PublicClientProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username: rawUsername } = await params;
  const username = cleanPublicClientUsername(rawUsername) || "client";
  const [profile, session] = await Promise.all([
    readPublicClientProfile(username),
    getCurrentUserFromServer()
  ]);
  if (profile && session.authenticated && session.user.id !== "guest-user" && isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    if (!supabase) throw new Error("Unable to verify public profile access.");
    if (await areProfilesCultureBlocked(supabase, session.user.id, profile.id)) notFound();
  }

  return (
    <main>
      <PublicClientProfileContent
        profile={profile}
        username={username}
        viewerCanReport={session.authenticated && session.user.id !== "guest-user"}
      />
    </main>
  );
}
