import { AccountPrivacyWorkspace } from "@/components/trust/account-privacy-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getPr27PrivacySnapshot } from "@/lib/trust/product-pr27-service";

export default async function AccountPrivacyPage() {
  const user = await getAuthorizedUser([
    "client_user",
    "barber_user",
    "shop_owner_user",
    "platform_admin",
    "architect"
  ]);
  const snapshot = await getPr27PrivacySnapshot(user);
  return <AccountPrivacyWorkspace initial={snapshot} />;
}
