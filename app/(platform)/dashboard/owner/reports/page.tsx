import { OwnerReportPack } from "@/components/rent/owner-report-pack";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerReportsPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  return (
    <OwnerReportPack
      shopIds={[user.ownedShopId ?? "", ...user.locationIds]}
    />
  );
}
