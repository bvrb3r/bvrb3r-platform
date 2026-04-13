import type { Route } from "next";
import { redirect } from "next/navigation";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import {
  buildRuntimeUserFromProductionAuth,
  ensureCanonicalProfileForAuthUser
} from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CallbackSearchParams = Promise<{
  code?: string;
  error?: string;
  error_description?: string;
  error_code?: string;
  next?: string;
  state?: string;
}>;

function toLoginErrorPath(message: string): Route {
  return `/login?error=${encodeURIComponent(message)}` as Route;
}

function toExchangePath(params: Awaited<CallbackSearchParams>): Route {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) {
      search.set(key, value);
    }
  }

  return `/auth/callback/exchange?${search.toString()}` as Route;
}

export default async function AuthCallbackPage({
  searchParams
}: {
  searchParams: CallbackSearchParams;
}) {
  const params = await searchParams;
  console.info("[auth] callback page entered", {
    hasCode: Boolean(params.code),
    hasError: Boolean(params.error)
  });

  if (params.error) {
    redirect(toLoginErrorPath(params.error_description ?? params.error));
  }

  if (params.code) {
    console.info("[auth] callback received OAuth code; routing through server exchange", {
      hasCode: true,
      hasNext: Boolean(params.next),
      hasState: Boolean(params.state)
    });
    redirect(toExchangePath(params));
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const authUser = result?.data.user;

  if (!authUser) {
    return <AuthSessionRecovery mode="callback" />;
  }

  const identityUser = {
    id: authUser.id,
    email: authUser.email,
    phone: authUser.phone,
    email_confirmed_at: authUser.email_confirmed_at,
    phone_confirmed_at: authUser.phone_confirmed_at,
    user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
  };

  await ensureCanonicalProfileForAuthUser(identityUser);
  const runtimeUser = await buildRuntimeUserFromProductionAuth(identityUser);

  const destination = await resolvePostAuthDestination(runtimeUser);
  console.info("[auth] callback resolved destination", {
    userId: runtimeUser.id,
    destination
  });
  redirect(destination);
}
