import { KioskModeScreen } from "@/components/kiosk/kiosk-mode-screen";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <KioskModeScreen shopId={shopId} />;
}
