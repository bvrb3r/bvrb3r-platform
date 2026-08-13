-- Apply only after the environment-aware application build is fully serving
-- production traffic. Keeping this invariant out of the foundation migration
-- preserves compatibility with the previous direct-binding write during the
-- schema-first deployment window.

create or replace function private.enforce_connected_account_provider_binding_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.provider_account_id is not null
      or new.provider_environment is not null
      or new.provider_account_generation <> 0 then
      raise exception 'connected accounts must be inserted without a provider binding'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.provider_account_generation is distinct from old.provider_account_generation then
    if not (
      new.id is not distinct from old.id
      and new.provider is not distinct from old.provider
      and old.provider_account_id is not null
      and new.provider_account_id is null
      and new.provider_environment is null
      and new.provider_account_generation = old.provider_account_generation + 1
      and exists (
        select 1
        from public.connected_account_provider_bindings binding
        where binding.connected_account_id = old.id
          and binding.provider = old.provider
          and binding.provider_account_id = old.provider_account_id
          and (
            old.provider_environment is null
            or binding.provider_environment = old.provider_environment
          )
          and binding.binding_generation = old.provider_account_generation
          and binding.binding_status = 'archived'
      )
      and not exists (
        select 1
        from public.connected_account_provider_bindings binding
        where binding.connected_account_id = old.id
          and binding.binding_status = 'active'
      )
    ) then
      raise exception 'provider binding generation may only advance during a guarded reset'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if old.provider_account_id is not null
    and new.provider_account_id is null then
    raise exception 'provider bindings may only be cleared by the guarded reset function'
      using errcode = '23514';
  end if;

  if new.provider_account_id is null then
    if new.provider_environment is not null then
      raise exception 'an unbound connected account cannot have a provider environment'
        using errcode = '23514';
    end if;

    return new;
  end if;

  -- Existing legacy mappings can remain temporarily unclassified, but only
  -- while their account/provider/id/generation tuple stays unchanged.
  if new.provider_environment is null then
    if new.id is not distinct from old.id
      and old.provider_account_id is not null
      and old.provider_environment is null
      and new.provider is not distinct from old.provider
      and new.provider_account_id is not distinct from old.provider_account_id then
      return new;
    end if;

    raise exception 'a changed provider binding requires an explicit environment'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.connected_account_provider_bindings binding
    where binding.connected_account_id = new.id
      and binding.provider = new.provider
      and binding.provider_account_id = new.provider_account_id
      and binding.provider_environment = new.provider_environment
      and binding.binding_generation = new.provider_account_generation
      and binding.binding_status = 'active'
  ) then
    raise exception 'connected account provider tuple has no matching active binding'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_connected_account_provider_binding_invariant()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_connected_account_provider_binding_invariant
  on public.connected_accounts;

create trigger enforce_connected_account_provider_binding_invariant
before insert or update on public.connected_accounts
for each row execute function private.enforce_connected_account_provider_binding_invariant();
