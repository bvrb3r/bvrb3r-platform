export type BusinessToolkitTab = "income" | "pricing" | "booth_rent" | "autobooth" | "utilization" | "no_shows";

export type BusinessToolkitState = {
  cuts: number;
  price: number;
  tipPercent: number;
  weeklyRent: number;
  transaction: number;
  autoBoothPercent: number;
  remainingRent: number;
  openHours: number;
  bookedHours: number;
  noShows: number;
};

export const DEFAULT_BUSINESS_TOOLKIT_STATE: BusinessToolkitState = {
  cuts: 30,
  price: 40,
  tipPercent: 20,
  weeklyRent: 260,
  transaction: 45,
  autoBoothPercent: 15,
  remainingRent: 180,
  openHours: 40,
  bookedHours: 28,
  noShows: 3
};

export function autoBoothEstimate(transaction: number, ratePercent: number, remainingBalance: number) {
  const eligibleTransaction = Math.max(0, transaction);
  const rate = Math.max(0, ratePercent) / 100;
  const remaining = Math.max(0, remainingBalance);
  return Math.min(eligibleTransaction * rate, remaining);
}

export function calculateBusinessToolkit(state: BusinessToolkitState) {
  const serviceWeek = Math.max(0, state.cuts) * Math.max(0, state.price);
  const estimatedTips = serviceWeek * Math.max(0, state.tipPercent) / 100;
  const autoBoothContribution = autoBoothEstimate(
    state.transaction,
    state.autoBoothPercent,
    state.remainingRent
  );
  const utilization = Math.min(
    100,
    Math.round(Math.max(0, state.bookedHours) / Math.max(1, state.openHours) * 100)
  );

  return {
    serviceWeek,
    estimatedTips,
    estimatedWeeklyTake: serviceWeek + estimatedTips,
    fiveDollarRaiseWeekly: Math.max(0, state.cuts) * 5,
    rentCuts: Math.ceil(Math.max(0, state.weeklyRent) / Math.max(1, state.price)),
    rentSharePercent: serviceWeek ? Math.round(Math.max(0, state.weeklyRent) / serviceWeek * 100) : 0,
    afterRent: serviceWeek - Math.max(0, state.weeklyRent),
    autoBoothContribution,
    rentAfterContribution: Math.max(0, state.remainingRent - autoBoothContribution),
    utilization,
    openHours: Math.max(0, state.openHours - state.bookedHours),
    noShowWeeklyCost: Math.max(0, state.noShows) * Math.max(0, state.price)
  };
}
