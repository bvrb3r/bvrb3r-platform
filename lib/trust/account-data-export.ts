import { createHash, randomBytes } from "node:crypto";
import { currentLegalVersions } from "@/lib/legal/documents";
import { hasEmailDeliveryConfig, runtimeConfig } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ExportRow = Record<string, unknown>;

type ExportUnavailableRow = ExportRow & {
  unavailable: true;
  table: string;
  code: string;
};

const APPOINTMENT_EXPORT_COLUMNS = [
  "id",
  "client_id",
  "barber_id",
  "shop_id",
  "location_id",
  "service_id",
  "status",
  "starts_at",
  "ends_at",
  "scheduled_start_at",
  "scheduled_end_at",
  "cancelled_at",
  "cancellation_reason",
  "created_at",
  "updated_at"
].join(", ");

const PAYMENT_EXPORT_COLUMNS = [
  "id",
  "appointment_id",
  "pos_sale_id",
  "client_id",
  "shop_id",
  "barber_id",
  "amount",
  "currency",
  "payment_status",
  "payment_type",
  "paid_at",
  "created_at"
].join(", ");

function queryFailure(table: string, error: { code?: string | null } | null): ExportUnavailableRow[] {
  return [{ unavailable: true, table, code: error?.code ?? "query_failed" }];
}

async function safeSelect(
  supabase: AdminClient,
  table: string,
  column: string,
  value: string | null | undefined,
  select = "*"
): Promise<ExportRow[]> {
  if (!value) return [];
  const result = await supabase.from(table).select(select).eq(column, value);
  return result.error ? queryFailure(table, result.error) : (result.data ?? []) as unknown as ExportRow[];
}

async function safeSelectMany(
  supabase: AdminClient,
  table: string,
  column: string,
  values: string[],
  select = "*"
): Promise<ExportRow[]> {
  if (!values.length) return [];
  const result = await supabase.from(table).select(select).in(column, values);
  return result.error ? queryFailure(table, result.error) : (result.data ?? []) as unknown as ExportRow[];
}

function stringIds(rows: ExportRow[], key: string) {
  return rows
    .map((row) => typeof row[key] === "string" ? row[key] as string : null)
    .filter((value): value is string => Boolean(value));
}

function dedupeRows(rows: ExportRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = typeof row.id === "string" ? `id:${row.id}` : JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function buildPr31AccountExportBundle(
  supabase: AdminClient,
  profileId: string,
  generatedAt = new Date().toISOString()
) {
  const [profiles, clients, barbers, shops, posts, comments, media, legalAcceptances, privacyPreferences, dataRightsRequests, threadParticipants, prelaunchWaitlist, organizedGroupBookings, giftPurchases, claimedGiftCards, giftLedgerDirect, giftApplicationsDirect, giftReversalsDirect, giftRedemptionRequests] = await Promise.all([
    safeSelect(supabase, "profiles", "id", profileId, "id, role, full_name, email, phone, profile_photo_path, profile_photo_url, public_username, public_bio, public_city, public_state, created_at, updated_at"),
    safeSelect(supabase, "clients", "profile_id", profileId),
    safeSelect(supabase, "barbers", "profile_id", profileId),
    safeSelect(supabase, "shops", "owner_profile_id", profileId),
    safeSelect(supabase, "culture_posts", "author_profile_id", profileId, "id, author_role, barber_id, shop_id, client_id, appointment_id, service_id, post_type, caption, visibility, moderation_status, publishing_status, is_bookable, allow_comments, metadata, created_at, updated_at, deleted_at"),
    safeSelect(supabase, "culture_comments", "actor_profile_id", profileId, "id, post_id, body, moderation_status, created_at, updated_at, deleted_at"),
    safeSelect(supabase, "media_assets", "owner_profile_id", profileId, "id, asset_type, storage_path, image_url, caption, featured, created_at, updated_at"),
    safeSelect(supabase, "compliance_acceptances", "user_id", profileId, "document_key, document_version, accepted_at"),
    safeSelect(supabase, "privacy_preferences", "profile_id", profileId),
    safeSelect(supabase, "data_rights_requests", "profile_id", profileId, "id, request_type, status, requested_at, acknowledged_at, completed_at, blocked_reason"),
    safeSelect(supabase, "thread_participants", "profile_id", profileId, "thread_id, participant_role, joined_at"),
    safeSelect(supabase, "shop_prelaunch_waitlist", "profile_id", profileId, "id, shop_id, profile_id, email, phone, position, status, opening_notification_consent, joined_at, notified_at, converted_at, withdrawn_at, contact_anonymized_at"),
    safeSelect(supabase, "group_bookings", "organizer_profile_id", profileId, "id, organizer_profile_id, organizer_name, organizer_email, organizer_phone, location_id, payment_mode, member_count, total_service_cents, currency, status, starts_at, ends_at, holds_expire_at, confirmed_at, created_at, updated_at"),
    safeSelect(supabase, "gift_card_purchase_attempts", "buyer_profile_id", profileId, "id, buyer_profile_id, amount_cents, currency, scope_type, scope_barber_id, scope_shop_id, scope_label, sender_name, recipient_name, recipient_email, recipient_phone, delivery_channel, message, stripe_payment_intent_id, stripe_verified_at, gift_card_id, status, created_at, updated_at"),
    safeSelect(supabase, "gift_cards", "claimed_by_profile_id", profileId, "id, purchase_id, initial_balance_cents, balance_cents, currency, scope_type, scope_barber_id, scope_shop_id, claimed_by_profile_id, purchased_at, claimed_at, status, updated_at"),
    safeSelect(supabase, "gift_card_ledger", "profile_id", profileId, "id, gift_card_id, profile_id, appointment_id, entry_type, amount_cents, balance_after_cents, created_at"),
    safeSelect(supabase, "gift_card_applications", "profile_id", profileId, "id, gift_card_id, appointment_id, profile_id, amount_cents, service_only, tip_applied_cents, created_at"),
    safeSelect(supabase, "gift_card_application_reversals", "profile_id", profileId, "id, application_id, gift_card_id, appointment_id, profile_id, amount_cents, reason, balance_after_cents, created_at"),
    safeSelect(supabase, "gift_card_redemption_requests", "profile_id", profileId, "id, profile_id, appointment_id, created_at")
  ]);

  const clientIds = stringIds(clients, "id");
  const barberIds = stringIds(barbers, "id");
  const shopIds = stringIds(shops, "id");
  const [clientAppointments, barberAppointments, shopAppointments, clientPayments, barberPayments, shopPayments, reviewsAsClient, reviewsAsBarber, ownGroupMembers, ownedPrelaunchConfigs] = await Promise.all([
    safeSelectMany(supabase, "appointments", "client_id", clientIds, APPOINTMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "appointments", "barber_id", barberIds, APPOINTMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "appointments", "shop_id", shopIds, APPOINTMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "payments", "client_id", clientIds, PAYMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "payments", "barber_id", barberIds, PAYMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "payments", "shop_id", shopIds, PAYMENT_EXPORT_COLUMNS),
    safeSelectMany(supabase, "reviews", "client_id", clientIds, "id, appointment_id, barber_id, client_id, location_id, rating, message, created_at"),
    safeSelectMany(supabase, "reviews", "barber_id", barberIds, "id, appointment_id, barber_id, client_id, location_id, rating, message, created_at"),
    safeSelectMany(supabase, "group_booking_members", "client_id", clientIds, "id, group_id, member_key, full_name, email, phone, is_minor, is_organizer, client_id, appointment_id, price_cents, currency, status, created_at, updated_at"),
    safeSelectMany(supabase, "shop_prelaunches", "shop_id", shopIds, "shop_id, opening_at, chair_capacity, head_start_hours, status, page_visits, version, go_live_approved_at, created_at, updated_at")
  ]);

  const groupIds = Array.from(new Set([
    ...stringIds(organizedGroupBookings, "id"),
    ...stringIds(ownGroupMembers, "group_id")
  ]));
  const [sharedGroupBookings, sharedGroupMembers, groupPaymentIntents] = await Promise.all([
    safeSelectMany(supabase, "group_bookings", "id", groupIds, "id, location_id, payment_mode, member_count, total_service_cents, currency, status, starts_at, ends_at, holds_expire_at, confirmed_at, created_at, updated_at"),
    safeSelectMany(supabase, "group_booking_members", "group_id", stringIds(organizedGroupBookings, "id"), "id, group_id, member_key, full_name, is_minor, is_organizer, client_id, appointment_id, price_cents, currency, status, created_at, updated_at"),
    safeSelectMany(supabase, "group_booking_payment_intents", "group_id", groupIds, "id, group_id, member_id, payer_kind, amount_cents, currency, status, stripe_payment_intent_id, created_at, updated_at")
  ]);

  const purchaseIds = stringIds(giftPurchases, "id");
  const purchasedGiftCards = await safeSelectMany(
    supabase,
    "gift_cards",
    "purchase_id",
    purchaseIds,
    "id, purchase_id, initial_balance_cents, balance_cents, currency, scope_type, scope_barber_id, scope_shop_id, claimed_by_profile_id, purchased_at, claimed_at, status, updated_at"
  );
  const giftCards = dedupeRows([...claimedGiftCards, ...purchasedGiftCards]);
  const giftCardIds = stringIds(giftCards, "id");
  const [giftDeliveries, giftLedgerByCard, giftApplicationsByCard] = await Promise.all([
    safeSelectMany(supabase, "gift_card_deliveries", "purchase_id", purchaseIds, "id, purchase_id, channel, destination_masked, provider, provider_message_id, status, attempt_count, delivered_at, created_at, updated_at"),
    safeSelectMany(supabase, "gift_card_ledger", "gift_card_id", giftCardIds, "id, gift_card_id, profile_id, appointment_id, entry_type, amount_cents, balance_after_cents, created_at"),
    safeSelectMany(supabase, "gift_card_applications", "gift_card_id", giftCardIds, "id, gift_card_id, appointment_id, profile_id, amount_cents, service_only, tip_applied_cents, created_at")
  ]);
  const giftApplications = dedupeRows([...giftApplicationsDirect, ...giftApplicationsByCard]);
  const giftApplicationIds = stringIds(giftApplications, "id");
  const [giftPayoutObligations, giftReversalsByApplication] = await Promise.all([
    safeSelectMany(supabase, "gift_card_payout_obligations", "application_id", giftApplicationIds, "id, application_id, appointment_id, barber_id, amount_cents, status, created_at, updated_at"),
    safeSelectMany(supabase, "gift_card_application_reversals", "application_id", giftApplicationIds, "id, application_id, gift_card_id, appointment_id, profile_id, amount_cents, reason, balance_after_cents, created_at")
  ]);
  const giftPayoutEvents = await safeSelectMany(
    supabase,
    "gift_card_payout_obligation_events",
    "obligation_id",
    stringIds(giftPayoutObligations, "id"),
    "id, obligation_id, previous_status, next_status, reason, metadata, created_at"
  );

  const appointments = dedupeRows([...clientAppointments, ...barberAppointments, ...shopAppointments]);
  const payments = dedupeRows([...clientPayments, ...barberPayments, ...shopPayments]);
  const paymentIds = stringIds(payments, "id");
  // Tips are private to the client/barber relationship. Owning a shop does not
  // make the owner a party to a barber's tip or compensation detail.
  const personalAppointmentIds = stringIds(
    dedupeRows([...clientAppointments, ...barberAppointments]),
    "id"
  );
  const threadIds = stringIds(threadParticipants, "thread_id");
  const [refunds, tips, messages] = await Promise.all([
    safeSelectMany(supabase, "refunds", "payment_id", paymentIds, "id, payment_id, amount, reason, refunded_at, created_at"),
    safeSelectMany(supabase, "tips", "appointment_id", personalAppointmentIds, "id, appointment_id, payment_id, client_id, barber_id, amount, created_at"),
    safeSelectMany(supabase, "messages", "thread_id", threadIds, "id, thread_id, sender_profile_id, body, message_type, metadata, created_at, read_at")
  ]);

  return {
    schemaVersion: 3,
    generatedAt,
    accountId: profileId,
    legalVersions: currentLegalVersions(),
    data: {
      profiles,
      clients,
      barbers,
      shops,
      appointments,
      transactionsAsParty: {
        payments,
        refunds,
        tips
      },
      culture: {
        posts,
        comments
      },
      media,
      reviews: dedupeRows([...reviewsAsClient, ...reviewsAsBarber]),
      messaging: {
        threadParticipants,
        messages
      },
      legalAcceptances,
      privacyPreferences,
      dataRightsRequests,
      productPr36: {
        groupBookings: dedupeRows([...organizedGroupBookings, ...sharedGroupBookings]),
        groupMembers: dedupeRows([...ownGroupMembers, ...sharedGroupMembers]),
        groupPaymentIntents,
        giftCards,
        giftPurchases,
        giftDeliveries,
        giftLedger: dedupeRows([...giftLedgerDirect, ...giftLedgerByCard]),
        giftApplications,
        giftApplicationReversals: dedupeRows([...giftReversalsDirect, ...giftReversalsByApplication]),
        giftPayoutObligations,
        giftPayoutEvents,
        giftRedemptionRequests,
        prelaunchWaitlist,
        ownedPrelaunchConfigs
      }
    },
    exclusions: [
      "payment credentials and full card data",
      "another user's private data outside shared records",
      "internal security material",
      "provider secrets and authentication tokens"
    ]
  };
}

export function createAccountExportToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAccountExportToken(token) };
}

export function hashAccountExportToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function accountExportDownloadUrl(token: string) {
  const base = runtimeConfig.appUrl.replace(/\/$/, "");
  return `${base}/api/account/exports/${encodeURIComponent(token)}`;
}

export async function sendAccountExportReadyEmail(input: {
  destination: string;
  downloadUrl: string;
  expiresAt: string;
}) {
  if (!hasEmailDeliveryConfig()) {
    throw new Error("account_export_email_unavailable");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeConfig.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: runtimeConfig.resendFromEmail,
      to: [input.destination],
      subject: "Your BVRB3R data export is ready",
      text: `Your private BVRB3R JSON export is ready. Sign in and download it here: ${input.downloadUrl}\n\nThis link expires at ${input.expiresAt}. If you did not request this export, contact support.`
    })
  });
  if (!response.ok) {
    throw new Error(`account_export_email_failed_${response.status}`);
  }
}

export async function sendAccountDeletionChallengeEmail(input: {
  destination: string;
  challenge: string;
  expiresAt: string;
}) {
  if (!hasEmailDeliveryConfig()) {
    throw new Error("account_deletion_email_unavailable");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeConfig.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: runtimeConfig.resendFromEmail,
      to: [input.destination],
      subject: "Confirm your BVRB3R account-deletion request",
      text: `Your BVRB3R verification code is ${input.challenge}. It expires at ${input.expiresAt}. Do not share this code. If you did not request account deletion, contact support immediately.`
    })
  });
  if (!response.ok) {
    throw new Error(`account_deletion_email_failed_${response.status}`);
  }
}
