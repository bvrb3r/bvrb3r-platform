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
  const isFixture = isKioskFixtureTarget("barber", barberId);

  return (
    <KioskParityScreen
      shopId={barberId}
      scope="barber"
      initialLocale={resolveKioskLocale(lang)}
      cardSimulationEnabled={isFixture}
      loyaltyReward={isFixture ? { visitNumber: 10, serviceDiscountCents: 2_000 } : null}
    />
  );
}
