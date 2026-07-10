alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.current_auth_email() set search_path = public, auth, pg_temp;
alter function public.claim_public_username(text, text, text, uuid, text) set search_path = public, auth, pg_temp;

revoke execute on function public.can_access_verification_storage_object(text, text) from public, anon;
revoke execute on function public.current_profile_role() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_platform_admin_request() from public, anon;
revoke execute on function public.is_verification_document_subject(uuid, public.verification_owner_type, text) from public, anon;

grant execute on function public.can_access_verification_storage_object(text, text) to authenticated, service_role;
grant execute on function public.current_profile_role() to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.is_platform_admin_request() to authenticated, service_role;
grant execute on function public.is_verification_document_subject(uuid, public.verification_owner_type, text) to authenticated, service_role;
