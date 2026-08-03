"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  calculateBusinessToolkit,
  DEFAULT_BUSINESS_TOOLKIT_STATE,
  type BusinessToolkitState,
  type BusinessToolkitTab
} from "@/lib/toolkit/business-toolkit";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const tabs: Array<{ id: BusinessToolkitTab; label: string }> = [
  { id: "income", label: "Income" },
  { id: "pricing", label: "Pricing" },
  { id: "booth_rent", label: "Booth rent" },
  { id: "autobooth", label: "AutoBooth" },
  { id: "utilization", label: "Utilization" },
  { id: "no_shows", label: "No-shows" }
];

type SliderSpec = {
  key: keyof BusinessToolkitState;
  label: string;
  min: number;
  max: number;
  step: number;
  valueLabel: (value: number) => string;
};

function sliderSpecs(tab: BusinessToolkitTab): SliderSpec[] {
  if (tab === "income") return [
    { key: "cuts", label: "Cuts per week", min: 5, max: 80, step: 1, valueLabel: (value) => `${value} cuts` },
    { key: "price", label: "Average service price", min: 15, max: 150, step: 5, valueLabel: (value) => money.format(value) },
    { key: "tipPercent", label: "Average tip", min: 0, max: 40, step: 5, valueLabel: (value) => `${value}%` }
  ];
  if (tab === "pricing") return [
    { key: "price", label: "Your price", min: 15, max: 150, step: 5, valueLabel: (value) => money.format(value) },
    { key: "cuts", label: "Cuts per week", min: 5, max: 80, step: 1, valueLabel: (value) => `${value} cuts` }
  ];
  if (tab === "booth_rent") return [
    { key: "weeklyRent", label: "Weekly booth rent", min: 100, max: 600, step: 10, valueLabel: (value) => money.format(value) },
    { key: "cuts", label: "Cuts per week", min: 5, max: 80, step: 1, valueLabel: (value) => `${value} cuts` },
    { key: "price", label: "Average price", min: 15, max: 150, step: 5, valueLabel: (value) => money.format(value) }
  ];
  if (tab === "autobooth") return [
    { key: "transaction", label: "This service transaction", min: 15, max: 200, step: 5, valueLabel: (value) => money.format(value) },
    { key: "autoBoothPercent", label: "AutoBooth rate", min: 5, max: 30, step: 1, valueLabel: (value) => `${value}%` },
    { key: "remainingRent", label: "Rent remaining this week", min: 0, max: 400, step: 10, valueLabel: (value) => money.format(value) }
  ];
  if (tab === "utilization") return [
    { key: "openHours", label: "Open hours this week", min: 10, max: 70, step: 1, valueLabel: (value) => `${value} hrs` },
    { key: "bookedHours", label: "Booked hours", min: 0, max: 70, step: 1, valueLabel: (value) => `${value} hrs` }
  ];
  return [
    { key: "noShows", label: "No-shows per week", min: 0, max: 10, step: 1, valueLabel: (value) => `${value} no-shows` },
    { key: "price", label: "Average price", min: 15, max: 150, step: 5, valueLabel: (value) => money.format(value) }
  ];
}

export function BusinessToolkitWorkspace() {
  const [tab, setTab] = useState<BusinessToolkitTab>("income");
  const [state, setState] = useState(DEFAULT_BUSINESS_TOOLKIT_STATE);
  const result = useMemo(() => calculateBusinessToolkit(state), [state]);

  const view = (() => {
    if (tab === "income") return {
      title: "Weekly gross service estimator",
      subtitle: "Cuts, price, and tips — what one week at the chair could look like.",
      output: "Estimated service sales + tips",
      big: money.format(result.estimatedWeeklyTake),
      detail: `${money.format(result.estimatedWeeklyTake * 52)} a year before platform and processing charges or booth rent`,
      rows: [
        [`Services (${state.cuts} × ${money.format(state.price)})`, money.format(result.serviceWeek)],
        ["Client-confirmed tips — 100% barber-owned", `+${money.format(result.estimatedTips)}`],
        ["BVRB3R platform fee", "5% of eligible transactions · excluded from this gross estimate"]
      ],
      cta: ["See your real numbers — Barber Earnings", "/dashboard/barber/earnings"],
      fine: "Gross estimate only. Real net payout subtracts the 5% BVRB3R platform fee and any separately disclosed processing charges; booth rent remains separate."
    };
    if (tab === "pricing") return {
      title: "Pricing sandbox",
      subtitle: "What one price change could do to a steady week.",
      output: "A $5 raise is worth",
      big: money.format(result.fiveDollarRaiseWeekly),
      detail: `more per week · ${money.format(result.fiveDollarRaiseWeekly * 52)} a year if the book holds`,
      rows: [
        [`This week at ${money.format(state.price)}`, money.format(result.serviceWeek)],
        [`At ${money.format(state.price + 5)}`, money.format(state.cuts * (state.price + 5))],
        [`At ${money.format(state.price + 10)}`, money.format(state.cuts * (state.price + 10))]
      ],
      cta: ["Set your real menu — Services Manager", "/dashboard/barber/services"],
      fine: "Your book decides; this tool only does the math. Real price changes apply to new bookings, never existing snapshots."
    };
    if (tab === "booth_rent") return {
      title: "Booth rent affordability",
      subtitle: "How much of a service week the fixed chair cost could consume.",
      output: "Rent is covered by",
      big: `${result.rentCuts} cuts`,
      detail: `${result.rentSharePercent}% of the service week goes to rent`,
      rows: [
        ["Week after rent", money.format(result.afterRent)],
        ["Planning marker", "rent ≤ 25% of the week"],
        ["This estimate", `${result.rentSharePercent}% · ${result.rentSharePercent > 25 ? "heavy" : "within marker"}`]
      ],
      cta: ["See real terms — Join a Shop", "/dashboard/barber/setup"],
      fine: "Every shop posts its own terms. BVRB3R rent is a flat agreement between the barber and owner."
    };
    if (tab === "autobooth") return {
      title: "AutoBooth estimator",
      subtitle: "contribution = min(transaction × rate, remaining_balance). Tips are excluded; contributions stop at zero.",
      output: "This service contributes",
      big: preciseMoney.format(result.autoBoothContribution),
      detail: `${money.format(result.rentAfterContribution)} rent left after this service`,
      rows: [
        [`${state.autoBoothPercent}% of ${money.format(state.transaction)}`, preciseMoney.format(state.transaction * state.autoBoothPercent / 100)],
        ["Capped at remaining", money.format(state.remainingRent)],
        ["Client-confirmed tip", "100% barber-owned · excluded from rent"]
      ],
      cta: ["Set it up for real — AutoBooth", "/pro/autobooth"],
      fine: "Once the balance reaches $0.00, contributions stop by structure. Every real contribution is itemized on the money screen."
    };
    if (tab === "utilization") return {
      title: "Chair utilization",
      subtitle: "Booked hours against open hours.",
      output: "Utilization",
      big: `${result.utilization}%`,
      detail: `${result.openHours} open hours remain in this estimate`,
      rows: [
        ["Planning range", "75–90% keeps walk-in room"],
        ["Under 60%", "consider kiosk + walk-ins"],
        ["Over 95%", "review demand and pricing"]
      ],
      cta: ["Fill the gaps — Availability & Walk-Ins", "/dashboard/barber/availability"],
      fine: "The real utilization number lives in barber operations and comes from the actual calendar."
    };
    return {
      title: "No-show cost",
      subtitle: "What missed appointments could cost before policy recovery.",
      output: "Estimated missed revenue",
      big: `${money.format(result.noShowWeeklyCost * 52)}/yr`,
      detail: `${money.format(result.noShowWeeklyCost)} a week`,
      rows: [
        ["Reminders + confirmation", "built into appointment delivery"],
        ["No-show fee", "only under the posted accepted policy"],
        ["Automatic waitlist refill", "V3 · honestly gated"]
      ],
      cta: ["Set your real policy — Services Manager", "/dashboard/barber/services"],
      fine: "Fees follow the barber's posted policy, shown before booking and enforced only through the real payment rail."
    };
  })();

  return (
    <main className="min-h-screen bg-[#060708] text-[#F5F1E8]">
      <header className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-5 py-5 sm:px-8">
        <span className="text-sm font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#C9A87C]">Business toolkit · run the numbers before the chair</span>
        <span className="ml-auto rounded-full border border-[#D9B461]/35 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#D9B461]">Estimate · real numbers live in the app</span>
      </header>

      <nav className="mx-auto flex max-w-[1080px] flex-wrap gap-2 px-5 sm:px-8" aria-label="Business toolkit calculators">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={`min-h-11 rounded-full border px-4 font-mono text-[10px] uppercase tracking-[0.12em] ${tab === item.id ? "border-[#C4F24E]/50 bg-[#C4F24E]/8 text-[#C4F24E]" : "border-white/14 text-white/50"}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <section className="mx-auto grid max-w-[1080px] gap-5 px-5 py-6 sm:px-8 lg:grid-cols-2">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#C9A87C]">{view.title}</p>
          <p className="mt-2 text-sm leading-6 text-white/50">{view.subtitle}</p>
          <div className="mt-6 space-y-5">
            {sliderSpecs(tab).map((slider) => (
              <label key={slider.key} className="block">
                <span className="flex items-baseline gap-3 text-sm font-semibold">
                  <span className="flex-1">{slider.label}</span>
                  <span className="font-mono text-[#E4F9B8]">{slider.valueLabel(state[slider.key])}</span>
                </span>
                <input type="range" className="mt-2 w-full accent-[#C4F24E]" min={slider.min} max={slider.max} step={slider.step} value={state[slider.key]} onChange={(event) => setState((current) => ({ ...current, [slider.key]: Number(event.currentTarget.value) }))} />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[22px] border border-[#C4F24E]/30 bg-[#C4F24E]/[0.04] p-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#C9A87C]">{view.output}</p>
            <p className="mt-2 font-serif text-5xl text-[#C4F24E]">{view.big}</p>
            <p className="mt-2 font-mono text-[11px] text-white/55">{view.detail}</p>
          </div>
          <dl className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.02] p-5">
            {view.rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-3 text-sm">
                <dt className="flex-1 text-white/62">{label}</dt>
                <dd className="text-right font-mono text-xs text-[#E4F9B8]">{value}</dd>
              </div>
            ))}
          </dl>
          <Link href={view.cta[1] as Route} className="flex min-h-[50px] items-center justify-center rounded-full bg-[#C4F24E] px-5 text-center text-sm font-extrabold text-black">{view.cta[0]}</Link>
          <p className="font-mono text-[9px] leading-6 text-white/35">{view.fine}</p>
        </div>
      </section>
    </main>
  );
}
