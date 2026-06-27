import type { OnboardingReadinessResult, ReadinessKey } from "@/lib/onboarding/types";

const DEFAULT_SECTION_ORDER: ReadinessKey[] = [
  "publicGuest",
  "browse",
  "account",
  "booking",
  "culture",
  "barberBusiness",
  "payout",
  "shop",
  "kiosk"
];

export function OnboardingReadinessSummary({
  result,
  title = "Readiness",
  sectionOrder = DEFAULT_SECTION_ORDER
}: {
  result: OnboardingReadinessResult;
  title?: string;
  sectionOrder?: ReadinessKey[];
}) {
  const visibleSections = sectionOrder.map((key) => result.readiness[key]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-black/30 p-5 text-white shadow-[0_20px_80px_rgba(0,0,0,0.32)]" data-testid="onboarding-readiness-summary">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7CFF00]">{title}</p>
          <h2 className="mt-2 text-2xl font-semibold">{result.currentHighestReadinessLabel}</h2>
          <p className="mt-2 text-sm text-white/60">{result.progressPercent}% complete based on connected readiness proof.</p>
        </div>
        <div className="rounded-2xl border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-4 py-3 text-sm text-[#d7ffab]">
          {result.canEnterDashboard ? "Dashboard available" : "Setup needed before dashboard"}
        </div>
      </div>

      <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Next best action</p>
        <h3 className="mt-2 text-lg font-semibold">{result.nextBestAction.label}</h3>
        <p className="mt-2 text-sm leading-6 text-white/62">{result.nextBestAction.description}</p>
        <a className="mt-4 inline-flex rounded-full border border-[#7CFF00]/30 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#d7ffab]" href={result.nextBestAction.href}>
          Continue
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <article key={section.key} className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{section.label}</h3>
                <p className="mt-1 text-xs text-white/45">{section.proofConnected ? "Proof connected" : "Proof not connected yet"}</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/78">{section.statusLabel}</span>
            </div>
            {section.missingRequirements.length ? (
              <ul className="mt-4 space-y-2 text-sm leading-6 text-white/64">
                {section.missingRequirements.slice(0, 3).map((requirement) => (
                  <li key={requirement.id}>- {requirement.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-white/56">No missing requirements for this readiness state.</p>
            )}
            {section.missingRequirements.length > 3 ? (
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/40">{section.missingRequirements.length - 3} more requirement(s)</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
