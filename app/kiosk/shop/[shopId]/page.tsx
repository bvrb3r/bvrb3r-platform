import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";
import { isKioskFixtureTarget } from "@/lib/kiosk/local-fixture";
import { resolveKioskLocale } from "@/lib/kiosk/locale";

export const dynamic = "force-dynamic";

export default async function ShopKioskPage({
  params,
  searchParams
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { shopId } = await params;
  const { lang } = await searchParams;

  // Resolved on the server so a `?lang=es` kiosk boots straight into Spanish
  // with no English flash and no hydration mismatch.
  //
  // The card-reader simulation is decided here too, on the server, and only
  // ever for the seeded local fixture — a real shop kiosk cannot turn it on,
  // and `isKioskFixtureTarget` is hard-false when NODE_ENV is production.
  return (
    <KioskParityScreen
      shopId={shopId}
      scope="shop"
      initialLocale={resolveKioskLocale(lang)}
      cardSimulationEnabled={isKioskFixtureTarget("shop", shopId)}
    />
  );
}
