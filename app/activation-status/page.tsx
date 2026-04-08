import { redirect } from "next/navigation";
import { ActivationStatusWorkspace } from "@/components/onboarding/activation-status-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";

export default async function ActivationStatusPage() {
  const { authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  return <ActivationStatusWorkspace />;
}
