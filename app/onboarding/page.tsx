import { redirect } from "next/navigation";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function OnboardingIndexPage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }
  redirect(await resolvePostAuthDestination(user));
}
