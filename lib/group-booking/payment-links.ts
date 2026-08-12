import "server-only";

import type Stripe from "stripe";
import { hasTwilioDeliveryConfig, runtimeConfig } from "@/lib/config/runtime";
import { toNotificationDeliveryRecord } from "@/lib/engagement/delivery";
import { executeNotificationAttempt } from "@/lib/engagement/live-delivery";
import {
  buildGroupPaymentLink,
  deriveGroupPaymentLinkToken,
  GROUP_SPLIT_PAYMENT_PURPOSE,
  groupSplitPaymentProviderBlockers,
  verifyGroupPaymentLinkToken,
  type GroupSplitPaymentProviderBlocker
} from "@/lib/group-booking/payment-link-domain";
import { createPaymentLedgerEntry } from "@/lib/payments/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeConnectClient } from "@/lib/stripe/connect";
import type { EngagementNotificationRecord } from "@/types/engagement";
import type { NotificationDeliveryAttemptRecord } from "@/types/mobile";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type GroupRow = {
  id: string;
  organizer_name: string;
  payment_mode: "organizer" | "split";
  status: string;
};

type MemberRow = {
  id: string;
  group_id: string;
  full_name: string;
  email: string;
  phone: string;
  is_minor: boolean;
  appointment_id: string | null;
  client_id: string | null;
  status: string;
};

type ResponsibilityRow = {
  id: string;
  group_id: string;
  member_id: string;
  payer_kind: "organizer" | "member";
  payer_email: string;
  amount_cents: number;
  currency: string;
  status: "planned" | "link_queued" | "ready_at_checkout" | "paid" | "cancelled" | "needs_review";
  stripe_payment_intent_id: string | null;
};

type AppointmentRow = {
  id: string;
  client_id: string;
  barber_id: string;
  shop_id: string | null;
  location_id: string;
  service_id: string | null;
  status: string;
};

export type GroupSplitPaymentDelivery = {
  state: "not_required" | "gated" | "delivered" | "partial";
  requiredCount: number;
  deliveredCount: number;
  provider: "stripe_twilio" | "unavailable";
  chargedAtBooking: false;
  blockers: Array<{ code: string; message: string }>;
  message: string;
};

export type GroupSplitPaymentLinkView = {
  groupId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  currency: string;
  appointmentId: string;
  clientSecret: string | null;
  publishableKey: string | null;
  paymentStatus: Stripe.PaymentIntent.Status;
  alreadyPaid: boolean;
};

export class GroupSplitPaymentError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "group_split_payment_failed"
  ) {
    super(message);
    this.name = "GroupSplitPaymentError";
  }
}

function requireSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new GroupSplitPaymentError(
      "Split-payment truth is unavailable because the database cannot be reached.",
      503,
      "group_split_database_unavailable"
    );
  }
  return supabase;
}

function currentProviderConfig() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    linkSecret: process.env.GROUP_PAYMENT_LINK_SECRET ?? "",
    paymentsProvider: process.env.PAYMENTS_PROVIDER ?? runtimeConfig.paymentProvider,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    twilioReady: hasTwilioDeliveryConfig()
  };
}

export function readGroupSplitPaymentProviderReadiness() {
  const blockers = groupSplitPaymentProviderBlockers(currentProviderConfig());
  return {
    available: blockers.length === 0,
    blockers
  };
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(cents / 100);
}

function providerGate(blockers: Array<{ code: string; message: string }>, requiredCount: number): GroupSplitPaymentDelivery {
  return {
    state: "gated",
    requiredCount,
    deliveredCount: 0,
    provider: "unavailable",
    chargedAtBooking: false,
    blockers,
    message: "The appointments are confirmed, but split-payment texts are unavailable. No card was charged and no placeholder link was created."
  };
}

function activePaymentStatus(status: string) {
  return ["pending", "authorized", "captured", "partially_refunded"].includes(status);
}

async function loadGroupPaymentRows(supabase: SupabaseAdmin, groupId: string) {
  const [groupResult, membersResult, responsibilitiesResult] = await Promise.all([
    supabase.from("group_bookings")
      .select("id, organizer_name, payment_mode, status")
      .eq("id", groupId)
      .maybeSingle(),
    supabase.from("group_booking_members")
      .select("id, group_id, full_name, email, phone, is_minor, appointment_id, client_id, status")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
    supabase.from("group_booking_payment_intents")
      .select("id, group_id, member_id, payer_kind, payer_email, amount_cents, currency, status, stripe_payment_intent_id")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
  ]);

  if (groupResult.error || membersResult.error || responsibilitiesResult.error) {
    throw new GroupSplitPaymentError("The confirmed group payment plan could not be verified.", 503, "group_split_plan_unavailable");
  }
  if (!groupResult.data) {
    throw new GroupSplitPaymentError("Group booking not found.", 404, "group_booking_not_found");
  }
  return {
    group: groupResult.data as GroupRow,
    members: (membersResult.data ?? []) as MemberRow[],
    responsibilities: (responsibilitiesResult.data ?? []) as ResponsibilityRow[]
  };
}

async function loadAppointments(supabase: SupabaseAdmin, members: MemberRow[]) {
  const appointmentIds = members.map((member) => member.appointment_id).filter(Boolean) as string[];
  if (!appointmentIds.length) return new Map<string, AppointmentRow>();
  const result = await supabase.from("appointments")
    .select("id, client_id, barber_id, shop_id, location_id, service_id, status")
    .in("id", appointmentIds);
  if (result.error) {
    throw new GroupSplitPaymentError("The appointments behind this payment plan could not be verified.", 503, "group_split_appointments_unavailable");
  }
  return new Map(((result.data ?? []) as AppointmentRow[]).map((appointment) => [appointment.id, appointment]));
}

async function sendGroupPaymentText(input: {
  group: GroupRow;
  member: MemberRow;
  responsibility: ResponsibilityRow;
  appointment: AppointmentRow;
  paymentUrl: string;
}) {
  const now = new Date().toISOString();
  const notification: EngagementNotificationRecord = {
    id: `group-split-${input.responsibility.id}`,
    userEmail: input.responsibility.payer_email,
    role: "client_user",
    clientId: input.appointment.client_id,
    barberId: input.appointment.barber_id,
    locationId: input.appointment.location_id,
    channel: "sms",
    type: "booking_alert",
    title: `BVRB3R payment link for ${input.member.full_name}`,
    body: `${formatMoney(input.responsibility.amount_cents, input.responsibility.currency)} is assigned to this one appointment in ${input.group.organizer_name}'s group. No charge was created when the group was booked. Use the secure Stripe link only when you are ready to pay.`,
    status: "queued",
    createdAt: now
  };
  const delivery = toNotificationDeliveryRecord(notification);
  delivery.destination = input.member.phone;
  delivery.metadata.webUrl = input.paymentUrl;
  const attempt: NotificationDeliveryAttemptRecord = {
    id: `attempt-${delivery.id}-1`,
    deliveryId: delivery.id,
    notificationId: notification.id,
    channel: "sms",
    provider: delivery.provider,
    status: "queued",
    userEmail: input.responsibility.payer_email,
    destination: input.member.phone,
    attemptNumber: 1,
    deepLinkUrl: input.paymentUrl,
    metadata: {
      groupId: input.group.id,
      memberId: input.member.id,
      appointmentId: input.appointment.id,
      operational: true
    },
    createdAt: now,
    updatedAt: now
  };
  return executeNotificationAttempt({ notification, delivery, attempt });
}

async function ensurePendingPaymentLedger(input: {
  supabase: SupabaseAdmin;
  group: GroupRow;
  member: MemberRow;
  responsibility: ResponsibilityRow;
  appointment: AppointmentRow;
  paymentIntent: Stripe.PaymentIntent;
}) {
  const existing = await input.supabase.from("payments")
    .select("id, provider_payment_intent_id, payment_status")
    .eq("appointment_id", input.appointment.id)
    .order("created_at", { ascending: false });
  if (existing.error) {
    throw new GroupSplitPaymentError("Existing appointment payment truth could not be checked.", 503, "group_split_payment_check_failed");
  }
  const active = (existing.data ?? []).find((payment) => activePaymentStatus(String(payment.payment_status)));
  if (active) {
    if (active.provider_payment_intent_id === input.paymentIntent.id) return;
    throw new GroupSplitPaymentError(
      "This appointment already has an active payment. A second split-payment link was not created.",
      409,
      "group_split_duplicate_payment"
    );
  }

  await createPaymentLedgerEntry(input.supabase, {
    appointmentId: input.appointment.id,
    clientId: input.appointment.client_id,
    shopId: input.appointment.shop_id,
    barberId: input.appointment.barber_id,
    provider: "stripe",
    providerPaymentIntentId: input.paymentIntent.id,
    amount: input.responsibility.amount_cents / 100,
    currency: input.responsibility.currency,
    paymentStatus: "pending",
    paymentType: "booking",
    legacyStatus: "pending",
    metadata: {
      source: GROUP_SPLIT_PAYMENT_PURPOSE,
      groupId: input.group.id,
      groupMemberId: input.member.id,
      groupPaymentIntentId: input.responsibility.id,
      serviceId: input.appointment.service_id
    }
  });
}

async function ensureStripePaymentIntent(input: {
  group: GroupRow;
  member: MemberRow;
  responsibility: ResponsibilityRow;
  appointment: AppointmentRow;
}) {
  const stripe = getStripeConnectClient();
  if (input.responsibility.stripe_payment_intent_id) {
    return stripe.paymentIntents.retrieve(input.responsibility.stripe_payment_intent_id);
  }
  return stripe.paymentIntents.create({
    amount: input.responsibility.amount_cents,
    currency: input.responsibility.currency.toLowerCase(),
    receipt_email: input.responsibility.payer_email,
    automatic_payment_methods: { enabled: true },
    description: `BVRB3R group booking · ${input.member.full_name}`,
    metadata: {
      purpose: GROUP_SPLIT_PAYMENT_PURPOSE,
      groupId: input.group.id,
      groupMemberId: input.member.id,
      groupPaymentIntentId: input.responsibility.id,
      appointmentId: input.appointment.id,
      clientId: input.appointment.client_id,
      barberId: input.appointment.barber_id,
      locationId: input.appointment.location_id,
      serviceId: input.appointment.service_id ?? ""
    }
  }, { idempotencyKey: `pr36-group-split:${input.group.id}:${input.responsibility.id}` });
}

function assertStripeBinding(input: {
  paymentIntent: Stripe.PaymentIntent;
  group: GroupRow;
  member: MemberRow;
  responsibility: ResponsibilityRow;
  appointment: AppointmentRow;
  requirePayable?: boolean;
}) {
  if (
    input.paymentIntent.amount !== input.responsibility.amount_cents
    || input.paymentIntent.currency !== input.responsibility.currency.toLowerCase()
    || input.paymentIntent.metadata.purpose !== GROUP_SPLIT_PAYMENT_PURPOSE
    || input.paymentIntent.metadata.groupId !== input.group.id
    || input.paymentIntent.metadata.groupMemberId !== input.member.id
    || input.paymentIntent.metadata.groupPaymentIntentId !== input.responsibility.id
    || input.paymentIntent.metadata.appointmentId !== input.appointment.id
    || input.paymentIntent.metadata.clientId !== input.appointment.client_id
    || input.paymentIntent.metadata.barberId !== input.appointment.barber_id
    || input.paymentIntent.metadata.locationId !== input.appointment.location_id
    || input.paymentIntent.metadata.serviceId !== (input.appointment.service_id ?? "")
  ) {
    throw new GroupSplitPaymentError(
      "Stripe returned a payment session that does not match this exact group member, amount, and appointment.",
      409,
      "group_split_stripe_binding_mismatch"
    );
  }
  if (!input.paymentIntent.client_secret) {
    throw new GroupSplitPaymentError("Stripe did not return usable payment fields for this appointment.", 503, "group_split_client_secret_missing");
  }
  if (input.requirePayable && !["requires_payment_method", "requires_confirmation", "requires_action"].includes(input.paymentIntent.status)) {
    throw new GroupSplitPaymentError(
      "Stripe does not report this payment session as payable. It was not texted and requires review.",
      409,
      "group_split_stripe_state_not_payable"
    );
  }
}

export async function provisionGroupSplitPaymentLinks(input: {
  groupId: string;
  smsConsent: boolean;
}): Promise<GroupSplitPaymentDelivery> {
  const supabase = requireSupabase();
  const { group, members, responsibilities } = await loadGroupPaymentRows(supabase, input.groupId);
  if (group.payment_mode !== "split") {
    return {
      state: "not_required",
      requiredCount: 0,
      deliveredCount: 0,
      provider: "unavailable",
      chargedAtBooking: false,
      blockers: [],
      message: "The organizer chose one checkout payer. No split-payment links were created and no card was charged at booking."
    };
  }
  if (group.status !== "confirmed") {
    return providerGate([{ code: "group_not_confirmed", message: "Every appointment must be confirmed before a payment link can be created." }], responsibilities.length);
  }
  if (!input.smsConsent) {
    return providerGate([{ code: "split_sms_consent_missing", message: "The organizer did not consent to transactional split-payment texts." }], responsibilities.length);
  }
  if (!responsibilities.length) {
    return providerGate([{ code: "group_split_plan_missing", message: "No server-owned payment responsibilities exist for this confirmed group." }], 0);
  }
  const config = currentProviderConfig();
  const configBlockers: GroupSplitPaymentProviderBlocker[] = groupSplitPaymentProviderBlockers(config);
  if (configBlockers.length) return providerGate(configBlockers, responsibilities.length);

  const appointments = await loadAppointments(supabase, members);
  const membersById = new Map(members.map((member) => [member.id, member]));
  let deliveredCount = 0;
  const blockers: Array<{ code: string; message: string }> = [];

  for (const responsibility of responsibilities) {
    if (responsibility.status === "paid" || responsibility.status === "cancelled") continue;
    if (responsibility.status === "link_queued" && responsibility.stripe_payment_intent_id) {
      deliveredCount += 1;
      continue;
    }
    const member = membersById.get(responsibility.member_id);
    const appointment = member?.appointment_id ? appointments.get(member.appointment_id) : null;
    if (!member || !appointment || member.status !== "confirmed" || ["cancelled", "refunded"].includes(appointment.status)) {
      blockers.push({ code: "group_split_member_not_payable", message: "One group member does not have a confirmed, payable appointment." });
      continue;
    }

    try {
      const paymentIntent = await ensureStripePaymentIntent({ group, member, responsibility, appointment });
      assertStripeBinding({ paymentIntent, group, member, responsibility, appointment, requirePayable: true });
      await ensurePendingPaymentLedger({ supabase, group, member, responsibility, appointment, paymentIntent });
      const bound = await supabase.from("group_booking_payment_intents").update({
        stripe_payment_intent_id: paymentIntent.id,
        status: "ready_at_checkout",
        updated_at: new Date().toISOString()
      }).eq("id", responsibility.id)
        .eq("group_id", group.id)
        .eq("member_id", member.id)
        .in("status", ["planned", "ready_at_checkout", "needs_review"])
        .select("id")
        .maybeSingle();
      if (bound.error || !bound.data) {
        throw new GroupSplitPaymentError("The Stripe session could not be bound to this group member.", 503, "group_split_binding_write_failed");
      }

      const token = deriveGroupPaymentLinkToken({
        groupId: group.id,
        memberId: member.id,
        paymentIntentId: paymentIntent.id,
        payerEmail: responsibility.payer_email,
        secret: config.linkSecret
      });
      const paymentUrl = buildGroupPaymentLink({
        appUrl: config.appUrl,
        groupId: group.id,
        memberId: member.id,
        token
      });
      const delivery = await sendGroupPaymentText({ group, member, responsibility, appointment, paymentUrl });
      if (delivery.status !== "delivered") {
        throw new GroupSplitPaymentError(
          delivery.errorMessage ?? "Twilio did not verify delivery of this payment link.",
          503,
          delivery.provider === "twilio_placeholder" ? "group_split_twilio_gated" : "group_split_sms_failed"
        );
      }
      const queued = await supabase.from("group_booking_payment_intents").update({
        status: "link_queued",
        updated_at: delivery.executedAt ?? new Date().toISOString()
      }).eq("id", responsibility.id)
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .eq("status", "ready_at_checkout")
        .select("id")
        .maybeSingle();
      if (queued.error || !queued.data) {
        throw new GroupSplitPaymentError("The delivered payment link could not be recorded for review.", 503, "group_split_delivery_write_failed");
      }
      deliveredCount += 1;
    } catch (error) {
      const failure = error instanceof GroupSplitPaymentError
        ? error
        : new GroupSplitPaymentError(
            error instanceof Error ? error.message : "The split-payment link could not be created.",
            503,
            "group_split_provider_failed"
          );
      blockers.push({ code: failure.code, message: failure.message });
      await supabase.from("group_booking_payment_intents").update({
        status: "needs_review",
        updated_at: new Date().toISOString()
      }).eq("id", responsibility.id)
        .in("status", ["planned", "ready_at_checkout", "needs_review"]);
    }
  }

  const state = deliveredCount === responsibilities.length ? "delivered" : deliveredCount > 0 ? "partial" : "gated";
  return {
    state,
    requiredCount: responsibilities.length,
    deliveredCount,
    provider: deliveredCount > 0 ? "stripe_twilio" : "unavailable",
    chargedAtBooking: false,
    blockers,
    message: state === "delivered"
      ? `${deliveredCount} secure Stripe payment link${deliveredCount === 1 ? " was" : "s were"} texted. No card was charged when the appointments were booked.`
      : "The appointments are confirmed, but one or more split-payment texts need review. No card was charged by group booking."
  };
}

export async function readGroupSplitPaymentLink(input: {
  groupId: string;
  memberId: string;
  token: string;
}): Promise<GroupSplitPaymentLinkView> {
  const config = currentProviderConfig();
  const blockers = groupSplitPaymentProviderBlockers(config).filter((blocker) => blocker.code !== "twilio_missing");
  if (blockers.length) {
    throw new GroupSplitPaymentError(blockers[0].message, 503, blockers[0].code);
  }
  const supabase = requireSupabase();
  const { group, members, responsibilities } = await loadGroupPaymentRows(supabase, input.groupId);
  const member = members.find((entry) => entry.id === input.memberId);
  const responsibility = responsibilities.find((entry) => entry.member_id === input.memberId);
  if (!member || !responsibility?.stripe_payment_intent_id || !member.appointment_id) {
    throw new GroupSplitPaymentError("This payment link is not available.", 404, "group_split_link_not_found");
  }
  if (!verifyGroupPaymentLinkToken({
    token: input.token,
    groupId: group.id,
    memberId: member.id,
    paymentIntentId: responsibility.stripe_payment_intent_id,
    payerEmail: responsibility.payer_email,
    secret: config.linkSecret
  })) {
    throw new GroupSplitPaymentError("This payment link is invalid.", 404, "group_split_link_invalid");
  }
  if (group.status === "cancelled" || member.status === "cancelled" || responsibility.status === "cancelled") {
    throw new GroupSplitPaymentError("This appointment is no longer payable.", 409, "group_split_link_cancelled");
  }

  const appointments = await loadAppointments(supabase, [member]);
  const appointment = appointments.get(member.appointment_id);
  if (!appointment || ["cancelled", "refunded"].includes(appointment.status)) {
    throw new GroupSplitPaymentError("This appointment is no longer payable.", 409, "group_split_link_cancelled");
  }
  const paymentIntent = await getStripeConnectClient().paymentIntents.retrieve(responsibility.stripe_payment_intent_id);
  assertStripeBinding({ paymentIntent, group, member, responsibility, appointment });
  const alreadyPaid = paymentIntent.status === "succeeded";
  const payable = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(paymentIntent.status);
  if (alreadyPaid && responsibility.status !== "paid") {
    await supabase.from("group_booking_payment_intents").update({
      status: "paid",
      updated_at: new Date().toISOString()
    }).eq("id", responsibility.id)
      .eq("stripe_payment_intent_id", paymentIntent.id);
  }
  return {
    groupId: group.id,
    memberId: member.id,
    memberName: member.full_name,
    amountCents: responsibility.amount_cents,
    currency: responsibility.currency,
    appointmentId: appointment.id,
    clientSecret: payable ? paymentIntent.client_secret : null,
    publishableKey: payable ? config.stripePublishableKey : null,
    paymentStatus: paymentIntent.status,
    alreadyPaid
  };
}
