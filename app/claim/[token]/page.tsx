import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientBridgeClaimScreen } from "@/components/clientbridge/clientbridge-claim-screen";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getClientBridgeClaim } from "@/lib/clientbridge/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim Your Visit | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export default async function ClientBridgeClaimPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [claim, session] = await Promise.all([
    getClientBridgeClaim(token),
    getCurrentUserFromServer()
  ]);
  if (!claim) notFound();
  return (
    <ClientBridgeClaimScreen
      token={token}
      claim={claim}
      authenticated={session.authenticated && session.user.id !== "guest-user"}
    />
  );
}

