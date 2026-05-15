-- Master truth: profiles.role is account identity only.
-- Valid production identities are client_user, barber_user, and shop_owner_user.
-- Barber money relationships live on barbers/shop relationships, not profiles.role.

do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.profiles
    set role = 'client_user'::public.app_role
    where role::text = 'client';

    update public.profiles
    set role = 'barber_user'::public.app_role
    where role::text in ('barber', 'freelance_barber', 'booth_rent_barber', 'commission_barber');

    update public.profiles
    set role = 'shop_owner_user'::public.app_role
    where role::text in ('owner', 'shop_owner');
  end if;
end $$;

do $$
begin
  if to_regclass('public.user_roles') is not null then
    update public.user_roles
    set role = 'client_user'
    where role = 'client';

    update public.user_roles
    set role = 'barber_user'
    where role in ('barber', 'freelance_barber', 'booth_rent_barber', 'commission_barber');

    update public.user_roles
    set role = 'shop_owner_user'
    where role in ('owner', 'shop_owner');
  end if;
end $$;

do $$
begin
  if to_regclass('public.barbers') is not null then
    update public.barbers
    set barber_subtype = 'booth_rent'::public.barber_subtype
    where barber_subtype::text = 'blueprint';

    update public.barbers
    set barber_subtype = 'freelance'::public.barber_subtype
    where barber_subtype is null;

    update public.barbers
    set shop_approval_status = 'not_required'::public.approval_status
    where barber_subtype = 'freelance'::public.barber_subtype
      and shop_approval_status is distinct from 'not_required'::public.approval_status;
  end if;
end $$;

do $$
begin
  if to_regclass('public.barbers') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'barbers'
        and column_name = 'default_money_relationship'
    ) then
    execute $sql$
      update public.barbers
      set default_money_relationship = coalesce(default_money_relationship, barber_subtype::text, 'freelance')
      where default_money_relationship is null
    $sql$;

    execute $sql$
      update public.barbers
      set default_money_relationship = 'freelance'
      where barber_subtype::text = 'freelance'
        and default_money_relationship is distinct from 'freelance'
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.availability_rules') is not null
    and to_regclass('public.barber_working_hours') is not null
    and to_regclass('public.barbers') is not null
    and to_regclass('public.locations') is not null then
    insert into public.availability_rules (
      barber_id,
      location_id,
      weekday,
      start_time,
      end_time
    )
    select
      b.id,
      l.id,
      wh.weekday,
      wh.start_time,
      wh.end_time
    from public.barber_working_hours wh
    join public.barbers b
      on wh.barber_reference in (b.reference_code, b.id::text, b.profile_id::text, coalesce(b.booking_slug, ''))
    join public.locations l
      on wh.shop_reference in (l.id::text, coalesce(l.reference_code, ''))
    where not exists (
      select 1
      from public.availability_rules ar
      where ar.barber_id = b.id
        and ar.location_id = l.id
        and ar.weekday = wh.weekday
        and ar.start_time = wh.start_time
        and ar.end_time = wh.end_time
    );
  end if;
end $$;

-- Production cleanup checks:
-- select count(*) from public.profiles where role::text in ('client', 'barber', 'freelance_barber', 'booth_rent_barber', 'commission_barber', 'owner', 'shop_owner');
-- select count(*) from public.user_roles where role in ('client', 'barber', 'freelance_barber', 'booth_rent_barber', 'commission_barber', 'owner', 'shop_owner');
