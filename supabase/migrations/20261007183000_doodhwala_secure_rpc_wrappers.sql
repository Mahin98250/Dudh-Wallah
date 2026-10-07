-- Doodhwala secure RPC wrappers.
-- Exposed API functions are SECURITY INVOKER; privileged implementations live in private schema.
-- This preserves authorization while reducing exposed SECURITY DEFINER surface.

create or replace function private.admin_list_orders_impl(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select o.id,o.status,o.subtotal,o.delivery_fee,o.total,o.created_at,o.updated_at,o.delivery_recipient_name,
      o.delivery_area_name,o.delivery_city,o.delivery_pin_code,p.display_name provider_name,pr.full_name customer_name
    from public.orders o left join public.provider_profiles p on p.id=o.provider_id
      left join public.profiles pr on pr.id=o.customer_id
    order by o.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x),'[]'::jsonb);
end $$;
revoke all on function private.admin_list_orders_impl(integer) from public,anon,authenticated;

create or replace function private.admin_list_providers_impl(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select pp.id,pp.display_name,pp.owner_name,pp.phone,pp.area_name,pp.city,pp.pin_code,pp.is_active,pp.rating_avg,
      pp.max_open_orders,pp.max_daily_litres,pp.created_at,coalesce(pv.status,'pending') verification_status,
      (select count(*) from public.milk_products mp where mp.provider_id=pp.id and mp.is_active) product_count
    from public.provider_profiles pp left join public.provider_verifications pv on pv.provider_id=pp.id
    order by pp.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x),'[]'::jsonb);
end $$;
revoke all on function private.admin_list_providers_impl(integer) from public,anon,authenticated;

create or replace function private.admin_list_customers_impl(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select pr.id,pr.full_name,pr.phone,pr.account_type,pr.created_at,au.email,
      (select count(*) from public.orders o where o.customer_id=pr.id) order_count,
      (select count(*) from public.milk_subscriptions s where s.customer_id=pr.id and s.status='active') active_plan_count
    from public.profiles pr left join auth.users au on au.id=pr.id
    order by pr.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x),'[]'::jsonb);
end $$;
revoke all on function private.admin_list_customers_impl(integer) from public,anon,authenticated;

create or replace function private.admin_list_subscriptions_impl(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select s.id,s.status,s.quantity_litres,s.price_per_litre,s.delivery_time,s.start_date,s.end_date,s.days_of_week,s.created_at,
      pr.full_name customer_name,pp.display_name provider_name,mp.name product_name,
      (select count(*) from public.subscription_deliveries sd where sd.subscription_id=s.id) delivery_count
    from public.milk_subscriptions s left join public.profiles pr on pr.id=s.customer_id
      left join public.provider_profiles pp on pp.id=s.provider_id left join public.milk_products mp on mp.id=s.product_id
    order by s.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x),'[]'::jsonb);
end $$;
revoke all on function private.admin_list_subscriptions_impl(integer) from public,anon,authenticated;

create or replace function public.admin_list_orders(p_limit integer default 100)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_list_orders_impl(p_limit); $$;
create or replace function public.admin_list_providers(p_limit integer default 100)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_list_providers_impl(p_limit); $$;
create or replace function public.admin_list_customers(p_limit integer default 100)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_list_customers_impl(p_limit); $$;
create or replace function public.admin_list_subscriptions(p_limit integer default 100)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_list_subscriptions_impl(p_limit); $$;

revoke all on function public.admin_list_orders(integer) from public,anon,authenticated;
revoke all on function public.admin_list_providers(integer) from public,anon,authenticated;
revoke all on function public.admin_list_customers(integer) from public,anon,authenticated;
revoke all on function public.admin_list_subscriptions(integer) from public,anon,authenticated;
grant execute on function public.admin_list_orders(integer) to authenticated;
grant execute on function public.admin_list_providers(integer) to authenticated;
grant execute on function public.admin_list_customers(integer) to authenticated;
grant execute on function public.admin_list_subscriptions(integer) to authenticated;

create or replace function private.provider_update_order_status_impl(p_order_id uuid,p_new_status text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare v_uid uuid:=auth.uid();v_order public.orders%rowtype;v_reason text:=left(nullif(trim(p_reason),''),300);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.orders where id=p_order_id and provider_owner_id=v_uid for update;
  if not found then raise exception 'order_not_found_or_not_provider'; end if;
  if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled') then raise exception 'invalid_order_status'; end if;
  if p_new_status in ('rejected','cancelled') and v_reason is null then raise exception 'reason_required'; end if;
  if not ((v_order.status='placed' and p_new_status in ('accepted','rejected','cancelled'))
    or (v_order.status='accepted' and p_new_status in ('preparing','cancelled'))
    or (v_order.status='preparing' and p_new_status in ('ready','cancelled'))
    or (v_order.status='ready' and p_new_status in ('out_for_delivery','cancelled'))
    or (v_order.status='out_for_delivery' and p_new_status in ('delivered','cancelled')))
    then raise exception 'invalid_order_status_transition:%:%',v_order.status,p_new_status; end if;
  update public.orders set status=p_new_status,status_reason=v_reason,updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',p_new_status,'status_reason',v_reason);
end $$;
revoke all on function private.provider_update_order_status_impl(uuid,text,text) from public,anon,authenticated;

create or replace function public.provider_update_order_status(p_order_id uuid,p_new_status text,p_reason text default null)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.provider_update_order_status_impl(p_order_id,p_new_status,p_reason); $$;
revoke all on function public.provider_update_order_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.provider_update_order_status(uuid,text,text) to authenticated;

create or replace function private.customer_cancel_order_impl(p_order_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare v_uid uuid:=auth.uid();v_order public.orders%rowtype;v_reason text:=coalesce(left(nullif(trim(p_reason),''),300),'Cancelled by customer');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_uid for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('placed','accepted') then raise exception 'order_cannot_be_cancelled_now'; end if;
  update public.orders set status='cancelled',status_reason=v_reason,updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status','cancelled','status_reason',v_reason);
end $$;
revoke all on function private.customer_cancel_order_impl(uuid,text) from public,anon,authenticated;

create or replace function public.customer_cancel_order(p_order_id uuid,p_reason text default null)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.customer_cancel_order_impl(p_order_id,p_reason); $$;
revoke all on function public.customer_cancel_order(uuid,text) from public,anon,authenticated;
grant execute on function public.customer_cancel_order(uuid,text) to authenticated;
