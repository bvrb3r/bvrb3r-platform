insert into storage.buckets (id, name, public)
values ('culture-media', 'culture-media', false)
on conflict (id) do nothing;

drop policy if exists "culture media storage author read" on storage.objects;
create policy "culture media storage author read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'culture-media'
    and (storage.foldername(name))[1] = 'culture'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "culture media storage author insert" on storage.objects;
create policy "culture media storage author insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'culture-media'
    and (storage.foldername(name))[1] = 'culture'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "culture media storage author update" on storage.objects;
create policy "culture media storage author update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'culture-media'
    and (storage.foldername(name))[1] = 'culture'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'culture-media'
    and (storage.foldername(name))[1] = 'culture'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

comment on policy "culture media storage author read" on storage.objects is 'Authors can read their own private Culture media paths. Public feed rendering uses server-generated signed display URLs only for approved posts.';
comment on policy "culture media storage author insert" on storage.objects is 'Authors can upload Culture media only under culture/{profile_id}/... paths.';
comment on policy "culture media storage author update" on storage.objects is 'Authors can replace Culture media only under their own culture/{profile_id}/... paths.';
