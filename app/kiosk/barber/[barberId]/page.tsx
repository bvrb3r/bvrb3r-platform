import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";

export const dynamic = "force-dynamic";

export default async function BarberKioskPage({ params }: { params: Promise<{ barberId: string }> }) {
  const { barberId } = await params;
  return <KioskParityScreen shopId={barberId} scope="barber" />;
}
