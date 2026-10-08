-- Doodhwala Admin Control Center
-- Reproducible schema for provider operations, catalog controls, order detail, and audit logging.

create table if not exists private.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on private.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_entity_idx
  on private.admin_audit_log(entity_type,entity_id,created_at desc);

alter table private.admin_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='private'
      and tablename='admin_audit_log'
      and policyname='deny_direct_admin_audit_access'
  ) then
    execute 'create policy "deny_direct_admin_audit_access" on private.admin_audit_log for all to authenticated using (false) with check (false)';
  end if;
end
$$;

revoke all on private.admin_audit_log from public,anon,authenticated;

create or replace function private.admin_get_provider_detail_impl(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  select jsonb_build_object(
    'provider', to_jsonb(pp),
    'verification', to_jsonb(pv),
    'service_area', to_jsonb(psa),
    'products', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.created_at desc)
      from public.milk_products mp
      where mp.provider_id=pp.id
    ),'[]'::jsonb)
  ) into v_result
  from public.provider_profiles pp
  left join public.provider_verifications pv on pv.provider_id=pp.id
  left join public.provider_service_areas psa on psa.provider_id=pp.id
  where pp.id=p_provider_id;
  if v_result is null then raise exception 'provider_not_found'; end if;
  return v_result;
end
$$;

create or replace function public.admin_get_provider_detail(p_provider_id uuid)
returns jsonb
language sql
stable
set search_path to 'public','pg_temp'
as $$ select private.admin_get_provider_detail_impl(p_provider_id) $$;

create or replace function private.admin_set_provider_service_area_impl(
  p_provider_id uuid,p_label text,p_latitude numeric,p_longitude numeric,p_service_radius_km numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_label text:=left(trim(coalesce(p_label,'')),120);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  if not exists(select 1 from public.provider_profiles where id=p_provider_id) then raise exception 'provider_not_found'; end if;
  if p_latitude is null or p_longitude is null then raise exception 'service_area_location_required'; end if;
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then raise exception 'invalid_service_area_location'; end if;
  if p_service_radius_km is null or p_service_radius_km <= 0 or p_service_radius_km > 25 then raise exception 'invalid_service_radius'; end if;
  if v_label='' then raise exception 'service_area_label_required'; end if;
  insert into public.provider_service_areas(provider_id,label,latitude,longitude,service_radius_km,updated_at)
  values(p_provider_id,v_label,p_latitude,p_longitude,p_service_radius_km,now())
  on conflict(provider_id) do update set
    label=excluded.label,latitude=excluded.latitude,longitude=excluded.longitude,
    service_radius_km=excluded.service_radius_km,updated_at=now();
  insert into private.admin_audit_log(actor_user_id,action,entity_type,entity_id,details)
  values(v_uid,'service_area_updated','provider',p_provider_id,
    jsonb_build_object('label',v_label,'service_radius_km',p_service_radius_km));
  return (select to_jsonb(psa) from public.provider_service_areas psa where psa.provider_id=p_provider_id);
end
$$;

create or replace function public.admin_set_provider_service_area(
  p_provider_id uuid,p_label text,p_latitude numeric,p_longitude numeric,p_service_radius_km numeric
)
returns jsonb
language sql
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_set_provider_service_area_impl(p_provider_id,p_label,p_latitude,p_longitude,p_service_radius_km) $$;

create or replace function private.admin_set_provider_controls_impl(
  p_provider_id uuid,p_is_active boolean,p_accepting_orders boolean,
  p_max_open_orders integer,p_max_daily_litres numeric,p_acceptance_timeout_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_approved boolean;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  if not exists(select 1 from public.provider_profiles where id=p_provider_id) then raise exception 'provider_not_found'; end if;
  select exists(select 1 from public.provider_verifications where provider_id=p_provider_id and status='approved') into v_approved;
  if coalesce(p_is_active,false) and not v_approved then raise exception 'provider_must_be_approved'; end if;
  if p_max_open_orders is null or p_max_open_orders < 1 or p_max_open_orders > 500 then raise exception 'invalid_max_open_orders'; end if;
  if p_max_daily_litres is null or p_max_daily_litres <= 0 or p_max_daily_litres > 100000 then raise exception 'invalid_max_daily_litres'; end if;
  if p_acceptance_timeout_minutes is null or p_acceptance_timeout_minutes < 1 or p_acceptance_timeout_minutes > 120 then raise exception 'invalid_acceptance_timeout'; end if;
  update public.provider_profiles
  set is_active=coalesce(p_is_active,is_active),
      accepting_orders=coalesce(p_accepting_orders,accepting_orders),
      max_open_orders=p_max_open_orders,
      max_daily_litres=p_max_daily_litres,
      acceptance_timeout_minutes=p_acceptance_timeout_minutes,
      updated_at=now()
  where id=p_provider_id;
  insert into private.admin_audit_log(actor_user_id,action,entity_type,entity_id,details)
  values(v_uid,'provider_controls_updated','provider',p_provider_id,
    jsonb_build_object('is_active',p_is_active,'accepting_orders',p_accepting_orders,
      'max_open_orders',p_max_open_orders,'max_daily_litres',p_max_daily_litres,
      'acceptance_timeout_minutes',p_acceptance_timeout_minutes));
  return (select to_jsonb(pp) from public.provider_profiles pp where pp.id=p_provider_id);
end
$$;

create or replace function public.admin_set_provider_controls(
 p_provider_id uuid,p_is_active boolean,p_accepting_orders boolean,p_max_open_orders integer,
 p_max_daily_litres numeric,p_acceptance_timeout_minutes integer
)
returns jsonb
language sql
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_set_provider_controls_impl(
  p_provider_id,p_is_active,p_accepting_orders,p_max_open_orders,p_max_daily_litres,p_acceptance_timeout_minutes
) $$;

create or replace function private.admin_set_product_state_impl(
  p_product_id uuid,p_is_active boolean,p_stock boolean,p_daily_available boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_provider_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  select provider_id into v_provider_id from public.milk_products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  update public.milk_products
  set is_active=coalesce(p_is_active,is_active),
      stock=coalesce(p_stock,stock),
      daily_available=coalesce(p_daily_available,daily_available),
      updated_at=now()
  where id=p_product_id;
  insert into private.admin_audit_log(actor_user_id,action,entity_type,entity_id,details)
  values(v_uid,'product_state_updated','product',p_product_id,
    jsonb_build_object('provider_id',v_provider_id,'is_active',p_is_active,'stock',p_stock,'daily_available',p_daily_available));
  return (select to_jsonb(mp) from public.milk_products mp where mp.id=p_product_id);
end
$$;

create or replace function public.admin_set_product_state(
 p_product_id uuid,p_is_active boolean,p_stock boolean,p_daily_available boolean
)
returns jsonb
language sql
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_set_product_state_impl(p_product_id,p_is_active,p_stock,p_daily_available) $$;

create or replace function private.admin_list_products_impl(p_limit integer default 150)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
    from (
      select mp.id,mp.provider_id,mp.name,mp.milk_type,mp.price_per_litre,mp.unit_label,
             mp.stock,mp.daily_available,mp.is_active,mp.created_at,mp.updated_at,
             pp.display_name provider_name,pp.is_active provider_active,
             coalesce(pv.status,'pending') verification_status
      from public.milk_products mp
      join public.provider_profiles pp on pp.id=mp.provider_id
      left join public.provider_verifications pv on pv.provider_id=pp.id
      order by mp.updated_at desc
      limit greatest(1,least(coalesce(p_limit,150),500))
    ) x
  ),'[]'::jsonb);
end
$$;

create or replace function public.admin_list_products(p_limit integer default 150)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_list_products_impl(p_limit) $$;

create or replace function private.admin_list_audit_log_impl(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,
             p.full_name actor_name,au.email actor_email
      from private.admin_audit_log a
      left join public.profiles p on p.id=a.actor_user_id
      left join auth.users au on au.id=a.actor_user_id
      order by a.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),500))
    ) x
  ),'[]'::jsonb);
end
$$;

create or replace function public.admin_list_audit_log(p_limit integer default 100)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_list_audit_log_impl(p_limit) $$;

create or replace function private.admin_get_order_detail_impl(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  select jsonb_build_object(
    'order',jsonb_build_object(
      'id',o.id,'status',o.status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,
      'customer_note',o.customer_note,'created_at',o.created_at,'updated_at',o.updated_at,
      'acceptance_deadline_at',o.acceptance_deadline_at,'estimated_delivery_min_minutes',o.estimated_delivery_min_minutes,
      'estimated_delivery_max_minutes',o.estimated_delivery_max_minutes,'promised_delivery_at',o.promised_delivery_at,
      'late_after_at',o.late_after_at,'status_reason',o.status_reason,
      'delivery_recipient_name',o.delivery_recipient_name,'delivery_phone',o.delivery_phone,
      'delivery_address_line',o.delivery_address_line,'delivery_area_name',o.delivery_area_name,
      'delivery_city',o.delivery_city,'delivery_pin_code',o.delivery_pin_code,
      'customer_name',cp.full_name,'provider_name',pp.display_name
    ),
    'items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.created_at asc) from public.order_items oi where oi.order_id=o.id),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(se) order by se.created_at asc) from public.order_status_events se where se.order_id=o.id),'[]'::jsonb),
    'rating',(select to_jsonb(r) from public.order_ratings r where r.order_id=o.id)
  )
  into v_result
  from public.orders o
  left join public.profiles cp on cp.id=o.customer_id
  left join public.provider_profiles pp on pp.id=o.provider_id
  where o.id=p_order_id;
  if v_result is null then raise exception 'order_not_found'; end if;
  return v_result;
end
$$;

create or replace function public.admin_get_order_detail(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_get_order_detail_impl(p_order_id) $$;

revoke execute on function public.admin_get_provider_detail(uuid) from public,anon;
revoke execute on function public.admin_set_provider_service_area(uuid,text,numeric,numeric,numeric) from public,anon;
revoke execute on function public.admin_set_provider_controls(uuid,boolean,boolean,integer,numeric,integer) from public,anon;
revoke execute on function public.admin_set_product_state(uuid,boolean,boolean,boolean) from public,anon;
revoke execute on function public.admin_list_products(integer) from public,anon;
revoke execute on function public.admin_list_audit_log(integer) from public,anon;
revoke execute on function public.admin_get_order_detail(uuid) from public,anon;

grant execute on function public.admin_get_provider_detail(uuid) to authenticated;
grant execute on function public.admin_set_provider_service_area(uuid,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.admin_set_provider_controls(uuid,boolean,boolean,integer,numeric,integer) to authenticated;
grant execute on function public.admin_set_product_state(uuid,boolean,boolean,boolean) to authenticated;
grant execute on function public.admin_list_products(integer) to authenticated;
grant execute on function public.admin_list_audit_log(integer) to authenticated;
grant execute on function public.admin_get_order_detail(uuid) to authenticated;

revoke execute on function private.admin_get_provider_detail_impl(uuid) from public,anon;
revoke execute on function private.admin_set_provider_service_area_impl(uuid,text,numeric,numeric,numeric) from public,anon;
revoke execute on function private.admin_set_provider_controls_impl(uuid,boolean,boolean,integer,numeric,integer) from public,anon;
revoke execute on function private.admin_set_product_state_impl(uuid,boolean,boolean,boolean) from public,anon;
revoke execute on function private.admin_list_products_impl(integer) from public,anon;
revoke execute on function private.admin_list_audit_log_impl(integer) from public,anon;
revoke execute on function private.admin_get_order_detail_impl(uuid) from public,anon;

grant execute on function private.admin_get_provider_detail_impl(uuid) to authenticated;
grant execute on function private.admin_set_provider_service_area_impl(uuid,text,numeric,numeric,numeric) to authenticated;
grant execute on function private.admin_set_provider_controls_impl(uuid,boolean,boolean,integer,numeric,integer) to authenticated;
grant execute on function private.admin_set_product_state_impl(uuid,boolean,boolean,boolean) to authenticated;
grant execute on function private.admin_list_products_impl(integer) to authenticated;
grant execute on function private.admin_list_audit_log_impl(integer) to authenticated;
grant execute on function private.admin_get_order_detail_impl(uuid) to authenticated;
