import { BarberSetupChecklistWorkspace } from "@/components/trust/barber-setup-checklist-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getPr27BarberSetup } from "@/lib/trust/product-pr27-service";

export default async function BarberSetupChecklistPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  const snapshot = await getPr27BarberSetup(user);
  return <BarberSetupChecklistWorkspace initial={snapshot} />;
}
