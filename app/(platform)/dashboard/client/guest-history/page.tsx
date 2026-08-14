import type { Metadata } from "next";
import { ProtectedSessionBoundary } from "@/components/auth/protected-session-boundary";
import { ClientBridgeGuestHistorySetup } from "@/components/clientbridge/clientbridge-guest-history-setup";
import { getAuthorizedUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resolve guest history · BVRB3R",
  description: "Securely resolve eligible guest visits against your verified client account."
};

export default async function ClientGuestHistoryPage() {
  await getAuthorizedUser(["client_user"]);

  return (
    <>
      <ProtectedSessionBoundary />
      <ClientBridgeGuestHistorySetup />
    </>
  );
}
