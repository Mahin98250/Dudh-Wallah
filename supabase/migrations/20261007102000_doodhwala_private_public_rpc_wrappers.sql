-- Keep privileged implementation functions outside the exposed API schema.
-- Public wrappers stay SECURITY INVOKER while delegating to tightly scoped
-- private SECURITY DEFINER implementations.

create or replace function private.find_nearby_providers_private(
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_max_km numeric default 20
)
returns table(
  provider_id uuid, provider_name text, owner_name text, area_name text, city text, pin_code text,
  milk_type text, rating_avg numeric, delivery_from time, delivery_to time,
  latitude numeric, longitude numeric, distance_km numeric, products jsonb
)
language sql security definer set search_path = public, pg_temp
as $function$
  with base as (
    select pp.id, pp.display_name, pp.owner_name, pp.area_name, pp.city, pp.pin_code,
           pp.primary_milk_type, pp.rating_avg, pp.delivery_from, pp.delivery_to,
           psa.latitude, psa.longitude,
           case when p_latitude is null or p_longitude is null then null else
             6371.0 * 2 * asin(sqrt(
               power(sin(radians(psa.latitude - p_latitude) / 2), 2) +
               cos(radians(p_latitude)) * cos(radians(psa.latitude)) *
               power(sin(radians(psa.longitude - p_longitude) / 2), 2)
             )) end as distance_km
    from public.provider_profiles pp
    join public.provider_service_areas psa on psa.provider_id = pp.id
    where pp.is_active and exists (
      select 1 from public.provider_verifications pv
      where pv.provider_id = pp.id and pv.status = 'approved'
    )
  ),
  product_groups as (
    select mp.provider_id,
           jsonb_agg(jsonb_build_object(
             'id',mp.id,'name',mp.name,'milk_type',mp.milk_type,
             'price_per_litre',mp.price_per_litre,'unit_label',mp.unit_label,
             'daily_available',mp.daily_available
           ) order by mp.created_at) as products
    from public.milk_products mp
    where mp.is_active and mp.stock
    group by mp.provider_id
  )
  select b.id,b.display_name,b.owner_name,b.area_name,b.city,b.pin_code,b.primary_milk_type,
         b.rating_avg,b.delivery_from,b.delivery_to,b.latitude,b.longitude,
         round(b.distance_km::numeric,2),coalesce(pg.products,'[]'::jsonb)
  from base b left join product_groups pg on pg.provider_id=b.id
  where b.distance_km is null or b.distance_km <= least(p_max_km,25)
  order by b.distance_km nulls last,b.display_name;
$function$;

create or replace function public.find_nearby_providers(
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_max_km numeric default 20
)
returns table(
  provider_id uuid, provider_name text, owner_name text, area_name text, city text, pin_code text,
  milk_type text, rating_avg numeric, delivery_from time, delivery_to time,
  latitude numeric, longitude numeric, distance_km numeric, products jsonb
)
language sql security invoker set search_path = ''
as $function$
  select * from private.find_nearby_providers_private(p_latitude,p_longitude,p_max_km);
$function$;

create or replace function private.get_admin_overview_private(
  p_from date default (current_date - 29),
  p_to date default current_date
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_result jsonb;
begin
  if not private.is_current_user_admin() then
    raise exception 'admin_access_required';
  end if;

  select jsonb_build_object(
    'period', jsonb_build_object('from',p_from,'to',p_to),
    'customers',(select count(*) from public.profiles where account_type='customer'),
    'providers',(select count(*) from public.provider_profiles),
    'approved_providers',(select count(*) from public.provider_profiles pp where exists(select 1 from public.provider_verifications pv where pv.provider_id=pp.id and pv.status='approved')),
    'orders',(select count(*) from public.orders where created_at >= p_from::timestamptz and created_at < (p_to+1)::timestamptz),
    'completed_orders',(select count(*) from public.orders where status='delivered' and created_at >= p_from::timestamptz and created_at < (p_to+1)::timestamptz),
    'cancelled_orders',(select count(*) from public.orders where status='cancelled' and created_at >= p_from::timestamptz and created_at < (p_to+1)::timestamptz),
    'gross_sales',(select coalesce(round(sum(total),2),0) from public.orders where status='delivered' and created_at >= p_from::timestamptz and created_at < (p_to+1)::timestamptz),
    'active_subscriptions',(select count(*) from public.milk_subscriptions where status='active'),
    'scheduled_deliveries',(select count(*) from public.subscription_deliveries where status='scheduled' and delivery_date between p_from and p_to),
    'milk_litres_delivered',(select coalesce(round(sum(oi.quantity),2),0) from public.order_items oi join public.orders o on o.id=oi.order_id where o.status='delivered' and o.created_at >= p_from::timestamptz and o.created_at < (p_to+1)::timestamptz),
    'daily_sales',coalesce((select jsonb_agg(row_to_json(x) order by x.sales_day) from (
      select (created_at at time zone 'Asia/Kolkata')::date as sales_day,
             round(coalesce(sum(total) filter(where status='delivered'),0),2) as sales,
             count(*) as orders
      from public.orders
      where created_at >= p_from::timestamptz and created_at < (p_to+1)::timestamptz
      group by 1
    ) x),'[]'::jsonb),
    'provider_sales',coalesce((select jsonb_agg(row_to_json(x) order by x.sales desc) from (
      select o.provider_id,pp.display_name as provider_name,
             round(coalesce(sum(o.total) filter(where o.status='delivered'),0),2) as sales,
             count(*) filter(where o.status='delivered') as delivered_orders
      from public.orders o join public.provider_profiles pp on pp.id=o.provider_id
      where o.created_at >= p_from::timestamptz and o.created_at < (p_to+1)::timestamptz
      group by o.provider_id,pp.display_name
    ) x),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_admin_overview(
  p_from date default (current_date - 29),
  p_to date default current_date
)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select private.get_admin_overview_private(p_from,p_to);
$function$;

revoke all on function private.find_nearby_providers_private(numeric,numeric,numeric) from public;
revoke all on function private.get_admin_overview_private(date,date) from public;
grant execute on function private.find_nearby_providers_private(numeric,numeric,numeric) to anon, authenticated;
grant execute on function private.get_admin_overview_private(date,date) to authenticated;
grant execute on function public.find_nearby_providers(numeric,numeric,numeric) to anon,authenticated;
grant execute on function public.get_admin_overview(date,date) to authenticated;