import { redirect } from "next/navigation";
import { resolveKioskLocale, DEFAULT_KIOSK_LOCALE } from "@/lib/kiosk/locale";

export const dynamic = "force-dynamic";

/**
 * Legacy shop kiosk path. It only redirects — but it carries `?lang=` across so
 * a printed or bookmarked Spanish/Kreyòl kiosk link keeps its language.
 */
export default async function KioskPage({
  params,
  searchParams
}: {
  params: Promise<{ shopId: string }>;
  searchParams?: Promise<{ lang?: string | string[] }>;
}) {
  const { shopId } = await params;
  const { lang } = (await searchParams) ?? {};
  const locale = resolveKioskLocale(lang);
  const suffix = locale === DEFAULT_KIOSK_LOCALE ? "" : `?lang=${locale}`;

  redirect(`/kiosk/shop/${shopId}${suffix}`);
}
