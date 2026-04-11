import { redirect } from "next/navigation";
import { ContactVerificationWorkspace } from "@/components/auth/contact-verification-workspace";
import {
  buildRuntimeUserFromProductionAuth,
  getContactVerificationState
} from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function VerifyContactPage() {
  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const authUser = result?.data.user;

  if (!authUser) {
    redirect("/login");
  }

  const identityUser = {
    id: authUser.id,
    email: authUser.email,
    phone: authUser.phone,
    email_confirmed_at: authUser.email_confirmed_at,
    phone_confirmed_at: authUser.phone_confirmed_at,
    user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
  };

  const contactState = await getContactVerificationState(identityUser);
  if (contactState.canContinue) {
    if (contactState.requiresRoleSelection) {
      redirect("/role-select");
    }

    const destination = await resolvePostAuthDestination(
      await buildRuntimeUserFromProductionAuth(identityUser)
    );
    if (destination !== "/verify-contact") {
      redirect(destination);
    }
  }

  return <ContactVerificationWorkspace />;
}
