-- Doodhwala Phase 3 + 4
-- Marketplace database: auth profiles, local providers, catalogue, locations, addresses and orders.
-- Intended for a fresh Doodhwala Supabase project.
--
-- Security model:
-- * Browser uses only the Supabase publishable key.
-- * Every exposed table has RLS enabled.
-- * Authorization is based on ownership / provider linkage, not editable user metadata.
-- * Provider verification is server-controlled and defaults to pending.
-- * Order creation is atomic and server-priced through a private SECURITY DEFINER RPC.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  account_type text not null default 'customer' check (account_type in ('customer','provider')),
  default_latitude numeric,
  default_longitude numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null,
  owner_name text not null,
  phone text not null,
  primary_milk_type text not null check (primary_milk_type in ('cow','buffalo','a2','mixed')),
  area_name text not null,
  city text not null,
  pin_code text not null check (pin_code ~ '^[0-9]{6}$'),
  description text,
  delivery_from time,
  delivery_to time,
  service_radius_km numeric not null default 5 check (service_radius_km > 0 and service_radius_km <= 25),
  rating_avg numeric not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.provider_profiles to anon, authenticated;
alter table public.provider_profiles enable row level security;

create table if not exists public.provider_verifications (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.provider_verifications to anon, authenticated;
alter table public.provider_verifications enable row level security;

create schema if not exists private;

create or replace function private.create_pending_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.provider_verifications(provider_id, status)
  values (new.id, 'pending')
  on conflict (provider_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_pending_provider_verification() from public, anon, authenticated;

drop trigger if exists provider_verification_on_create on public.provider_profiles;
create trigger provider_verification_on_create
after insert on public.provider_profiles
for each row execute function private.create_pending_provider_verification();

drop policy if exists "provider_profiles_select_public_or_owner" on public.provider_profiles;
create policy "provider_profiles_select_public_or_owner"
on public.provider_profiles for select
to anon, authenticated
using (
  (select auth.uid()) = owner_user_id
  or exists (
    select 1 from public.provider_verifications pv
    where pv.provider_id = provider_profiles.id
      and pv.status = 'approved'
  )
);

drop policy if exists "provider_profiles_insert_own" on public.provider_profiles;
create policy "provider_profiles_insert_own"
on public.provider_profiles for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists "provider_profiles_update_own" on public.provider_profiles;
create policy "provider_profiles_update_own"
on public.provider_profiles for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists "provider_verifications_select_public_or_owner" on public.provider_verifications;
create policy "provider_verifications_select_public_or_owner"
on public.provider_verifications for select
to anon, authenticated
using (
  status = 'approved'
  or exists (
    select 1 from public.provider_profiles pp
    where pp.id = provider_verifications.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

create table if not exists public.provider_service_areas (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  label text not null,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  service_radius_km numeric not null default 5 check (service_radius_km > 0 and service_radius_km <= 25),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.provider_service_areas to anon, authenticated;
alter table public.provider_service_areas enable row level security;

drop policy if exists "service_area_select_public_or_owner" on public.provider_service_areas;
create policy "service_area_select_public_or_owner"
on public.provider_service_areas for select
to anon, authenticated
using (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = provider_service_areas.provider_id
      and (
        pp.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.provider_verifications pv
          where pv.provider_id = pp.id and pv.status = 'approved'
        )
      )
  )
);

drop policy if exists "service_area_insert_own" on public.provider_service_areas;
create policy "service_area_insert_own"
on public.provider_service_areas for insert
to authenticated
with check (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = provider_service_areas.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "service_area_update_own" on public.provider_service_areas;
create policy "service_area_update_own"
on public.provider_service_areas for update
to authenticated
using (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = provider_service_areas.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = provider_service_areas.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

create table if not exists public.milk_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  name text not null,
  milk_type text not null check (milk_type in ('cow','buffalo','a2','mixed')),
  price_per_litre numeric(10,2) not null check (price_per_litre > 0 and price_per_litre < 10000),
  unit_label text not null default '1 L',
  stock boolean not null default true,
  daily_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.milk_products to anon, authenticated;
alter table public.milk_products enable row level security;

drop policy if exists "milk_products_select_public_or_owner" on public.milk_products;
create policy "milk_products_select_public_or_owner"
on public.milk_products for select
to anon, authenticated
using (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_products.provider_id
      and (
        pp.owner_user_id = (select auth.uid())
        or (
          pp.is_active
          and milk_products.is_active
          and milk_products.stock
          and exists (
            select 1 from public.provider_verifications pv
            where pv.provider_id = pp.id and pv.status = 'approved'
          )
        )
      )
  )
);

drop policy if exists "milk_products_insert_own" on public.milk_products;
create policy "milk_products_insert_own"
on public.milk_products for insert
to authenticated
with check (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_products.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "milk_products_update_own" on public.milk_products;
create policy "milk_products_update_own"
on public.milk_products for update
to authenticated
using (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_products.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_products.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "milk_products_delete_own" on public.milk_products;
create policy "milk_products_delete_own"
on public.milk_products for delete
to authenticated
using (
  exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_products.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  area_name text not null,
  city text not null,
  pin_code text not null check (pin_code ~ '^[0-9]{6}$'),
  latitude numeric check (latitude between -90 and 90),
  longitude numeric check (longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.addresses to authenticated;
alter table public.addresses enable row level security;

drop policy if exists "addresses_own_select" on public.addresses;
create policy "addresses_own_select"
on public.addresses for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "addresses_own_insert" on public.addresses;
create policy "addresses_own_insert"
on public.addresses for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "addresses_own_update" on public.addresses;
create policy "addresses_own_update"
on public.addresses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "addresses_own_delete" on public.addresses;
create policy "addresses_own_delete"
on public.addresses for delete
to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  provider_owner_id uuid not null references public.profiles(id) on delete restrict,
  address_id uuid not null references public.addresses(id) on delete restrict,
  status text not null default 'placed' check (status in ('placed','accepted','out_for_delivery','delivered','cancelled')),
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.orders to authenticated;
alter table public.orders enable row level security;

drop policy if exists "orders_customer_or_provider_select" on public.orders;
create policy "orders_customer_or_provider_select"
on public.orders for select
to authenticated
using (
  customer_id = (select auth.uid())
  or provider_owner_id = (select auth.uid())
);

drop policy if exists "orders_provider_update" on public.orders;
create policy "orders_provider_update"
on public.orders for update
to authenticated
using (provider_owner_id = (select auth.uid()))
with check (provider_owner_id = (select auth.uid()));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.milk_products(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  product_name_snapshot text not null,
  unit_price numeric(10,2) not null check (unit_price > 0),
  quantity integer not null check (quantity > 0 and quantity <= 100),
  line_total numeric(10,2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

grant select on public.order_items to authenticated;
alter table public.order_items enable row level security;

drop policy if exists "order_items_customer_or_provider_select" on public.order_items;
create policy "order_items_customer_or_provider_select"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.customer_id = (select auth.uid()) or o.provider_owner_id = (select auth.uid()))
  )
);

create or replace function private.create_order_secure(
  p_provider_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_provider_owner uuid;
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product record;
  v_subtotal numeric(10,2) := 0;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1 from public.addresses
    where id = p_address_id and user_id = v_uid
  ) then
    raise exception 'address_not_owned';
  end if;

  select owner_user_id into v_provider_owner
  from public.provider_profiles pp
  where pp.id = p_provider_id
    and pp.is_active
    and exists (
      select 1 from public.provider_verifications pv
      where pv.provider_id = pp.id and pv.status = 'approved'
    );

  if v_provider_owner is null then
    raise exception 'provider_unavailable';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  insert into public.orders(customer_id, provider_id, provider_owner_id, address_id, customer_note)
  values(v_uid, p_provider_id, v_provider_owner, p_address_id, p_customer_note);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select id, provider_id, name, price_per_litre, stock, is_active
    into v_product
    from public.milk_products
    where id = (v_item->>'product_id')::uuid
      and provider_id = p_provider_id
      and stock
      and is_active
    limit 1;

    if not found then
      raise exception 'product_unavailable:%', v_item->>'product_id';
    end if;

    if coalesce((v_item->>'quantity')::integer, 0) < 1 or coalesce((v_item->>'quantity')::integer, 0) > 100 then
      raise exception 'invalid_quantity';
    end if;

    insert into public.order_items(
      order_id, product_id, provider_id, product_name_snapshot, unit_price, quantity
    )
    values(
      v_order_id,
      v_product.id,
      v_product.provider_id,
      v_product.name,
      v_product.price_per_litre,
      (v_item->>'quantity')::integer
    );

    v_subtotal := v_subtotal + (v_product.price_per_litre * (v_item->>'quantity')::integer);
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = 0,
      total = v_subtotal,
      updated_at = now()
  where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function private.create_order_secure(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function private.create_order_secure(uuid, uuid, jsonb, text) to authenticated;

create or replace function public.create_order(
  p_provider_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select private.create_order_secure(p_provider_id, p_address_id, p_items, p_customer_note);
$$;

revoke all on function public.create_order(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.create_order(uuid, uuid, jsonb, text) to authenticated;

create or replace function public.find_nearby_providers(
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_max_km numeric default 20
)
returns table(
  provider_id uuid,
  provider_name text,
  owner_name text,
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
      pp.owner_name,
      pp.area_name,
      pp.city,
      pp.pin_code,
      pp.primary_milk_type,
      pp.rating_avg,
      pp.delivery_from,
      pp.delivery_to,
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
          'daily_available', mp.daily_available
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
    b.owner_name,
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
    coalesce(pg.products, '[]'::jsonb)
  from base b
  left join product_groups pg on pg.provider_id = b.id
  where (b.distance_km is null or b.distance_km <= least(p_max_km, 25))
  order by b.distance_km nulls last, b.display_name;
$$;

grant execute on function public.find_nearby_providers(numeric, numeric, numeric) to anon, authenticated;

-- Indexes for discovery / ownership checks.
create index if not exists provider_profiles_owner_idx on public.provider_profiles(owner_user_id);
create index if not exists provider_service_areas_lat_lng_idx on public.provider_service_areas(latitude, longitude);
create index if not exists milk_products_provider_idx on public.milk_products(provider_id);
create index if not exists milk_products_active_idx on public.milk_products(provider_id, is_active, stock);
create index if not exists addresses_user_idx on public.addresses(user_id);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_provider_owner_idx on public.orders(provider_owner_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

comment on table public.provider_profiles is 'Independent/local milk sellers only. Large packaged dairy brands are not intended to be onboarded as ordinary providers.';
comment on table public.provider_verifications is 'Marketplace-controlled provider verification state.';
