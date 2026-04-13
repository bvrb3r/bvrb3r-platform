import type { Route } from "next";
import { Suspense } from "react";
import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";
import { buildOAuthCallbackRedirectPath, type OAuthCallbackSearchParams } from "@/lib/auth/oauth-callback";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { redirect } from "next/navigation";

type SignupPageProps = {
  searchParams?: Promise<OAuthCallbackSearchParams>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
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
      <AuthEntryWorkspace mode="signup" />
    </Suspense>
  );
}
