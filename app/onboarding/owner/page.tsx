import { ShopOwnerOnboardingWorkspace } from "@/components/onboarding/shop-owner-onboarding-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { cleanShopUsername, normalizeShopOwnerOnboardingStep } from "@/lib/onboarding/shop-owner-path";

export default async function ShopOwnerOnboardingPathPage({
  searchParams
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const params = await searchParams;
  const step = normalizeShopOwnerOnboardingStep(params.step);

  return (
    <ShopOwnerOnboardingWorkspace
      step={step}
      initialDraft={{
        authenticated: true,
        role: "shop_owner_user",
        ownerName: user.name,
        email: user.email,
        phone: user.phone ?? null,
        shopRecordId: user.ownedShopId ?? null,
        shopName: user.ownedShopName ?? "",
        shopDisplayName: user.ownedShopName ?? "",
        shopUsername: user.ownedShopName ? cleanShopUsername(user.ownedShopName) : "",
        usernameAvailable: false,
        verificationPosture: user.appApprovalStatus === "approved" ? "approved" : "pending"
      }}
    />
  );
}
