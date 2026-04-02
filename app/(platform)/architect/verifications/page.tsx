import { ArchitectVerificationQueueWorkspace } from "@/components/operations/architect-verification-queue-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { createEmptyArchitectVerificationQueuePayload, listVerificationProfilesForArchitect } from "@/lib/platform-admin/verification-service";
import type { ArchitectVerificationQueueFilters } from "@/types/platform-admin";

export default async function ArchitectVerificationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getPlatformAdminUser();
  const resolved = searchParams ? await searchParams : undefined;
  const initialFilters: ArchitectVerificationQueueFilters = {
    search: typeof resolved?.search === "string" ? resolved.search : undefined,
    role: typeof resolved?.role === "string" ? resolved.role as ArchitectVerificationQueueFilters["role"] : "all",
    overallStatus: typeof resolved?.overallStatus === "string" ? resolved.overallStatus as ArchitectVerificationQueueFilters["overallStatus"] : "all",
    identityStatus: typeof resolved?.identityStatus === "string" ? resolved.identityStatus as ArchitectVerificationQueueFilters["identityStatus"] : "all",
    licenseStatus: typeof resolved?.licenseStatus === "string" ? resolved.licenseStatus as ArchitectVerificationQueueFilters["licenseStatus"] : "all",
    businessStatus: typeof resolved?.businessStatus === "string" ? resolved.businessStatus as ArchitectVerificationQueueFilters["businessStatus"] : "all",
    payoutStatus: typeof resolved?.payoutStatus === "string" ? resolved.payoutStatus as ArchitectVerificationQueueFilters["payoutStatus"] : "all",
    complianceStatus: typeof resolved?.complianceStatus === "string" ? resolved.complianceStatus as ArchitectVerificationQueueFilters["complianceStatus"] : "all",
    submittedOnly: resolved?.submittedOnly === "true"
  };

  let initialData = createEmptyArchitectVerificationQueuePayload();

  try {
    initialData = await listVerificationProfilesForArchitect(user, initialFilters);
  } catch (error) {
    console.error("[Architect Verification] queue page loader failed", error);
    initialData = createEmptyArchitectVerificationQueuePayload(["Verification review data is partially unavailable. Core architect access is still active."]);
  }

  return <ArchitectVerificationQueueWorkspace initialData={initialData} initialFilters={initialFilters} />;
}
