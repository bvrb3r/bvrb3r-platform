import { RentOperationsWorkspace } from "@/components/rent/rent-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerRentPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "owner"]);

  return (
    <div className="min-h-screen bg-[#060708] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <RentOperationsWorkspace
          viewer="owner"
          shopIds={[user.ownedShopId ?? "", ...user.locationIds]}
        />
      </div>
    </div>
  );
}
