"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { regenerateAppIdentityCard, setAppIdentityCardPaused } from "@/lib/app-id/service.server";

const APP_ID_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;

export async function regenerateAppIdentityCardAction() {
  const user = await getAuthorizedUser([...APP_ID_ROLES]);
  await regenerateAppIdentityCard(user);
  revalidatePath("/id");
}

export async function setAppIdentityCardPausedAction(formData: FormData) {
  const user = await getAuthorizedUser([...APP_ID_ROLES]);
  await setAppIdentityCardPaused(user, formData.get("paused") === "true");
  revalidatePath("/id");
}
