import {
  buildBookingTransactionBreakdownFromContext,
  readAppointmentFinancialContext,
  type AppointmentFinancialContext
} from "@/lib/fintech/breakdown";
import type { BookingReceiptView } from "@/types/fintech";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function buildPaymentMethodLabel(context: AppointmentFinancialContext) {
  if (context.paymentSummary?.defaultPaymentMethod?.label) {
    return context.paymentSummary.defaultPaymentMethod.label;
  }

  const latest = context.paymentSummary?.latestBookingPayment;
  if (latest?.provider) {
    return `${latest.provider.toUpperCase()} booking payment`;
  }

  return "Payment method on file";
}

export function buildBookingReceiptFromContext(context: AppointmentFinancialContext): BookingReceiptView {
  const gross = roundCurrency(Number(context.appointment.subtotal ?? context.appointment.totalAmount ?? 0));
  const discounts = roundCurrency(Number(context.appointment.discountTotal ?? 0));
  const tax = roundCurrency(Number(context.appointment.taxTotal ?? 0));
  const tip = roundCurrency(Number(context.appointment.tipAmount ?? 0));
  const total = roundCurrency(Number(context.appointment.grandTotal ?? context.appointment.totalAmount ?? 0));
  const breakdown = buildBookingTransactionBreakdownFromContext(context);
  const pointsUsed = Math.abs(
    context.pointsTransactions
      .filter((transaction) => transaction.pointsDelta < 0 && transaction.sourceType === "booking_redemption")
      .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
  );
  const pointsEarned = context.pointsTransactions
    .filter((transaction) => transaction.pointsDelta > 0)
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);

  const lines = [
    { label: "Service subtotal", kind: "service" as const, amount: gross },
    ...(discounts > 0 ? [{ label: "Discounts", kind: "discount" as const, amount: -discounts }] : []),
    ...(tax > 0 ? [{ label: "Tax", kind: "tax" as const, amount: tax }] : []),
    ...(tip > 0 ? [{ label: "Tip", kind: "tip" as const, amount: tip }] : []),
    ...(pointsUsed > 0 ? [{ label: "BVR Points applied", kind: "points" as const, amount: -roundCurrency(pointsUsed * 0.1) }] : []),
    ...(breakdown.platformFee > 0 ? [{ label: "Platform fee", kind: "platform_fee" as const, amount: breakdown.platformFee }] : []),
    ...(breakdown.barberEarnings > 0 ? [{ label: "Barber earnings", kind: "barber_earnings" as const, amount: breakdown.barberEarnings }] : []),
    ...(breakdown.shopEarnings > 0 ? [{ label: "Shop earnings", kind: "shop_earnings" as const, amount: breakdown.shopEarnings }] : [])
  ];

  return {
    appointmentId: context.appointment.id,
    issuedAt: context.paymentSummary?.latestBookingPayment?.paidAt
      ?? context.paymentRows.find((row) => row.payment_type === "booking")?.paid_at
      ?? context.appointment.updatedAt,
    clientName: context.clientName,
    barberName: context.barberName,
    shopLabel: context.shopLabel,
    paymentMethodLabel: buildPaymentMethodLabel(context),
    pointsUsed,
    pointsEarned,
    lines,
    totals: {
      gross,
      discounts,
      tax,
      tip,
      total
    }
  };
}

export async function readBookingReceipt(appointmentId: string) {
  const context = await readAppointmentFinancialContext(appointmentId);
  if (!context) {
    return null;
  }

  return buildBookingReceiptFromContext(context);
}
