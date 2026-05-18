import type { ArchitectSqlSnippet } from "@/lib/architect/debug/types";

function sqlString(value: string) {
  return value.replaceAll("'", "''");
}

export function buildAppointmentSqlSnippets(appointmentId: string): ArchitectSqlSnippet[] {
  const id = sqlString(appointmentId);
  return [
    {
      label: "Appointment lifecycle",
      sql: `select id,status,completed_at,updated_at from appointments where id = '${id}';`
    },
    {
      label: "Payment capture",
      sql: `select id,appointment_id,amount,status,payment_status,currency,paid_at from payments where appointment_id = '${id}';`
    },
    {
      label: "Payment routing",
      sql: `select id,appointment_id,payment_id,barber_id,shop_id,routing_model,payout_recipient_type,provider_gross_amount,platform_fee_amount,barber_payout_amount,shop_split_amount,payout_readiness_status,money_routing_status,eligible_at,released_at,blocked_reason from payment_routing_records where appointment_id = '${id}';`
    },
    {
      label: "Status history",
      sql: `select appointment_id,status,old_status,new_status,change_reason,changed_at from appointment_status_history where appointment_id = '${id}' order by changed_at desc;`
    },
    {
      label: "Routing schema",
      sql: "select column_name,data_type,is_nullable from information_schema.columns where table_name = 'payment_routing_records' order by ordinal_position;"
    },
    {
      label: "Routing constraints",
      sql: "select constraint_name,check_clause from information_schema.check_constraints where constraint_name like 'payment_routing_records%';"
    }
  ];
}
