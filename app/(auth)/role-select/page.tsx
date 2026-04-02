import { redirect } from "next/navigation";
import { RoleSelectWorkspace } from "@/components/onboarding/role-select-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function RoleSelectPage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  const destination = await resolvePostAuthDestination(user);
  if (destination !== "/role-select") {
    redirect(destination);
  }

  return <RoleSelectWorkspace />;
}
