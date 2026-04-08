import { redirect } from "next/navigation";
import { BarberTypeWorkspace } from "@/components/onboarding/barber-type-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function BarberTypePage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  const destination = await resolvePostAuthDestination(user);
  if (destination !== "/onboarding/barber-type") {
    redirect(destination);
  }

  return <BarberTypeWorkspace />;
}
