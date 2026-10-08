-- Record provider moderation actions in the private admin audit log.
create or replace function private.admin_set_provider_review_impl(
  p_provider_id uuid,
  p_status text,
  p_notes text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  if v_status not in ('pending','approved','rejected') then raise exception 'invalid_provider_review_status'; end if;

  perform 1 from public.provider_profiles where id=p_provider_id for update;
  if not found then raise exception 'provider_not_found'; end if;

  insert into public.provider_verifications(provider_id,status,notes,reviewed_at)
  values(p_provider_id,v_status,left(nullif(trim(p_notes),''),500),case when v_status='pending' then null else now() end)
  on conflict(provider_id) do update
  set status=excluded.status,notes=excluded.notes,reviewed_at=excluded.reviewed_at;

  if p_is_active is not null then
    update public.provider_profiles set is_active=p_is_active,updated_at=now() where id=p_provider_id;
  elsif v_status='approved' then
    update public.provider_profiles set is_active=true,updated_at=now() where id=p_provider_id;
  elsif v_status='rejected' then
    update public.provider_profiles set is_active=false,updated_at=now() where id=p_provider_id;
  end if;

  insert into private.admin_audit_log(actor_user_id,action,entity_type,entity_id,details)
  values(
    v_uid,'provider_review_updated','provider',p_provider_id,
    jsonb_build_object(
      'status',v_status,
      'notes',left(nullif(trim(p_notes),''),500),
      'is_active',coalesce(p_is_active,(select is_active from public.provider_profiles where id=p_provider_id))
    )
  );

  return jsonb_build_object(
    'provider_id',p_provider_id,
    'verification_status',v_status,
    'is_active',(select is_active from public.provider_profiles where id=p_provider_id)
  );
end
$$;
