import { WaitingRoomTv } from "@/components/tv/waiting-room-tv";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { readWaitingRoomTvSnapshot, WaitingRoomTvError } from "@/lib/tv/waiting-room-service";

export default async function WaitingRoomTvPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ shopId?: string | string[] }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const rawShopId = (await searchParams).shopId;
  const shopId = Array.isArray(rawShopId) ? rawShopId[0] : rawShopId;

  try {
    return <WaitingRoomTv initialSnapshot={await readWaitingRoomTvSnapshot(user, shopId)} />;
  } catch (error) {
    if (error instanceof WaitingRoomTvError && error.code === "tv_shop_required") {
      return <WaitingRoomTv initialSnapshot={{
        shopId: "setup-required",
        shopName: "Shop selection required",
        generatedAt: new Date().toISOString(),
        team: [],
        menu: [],
        status: "setup"
      }} />;
    }
    throw error;
  }
}
