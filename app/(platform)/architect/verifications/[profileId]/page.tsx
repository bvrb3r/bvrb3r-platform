import { ArchitectVerificationDetailWorkspace } from "@/components/operations/architect-verification-detail-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { createEmptyArchitectVerificationDetailPayload, getVerificationProfileDetail } from "@/lib/platform-admin/verification-service";

export default async function ArchitectVerificationDetailPage({
  params
}: {
  params: Promise<{ profileId: string }>;
}) {
  const user = await getPlatformAdminUser();
  const { profileId } = await params;
  let initialData = createEmptyArchitectVerificationDetailPayload();

  try {
    initialData = await getVerificationProfileDetail(user, profileId);
  } catch (error) {
    console.error("[Architect Verification] detail page loader failed", error);
    initialData = createEmptyArchitectVerificationDetailPayload(["Verification review data is partially unavailable. Core architect access is still active."]);
  }

  return <ArchitectVerificationDetailWorkspace profileId={profileId} initialData={initialData} />;
}
