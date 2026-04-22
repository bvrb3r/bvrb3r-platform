import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { decoratePublicProfileWithActivation } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildPublicProfilePayload, getMarketplaceProvider } from "@/lib/marketplace/provider";
import { getTrustProvider } from "@/lib/trust/provider";

export default async function PublicBarberProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username } = await params;
  const [marketplaceProvider, trustProvider, activationProvider, context] = await Promise.all([
    getMarketplaceProvider(),
    getTrustProvider(),
    getMarketplaceActivationProvider(),
    getClientExperienceContext()
  ]);
  const [runtime, trustState, activationState] = await Promise.all([
    marketplaceProvider.readRuntime(),
    trustProvider.readState(),
    activationProvider.readState()
  ]);
  const profile = buildPublicProfilePayload(runtime, trustState, username);
  if (!profile) notFound();
  const decoratedProfile = decoratePublicProfileWithActivation(profile, activationState);
  try {
    await marketplaceProvider.recordProfileView({ barberId: decoratedProfile.barber.id, username, clientId: context.isSignedInClient ? context.clientId : undefined });
  } catch {}
  const canReport = ["client", "commission_barber", "booth_rent_barber", "owner"].includes(context.viewer.role);

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <PublicBarberProfile profile={decoratedProfile} viewerCanFollow={context.isSignedInClient} viewerCanReport={canReport} />
    </ClientAppShell>
  );
}
