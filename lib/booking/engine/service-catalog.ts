import type { BookableServiceShape } from "@/lib/booking/engine/availability";

/**
 * The bookable service catalog.
 *
 * `public.services` is the canonical catalog and stays that way; this module is
 * the projection the booking engine reads, and it exists to enforce two rules
 * the rest of the engine then gets to assume.
 *
 * **Money is integer cents.** `services.price` is `numeric(10,2)` and
 * `price_cents` is generated from it in the database, so the two can never
 * disagree. Reading the generated column rather than re-multiplying in
 * JavaScript keeps floating point out of a value that ends up on a receipt: at
 * no point does a price pass through a float.
 *
 * **The catalog decides bookability, not the request.** Duration, buffer and
 * price are read from the row every time. A caller that sends a price, a
 * duration, or a claim that a service is bookable is ignored — those fields do
 * not exist on any engine input type, which is the strongest form the rule can
 * take.
 */

export type ServiceCatalogRow = {
  id: string;
  location_id?: string | null;
  name: string;
  category?: string | null;
  duration_min: number;
  buffer_min?: number | null;
  price?: number | string | null;
  price_cents?: number | string | null;
  currency?: string | null;
  active?: boolean | null;
  is_bookable?: boolean | null;
};

export const SERVICE_CATALOG_COLUMNS =
  "id, location_id, name, category, duration_min, buffer_min, price, price_cents, currency, active, is_bookable";

/**
 * Integer cents from a catalog row.
 *
 * The generated column is authoritative. The `price` fallback exists only for a
 * database that has not yet applied this PR's migration; it rounds once, at the
 * boundary, rather than letting a fractional cent travel any further.
 */
export function servicePriceCents(row: Pick<ServiceCatalogRow, "price_cents" | "price">): number {
  // `Number(null)` is 0, not NaN, so an absent generated column would otherwise
  // read as a free service on a database that has not applied this migration.
  if (row.price_cents !== null && row.price_cents !== undefined) {
    const generated = Number(row.price_cents);
    if (Number.isFinite(generated) && generated >= 0) {
      return Math.round(generated);
    }
  }

  const legacy = Number(row.price ?? 0);
  return Number.isFinite(legacy) && legacy > 0 ? Math.round(legacy * 100) : 0;
}

export function isBookableServiceRow(row: ServiceCatalogRow) {
  return Boolean(row.active) && row.is_bookable !== false && row.duration_min > 0;
}

export function toBookableService(row: ServiceCatalogRow): BookableServiceShape {
  return {
    id: row.id,
    name: row.name,
    durationMin: Math.max(0, Math.round(row.duration_min)),
    bufferMin: Math.max(0, Math.round(Number(row.buffer_min ?? 0))),
    priceCents: servicePriceCents(row),
    currency: (row.currency ?? "usd").toLowerCase(),
    active: Boolean(row.active),
    bookable: isBookableServiceRow(row)
  };
}

/**
 * What a booking record keeps.
 *
 * Written once at confirmation into `appointment_service_snapshots`, which has
 * no UPDATE grant and a trigger that refuses one. A price change next spring
 * cannot reach back and restate what a client agreed to last autumn — which is
 * the whole reason the snapshot exists rather than a join to the live catalog.
 */
export type ConfirmedServiceSnapshot = {
  serviceId: string;
  serviceName: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  currency: string;
};

export function toConfirmedServiceSnapshot(service: BookableServiceShape): ConfirmedServiceSnapshot {
  return {
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.durationMin,
    bufferMin: service.bufferMin,
    priceCents: service.priceCents,
    currency: service.currency
  };
}

/**
 * Formatting for display only. Never feed the result back into a calculation —
 * cents are the value, this is a rendering of it.
 */
export function formatServicePrice(priceCents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(Math.max(0, Math.round(priceCents)) / 100);
}
