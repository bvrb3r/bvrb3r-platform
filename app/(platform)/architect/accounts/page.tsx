import { ArchitectAccountDirectoryWorkspace } from "@/components/operations/architect-account-directory-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { getArchitectAccountDirectoryPayload, normalizeArchitectAccountDirectoryFilters } from "@/lib/platform-admin/accounts-service";
import type { ArchitectAccountDirectoryFilters, ArchitectAccountDirectoryPayload } from "@/types/platform-admin";

function createEmptyDirectoryPayload(filters: ArchitectAccountDirectoryFilters, warnings: string[] = []): ArchitectAccountDirectoryPayload {
  return {
    accounts: [],
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
    filters: {
      ...filters,
      onboarding: filters.onboarding ?? "all"
    },
    warnings
  };
}

export default async function ArchitectAccountsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getPlatformAdminUser();
  const resolved = searchParams ? await searchParams : undefined;
  const initialFilters: ArchitectAccountDirectoryFilters = normalizeArchitectAccountDirectoryFilters({
    search: typeof resolved?.search === "string" ? resolved.search : "",
    role: typeof resolved?.role === "string" ? resolved.role as ArchitectAccountDirectoryFilters["role"] : "all",
    status: typeof resolved?.status === "string" ? resolved.status as ArchitectAccountDirectoryFilters["status"] : "all",
    onboarding: typeof resolved?.onboarding === "string" ? resolved.onboarding as ArchitectAccountDirectoryFilters["onboarding"] : "all"
  });
  let initialData = createEmptyDirectoryPayload(initialFilters);

  try {
    initialData = await getArchitectAccountDirectoryPayload(user, initialFilters);
  } catch (error) {
    console.error("[Architect Accounts] directory page loader failed", error);
    initialData = createEmptyDirectoryPayload(initialFilters, ["Architect account directory failed to read live account truth. This is not a true zero-account state."]);
  }

  return <ArchitectAccountDirectoryWorkspace initialData={initialData} initialFilters={initialFilters} />;
}
