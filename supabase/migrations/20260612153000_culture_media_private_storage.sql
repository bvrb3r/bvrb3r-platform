-- Culture media is uploaded only through the authenticated Next.js API route,
-- which uses the server-side Supabase service client after role/ownership checks.
-- Keep the bucket private and avoid storage.objects policies here because some
-- hosted migration runners cannot own or alter the storage.objects relation.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('culture-media', 'culture-media', false)
  on conflict (id) do update
    set public = false;
exception
  when insufficient_privilege then
    raise notice 'Skipping culture-media bucket upsert because this migration role cannot manage storage.buckets. Create or verify a private culture-media bucket before enabling media uploads.';
end
$$;
