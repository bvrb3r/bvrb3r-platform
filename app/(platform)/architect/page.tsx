import { ArchitectDashboard } from "@/components/operations/architect-dashboard";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { getArchitectDashboardPayload } from "@/lib/platform-admin/accounts-service";
import type { ArchitectDashboardPayload } from "@/types/platform-admin";

function createEmptyDashboardPayload(actorName: string, warnings: string[] = []): ArchitectDashboardPayload {
  return {
    actorName,
    counts: {
      totalAccounts: 0,
      totalClients: 0,
      totalBarbers: 0,
      totalShopOwners: 0,
      totalPlatformAdmins: 0,
      pendingBarberApprovals: 0,
      pendingShopOwnerApprovals: 0,
      approvedBarbers: 0,
      approvedShops: 0,
      suspendedAccounts: 0,
      bannedAccounts: 0
    },
    recentSignups: [],
    recentApprovalActions: [],
    warnings
  };
}

export default async function ArchitectPage() {
  const user = await getPlatformAdminUser();
  let initialData = createEmptyDashboardPayload(user.name);

  try {
    const payload = await getArchitectDashboardPayload(user);
    if (!payload || typeof payload !== "object") {
      console.error("[Architect] dashboard page loader received an invalid payload", payload);
    } else {
      initialData = payload;
    }
  } catch (error) {
    console.error("[Architect] dashboard page loader failed", error);
    initialData = createEmptyDashboardPayload(user.name, ["Architect account data is partially unavailable. Live account views will show true empty states where reads failed."]);
  }

  return <ArchitectDashboard initialData={initialData} />;
}
