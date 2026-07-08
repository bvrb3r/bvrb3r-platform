import type { Route } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { AuthEntryCard } from "@/components/home/auth-entry-card";
import { FinalCta } from "@/components/home/final-cta";
import { HomeHeader } from "@/components/home/home-header";
import { HomeHero } from "@/components/home/home-hero";
import { ValueStrip } from "@/components/home/value-strip";
import { buildOAuthCallbackRedirectPath, type OAuthCallbackSearchParams } from "@/lib/auth/oauth-callback";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

type HomePageProps = {
  searchParams?: Promise<OAuthCallbackSearchParams>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const callbackRedirect = buildOAuthCallbackRedirectPath(await (searchParams ?? Promise.resolve({})));
  if (callbackRedirect) {
    redirect(callbackRedirect as Route);
  }

  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-[#030403] text-[#f5f1e8]">
      <AuthSessionRecovery mode="public" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(196, 242, 78,0.18),transparent_28%),radial-gradient(circle_at_92%_26%,rgba(255,255,255,0.07),transparent_24%),linear-gradient(180deg,#050604_0%,#0a0b09_42%,#030403_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.32] [background-image:linear-gradient(rgba(245,241,232,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(245,241,232,0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]"
      />

      <HomeHeader />
      <section className="page-shell grid gap-10 pb-14 pt-7 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-center lg:gap-14 lg:pb-20 lg:pt-16">
        <HomeHero />
        <Suspense fallback={<div className="min-h-[520px] rounded-[34px] border border-white/8 bg-white/[0.03]" />}>
          <AuthEntryCard />
        </Suspense>
      </section>
      <ValueStrip />
      <FinalCta />
    </main>
  );
}
