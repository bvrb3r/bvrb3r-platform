import { ArchitectAccountDetailWorkspace } from "@/components/operations/architect-account-detail-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { getArchitectAccountDetailPayload } from "@/lib/platform-admin/accounts-service";
import type { ArchitectAccountDetailPayload } from "@/types/platform-admin";

export default async function ArchitectAccountDetailPage({
  params
}: {
  params: Promise<{ profileId: string }>;
}) {
  const user = await getPlatformAdminUser();
  const { profileId } = await params;
  let initialData: ArchitectAccountDetailPayload = {
    account: null,
    warnings: []
  };

  try {
    initialData = await getArchitectAccountDetailPayload(user, profileId);
  } catch (error) {
    console.error("[Architect Accounts] detail page loader failed", error);
    initialData = {
      account: null,
      warnings: ["Architect account detail is partially unavailable. Live account views will show true empty states where reads failed."]
    };
  }

  return <ArchitectAccountDetailWorkspace profileId={profileId} initialData={initialData} />;
}
