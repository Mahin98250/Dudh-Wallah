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
language sql
security definer
set search_path = public, pg_temp
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

revoke all on function public.find_nearby_providers(numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.find_nearby_providers(numeric,numeric,numeric) to anon, authenticated;