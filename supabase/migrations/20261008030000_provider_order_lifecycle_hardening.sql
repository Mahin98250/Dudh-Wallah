-- Doodhwala Phase 2 order lifecycle hardening.
-- Provider acceptance windows are enforced server-side and the public RPC is authenticated-only.

create or replace function private.provider_update_order_status_impl(
  p_order_id uuid,
  p_new_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_order public.orders%rowtype;
  v_reason text:=left(nullif(trim(p_reason),''),300);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_order
  from public.orders
  where id=p_order_id and provider_owner_id=v_uid
  for update;

  if not found then raise exception 'order_not_found_or_not_provider'; end if;
  if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled') then
    raise exception 'invalid_order_status';
  end if;
  if p_new_status in ('rejected','cancelled') and v_reason is null then raise exception 'reason_required'; end if;

  if v_order.status='placed'
     and p_new_status='accepted'
     and v_order.acceptance_deadline_at is not null
     and now()>v_order.acceptance_deadline_at then
    raise exception 'acceptance_window_expired';
  end if;

  if not (
    (v_order.status='placed' and p_new_status in ('accepted','rejected','cancelled'))
    or (v_order.status='accepted' and p_new_status in ('preparing','cancelled'))
    or (v_order.status='preparing' and p_new_status in ('ready','cancelled'))
    or (v_order.status='ready' and p_new_status in ('out_for_delivery','cancelled'))
    or (v_order.status='out_for_delivery' and p_new_status in ('delivered','cancelled'))
  ) then
    raise exception 'invalid_order_status_transition:%:%',v_order.status,p_new_status;
  end if;

  update public.orders
  set status=p_new_status,
      status_reason=v_reason,
      acceptance_deadline_at=case when p_new_status='accepted' then null else acceptance_deadline_at end,
      updated_at=now()
  where id=p_order_id;

  if p_new_status='accepted' then
    perform private.set_order_delivery_promise(p_order_id);
  end if;

  if p_new_status='delivered' then
    update public.orders
    set promised_delivery_at=coalesce(promised_delivery_at,now()),
        late_after_at=coalesce(late_after_at,now()),
        updated_at=now()
    where id=p_order_id;
  end if;

  return jsonb_build_object(
    'id',p_order_id,
    'status',p_new_status,
    'status_reason',v_reason,
    'promised_delivery_at',(select promised_delivery_at from public.orders where id=p_order_id),
    'estimated_delivery_min_minutes',(select estimated_delivery_min_minutes from public.orders where id=p_order_id),
    'estimated_delivery_max_minutes',(select estimated_delivery_max_minutes from public.orders where id=p_order_id)
  );
end
$$;

revoke execute on function public.provider_update_order_status(uuid,text,text) from public,anon;
grant execute on function public.provider_update_order_status(uuid,text,text) to authenticated;
revoke execute on function private.provider_update_order_status_impl(uuid,text,text) from public,anon;
grant execute on function private.provider_update_order_status_impl(uuid,text,text) to authenticated;
