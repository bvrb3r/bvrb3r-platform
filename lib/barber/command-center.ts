import type {
  BookingSourceProvider,
  PaymentOwner
} from "@/lib/clientbridge/domain";

export type ExternalCalendarProvider = Exclude<BookingSourceProvider, "bvrb3r">;
export type ExternalCalendarStatus =
  | "booked"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "canceled"
  | "no_show";

export function isBvrb3rFinancialAppointment(input: {
  sourceProvider: BookingSourceProvider | null | undefined;
  paymentOwner: PaymentOwner | string | null | undefined;
  externalFinancialDataPrivate: boolean | null | undefined;
}) {
  return input.sourceProvider === "bvrb3r"
    && !input.paymentOwner?.startsWith("external:")
    && input.externalFinancialDataPrivate === false;
}

export function resolveExternalCalendarProvider(input: {
  sourceProvider: BookingSourceProvider | null | undefined;
  paymentOwner: PaymentOwner | string | null | undefined;
}): ExternalCalendarProvider | null {
  if (input.sourceProvider && input.sourceProvider !== "bvrb3r") {
    return input.sourceProvider;
  }

  if (input.paymentOwner?.startsWith("external:")) {
    const provider = input.paymentOwner.slice("external:".length);
    return provider === "booksy" || provider === "square" || provider === "thecut"
      ? provider
      : null;
  }

  return null;
}

export function normalizeExternalCalendarStatus(status: string): ExternalCalendarStatus {
  if (status === "cancelled" || status === "canceled") {
    return "canceled";
  }

  if (
    status === "confirmed"
    || status === "checked_in"
    || status === "completed"
    || status === "no_show"
  ) {
    return status;
  }

  return "booked";
}
