-- Doodhwala Phase 2 provider operations
-- Live provider dashboard state, secure catalog mutation, store control, and subscriptions.

create or replace function private.provider_get_dashboard_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_provider public.provider_profiles%rowtype;
  v_verification text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_provider
  from public.provider_profiles
  where owner_user_id=v_uid
  limit 1;
  if not found then raise exception 'provider_not_found'; end if;

  select coalesce(status,'pending') into v_verification
  from public.provider_verifications
  where provider_id=v_provider.id;

  select jsonb_build_object(
    'provider',to_jsonb(v_provider),
    'verification_status',coalesce(v_verification,'pending'),
    'service_area',(select to_jsonb(a) from public.provider_service_areas a where a.provider_id=v_provider.id),
    'products',coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.created_at desc)
      from public.milk_products mp
      where mp.provider_id=v_provider.id
    ),'[]'::jsonb),
    'metrics',jsonb_build_object(
      'orders_today',(select count(*) from public.orders o where o.provider_id=v_provider.id and (o.created_at at time zone 'Asia/Kolkata')::date=current_date),
      'open_orders',(select count(*) from public.orders o where o.provider_id=v_provider.id and o.status in ('placed','accepted','preparing','ready','out_for_delivery')),
      'delivered_today',(select count(*) from public.orders o where o.provider_id=v_provider.id and o.status='delivered' and (o.created_at at time zone 'Asia/Kolkata')::date=current_date),
      'sales_today',(select coalesce(round(sum(o.total) filter(where o.status='delivered'),2),0) from public.orders o where o.provider_id=v_provider.id and (o.created_at at time zone 'Asia/Kolkata')::date=current_date),
      'litres_today',(select coalesce(round(sum(oi.quantity),2),0) from public.order_items oi join public.orders o on o.id=oi.order_id where o.provider_id=v_provider.id and o.status='delivered' and (o.created_at at time zone 'Asia/Kolkata')::date=current_date),
      'active_subscriptions',(select count(*) from public.milk_subscriptions s where s.provider_id=v_provider.id and s.status='active')
    )
  ) into v_result;
  return v_result;
end
$$;

create or replace function public.provider_get_dashboard()
returns jsonb
language sql stable security invoker
set search_path to 'public','pg_temp'
as $$ select private.provider_get_dashboard_impl() $$;

create or replace function private.provider_set_store_status_impl(p_provider_id uuid,p_accepting_orders boolean)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.provider_profiles where id=p_provider_id and owner_user_id=v_uid) then raise exception 'provider_not_found_or_not_owner'; end if;
  update public.provider_profiles set accepting_orders=coalesce(p_accepting_orders,accepting_orders),updated_at=now()
  where id=p_provider_id;
  return (select to_jsonb(pp) from public.provider_profiles pp where pp.id=p_provider_id);
end
$$;

create or replace function public.provider_set_store_status(p_provider_id uuid,p_accepting_orders boolean)
returns jsonb language sql security invoker set search_path to 'public','pg_temp'
as $$ select private.provider_set_store_status_impl(p_provider_id,p_accepting_orders) $$;

create or replace function private.provider_upsert_product_impl(
  p_provider_id uuid,p_product_id uuid,p_name text,p_milk_type text,
  p_price_per_litre numeric,p_unit_label text,p_stock boolean,p_daily_available boolean,p_is_active boolean
)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid:=coalesce(p_product_id,gen_random_uuid());
  v_type text:=lower(trim(coalesce(p_milk_type,'')));
  v_name text:=left(trim(coalesce(p_name,'')),160);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.provider_profiles where id=p_provider_id and owner_user_id=v_uid) then raise exception 'provider_not_found_or_not_owner'; end if;
  if v_name='' then raise exception 'product_name_required'; end if;
  if v_type not in ('cow','buffalo','a2','mixed') then raise exception 'invalid_milk_type'; end if;
  if p_price_per_litre is null or p_price_per_litre<=0 or p_price_per_litre>=10000 then raise exception 'invalid_product_price'; end if;
  if p_product_id is not null and not exists(select 1 from public.milk_products where id=p_product_id and provider_id=p_provider_id) then raise exception 'product_not_found'; end if;

  insert into public.milk_products(id,provider_id,name,milk_type,price_per_litre,unit_label,stock,daily_available,is_active,updated_at)
  values(v_id,p_provider_id,v_name,v_type,p_price_per_litre,left(coalesce(p_unit_label,'1 L'),40),coalesce(p_stock,true),coalesce(p_daily_available,true),coalesce(p_is_active,true),now())
  on conflict(id) do update set
    name=excluded.name,milk_type=excluded.milk_type,price_per_litre=excluded.price_per_litre,
    unit_label=excluded.unit_label,stock=excluded.stock,daily_available=excluded.daily_available,
    is_active=excluded.is_active,updated_at=now();

  return (select to_jsonb(mp) from public.milk_products mp where mp.id=v_id);
end
$$;

create or replace function public.provider_upsert_product(
  p_provider_id uuid,p_product_id uuid,p_name text,p_milk_type text,p_price_per_litre numeric,
  p_unit_label text,p_stock boolean,p_daily_available boolean,p_is_active boolean
)
returns jsonb language sql security invoker set search_path to 'public','pg_temp'
as $$ select private.provider_upsert_product_impl(
  p_provider_id,p_product_id,p_name,p_milk_type,p_price_per_litre,p_unit_label,p_stock,p_daily_available,p_is_active
) $$;

create or replace function private.provider_delete_product_impl(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid(); v_deleted jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  delete from public.milk_products mp
  where mp.id=p_product_id
    and exists(select 1 from public.provider_profiles pp where pp.id=mp.provider_id and pp.owner_user_id=v_uid)
  returning to_jsonb(mp) into v_deleted;
  if v_deleted is null then raise exception 'product_not_found_or_not_owner'; end if;
  return v_deleted;
end
$$;

create or replace function public.provider_delete_product(p_product_id uuid)
returns jsonb language sql security invoker set search_path to 'public','pg_temp'
as $$ select private.provider_delete_product_impl(p_product_id) $$;

create or replace function private.provider_get_subscriptions_impl(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select s.id,s.status,s.quantity_litres,s.price_per_litre,s.delivery_time,s.timezone_name,
             s.start_date,s.end_date,s.days_of_week,s.cutoff_minutes,s.price_policy,
             s.customer_note,s.paused_until,s.created_at,
             pr.full_name customer_name,pr.phone customer_phone,mp.name product_name,
             (select count(*) from public.subscription_deliveries sd where sd.subscription_id=s.id) delivery_count,
             (select count(*) from public.subscription_deliveries sd where sd.subscription_id=s.id and sd.status in ('scheduled','materialized')) pending_deliveries
      from public.milk_subscriptions s
      join public.provider_profiles pp on pp.id=s.provider_id
      left join public.profiles pr on pr.id=s.customer_id
      left join public.milk_products mp on mp.id=s.product_id
      where pp.owner_user_id=v_uid
      order by s.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),300))
    ) x
  ),'[]'::jsonb);
end
$$;

create or replace function public.provider_get_subscriptions(p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path to 'public','pg_temp'
as $$ select private.provider_get_subscriptions_impl(p_limit) $$;

revoke execute on function public.provider_get_dashboard() from public,anon;
revoke execute on function public.provider_set_store_status(uuid,boolean) from public,anon;
revoke execute on function public.provider_upsert_product(uuid,uuid,text,text,numeric,text,boolean,boolean,boolean) from public,anon;
revoke execute on function public.provider_delete_product(uuid) from public,anon;
revoke execute on function public.provider_get_subscriptions(integer) from public,anon;

grant execute on function public.provider_get_dashboard() to authenticated;
grant execute on function public.provider_set_store_status(uuid,boolean) to authenticated;
grant execute on function public.provider_upsert_product(uuid,uuid,text,text,numeric,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.provider_delete_product(uuid) to authenticated;
grant execute on function public.provider_get_subscriptions(integer) to authenticated;

revoke execute on function private.provider_get_dashboard_impl() from public,anon;
revoke execute on function private.provider_set_store_status_impl(uuid,boolean) from public,anon;
revoke execute on function private.provider_upsert_product_impl(uuid,uuid,text,text,numeric,text,boolean,boolean,boolean) from public,anon;
revoke execute on function private.provider_delete_product_impl(uuid) from public,anon;
revoke execute on function private.provider_get_subscriptions_impl(integer) from public,anon;

grant execute on function private.provider_get_dashboard_impl() to authenticated;
grant execute on function private.provider_set_store_status_impl(uuid,boolean) to authenticated;
grant execute on function private.provider_upsert_product_impl(uuid,uuid,text,text,numeric,text,boolean,boolean,boolean) to authenticated;
grant execute on function private.provider_delete_product_impl(uuid) to authenticated;
grant execute on function private.provider_get_subscriptions_impl(integer) to authenticated;
