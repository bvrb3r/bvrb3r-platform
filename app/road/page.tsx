import type { Metadata } from "next";
import { ProtectedSessionBoundary } from "@/components/auth/protected-session-boundary";
import { RoadScreen } from "@/components/road/road-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { loadRoadSnapshot } from "@/lib/road/service.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Road · BVRB3R",
  description: "Your server-verified path from sign-up to V3."
};

export default async function RoadPage() {
  const user = await getAuthorizedUser(["client_user", "barber_user", "shop_owner_user"]);
  const snapshot = await loadRoadSnapshot(user);

  return (
    <>
      <ProtectedSessionBoundary />
      <RoadScreen snapshot={snapshot} />
    </>
  );
}
