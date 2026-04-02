import { redirect } from "next/navigation";
import { ActivationStatusWorkspace } from "@/components/onboarding/activation-status-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function ActivationStatusPage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  const destination = await resolvePostAuthDestination(user);
  if (destination !== "/activation-status") {
    redirect(destination);
  }

  return <ActivationStatusWorkspace />;
}
