import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { PublicShopProfile } from "@/components/marketplace/public-shop-profile";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getPublicShopProfilePayload } from "@/lib/booking/platform-service";

export default async function PublicShopProfilePage({ params }: { params: Promise<{ shopId: string }>; }) {
  const { shopId } = await params;
  const [payload, context] = await Promise.all([
    getPublicShopProfilePayload(shopId),
    getClientExperienceContext()
  ]);

  if (!payload) {
    notFound();
  }

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <PublicShopProfile payload={payload} viewerCanFavorite={context.isSignedInClient && context.viewer.role === "client"} />
    </ClientAppShell>
  );
}
