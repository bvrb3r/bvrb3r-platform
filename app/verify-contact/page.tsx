import { redirect } from "next/navigation";
import { ContactVerificationWorkspace } from "@/components/auth/contact-verification-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function VerifyContactPage() {
  const { user, authenticated } = await getCurrentUserFromServer();
  if (!authenticated) {
    redirect("/login");
  }

  const destination = await resolvePostAuthDestination(user);
  if (destination !== "/verify-contact") {
    redirect(destination);
  }

  return <ContactVerificationWorkspace />;
}
