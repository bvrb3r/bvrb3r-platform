import { KioskModeScreen } from "@/components/kiosk/kiosk-mode-screen";

export const dynamic = "force-dynamic";

export default async function BarberKioskPage({ params }: { params: Promise<{ barberId: string }> }) {
  const { barberId } = await params;
  return <KioskModeScreen shopId={barberId} scope="barber" />;
}
