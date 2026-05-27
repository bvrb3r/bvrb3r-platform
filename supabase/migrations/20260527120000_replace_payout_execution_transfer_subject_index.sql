do $$
begin
  if to_regclass('public.payout_executions') is not null then
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.payout_executions'::regclass
        and conname = 'payout_executions_transfer_subject_uidx'
    ) then
      alter table public.payout_executions
        drop constraint payout_executions_transfer_subject_uidx;
    else
      drop index if exists public.payout_executions_transfer_subject_uidx;
    end if;
  end if;
end $$;

create unique index if not exists payout_executions_one_executed_transfer_per_subject_uidx
  on public.payout_executions (routing_record_id, target_subject_type)
  where routing_record_id is not null
    and target_subject_type is not null
    and execution_status = 'executed'
    and execution_type = 'transfer';

notify pgrst, 'reload schema';
