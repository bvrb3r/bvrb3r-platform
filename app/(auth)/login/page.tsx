import { Suspense } from "react";
import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isOwnerReviewMode } from "@/lib/config/owner-review";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <Suspense fallback={null}>
      <AuthEntryWorkspace mode="login" signupEnabled={!isOwnerReviewMode()} />
    </Suspense>
  );
}
