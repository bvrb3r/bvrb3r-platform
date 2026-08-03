import type { Metadata } from "next";
import { GroupBookingWorkspace } from "@/components/group-booking/group-booking-workspace";

export const metadata: Metadata = {
  title: "Group Walk-In | BVRB3R Kiosk",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default async function ShopKioskGroupPage({
  params
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return (
    <GroupBookingWorkspace
      initialView="kiosk"
      kioskShopId={shopId}
      kioskOnly
    />
  );
}
