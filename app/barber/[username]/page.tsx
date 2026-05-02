import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function PublicBarberProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username } = await params;
  const [profile, context] = await Promise.all([
    getBarberDetailsPayload(username),
    getClientExperienceContext()
  ]);
  if (!profile) notFound();
  const canReport = ["client", "commission_barber", "booth_rent_barber", "owner"].includes(context.viewer.role);

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <PublicBarberProfile profile={profile} viewerCanFollow={context.isSignedInClient} viewerCanReport={canReport} />
    </ClientAppShell>
  );
}
