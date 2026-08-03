import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { SYSTEM_ATLAS_MISSIONS, SYSTEM_ATLAS_RESULT_CODES } from "@/lib/atlas/system-atlas";

export const metadata: Metadata = {
  title: "System Atlas · BVRB3R",
  description: "The 21 audited BVRB3R mission chains, from every door to its governed exit."
};

const doctrine = [
  "Rent-only shop model — locked ✓",
  "Stripe-only money rail ✓",
  "4 exit families on all 21 ✓",
  "No UI impersonates another role ✓"
];

export default async function SystemAtlasPage() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    redirect("/login?next=%2Fatlas");
  }

  return (
    <main className="min-h-screen bg-[#060708] text-[#F5F1E8]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,rgba(196,242,78,0.06),transparent_62%)]" />

      <header className="relative z-10 flex flex-wrap items-center gap-3 px-5 py-5 sm:px-8">
        <span className="text-sm font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#C9A87C]">
          Universal App System Diagram Atlas · v1.0
        </span>
        <span className="ml-auto rounded-full border border-[#C4F24E]/35 bg-[#C4F24E]/[0.08] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#C4F24E]">
          Audited · 21 / 21 pass
        </span>
      </header>

      <section className="relative z-10 mx-auto max-w-[1240px] px-5 pb-2 pt-2 sm:px-8">
        <h1 className="max-w-4xl font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-normal leading-[1.02]">
          The system, in 21 mission chains.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">
          DOOR → INTENT → FLOW → ACTION → NODE / STATE / EVENT → RESULT → EXIT → LOOP. Every diagram terminates in the four governed exits and names its registry anchors.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {doctrine.map((item, index) => (
            <span
              key={item}
              className={`rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] ${index === 0 ? "border-[#C4F24E]/30 bg-[#C4F24E]/[0.06] text-[#C4F24E]" : "border-white/15 bg-white/[0.04] text-white/60"}`}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-7 sm:px-8 sm:pb-16">
        {SYSTEM_ATLAS_MISSIONS.map((mission, index) => (
          <article key={mission.number} className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
              <span className="font-mono text-xs font-bold" style={{ color: mission.color }}>{mission.number}</span>
              <h2 className="text-sm font-extrabold sm:text-base">{mission.title}</h2>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{mission.role}</span>
              <span className="ml-auto rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/[0.08] px-3 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#C4F24E]">
                Pass ✓
              </span>
            </div>
            <div className="relative aspect-[1.64] w-full bg-black">
              <Image
                src={mission.image}
                alt={`${mission.number}. ${mission.title}`}
                fill
                priority={index === 0}
                loading={index === 0 ? "eager" : "lazy"}
                sizes="(max-width: 1240px) 100vw, 1180px"
                className="object-contain"
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-2 border-t border-white/[0.07] px-4 py-3 sm:px-5">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">Built as</span>
              <p className="text-xs leading-6 text-white/65 sm:text-sm">{mission.builtAs}</p>
            </div>
          </article>
        ))}

        <footer className="border-t border-white/[0.08] pt-4 font-mono text-[10px] leading-7 text-white/40">
          Audit notes: result codes ({SYSTEM_ATLAS_RESULT_CODES.join("/")}) and exit families match the governed system. A diagram is required behavior, not proof of production; production truth stays with the Architect evidence rail.
        </footer>
      </section>
    </main>
  );
}
