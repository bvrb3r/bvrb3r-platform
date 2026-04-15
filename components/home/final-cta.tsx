import Link from "next/link";

export function FinalCta() {
  return (
    <section className="page-shell pb-16 sm:pb-20" aria-labelledby="home-final-cta-title">
      <div className="rounded-[34px] border border-white/8 bg-[linear-gradient(135deg,rgba(16,18,15,0.94),rgba(5,6,5,0.96))] px-5 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:px-8 sm:py-10">
        <h2 id="home-final-cta-title" className="text-balance text-4xl font-semibold text-white sm:text-5xl" data-display="true">
          Barbershop-first. System-driven.
        </h2>
        <Link
          href="/login"
          className="mt-7 inline-flex min-h-[54px] items-center justify-center rounded-full bg-[#7cff00] px-7 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_18px_40px_rgba(124,255,0,0.26)] transition hover:bg-[#b7ff58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Enter the Platform
        </Link>
      </div>
    </section>
  );
}
