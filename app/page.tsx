import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { CinematicHome } from "@/components/public-site/cinematic-home";
import { buildOAuthCallbackRedirectPath, type OAuthCallbackSearchParams } from "@/lib/auth/oauth-callback";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

type HomePageProps = {
  searchParams?: Promise<OAuthCallbackSearchParams>;
};

export const metadata: Metadata = {
  title: "BVRB3R — The whole barbershop. One system.",
  description:
    "Find the right barber, book a real chair, follow the live floor, and run the shop from one connected BVRB3R platform.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BVRB3R — The whole barbershop. One system.",
    description: "Discovery, booking, walk-ins, and floor control built around how barbering actually works.",
    type: "website",
    url: "/"
  }
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
    <>
      <AuthSessionRecovery mode="public" />
      <CinematicHome />
    </>
  );
}
