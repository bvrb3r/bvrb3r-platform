import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

export const dynamic = "force-dynamic";

export default async function ShopKioskPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <KioskParityScreen shopId={shopId} scope="shop" />;
}
