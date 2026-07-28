import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CompensationSnapshotRecord, OwnerAnalyticsSnapshotRecord, WorkflowEventRecord, WorkflowPersistenceEnvelope } from "@/lib/operations/persistence";

export interface WorkflowPersistenceResult {
  provider: "supabase" | "mock";
  persisted: boolean;
  workflowEventStored: boolean;
  compensationStored: boolean;
  ownerAnalyticsStored: boolean;
  message: string;
}

interface OperationsPersistenceProvider {
  kind: "supabase" | "mock";
  syncWorkflowEnvelope(input: WorkflowPersistenceEnvelope): Promise<WorkflowPersistenceResult>;
}

function toWorkflowEventInsert(record: WorkflowEventRecord) {
  return {
    appointment_reference: record.appointmentReference,
    location_reference: record.locationReference,
    barber_reference: record.barberReference,
    barber_user_reference: record.barberUserReference,
    barber_email: record.barberEmail,
    client_reference: record.clientReference,
    client_email: record.clientEmail,
    actor_role: record.actorRole,
    event_type: record.eventType,
    title: record.title,
    detail: record.detail,
    event_payload: record.eventPayload,
    created_at: record.createdAt
  };
}

function toCompensationInsert(record: CompensationSnapshotRecord) {
  return {
    appointment_reference: record.appointmentReference,
    location_reference: record.locationReference,
    barber_reference: record.barberReference,
    barber_user_reference: record.barberUserReference,
    barber_email: record.barberEmail,
    client_reference: record.clientReference,
    client_email: record.clientEmail,
    compensation_model: record.compensationModel,
    business_date: record.businessDate,
    gross_service_amount: record.grossServiceAmount,
    deposit_amount: record.depositAmount,
    collected_amount: record.collectedAmount,
    tip_amount: record.tipAmount,
    autobooth_percent: record.autoBoothPercent,
    autobooth_rent_applied_amount: record.autoBoothRentAppliedAmount,
    booth_rent_amount: record.boothRentAmount,
    booth_rent_period_label: record.boothRentPeriodLabel,
    rent_coverage_amount: record.rentCoverageAmount,
    checkout_reference: record.checkoutReference,
    captured_at: record.capturedAt,
    updated_at: new Date().toISOString()
  };
}

function toOwnerAnalyticsInsert(record: OwnerAnalyticsSnapshotRecord) {
  return {
    location_reference: record.locationReference,
    business_date: record.businessDate,
    booked_count: record.bookedCount,
    completed_services_count: record.completedServicesCount,
    paid_appointments_count: record.paidAppointmentsCount,
    revenue_total: record.revenueTotal,
    tip_total: record.tipTotal,
    outstanding_balance: record.outstandingBalance,
    updated_at: record.updatedAt
  };
}

function createMockOperationsPersistenceProvider(): OperationsPersistenceProvider {
  return {
    kind: "mock",
    async syncWorkflowEnvelope(input) {
      return {
        provider: "mock",
        persisted: false,
        workflowEventStored: Boolean(input.workflowEvent),
        compensationStored: Boolean(input.compensationSnapshot),
        ownerAnalyticsStored: Boolean(input.ownerAnalyticsSnapshot),
        message: "Supabase service role key is not configured. Running in local demo sync mode."
      };
    }
  };
}

function createSupabaseOperationsPersistenceProvider(): OperationsPersistenceProvider {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return createMockOperationsPersistenceProvider();
  }

  return {
    kind: "supabase",
    async syncWorkflowEnvelope(input) {
      const workflowEventInsert = toWorkflowEventInsert(input.workflowEvent);
      const workflowResult = await supabase.from("workflow_events").insert(workflowEventInsert);
      if (workflowResult.error) {
        throw workflowResult.error;
      }

      let compensationStored = false;
      if (input.compensationSnapshot) {
        const compensationResult = await supabase
          .from("compensation_snapshots")
          .upsert(toCompensationInsert(input.compensationSnapshot), { onConflict: "appointment_reference" });

        if (compensationResult.error) {
          throw compensationResult.error;
        }

        compensationStored = true;
      }

      const analyticsResult = await supabase
        .from("owner_daily_analytics")
        .upsert(toOwnerAnalyticsInsert(input.ownerAnalyticsSnapshot), { onConflict: "location_reference,business_date" });

      if (analyticsResult.error) {
        throw analyticsResult.error;
      }

      return {
        provider: "supabase",
        persisted: true,
        workflowEventStored: true,
        compensationStored,
        ownerAnalyticsStored: true,
        message: "Supabase operational sync completed."
      };
    }
  };
}

export async function getOperationsPersistenceProvider(): Promise<OperationsPersistenceProvider> {
  return createSupabaseAdminClient() ? createSupabaseOperationsPersistenceProvider() : createMockOperationsPersistenceProvider();
}
