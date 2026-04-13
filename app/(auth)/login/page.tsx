import type { Route } from "next";
import { Suspense } from "react";
import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";
import { buildOAuthCallbackRedirectPath, type OAuthCallbackSearchParams } from "@/lib/auth/oauth-callback";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams?: Promise<OAuthCallbackSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const callbackRedirect = buildOAuthCallbackRedirectPath(await (searchParams ?? Promise.resolve({})));
  if (callbackRedirect) {
    redirect(callbackRedirect as Route);
  }

  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <Suspense fallback={null}>
      <AuthEntryWorkspace mode="login" />
    </Suspense>
  );
}
