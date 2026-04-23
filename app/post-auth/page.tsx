import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { isDynamicServerError } from "next/dist/client/components/hooks-server-context";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination, resolvePostAuthRecoveryDestination } from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

export default async function PostAuthPage() {
  let session;

  try {
    session = await getCurrentUserFromServer();
  } catch (error) {
    if (isDynamicServerError(error)) {
      throw error;
    }

    console.error("[auth] /post-auth session read failed", {
      error: error instanceof Error ? error.message : `${error ?? "unknown error"}`
    });
    redirect("/login");
  }

  const { user, authenticated } = session;
  if (!authenticated) {
    console.info("[auth] /post-auth redirecting unauthenticated visitor to /login");
    redirect("/login");
  }

  try {
    const destination = await resolvePostAuthDestination(user);
    console.info("[auth] /post-auth redirecting authenticated user", {
      userId: user.id,
      destination
    });
    redirect(destination);
  } catch (error) {
    if (isRedirectError(error) || isDynamicServerError(error)) {
      throw error;
    }

    const fallbackDestination = resolvePostAuthRecoveryDestination(user);
    console.error("[auth] /post-auth resolution failed; using recovery destination", {
      userId: user.id,
      error: error instanceof Error ? error.message : `${error ?? "unknown error"}`,
      fallbackDestination
    });
    redirect(fallbackDestination);
  }
}
