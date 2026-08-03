import { RentOperationsWorkspace } from "@/components/rent/rent-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerRentPage({
  searchParams
}: {
  searchParams?: Promise<{ screen?: string | string[]; barberId?: string | string[] }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user", "owner"]);
  const params = searchParams ? await searchParams : {};
  const rawScreen = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const rawBarberId = Array.isArray(params.barberId) ? params.barberId[0] : params.barberId;
  const initialScreen = rawScreen === "statement" || rawScreen === "autobooth" ? rawScreen : "lifecycle";

  return (
    <div className="min-h-screen bg-[#060708] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <RentOperationsWorkspace
          viewer="owner"
          shopIds={[user.ownedShopId ?? "", ...user.locationIds]}
          initialScreen={initialScreen}
          preferredBarberId={rawBarberId ?? null}
        />
      </div>
    </div>
  );
}
