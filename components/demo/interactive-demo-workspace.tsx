"use client";

import Link from "next/link";
import { useState } from "react";
import { INTERACTIVE_DEMOS, type DemoRole } from "@/lib/demo/pr36-interactive-demo";

export function InteractiveDemoWorkspace({ initialRole }: { initialRole: DemoRole }) {
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [stepIndex, setStepIndex] = useState(0);
  const demo = INTERACTIVE_DEMOS[role];
  const step = demo.steps[stepIndex] ?? demo.steps[0];

  function chooseRole(nextRole: DemoRole) {
    setRole(nextRole);
    setStepIndex(0);
  }

  return (
    <main className="min-h-screen bg-[#060708] px-4 py-10 text-[#F5F1E8] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#C4F24E]">Interactive product demo</p>
            <h1 className="mt-3 font-serif text-4xl sm:text-6xl" data-display="true">{demo.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
              {demo.subtitle} Every number is sample data, nothing is saved, and no account, card, text, or payment is requested.
            </p>
          </div>
          <Link href="/" className="text-sm font-semibold text-white/60 transition hover:text-white">Exit demo</Link>
        </header>

        <div className="mt-7 flex flex-wrap gap-2" aria-label="Demo role">
          {(["barber", "owner"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={role === candidate}
              onClick={() => chooseRole(candidate)}
              className={`min-h-11 rounded-full px-5 text-sm font-bold transition ${role === candidate ? "bg-[#C4F24E] text-[#060708]" : "border border-white/15 text-white/55 hover:border-white/30 hover:text-white"}`}
            >
              {candidate === "barber" ? "For barbers" : "For shop owners"}
            </button>
          ))}
        </div>

        <nav className="mt-7 grid gap-2 sm:grid-cols-4" aria-label="Demo steps">
          {demo.steps.map((candidate, index) => (
            <button
              key={candidate.label}
              type="button"
              aria-current={stepIndex === index ? "step" : undefined}
              onClick={() => setStepIndex(index)}
              className={`min-h-16 rounded-2xl border px-4 text-left transition ${stepIndex === index ? "border-[#C4F24E]/50 bg-[#C4F24E]/[0.08] text-[#C4F24E]" : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"}`}
            >
              <span className="font-mono text-[9px] tracking-[0.2em]">{String(index + 1).padStart(2, "0")}</span>
              <span className="mt-1 block text-sm font-semibold">{candidate.label}</span>
            </button>
          ))}
        </nav>

        <section className="relative mt-7 overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(196,242,78,0.09),transparent_38%),linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.98))] p-6 sm:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex rotate-[-14deg] items-center justify-center whitespace-nowrap font-mono text-4xl tracking-[0.25em] text-white/[0.045] sm:text-7xl">DEMO DATA</div>
          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#C9A87C]">Step {String(stepIndex + 1).padStart(2, "0")} · {step.label}</p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl" data-display="true">{step.title}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/58">{step.body}</p>

            <div className="mt-9 grid gap-3 md:grid-cols-3">
              {step.metrics.map((metric) => (
                <article key={metric.label} className={`rounded-3xl border p-5 ${metric.highlighted ? "border-[#C4F24E]/30 bg-[#C4F24E]/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
                  <p className={`font-mono text-[9px] uppercase tracking-[0.2em] ${metric.highlighted ? "text-[#C9A87C]" : "text-white/40"}`}>{metric.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${metric.highlighted ? "text-[#C4F24E]" : "text-white"}`}>{metric.value}</p>
                  <p className="mt-2 text-xs leading-5 text-white/45">{metric.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 border-t border-white/10 pt-7 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setStepIndex((stepIndex + 1) % demo.steps.length)}
                className="min-h-12 rounded-full bg-[#C4F24E] px-7 text-sm font-extrabold text-[#060708]"
              >
                {stepIndex === demo.steps.length - 1 ? "Run it again" : "Next step →"}
              </button>
              <span className="font-mono text-[10px] text-white/40">{stepIndex + 1} of {demo.steps.length}</span>
              <Link href={demo.signupHref} className="sm:ml-auto min-h-12 rounded-full border border-white/15 px-7 py-3 text-center text-sm font-bold text-white transition hover:border-[#C4F24E]/50 hover:text-[#C4F24E]">
                Make it real — sign up
              </Link>
            </div>
          </div>
        </section>

        <p className="mt-5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">Demo state is local to this page and is discarded when you leave.</p>
      </div>
    </main>
  );
}
