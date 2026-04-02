import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildWalletServiceEscrowEntries,
  resolveBoothRentCollection,
  summarizeWalletBalances,
  type WalletLedgerSeed
} from "@/lib/wallet/domain";
import type {
  BoothRentStatusView,
  WalletBalanceView,
  WalletSubjectType,
  WalletTransactionView
} from "@/types/wallet";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PaymentRow = {
  id: string;
  payment_type: string;
  payment_status: string;
  currency: string;
  barber_id: string | null;
  shop_id: string | null;
  appointment_id: string | null;
};

type AppointmentRow = {
  id: string;
  status: string;
};

type RoutingRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  barber_payout_amount: number | string;
  shop_split_amount: number | string;
  currency: string;
};

type PayoutExecutionRow = {
  id: string;
  target_subject_type: WalletSubjectType;
  execution_type: "transfer" | "reversal";
  execution_status: "pending" | "blocked" | "executed" | "failed" | "reversed";
  source_execution_id: string | null;
  amount: number | string;
  payout_reference: string | null;
  payout_speed: "standard" | "instant";
  instant_payout_fee_amount: number | string;
  net_transfer_amount: number | string;
  processor_transfer_id: string | null;
  processor_payout_id: string | null;
};

type WalletTransactionRow = {
  id: string;
  subject_type: WalletSubjectType;
  barber_id: string | null;
  shop_id: string | null;
  payment_id: string | null;
  transaction_type: WalletTransactionView["transactionType"];
  pending_delta: number | string;
  available_delta: number | string;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type BoothRentMembershipRow = {
  membership_id: string;
  location_id: string;
  profile_id: string;
  routing_model: string | null;
  booth_rent_amount: number | string | null;
  booth_rent_frequency: "weekly" | "monthly" | null;
  barber_id: string;
};

type BoothRentLedgerRow = {
  id: string;
  barber_id: string;
  shop_id: string | null;
  period_label: string;
  due_date: string;
  amount: number | string;
  status: "paid" | "due" | "overdue";
  paid_date: string | null;
  paid_payment_id: string | null;
  wallet_debit_transaction_id: string | null;
  wallet_credit_transaction_id: string | null;
  last_attempted_at: string | null;
  attempt_count: number | string;
  metadata: Record<string, unknown> | null;
};

export class WalletServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function numericMetadataValue(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" || typeof value === "string" ? Number(value) : 0;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function isServiceEscrowPayment(paymentType: string) {
  return paymentType === "booking" || paymentType === "tip" || paymentType === "add_on";
}

function buildWalletTransactionId(input: {
  routingId?: string | null;
  paymentId?: string | null;
  boothRentLedgerId?: string | null;
  subjectType: WalletSubjectType;
  transactionType: WalletTransactionView["transactionType"];
}) {
  if (input.boothRentLedgerId) {
    return `wallet:${input.subjectType}:booth-rent:${input.boothRentLedgerId}:${input.transactionType}`;
  }

  if (input.routingId) {
    return `wallet:${input.subjectType}:routing:${input.routingId}:${input.transactionType}`;
  }

  if (input.paymentId) {
    return `wallet:${input.subjectType}:payment:${input.paymentId}:${input.transactionType}`;
  }

  throw new WalletServiceError("Wallet transaction identity requires a routing, payment, or booth-rent ledger reference.", 500);
}

function mapWalletTransactionRow(row: WalletTransactionRow): WalletTransactionView {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_type === "barber" ? row.barber_id ?? "" : row.shop_id ?? "",
    transactionType: row.transaction_type,
    pendingDelta: numeric(row.pending_delta),
    availableDelta: numeric(row.available_delta),
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ?? {}
  };
}

async function upsertWalletTransactions(supabase: SupabaseClient, seeds: WalletLedgerSeed[]) {
  if (!seeds.length) {
    return [] as WalletTransactionView[];
  }

  const now = new Date().toISOString();
  const upsertRows = seeds.map((seed) => ({
    id: seed.id,
    subject_type: seed.subjectType,
    barber_id: seed.subjectType === "barber" ? seed.subjectId : null,
    shop_id: seed.subjectType === "shop" ? seed.subjectId : null,
    payment_id: seed.metadata?.paymentId ?? null,
    routing_record_id: seed.metadata?.routingRecordId ?? null,
    payout_execution_id: seed.metadata?.payoutExecutionId ?? null,
    refund_id: seed.metadata?.refundId ?? null,
    booth_rent_ledger_id: seed.metadata?.boothRentLedgerId ?? null,
    transaction_type: seed.transactionType,
    pending_delta: roundCurrency(seed.pendingDelta),
    available_delta: roundCurrency(seed.availableDelta),
    currency: (seed.currency ?? "usd").toLowerCase(),
    metadata: seed.metadata ?? {},
    created_at: seed.createdAt ?? now,
    updated_at: now
  }));

  const result = await supabase
    .from("wallet_transactions")
    .upsert(upsertRows, { onConflict: "id" })
    .select("id, subject_type, barber_id, shop_id, payment_id, transaction_type, pending_delta, available_delta, currency, metadata, created_at, updated_at");

  if (result.error) {
    throw new WalletServiceError("Unable to persist wallet transactions.", 500);
  }

  return ((result.data ?? []) as WalletTransactionRow[]).map(mapWalletTransactionRow);
}

async function readWalletTransactionsForSubject(
  supabase: SupabaseClient,
  input: { subjectType: WalletSubjectType; subjectId: string }
) {
  const query = supabase
    .from("wallet_transactions")
    .select("id, subject_type, barber_id, shop_id, payment_id, transaction_type, pending_delta, available_delta, currency, metadata, created_at, updated_at")
    .eq(input.subjectType === "barber" ? "barber_id" : "shop_id", input.subjectId)
    .order("updated_at", { ascending: false });

  const result = await query;
  if (result.error) {
    throw new WalletServiceError("Unable to read wallet transactions.", 500);
  }

  return ((result.data ?? []) as WalletTransactionRow[]).map(mapWalletTransactionRow);
}

async function persistWalletBalance(
  supabase: SupabaseClient,
  balance: WalletBalanceView
) {
  const result = await supabase
    .from("wallet_balances")
    .upsert({
      subject_type: balance.subjectType,
      barber_id: balance.subjectType === "barber" ? balance.subjectId : null,
      shop_id: balance.subjectType === "shop" ? balance.subjectId : null,
      currency: balance.currency.toLowerCase(),
      pending_balance: roundCurrency(balance.pendingBalance),
      available_balance: roundCurrency(balance.availableBalance),
      updated_at: balance.updatedAt ?? new Date().toISOString()
    }, {
      onConflict: balance.subjectType === "barber" ? "barber_id" : "shop_id"
    });

  if (result.error) {
    throw new WalletServiceError("Unable to persist wallet balances.", 500);
  }
}

async function recalculateWalletBalances(
  supabase: SupabaseClient,
  subjects: Array<{ subjectType: WalletSubjectType; subjectId: string }>
) {
  const uniqueSubjects = Array.from(new Map(subjects.map((subject) => [`${subject.subjectType}:${subject.subjectId}`, subject])).values());
  const balances: WalletBalanceView[] = [];

  for (const subject of uniqueSubjects) {
    const transactions = await readWalletTransactionsForSubject(supabase, subject);
    const summaries = summarizeWalletBalances(transactions);
    const summary = summaries[`${subject.subjectType}:${subject.subjectId}:usd`] ?? {
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      currency: "usd",
      pendingBalance: 0,
      availableBalance: 0,
      updatedAt: new Date().toISOString()
    };
    await persistWalletBalance(supabase, summary);
    balances.push(summary);
  }

  return balances;
}

async function readWalletTransactionById(supabase: SupabaseClient, id: string) {
  const result = await supabase
    .from("wallet_transactions")
    .select("id, metadata, pending_delta, available_delta, created_at")
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    throw new WalletServiceError("Unable to inspect the wallet transaction base entry.", 500);
  }

  return result.data as {
    id: string;
    metadata: Record<string, unknown> | null;
    pending_delta: number | string;
    available_delta: number | string;
    created_at: string;
  } | null;
}

export async function syncWalletBalancesForPayment(
  supabase: SupabaseClient,
  paymentId: string
) {
  const [paymentResult, routingResult] = await Promise.all([
    supabase
      .from("payments")
      .select("id, payment_type, payment_status, currency, barber_id, shop_id, appointment_id")
      .eq("id", paymentId)
      .maybeSingle(),
    supabase
      .from("payment_routing_records")
      .select("id, payment_id, appointment_id, barber_payout_amount, shop_split_amount, currency")
      .eq("payment_id", paymentId)
      .maybeSingle()
  ]);

  if (paymentResult.error || routingResult.error) {
    throw new WalletServiceError("Unable to load payment routing for wallet reconciliation.", 500);
  }

  if (!paymentResult.data || !routingResult.data) {
    return {
      transactions: [] as WalletTransactionView[],
      balances: [] as WalletBalanceView[]
    };
  }

  const payment = paymentResult.data as PaymentRow;
  const routing = routingResult.data as RoutingRow;
  const appointment = payment.appointment_id
    ? await supabase
      .from("appointments")
      .select("id, status")
      .eq("id", payment.appointment_id)
      .maybeSingle()
    : { data: null, error: null };

  if (appointment.error) {
    throw new WalletServiceError("Unable to load the appointment state for wallet reconciliation.", 500);
  }

  const executionsResult = await supabase
    .from("payout_executions")
    .select("id, target_subject_type, execution_type, execution_status, source_execution_id, amount, payout_reference, payout_speed, instant_payout_fee_amount, net_transfer_amount, processor_transfer_id, processor_payout_id")
    .eq("routing_record_id", routing.id)
    .order("created_at", { ascending: true });

  if (executionsResult.error) {
    throw new WalletServiceError("Unable to load payout executions for wallet reconciliation.", 500);
  }

  const executions = (executionsResult.data ?? []) as PayoutExecutionRow[];
  const isCompleted = isServiceEscrowPayment(payment.payment_type)
    ? ((appointment.data as AppointmentRow | null)?.status === "completed" || (appointment.data as AppointmentRow | null)?.status === "refunded")
    : payment.payment_status === "captured" || payment.payment_status === "partially_refunded" || payment.payment_status === "refunded";

  const subjectInputs = [
    payment.barber_id && numeric(routing.barber_payout_amount) !== 0
      ? {
          subjectType: "barber" as const,
          subjectId: payment.barber_id,
          currentAmount: roundCurrency(numeric(routing.barber_payout_amount)),
          netPaidOut: roundCurrency(
            executions
              .filter((entry) => entry.target_subject_type === "barber" && entry.execution_type === "transfer" && entry.execution_status === "executed")
              .reduce((sum, entry) => sum + numeric(entry.amount), 0)
            - executions
              .filter((entry) => entry.target_subject_type === "barber" && entry.execution_type === "reversal" && entry.execution_status === "reversed")
              .reduce((sum, entry) => sum + numeric(entry.amount), 0)
          )
        }
      : null,
    payment.shop_id && numeric(routing.shop_split_amount) !== 0
      ? {
          subjectType: "shop" as const,
          subjectId: payment.shop_id,
          currentAmount: roundCurrency(numeric(routing.shop_split_amount)),
          netPaidOut: roundCurrency(
            executions
              .filter((entry) => entry.target_subject_type === "shop" && entry.execution_type === "transfer" && entry.execution_status === "executed")
              .reduce((sum, entry) => sum + numeric(entry.amount), 0)
            - executions
              .filter((entry) => entry.target_subject_type === "shop" && entry.execution_type === "reversal" && entry.execution_status === "reversed")
              .reduce((sum, entry) => sum + numeric(entry.amount), 0)
          )
        }
      : null
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const persistedTransactions: WalletTransactionView[] = [];
  for (const subject of subjectInputs) {
    const captureId = buildWalletTransactionId({
      routingId: routing.id,
      subjectType: subject.subjectType,
      transactionType: "payment_pending_credit"
    });
    const captureBase = await readWalletTransactionById(supabase, captureId);
    const baseAmount = roundCurrency(Math.max(
      numericMetadataValue(captureBase?.metadata, "baseAmount")
      || numeric(captureBase?.pending_delta ?? 0)
      || subject.currentAmount,
      0
    ));

    const entries = buildWalletServiceEscrowEntries({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      baseAmount,
      currentAmount: subject.currentAmount,
      isCompleted,
      netPaidOut: subject.netPaidOut,
      currency: routing.currency,
      transactionIds: {
        capture: captureId,
        completion: buildWalletTransactionId({
          routingId: routing.id,
          subjectType: subject.subjectType,
          transactionType: "payment_completion_release"
        }),
        adjustment: buildWalletTransactionId({
          routingId: routing.id,
          subjectType: subject.subjectType,
          transactionType: "payment_adjustment"
        }),
        payout: buildWalletTransactionId({
          routingId: routing.id,
          subjectType: subject.subjectType,
          transactionType: "payout_debit"
        })
      }
    });

    const transactionSeeds: WalletLedgerSeed[] = [
      {
        ...entries.capture,
        createdAt: captureBase?.created_at,
        metadata: {
          ...entries.capture.metadata,
          paymentId: payment.id,
          routingRecordId: routing.id,
          appointmentId: payment.appointment_id,
          baseAmount
        }
      },
      {
        ...entries.completion,
        metadata: {
          ...entries.completion.metadata,
          paymentId: payment.id,
          routingRecordId: routing.id,
          appointmentId: payment.appointment_id,
          baseAmount
        }
      },
      {
        ...entries.adjustment,
        metadata: {
          ...entries.adjustment.metadata,
          paymentId: payment.id,
          routingRecordId: routing.id,
          appointmentId: payment.appointment_id,
          baseAmount,
          currentAmount: subject.currentAmount
        }
      },
      {
        ...entries.payout,
        metadata: {
          ...entries.payout.metadata,
          paymentId: payment.id,
          routingRecordId: routing.id,
          appointmentId: payment.appointment_id,
          netPaidOut: subject.netPaidOut,
          payoutExecutionIds: executions
            .filter((entry) => entry.target_subject_type === subject.subjectType)
            .map((entry) => entry.id)
        }
      }
    ];

    persistedTransactions.push(...await upsertWalletTransactions(supabase, transactionSeeds));
  }

  const balances = await recalculateWalletBalances(
    supabase,
    subjectInputs.map((subject) => ({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId
    }))
  );

  return {
    transactions: persistedTransactions,
    balances
  };
}

export async function readWalletBalance(input: {
  subjectType: WalletSubjectType;
  subjectId: string;
}) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const result = await supabase
    .from("wallet_balances")
    .select("subject_type, barber_id, shop_id, currency, pending_balance, available_balance, updated_at")
    .eq(input.subjectType === "barber" ? "barber_id" : "shop_id", input.subjectId)
    .maybeSingle();

  if (result.error) {
    throw new WalletServiceError("Unable to load the wallet balance.", 500);
  }

  if (!result.data) {
    return null;
  }

  return {
    subjectType: result.data.subject_type as WalletSubjectType,
    subjectId: input.subjectType === "barber" ? (result.data.barber_id as string) : (result.data.shop_id as string),
    currency: result.data.currency as string,
    pendingBalance: numeric(result.data.pending_balance as number | string),
    availableBalance: numeric(result.data.available_balance as number | string),
    updatedAt: result.data.updated_at as string | null
  } satisfies WalletBalanceView;
}

function buildPeriodWindow(referenceAt: string, frequency: "weekly" | "monthly") {
  const reference = new Date(referenceAt);
  const start = new Date(reference);
  const end = new Date(reference);

  if (frequency === "weekly") {
    const day = start.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + offset);
    start.setUTCHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    const year = start.getUTCFullYear();
    const weekSeed = new Date(Date.UTC(year, 0, 1));
    const weekNumber = Math.ceil((((start.getTime() - weekSeed.getTime()) / 86400000) + weekSeed.getUTCDay() + 1) / 7);
    return {
      periodLabel: `${year}-W${String(Math.max(weekNumber, 1)).padStart(2, "0")}`,
      dueDate: end.toISOString(),
      startAt: start.toISOString(),
      endAt: end.toISOString()
    };
  }

  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCMonth(start.getUTCMonth() + 1, 0);
  end.setUTCHours(23, 59, 59, 999);
  return {
    periodLabel: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    dueDate: end.toISOString(),
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

async function readOrCreateBoothRentLedger(
  supabase: SupabaseClient,
  input: {
    barberId: string;
    shopId: string;
    amount: number;
    frequency: "weekly" | "monthly";
    referenceAt: string;
  }
) {
  const period = buildPeriodWindow(input.referenceAt, input.frequency);
  const existing = await supabase
    .from("booth_rent_ledgers")
    .select("id, barber_id, shop_id, period_label, due_date, amount, status, paid_date, paid_payment_id, wallet_debit_transaction_id, wallet_credit_transaction_id, last_attempted_at, attempt_count, metadata")
    .eq("barber_id", input.barberId)
    .eq("shop_id", input.shopId)
    .eq("period_label", period.periodLabel)
    .maybeSingle();

  if (existing.error) {
    throw new WalletServiceError("Unable to inspect booth-rent ledger state.", 500);
  }

  if (existing.data) {
    return {
      ledger: existing.data as BoothRentLedgerRow,
      period
    };
  }

  const insert = await supabase
    .from("booth_rent_ledgers")
    .insert({
      barber_id: input.barberId,
      shop_id: input.shopId,
      period_label: period.periodLabel,
      due_date: period.dueDate,
      amount: roundCurrency(input.amount),
      status: "due",
      attempt_count: 0,
      metadata: {
        frequency: input.frequency,
        periodStartAt: period.startAt,
        periodEndAt: period.endAt
      },
      updated_at: new Date().toISOString()
    })
    .select("id, barber_id, shop_id, period_label, due_date, amount, status, paid_date, paid_payment_id, wallet_debit_transaction_id, wallet_credit_transaction_id, last_attempted_at, attempt_count, metadata")
    .single();

  if (insert.error) {
    throw new WalletServiceError("Unable to create the booth-rent ledger row.", 500);
  }

  return {
    ledger: insert.data as BoothRentLedgerRow,
    period
  };
}

export async function processBoothRentAutoDeductions(referenceAt = new Date().toISOString()) {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      processed: 0,
      paid: 0,
      overdue: 0,
      ledgers: [] as BoothRentStatusView[]
    };
  }

  const membershipsResult = await supabase
    .from("staff_locations")
    .select("id, location_id, profile_id, routing_model, booth_rent_amount, booth_rent_frequency")
    .eq("routing_model", "booth_rent");

  if (membershipsResult.error) {
    throw new WalletServiceError("Unable to load booth-rent compensation assignments.", 500);
  }

  const membershipRows = (membershipsResult.data ?? []) as Array<{
    id: string;
    location_id: string;
    profile_id: string;
    routing_model: string | null;
    booth_rent_amount: number | string | null;
    booth_rent_frequency: "weekly" | "monthly" | null;
  }>;
  const profileIds = [...new Set(membershipRows.map((row) => row.profile_id).filter(Boolean))];
  const barbersResult = profileIds.length
    ? await supabase
      .from("barbers")
      .select("id, profile_id")
      .in("profile_id", profileIds)
    : { data: [], error: null };

  if (barbersResult.error) {
    throw new WalletServiceError("Unable to load booth-rent barber identities.", 500);
  }

  const barberIdByProfileId = new Map(
    ((barbersResult.data ?? []) as Array<{ id: string; profile_id: string }>).map((row) => [row.profile_id, row.id])
  );

  const memberships = membershipRows
    .map((row) => {
      const barberId = barberIdByProfileId.get(row.profile_id);
      if (!barberId) {
        return null;
      }

      return {
        membership_id: row.id,
        location_id: row.location_id,
        profile_id: row.profile_id,
        routing_model: row.routing_model,
        booth_rent_amount: row.booth_rent_amount,
        booth_rent_frequency: row.booth_rent_frequency,
        barber_id: barberId
      } satisfies BoothRentMembershipRow;
    })
    .filter((row): row is BoothRentMembershipRow => Boolean(row));

  const results: BoothRentStatusView[] = [];
  let paid = 0;
  let overdue = 0;

  for (const membership of memberships) {
    const amount = roundCurrency(numeric(membership.booth_rent_amount));
    const frequency = membership.booth_rent_frequency;
    if (!(amount > 0) || !frequency) {
      continue;
    }

    const wallet = await readWalletBalance({
      subjectType: "barber",
      subjectId: membership.barber_id
    });

    const { ledger, period } = await readOrCreateBoothRentLedger(supabase, {
      barberId: membership.barber_id,
      shopId: membership.location_id,
      amount,
      frequency,
      referenceAt
    });

    const outcome = resolveBoothRentCollection({
      amountDue: amount,
      availableBalance: wallet?.availableBalance ?? 0,
      frequency,
      periodLabel: ledger.period_label ?? period.periodLabel,
      dueDate: ledger.due_date ?? period.dueDate,
      lastAttemptedAt: ledger.last_attempted_at
    });

    if (outcome.status === "paid") {
      const debitId = buildWalletTransactionId({
        boothRentLedgerId: ledger.id,
        subjectType: "barber",
        transactionType: "booth_rent_debit"
      });
      const creditId = buildWalletTransactionId({
        boothRentLedgerId: ledger.id,
        subjectType: "shop",
        transactionType: "booth_rent_credit"
      });

      await upsertWalletTransactions(supabase, [
        {
          id: debitId,
          subjectType: "barber",
          subjectId: membership.barber_id,
          transactionType: "booth_rent_debit",
          pendingDelta: 0,
          availableDelta: -outcome.debitAmount,
          currency: "usd",
          metadata: {
            boothRentLedgerId: ledger.id,
            shopId: membership.location_id,
            periodLabel: period.periodLabel,
            frequency
          }
        },
        {
          id: creditId,
          subjectType: "shop",
          subjectId: membership.location_id,
          transactionType: "booth_rent_credit",
          pendingDelta: 0,
          availableDelta: outcome.debitAmount,
          currency: "usd",
          metadata: {
            boothRentLedgerId: ledger.id,
            barberId: membership.barber_id,
            periodLabel: period.periodLabel,
            frequency
          }
        }
      ]);

      await supabase
        .from("booth_rent_ledgers")
        .update({
          shop_id: membership.location_id,
          status: "paid",
          paid_date: outcome.paidDate,
          wallet_debit_transaction_id: debitId,
          wallet_credit_transaction_id: creditId,
          last_attempted_at: outcome.lastAttemptedAt,
          attempt_count: Number(ledger.attempt_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(ledger.metadata ?? {}),
            frequency,
            periodStartAt: period.startAt,
            periodEndAt: period.endAt
          }
        })
        .eq("id", ledger.id);

      await recalculateWalletBalances(supabase, [
        { subjectType: "barber", subjectId: membership.barber_id },
        { subjectType: "shop", subjectId: membership.location_id }
      ]);
      paid += 1;
    } else {
      await supabase
        .from("booth_rent_ledgers")
        .update({
          shop_id: membership.location_id,
          status: outcome.status,
          last_attempted_at: outcome.lastAttemptedAt,
          attempt_count: Number(ledger.attempt_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(ledger.metadata ?? {}),
            overdueAmount: outcome.overdueAmount,
            frequency,
            periodStartAt: period.startAt,
            periodEndAt: period.endAt
          }
        })
        .eq("id", ledger.id);
      overdue += 1;
    }

    results.push(outcome);
  }

  return {
    processed: results.length,
    paid,
    overdue,
    ledgers: results
  };
}

export async function readLatestBoothRentStatusForBarber(barberId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      amount: 0,
      frequency: null,
      status: "not_applicable",
      periodLabel: null,
      dueDate: null,
      paidDate: null,
      overdueAmount: 0,
      lastAttemptedAt: null
    } satisfies BoothRentStatusView;
  }

  const result = await supabase
    .from("booth_rent_ledgers")
    .select("id, barber_id, shop_id, period_label, due_date, amount, status, paid_date, paid_payment_id, wallet_debit_transaction_id, wallet_credit_transaction_id, last_attempted_at, attempt_count, metadata")
    .eq("barber_id", barberId)
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      amount: 0,
      frequency: null,
      status: "not_applicable",
      periodLabel: null,
      dueDate: null,
      paidDate: null,
      overdueAmount: 0,
      lastAttemptedAt: null
    } satisfies BoothRentStatusView;
  }

  const metadata = (result.data.metadata ?? {}) as Record<string, unknown>;
  return {
    amount: numeric(result.data.amount),
    frequency: (metadata.frequency as "weekly" | "monthly" | null) ?? null,
    status: result.data.status,
    periodLabel: result.data.period_label,
    dueDate: result.data.due_date,
    paidDate: result.data.paid_date,
    overdueAmount: numeric(metadata.overdueAmount ?? (result.data.status === "overdue" ? result.data.amount : 0)),
    lastAttemptedAt: result.data.last_attempted_at
  } satisfies BoothRentStatusView;
}

export async function readBoothRentSummaryForLocations(locationIds: string[]) {
  const supabase = getSupabase();
  if (!supabase || !locationIds.length) {
    return {
      paid: 0,
      overdue: 0,
      due: 0,
      overdueAmount: 0
    };
  }

  const result = await supabase
    .from("booth_rent_ledgers")
    .select("amount, status, shop_id")
    .in("shop_id", locationIds);

  if (result.error) {
    throw new WalletServiceError("Unable to load booth-rent summary.", 500);
  }

  const rows = (result.data ?? []) as Array<{ amount: number | string; status: "paid" | "due" | "overdue"; shop_id: string | null }>;
  return {
    paid: rows.filter((row) => row.status === "paid").length,
    overdue: rows.filter((row) => row.status === "overdue").length,
    due: rows.filter((row) => row.status === "due").length,
    overdueAmount: roundCurrency(rows.filter((row) => row.status === "overdue").reduce((sum, row) => sum + numeric(row.amount), 0))
  };
}
