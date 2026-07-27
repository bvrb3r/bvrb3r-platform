import { KioskParityScreen } from "@/components/kiosk/kiosk-parity-screen";
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
  return <KioskParityScreen shopId={shopId} scope="shop" initialLocale={resolveKioskLocale(lang)} />;
}
