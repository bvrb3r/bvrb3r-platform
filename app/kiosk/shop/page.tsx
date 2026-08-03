import type { Metadata, Route } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KIOSK_DEVICE_COOKIE, parseKioskDeviceCookieValue } from "@/lib/kiosk/device";

export const metadata: Metadata = {
  title: "Shop Kiosk | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default async function ShopKioskEntryPage() {
  const cookieStore = await cookies();
  const targetReference = parseKioskDeviceCookieValue(cookieStore.get(KIOSK_DEVICE_COOKIE)?.value);
  if (targetReference) {
    redirect(`/kiosk/shop/${encodeURIComponent(targetReference)}` as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-5 py-12 text-white">
      <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[0.035] p-7 sm:p-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#C4F24E]">Shop kiosk · setup required</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">This device is not paired to a shop.</h1>
        <p className="mt-5 text-sm leading-7 text-white/58">A Shop Owner must pair and launch this device before guest access can begin.</p>
        <Link href="/login?redirect=%2Fshop%2Fkiosk" className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-black text-black">Staff sign in</Link>
      </section>
    </main>
  );
}
