create or replace function public.find_nearby_providers_v2(
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_max_km numeric default 20
)
returns table(
  provider_id uuid,
  provider_name text,
  area_name text,
  city text,
  pin_code text,
  milk_type text,
  rating_avg numeric,
  delivery_from time,
  delivery_to time,
  latitude numeric,
  longitude numeric,
  distance_km numeric,
  service_radius_km numeric,
  is_serviceable boolean,
  products jsonb
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select
      pp.id,
      pp.display_name,
      pp.area_name,
      pp.city,
      pp.pin_code,
      pp.primary_milk_type,
      pp.rating_avg,
      pp.delivery_from,
      pp.delivery_to,
      coalesce(pp.service_radius_km,5) as service_radius_km,
      psa.latitude,
      psa.longitude,
      case
        when p_latitude is null or p_longitude is null then null
        else 6371.0 * 2 * asin(
          sqrt(
            power(sin(radians(psa.latitude - p_latitude) / 2), 2) +
            cos(radians(p_latitude)) * cos(radians(psa.latitude)) *
            power(sin(radians(psa.longitude - p_longitude) / 2), 2)
          )
        )
      end as distance_km
    from public.provider_profiles pp
    join public.provider_service_areas psa on psa.provider_id = pp.id
    where pp.is_active
      and exists (
        select 1 from public.provider_verifications pv
        where pv.provider_id = pp.id and pv.status = 'approved'
      )
  ),
  product_groups as (
    select
      mp.provider_id,
      jsonb_agg(
        jsonb_build_object(
          'id', mp.id,
          'name', mp.name,
          'milk_type', mp.milk_type,
          'price_per_litre', mp.price_per_litre,
          'unit_label', mp.unit_label,
          'stock', mp.stock,
          'daily_available', mp.daily_available,
          'is_active', mp.is_active
        )
        order by mp.created_at
      ) as products
    from public.milk_products mp
    where mp.is_active and mp.stock
    group by mp.provider_id
  )
  select
    b.id,
    b.display_name,
    b.area_name,
    b.city,
    b.pin_code,
    b.primary_milk_type,
    b.rating_avg,
    b.delivery_from,
    b.delivery_to,
    b.latitude,
    b.longitude,
    round(b.distance_km::numeric, 2),
    b.service_radius_km,
    case
      when p_latitude is null or p_longitude is null then null
      else b.distance_km <= b.service_radius_km
    end,
    coalesce(pg.products, '[]'::jsonb)
  from base b
  left join product_groups pg on pg.provider_id = b.id
  where b.distance_km is null or b.distance_km <= least(coalesce(p_max_km,20),25)
  order by b.distance_km nulls last, b.rating_avg desc nulls last, b.display_name;
$$;

revoke execute on function public.find_nearby_providers_v2(numeric,numeric,numeric) from public;
grant execute on function public.find_nearby_providers_v2(numeric,numeric,numeric) to anon, authenticated;

create or replace function public.get_provider_storefront(
  p_provider_id uuid,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns table(
  provider_id uuid,
  provider_name text,
  area_name text,
  city text,
  pin_code text,
  description text,
  milk_type text,
  rating_avg numeric,
  delivery_from time,
  delivery_to time,
  latitude numeric,
  longitude numeric,
  service_radius_km numeric,
  distance_km numeric,
  is_serviceable boolean,
  verification_status text,
  products jsonb
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with provider as (
    select
      pp.id,
      pp.display_name,
      pp.area_name,
      pp.city,
      pp.pin_code,
      pp.description,
      pp.primary_milk_type,
      pp.rating_avg,
      pp.delivery_from,
      pp.delivery_to,
      coalesce(pp.service_radius_km,5) service_radius_km,
      psa.latitude,
      psa.longitude,
      case
        when p_latitude is null or p_longitude is null then null
        else 6371.0 * 2 * asin(
          sqrt(
            power(sin(radians(psa.latitude - p_latitude) / 2), 2) +
            cos(radians(p_latitude)) * cos(radians(psa.latitude)) *
            power(sin(radians(psa.longitude - p_longitude) / 2), 2)
          )
        )
      end distance_km
    from public.provider_profiles pp
    join public.provider_service_areas psa on psa.provider_id=pp.id
    where pp.id=p_provider_id
      and pp.is_active
      and exists(
        select 1 from public.provider_verifications pv
        where pv.provider_id=pp.id and pv.status='approved'
      )
  ),
  products as (
    select jsonb_agg(
      jsonb_build_object(
        'id',mp.id,
        'name',mp.name,
        'milk_type',mp.milk_type,
        'price_per_litre',mp.price_per_litre,
        'unit_label',mp.unit_label,
        'stock',mp.stock,
        'daily_available',mp.daily_available,
        'is_active',mp.is_active
      ) order by mp.created_at
    ) as value
    from public.milk_products mp
    where mp.provider_id=p_provider_id
      and mp.is_active and mp.stock
  )
  select
    p.id,
    p.display_name,
    p.area_name,
    p.city,
    p.pin_code,
    p.description,
    p.primary_milk_type,
    p.rating_avg,
    p.delivery_from,
    p.delivery_to,
    p.latitude,
    p.longitude,
    p.service_radius_km,
    case when p_latitude is null or p_longitude is null then null else round(p.distance_km::numeric,2) end,
    case when p_latitude is null or p_longitude is null then null else p.distance_km <= p.service_radius_km end,
    'approved'::text,
    coalesce(products.value,'[]'::jsonb)
  from provider p
  cross join products;
$$;

revoke execute on function public.get_provider_storefront(uuid,numeric,numeric) from public;
grant execute on function public.get_provider_storefront(uuid,numeric,numeric) to anon, authenticated;

create index if not exists provider_profiles_active_rating_idx
  on public.provider_profiles(is_active, rating_avg desc);
