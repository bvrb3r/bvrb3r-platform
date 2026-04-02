import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  if (user.accountStatus === "active") {
    redirect(await resolvePostAuthDestination(user));
  }

  return children;
}
