-- Doodhwala admin provider-review secure wrapper.
-- Public API wrapper is SECURITY INVOKER; privileged implementation is private.

create or replace function private.admin_set_provider_review_impl(
  p_provider_id uuid,p_status text,p_notes text default null,p_is_active boolean default null
)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp'
as $$
declare v_uid uuid:=auth.uid();v_status text:=lower(trim(coalesce(p_status,'')));v_active boolean;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  if v_status not in ('pending','approved','rejected') then raise exception 'invalid_provider_review_status'; end if;
  select is_active into v_active from public.provider_profiles where id=p_provider_id for update;
  if not found then raise exception 'provider_not_found'; end if;
  insert into public.provider_verifications(provider_id,status,notes,reviewed_at)
  values(p_provider_id,v_status,left(nullif(trim(p_notes),''),500),case when v_status='pending' then null else now() end)
  on conflict(provider_id) do update set status=excluded.status,notes=excluded.notes,reviewed_at=excluded.reviewed_at;
  if p_is_active is not null then
    update public.provider_profiles set is_active=p_is_active,updated_at=now() where id=p_provider_id;
  elsif v_status='approved' then
    update public.provider_profiles set is_active=true,updated_at=now() where id=p_provider_id;
  elsif v_status='rejected' then
    update public.provider_profiles set is_active=false,updated_at=now() where id=p_provider_id;
  end if;
  return jsonb_build_object('provider_id',p_provider_id,'verification_status',v_status,'is_active',
    (select is_active from public.provider_profiles where id=p_provider_id));
end $$;
revoke all on function private.admin_set_provider_review_impl(uuid,text,text,boolean) from public,anon,authenticated;

create or replace function public.admin_set_provider_review(
  p_provider_id uuid,p_status text,p_notes text default null,p_is_active boolean default null
)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_set_provider_review_impl(p_provider_id,p_status,p_notes,p_is_active); $$;

revoke all on function public.admin_set_provider_review(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_provider_review(uuid,text,text,boolean) to authenticated;
