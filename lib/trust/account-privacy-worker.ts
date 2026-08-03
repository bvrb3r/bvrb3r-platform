import type Stripe from "stripe";
import {
  accountExportDownloadUrl,
  buildPr31AccountExportBundle,
  createAccountExportToken,
  sendAccountExportReadyEmail
} from "@/lib/trust/account-data-export";
import { getStripeConnectClient } from "@/lib/stripe/connect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AccountExportDeliveryRow = {
  id: string;
  profile_id: string;
  data_rights_request_id: string | null;
  status: string;
  attempt_count: number;
};

type AccountDeletionJobRow = {
  id: string;
  profile_id: string;
  attempt_count: number;
  application_finalized_at: string | null;
  auth_disabled_at: string | null;
};

type GiftPurchaseSettlementRow = {
  id: string;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  status: string;
};

type GiftPurchaseSettlementStripe = Pick<Stripe, "paymentIntents" | "refunds">;

export type AccountPrivacyWorkerResult = {
  expiredExports: number;
  builtExports: number;
  failedExports: number;
  finalizedAccounts: number;
  failedFinalizations: number;
};

function safeFailureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]+$/i.test(error.message)) {
    return error.message.slice(0, 80);
  }
  return "worker_step_failed";
}

function isMissingPr36GiftSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "42P01"
    || code === "PGRST205"
    || /gift_card_purchase_attempts.*(?:does not exist|schema cache)/i.test(message);
}

async function writeGiftPurchaseSettlementStatus(
  supabase: AdminClient,
  purchaseId: string,
  status: "failed" | "refunded"
) {
  const update = await supabase
    .from("gift_card_purchase_attempts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .is("gift_card_id", null);
  if (update.error) throw update.error;
}

/**
 * Account deletion must not orphan an unfinished Stripe gift-card charge.
 * The database owns identity anonymization, but only the provider client can
 * cancel an unsettled PaymentIntent or refund paid value that never activated
 * into a gift-card liability. Provider operations are idempotent and complete
 * before the deletion RPC removes the buyer's operational identity.
 */
export async function settlePr36GiftPurchasesBeforeDeletion(input: {
  supabase: AdminClient;
  profileId: string;
  stripe?: GiftPurchaseSettlementStripe;
}) {
  const purchasesResult = await input.supabase
    .from("gift_card_purchase_attempts")
    .select("id, amount_cents, currency, stripe_payment_intent_id, status")
    .eq("buyer_profile_id", input.profileId)
    .is("gift_card_id", null)
    .in("status", ["creating", "requires_payment", "paid", "needs_review"])
    .order("id", { ascending: true });

  if (purchasesResult.error) {
    // PR31 can deploy before PR36 in the stacked train. Missing future schema
    // is the sole safe no-op; every other read failure blocks finalization.
    if (isMissingPr36GiftSchema(purchasesResult.error)) return 0;
    throw purchasesResult.error;
  }

  const purchases = (purchasesResult.data ?? []) as GiftPurchaseSettlementRow[];
  if (!purchases.length) return 0;
  let stripe = input.stripe;
  let settled = 0;

  for (const purchase of purchases) {
    if (!purchase.stripe_payment_intent_id) {
      if (purchase.status !== "creating") {
        throw new Error("gift_purchase_missing_payment_reference");
      }
      await writeGiftPurchaseSettlementStatus(input.supabase, purchase.id, "failed");
      settled += 1;
      continue;
    }

    stripe ??= getStripeConnectClient();
    const intent = await stripe.paymentIntents.retrieve(purchase.stripe_payment_intent_id, {
      expand: ["latest_charge"]
    });
    const matchesPurchase = intent.metadata.purpose === "pr36_gift_card_purchase"
      && intent.metadata.purchaseId === purchase.id
      && intent.amount === purchase.amount_cents
      && intent.currency === purchase.currency;
    if (!matchesPurchase) {
      throw new Error("gift_purchase_payment_reference_mismatch");
    }

    if (intent.status === "succeeded") {
      const latestCharge = intent.latest_charge
        && typeof intent.latest_charge === "object"
        && !("deleted" in intent.latest_charge && intent.latest_charge.deleted)
        ? intent.latest_charge
        : null;
      const receivedCents = Math.max(intent.amount_received, intent.amount);
      const alreadyFullyRefunded = Boolean(
        latestCharge
        && (latestCharge.refunded || latestCharge.amount_refunded >= receivedCents)
      );
      if (!alreadyFullyRefunded) {
        await stripe.refunds.create({
          payment_intent: intent.id,
          reason: "requested_by_customer",
          metadata: {
            purpose: "pr36_gift_account_deletion",
            purchaseId: purchase.id
          }
        }, {
          idempotencyKey: `pr36-gift-account-deletion-refund:${purchase.id}`
        });
      }
      await writeGiftPurchaseSettlementStatus(input.supabase, purchase.id, "refunded");
      settled += 1;
      continue;
    }

    if (intent.status !== "canceled") {
      await stripe.paymentIntents.cancel(intent.id, {
        cancellation_reason: "requested_by_customer"
      }, {
        idempotencyKey: `pr36-gift-account-deletion-cancel:${purchase.id}`
      });
    }
    await writeGiftPurchaseSettlementStatus(input.supabase, purchase.id, "failed");
    settled += 1;
  }

  return settled;
}

async function expireAccountExports(supabase: AdminClient, now: string) {
  const result = await supabase
    .from("account_export_deliveries")
    .update({ status: "expired" })
    .eq("status", "ready")
    .lte("expires_at", now)
    .select("id");
  if (result.error) throw result.error;
  const expiredIds = (result.data ?? []).map((row) => row.id);
  if (expiredIds.length) {
    const archiveDelete = await supabase
      .schema("compliance_private")
      .from("account_export_archives")
      .delete()
      .in("delivery_id", expiredIds);
    if (archiveDelete.error) throw archiveDelete.error;
  }
  return expiredIds.length;
}

async function recoverStaleExportClaims(supabase: AdminClient, now: string) {
  const staleBefore = new Date(new Date(now).getTime() - 15 * 60 * 1000).toISOString();
  const result = await supabase
    .from("account_export_deliveries")
    .update({ status: "failed", last_error_code: "worker_claim_expired" })
    .eq("status", "building")
    .lt("last_attempt_at", staleBefore);
  if (result.error) throw result.error;
}

async function failExport(
  supabase: AdminClient,
  delivery: AccountExportDeliveryRow,
  error: unknown
) {
  await Promise.all([
    supabase
      .from("account_export_deliveries")
      .update({ status: "failed", last_error_code: safeFailureCode(error) })
      .eq("id", delivery.id)
      .eq("status", "building"),
    supabase
      .schema("compliance_private")
      .from("account_export_archives")
      .delete()
      .eq("delivery_id", delivery.id)
  ]);
}

async function buildQueuedAccountExports(
  supabase: AdminClient,
  now: string,
  sendEmail: typeof sendAccountExportReadyEmail
) {
  const queuedResult = await supabase
    .from("account_export_deliveries")
    .select("id, profile_id, data_rights_request_id, status, attempt_count")
    .in("status", ["requested", "failed"])
    .lt("attempt_count", 5)
    .order("requested_at", { ascending: true })
    .limit(10);
  if (queuedResult.error) throw queuedResult.error;

  let built = 0;
  let failed = 0;
  for (const queued of (queuedResult.data ?? []) as AccountExportDeliveryRow[]) {
    const claim = await supabase
      .from("account_export_deliveries")
      .update({
        status: "building",
        attempt_count: Number(queued.attempt_count ?? 0) + 1,
        last_attempt_at: now,
        last_error_code: null
      })
      .eq("id", queued.id)
      .eq("status", queued.status)
      .select("id, profile_id, data_rights_request_id, status, attempt_count")
      .maybeSingle();
    if (claim.error || !claim.data) continue;
    const delivery = claim.data as AccountExportDeliveryRow;

    try {
      const profile = await supabase
        .from("profiles")
        .select("email")
        .eq("id", delivery.profile_id)
        .maybeSingle();
      if (profile.error || !profile.data?.email) throw profile.error ?? new Error("export_email_missing");

      const bundle = await buildPr31AccountExportBundle(supabase, delivery.profile_id, now);
      const { token, tokenHash } = createAccountExportToken();
      const readyAt = new Date().toISOString();
      const expiresAt = new Date(new Date(readyAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const archiveWrite = await supabase
        .schema("compliance_private")
        .from("account_export_archives")
        .upsert({
          delivery_id: delivery.id,
          profile_id: delivery.profile_id,
          token_hash: tokenHash,
          archive_payload: bundle,
          created_at: readyAt,
          expires_at: expiresAt
        }, { onConflict: "delivery_id" });
      if (archiveWrite.error) throw archiveWrite.error;

      await sendEmail({
        destination: profile.data.email,
        downloadUrl: accountExportDownloadUrl(token),
        expiresAt
      });

      const readyWrite = await supabase
        .from("account_export_deliveries")
        .update({
          status: "ready",
          storage_reference: `private_archive:${delivery.id}`,
          ready_at: readyAt,
          expires_at: expiresAt
        })
        .eq("id", delivery.id)
        .eq("status", "building");
      if (readyWrite.error) throw readyWrite.error;

      if (delivery.data_rights_request_id) {
        await supabase
          .from("data_rights_requests")
          .update({
            status: "completed",
            completed_at: readyAt,
            resolution_metadata: {
              delivery_id: delivery.id,
              delivery: "authenticated_email_link",
              expires_at: expiresAt,
              schema_version: 3
            },
            updated_at: readyAt
          })
          .eq("id", delivery.data_rights_request_id);
      }
      built += 1;
    } catch (error) {
      failed += 1;
      await failExport(supabase, delivery, error);
    }
  }
  return { built, failed };
}

async function finalizeDueAccountDeletions(supabase: AdminClient, now: string) {
  const jobsResult = await supabase
    .schema("compliance_private")
    .from("account_deletion_finalization_jobs")
    .select("id, profile_id, attempt_count, application_finalized_at, auth_disabled_at")
    .in("status", ["scheduled", "failed"])
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(10);
  if (jobsResult.error) throw jobsResult.error;

  let finalized = 0;
  let failed = 0;
  for (const row of (jobsResult.data ?? []) as AccountDeletionJobRow[]) {
    const claimedAt = new Date().toISOString();
    const claim = await supabase
      .schema("compliance_private")
      .from("account_deletion_finalization_jobs")
      .update({
        status: "processing",
        last_attempt_at: claimedAt,
        attempt_count: Number(row.attempt_count ?? 0) + 1
      })
      .eq("id", row.id)
      .in("status", ["scheduled", "failed"])
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) continue;

    try {
      let applicationFinalizedAt = row.application_finalized_at;
      if (!applicationFinalizedAt) {
        await settlePr36GiftPurchasesBeforeDeletion({
          supabase,
          profileId: row.profile_id
        });
        const finalization = await supabase
          .schema("compliance_private")
          .rpc("finalize_account_deletion", { p_profile_id: row.profile_id });
        if (finalization.error) throw finalization.error;
        applicationFinalizedAt = new Date().toISOString();
        const stageWrite = await supabase
          .schema("compliance_private")
          .from("account_deletion_finalization_jobs")
          .update({ application_finalized_at: applicationFinalizedAt })
          .eq("id", row.id)
          .eq("status", "processing");
        if (stageWrite.error) throw stageWrite.error;
      }

      let authDisabledAt = row.auth_disabled_at;
      if (!authDisabledAt) {
        const disabled = await supabase.auth.admin.updateUserById(row.profile_id, {
          ban_duration: "876000h"
        });
        if (disabled.error) throw disabled.error;
        authDisabledAt = new Date().toISOString();
      }

      const completed = await supabase
        .schema("compliance_private")
        .from("account_deletion_finalization_jobs")
        .update({
          status: "completed",
          application_finalized_at: applicationFinalizedAt,
          auth_disabled_at: authDisabledAt,
          completed_at: authDisabledAt,
          last_error_code: null
        })
        .eq("id", row.id)
        .eq("status", "processing");
      if (completed.error) throw completed.error;
      finalized += 1;
    } catch (error) {
      failed += 1;
      await supabase
        .schema("compliance_private")
        .from("account_deletion_finalization_jobs")
        .update({ status: "failed", last_error_code: safeFailureCode(error) })
        .eq("id", row.id)
        .eq("status", "processing");
    }
  }
  return { finalized, failed };
}

export async function runPr31AccountPrivacyWorker(input: {
  supabase?: AdminClient;
  now?: string;
  sendEmail?: typeof sendAccountExportReadyEmail;
} = {}): Promise<AccountPrivacyWorkerResult> {
  const supabase = input.supabase ?? createSupabaseAdminClient();
  if (!supabase) throw new Error("account_privacy_worker_requires_server_truth");
  const now = input.now ?? new Date().toISOString();
  await recoverStaleExportClaims(supabase, now);
  const expiredExports = await expireAccountExports(supabase, now);
  const exports = await buildQueuedAccountExports(supabase, now, input.sendEmail ?? sendAccountExportReadyEmail);
  const deletions = await finalizeDueAccountDeletions(supabase, now);
  return {
    expiredExports,
    builtExports: exports.built,
    failedExports: exports.failed,
    finalizedAccounts: deletions.finalized,
    failedFinalizations: deletions.failed
  };
}
