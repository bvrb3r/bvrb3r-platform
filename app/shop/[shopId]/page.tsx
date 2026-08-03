import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { PublicShopProfile } from "@/components/marketplace/public-shop-profile";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { getPublicShopProfilePayload } from "@/lib/booking/platform-service";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readSymmetricBlockedProfileIds } from "@/lib/trust/product-pr31-blocks";

export default async function PublicShopProfilePage({ params }: { params: Promise<{ shopId: string }>; }) {
  const { shopId } = await params;
  const [payload, context] = await Promise.all([
    getPublicShopProfilePayload(shopId),
    getClientExperienceContext()
  ]);

  if (!payload) {
    notFound();
  }
  let visiblePayload = payload;
  if (context.viewer.id !== "guest-user" && isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    if (!supabase) throw new Error("Unable to verify public shop access.");
    const [shopResult, blockedProfileIds] = await Promise.all([
      supabase.from("shops").select("owner_profile_id").eq("id", payload.shop.id).maybeSingle(),
      readSymmetricBlockedProfileIds(supabase, context.viewer.id)
    ]);
    if (shopResult.error) throw new Error("Unable to verify public shop access.");
    if (shopResult.data?.owner_profile_id && blockedProfileIds.has(shopResult.data.owner_profile_id)) notFound();
    visiblePayload = {
      ...payload,
      barbers: payload.barbers.filter((barber) => !blockedProfileIds.has(barber.barber.userId))
    };
  }

  return (
    <ClientAppShell activeTab="search" mode={context.isGuest ? "guest" : "client"}>
      <PublicShopProfile payload={visiblePayload} viewerCanFavorite={context.isSignedInClient} />
    </ClientAppShell>
  );
}
