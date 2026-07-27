import { redirect } from "next/navigation";
import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(`/kiosk/shop/${shopId}`);
  return <KioskParityScreen shopId={shopId} scope="shop" />;
}
