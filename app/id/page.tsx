import type { Metadata } from "next";
import { ProtectedSessionBoundary } from "@/components/auth/protected-session-boundary";
import { AppIdentityScanScreen, AppIdentityScreen } from "@/components/app-id/app-identity-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { loadAppIdentitySnapshot, resolveAppIdentityScan } from "@/lib/app-id/service.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "App ID · BVRB3R",
  description: "Your signed, privacy-safe BVRB3R App ID.",
  robots: { index: false, follow: false, nocache: true }
};

export default async function AppIdentityPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ scan?: string | string[] }>;
}) {
  const { scan } = await searchParams;
  const token = Array.isArray(scan) ? scan[0] : scan;
  if (token) {
    return <AppIdentityScanScreen resolution={await resolveAppIdentityScan(token)} />;
  }

  const user = await getAuthorizedUser(["client_user", "barber_user", "shop_owner_user"]);
  const snapshot = await loadAppIdentitySnapshot(user);
  return (
    <>
      <ProtectedSessionBoundary />
      <AppIdentityScreen snapshot={snapshot} />
    </>
  );
}
