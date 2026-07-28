import { redirect } from "next/navigation";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function BarberTypePage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  const destination = String(await resolvePostAuthDestination(user));
  let nextPath = destination;
  if (destination === "/onboarding/barber-type") {
    nextPath = "/dashboard/barber";
  }
  redirect(nextPath);
}
