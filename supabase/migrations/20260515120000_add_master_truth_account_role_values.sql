alter type public.app_role add value if not exists 'client_user';
alter type public.app_role add value if not exists 'barber_user';
alter type public.app_role add value if not exists 'shop_owner_user';

alter type public.barber_subtype add value if not exists 'booth_rent';
