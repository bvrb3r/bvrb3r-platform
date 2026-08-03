import type { Metadata, Route } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  KIOSK_DEVICE_COOKIE,
  parseKioskDeviceCookieValue
} from "@/lib/kiosk/device";
import { DEFAULT_KIOSK_LOCALE, resolveKioskLocale } from "@/lib/kiosk/locale";

export const metadata: Metadata = {
  title: "Kiosk Check-In | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default async function CanonicalKioskCheckInPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ lang?: string | string[] }>;
}) {
  const [{ lang }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const targetReference = parseKioskDeviceCookieValue(
    cookieStore.get(KIOSK_DEVICE_COOKIE)?.value
  );

  if (targetReference) {
    const locale = resolveKioskLocale(lang);
    const localeQuery = locale === DEFAULT_KIOSK_LOCALE ? "" : `&lang=${locale}`;
    redirect(`/kiosk/shop/${encodeURIComponent(targetReference)}?mode=check-in${localeQuery}` as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-5 py-12 text-white">
      <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[0.035] p-7 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#C4F24E]">
          Kiosk device setup required
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">
          Launch Kiosk Mode from an authorized shop account.
        </h1>
        <p className="mt-5 text-sm leading-7 text-white/58">
          This device has no active shop assignment. A Shop Owner must sign in,
          pair this device, and launch Kiosk Mode before guest check-in can begin.
        </p>
        <Link
          href="/login?redirect=%2Fshop%2Fkiosk"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#C4F24E] px-6 text-sm font-black text-black transition hover:bg-[#d4ff6b]"
        >
          Staff sign in
        </Link>
      </section>
    </main>
  );
}
