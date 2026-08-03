import { CultureSafetyWorkspace } from "@/components/trust/culture-safety-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getPr27CultureSafetySnapshot } from "@/lib/trust/product-pr27-service";

export default async function CultureSafetyPage({
  searchParams
}: {
  searchParams: Promise<{
    targetProfileId?: string;
    postId?: string;
    handle?: string;
  }>;
}) {
  const [user, params] = await Promise.all([
    getAuthorizedUser([
      "client_user",
      "barber_user",
      "shop_owner_user",
      "platform_admin",
      "architect"
    ]),
    searchParams
  ]);
  const snapshot = await getPr27CultureSafetySnapshot(user);
  return (
    <CultureSafetyWorkspace
      initial={snapshot}
      initialTargetProfileId={params.targetProfileId}
      initialPostId={params.postId}
      initialTargetHandle={params.handle}
      canModerate={user.role === "platform_admin" || user.role === "architect"}
    />
  );
}
