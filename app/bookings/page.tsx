import type { Route } from "next";
import { redirect } from "next/navigation";
import { GuestBookingLookup } from "@/components/booking/guest-booking-lookup";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function BookingsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      nextParams.set(key, value);
    }
  }

  if (context.isSignedInClient) {
    redirect((`/dashboard/client/activity${nextParams.size ? `?${nextParams.toString()}` : ""}`) as Route);
  }

  const confirmation = typeof params.confirmation === "string" ? params.confirmation : "";
  const support = params.support === "1" || params.support === "true";

  return (
    <ClientAppShell activeTab="profile" mode="guest">
      <GuestBookingLookup initialConfirmation={confirmation} initialSupport={support} />
    </ClientAppShell>
  );
}
