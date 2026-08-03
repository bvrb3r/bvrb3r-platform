import OwnerSettingsPage from "@/app/(platform)/dashboard/owner/settings/page";

export default async function CanonicalOwnerPoliciesPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  return OwnerSettingsPage({
    searchParams: Promise.resolve({ ...params, section: params.section ?? "policies" })
  });
}
