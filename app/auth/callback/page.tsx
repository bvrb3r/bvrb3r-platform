import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  applySignupRoleIntentForAuthUser,
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
  type?: string;
}>;

function toExchangePath(params: Awaited<CallbackSearchParams>): Route {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) {
      search.set(key, value);
    }
  }

  return `/auth/callback/exchange?${search.toString()}` as Route;
}

function AuthCallbackError({ message, code }: { message: string; code?: string }) {
  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-center py-6 sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Sign-in link</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          This sign-in link could not be used.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          {message || "The link may be invalid or expired. Please request a new link or log in again."}
        </p>
        {code ? <p className="mt-3 text-xs uppercase tracking-[0.22em] text-white/42">{code}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex min-h-12 items-center rounded-full bg-[#c4f24e] px-6 text-sm font-semibold text-black">
            Back to login
          </Link>
          <Link href="/signup" className="inline-flex min-h-12 items-center rounded-full border border-white/12 px-6 text-sm font-semibold text-white/78">
            Create account
          </Link>
        </div>
      </Card>
    </section>
  );
}

export default async function AuthCallbackPage({
  searchParams
}: {
  searchParams: CallbackSearchParams;
}) {
  const params = await searchParams;
  console.info("[auth] callback page entered", {
    hasCode: Boolean(params.code),
    hasError: Boolean(params.error),
    type: params.type ?? null
  });

  if (params.error) {
    return (
      <AuthCallbackError
        message={params.error_description ?? params.error}
        code={params.error_code ?? params.error}
      />
    );
  }

  if (params.code) {
    if (params.type === "recovery") {
      const resetSearch = new URLSearchParams({
        code: params.code,
        type: "recovery"
      });
      redirect(`/reset-password?${resetSearch.toString()}` as Route);
    }

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

  if (params.type === "recovery") {
    redirect("/reset-password?recovery=1");
  }

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
  await applySignupRoleIntentForAuthUser(identityUser);
  const runtimeUser = await buildRuntimeUserFromProductionAuth(identityUser);

  const destination = await resolvePostAuthDestination(runtimeUser);
  console.info("[auth] callback resolved destination", {
    userId: runtimeUser.id,
    destination
  });
  redirect(destination);
}
