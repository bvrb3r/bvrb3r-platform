"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { shareRoadBadgeToCulture, updateRoadLeaderboardPrivacy } from "@/lib/road/service.server";

const ROAD_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;

export async function updateRoadLeaderboardPrivacyAction(formData: FormData) {
  const user = await getAuthorizedUser([...ROAD_ROLES]);
  await updateRoadLeaderboardPrivacy(user, {
    visible: formData.get("leaderboardVisible") === "on",
    pushesEnabled: formData.get("leaderboardPushes") === "on"
  });
  revalidatePath("/road");
}

export async function shareRoadBadgeToCultureAction(formData: FormData) {
  const user = await getAuthorizedUser([...ROAD_ROLES]);
  const badgeId = formData.get("badgeId");
  const caption = formData.get("caption");
  if (typeof badgeId !== "string" || typeof caption !== "string") {
    throw new Error("Badge share details are incomplete.");
  }
  await shareRoadBadgeToCulture(user, { badgeId, caption });
  revalidatePath("/road");
}
