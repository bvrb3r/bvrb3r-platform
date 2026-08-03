import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerOverviewPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return <OwnerOperationsWorkspace shopIds={[user.ownedShopId ?? "", ...user.locationIds]} />;
}
