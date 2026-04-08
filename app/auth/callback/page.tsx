import type { Route } from "next";
import { redirect } from "next/navigation";
import { buildRuntimeUserFromProductionAuth } from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CallbackSearchParams = Promise<{
  code?: string;
  error?: string;
  error_description?: string;
}>;

function toLoginErrorPath(message: string): Route {
  return `/login?error=${encodeURIComponent(message)}` as Route;
}

export default async function AuthCallbackPage({
  searchParams
}: {
  searchParams: CallbackSearchParams;
}) {
  const params = await searchParams;

  if (params.error) {
    redirect(toLoginErrorPath(params.error_description ?? params.error));
  }

  if (params.code) {
    redirect(`/auth/callback/exchange?code=${encodeURIComponent(params.code)}` as Route);
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const authUser = result?.data.user;

  if (!authUser) {
    redirect("/login");
  }

  const runtimeUser = await buildRuntimeUserFromProductionAuth({
    id: authUser.id,
    email: authUser.email,
    phone: authUser.phone,
    email_confirmed_at: authUser.email_confirmed_at,
    phone_confirmed_at: authUser.phone_confirmed_at,
    user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
  });

  redirect(await resolvePostAuthDestination(runtimeUser));
}
