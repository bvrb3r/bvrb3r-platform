import { WaitingRoomTv } from "@/components/tv/waiting-room-tv";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { readWaitingRoomTvSnapshot } from "@/lib/tv/waiting-room-service";

export default async function WaitingRoomTvPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  return <WaitingRoomTv initialSnapshot={await readWaitingRoomTvSnapshot(user)} />;
}
