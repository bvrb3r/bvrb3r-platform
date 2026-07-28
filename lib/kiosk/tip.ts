/**
 * Kiosk tip math.
 *
 * Kept as pure functions outside the screen so the arithmetic can be tested
 * directly — a tip is real money owed to a barber, and "close enough" rounding
 * in a component is how a client gets charged a cent they never agreed to.
 *
 * Everything is integer cents. The approved prototype works in whole dollars
 * (`Math.round(subtotal * pct / 100)`); cents are the same rule at a finer
 * grain and survive services priced at $32.50.
 */

/** The four tiles the approved prototype offers, in order. */
export const KIOSK_TIP_PERCENTS = [0, 15, 20, 25] as const;

/** The tile that renders pre-highlighted. */
export const KIOSK_DEFAULT_TIP_PERCENT = 20;

export type KioskTipPercent = (typeof KIOSK_TIP_PERCENTS)[number];

/**
 * Rounds half away from zero, matching `Math.round` for the positive amounts a
 * kiosk deals with while staying explicit about the rule.
 */
export function calculateKioskTipCents(subtotalCents: number, percent: number) {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) {
    return 0;
  }
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }

  return Math.round((subtotalCents * percent) / 100);
}

export function calculateKioskTotalCents(subtotalCents: number, percent: number) {
  const base = Number.isFinite(subtotalCents) && subtotalCents > 0 ? Math.round(subtotalCents) : 0;
  return base + calculateKioskTipCents(base, percent);
}

/**
 * `$40` for whole dollars, `$32.50` otherwise — the prototype never shows
 * trailing `.00`, and a kiosk price with pointless decimals reads as a bug.
 */
export function formatKioskMoney(cents: number | null | undefined) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return "";
  }

  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const absolute = Math.abs(rounded);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const body = remainder === 0 ? `$${dollars}` : `$${dollars}.${String(remainder).padStart(2, "0")}`;

  return negative ? `-${body}` : body;
}

export interface KioskTipOption {
  percent: number;
  tipCents: number;
  totalCents: number;
  /** `—` for the no-tip tile, `15%` otherwise, exactly as the prototype does. */
  percentLabel: string;
  recommended: boolean;
}

export function buildKioskTipOptions(subtotalCents: number): KioskTipOption[] {
  return KIOSK_TIP_PERCENTS.map((percent) => ({
    percent,
    tipCents: calculateKioskTipCents(subtotalCents, percent),
    totalCents: calculateKioskTotalCents(subtotalCents, percent),
    percentLabel: percent === 0 ? "—" : `${percent}%`,
    recommended: percent === KIOSK_DEFAULT_TIP_PERCENT
  }));
}

/** The cheapest service on a list — drives the "From $X" front-door chip. */
export function minimumServicePriceCents(services: Array<{ priceCents?: number | null }>) {
  const priced = services
    .map((service) => service.priceCents)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return priced.length ? Math.min(...priced) : null;
}
