import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";
import { isKioskFixtureTarget } from "@/lib/kiosk/local-fixture";
import { resolveKioskLocale } from "@/lib/kiosk/locale";

export const dynamic = "force-dynamic";

export default async function BarberKioskPage({
  params,
  searchParams
}: {
  params: Promise<{ barberId: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { barberId } = await params;
  const { lang } = await searchParams;

  return (
    <KioskParityScreen
      shopId={barberId}
      scope="barber"
      initialLocale={resolveKioskLocale(lang)}
      cardSimulationEnabled={isKioskFixtureTarget("barber", barberId)}
    />
  );
}
