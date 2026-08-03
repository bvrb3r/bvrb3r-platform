import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Barber Kiosk | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export default function BarberKioskEntryPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-5 py-12 text-white">
      <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[0.035] p-7 sm:p-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#C4F24E]">Barber kiosk · setup required</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">Launch Kiosk Mode from the Barber account.</h1>
        <p className="mt-5 text-sm leading-7 text-white/58">Direct launch is blocked until an authorized Barber creates a server-bound device session.</p>
        <Link href="/login?redirect=%2Fpro%2Fkiosk" className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-black text-black">Barber sign in</Link>
      </section>
    </main>
  );
}
