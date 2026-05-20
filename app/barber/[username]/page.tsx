import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function PublicBarberProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username } = await params;
  const [profile, context] = await Promise.all([
    getBarberDetailsPayload(username),
    getClientExperienceContext()
  ]);
  if (!profile) notFound();
  const canReport = isClientRole(context.viewer.role) || isBarberAccountRole(context.viewer.role) || isShopOwnerRole(context.viewer.role);

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <PublicBarberProfile
        profile={profile}
        viewerCanFollow={context.isSignedInClient}
        viewerCanMessage={context.isSignedInClient}
        viewerCanReport={canReport}
      />
    </ClientAppShell>
  );
}
