-- Doodhwala 10X order reliability + authorization hardening.
-- Goals: idempotent checkout, server-side serviceability, concurrency-safe capacity,
-- immutable order money/customer fields, actor-correct audit events, and safe status RPCs.

alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists order_request_hash text;

alter table public.orders
  drop constraint if exists orders_idempotency_key_length_check;
alter table public.orders
  add constraint orders_idempotency_key_length_check
  check (idempotency_key is null or (length(idempotency_key) between 16 and 120));

create unique index if not exists orders_customer_idempotency_key_uidx
  on public.orders(customer_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists orders_customer_created_idx
  on public.orders(customer_id, created_at desc);

create index if not exists order_items_order_idx
  on public.order_items(order_id);

drop policy if exists "orders_provider_update" on public.orders;
drop policy if exists "orders_customer_update" on public.orders;
drop policy if exists "orders_insert_authenticated" on public.orders;
drop policy if exists "orders_delete_authenticated" on public.orders;

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

revoke all on table public.order_items from anon, authenticated;
grant select on table public.order_items to authenticated;

create or replace function private.protect_provider_rating()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.owner_user_id
     and new.rating_avg is distinct from old.rating_avg then
    raise exception 'rating_managed_by_system';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_profiles_protect_rating on public.provider_profiles;
create trigger provider_profiles_protect_rating
before update on public.provider_profiles
for each row execute function private.protect_provider_rating();

revoke all on function private.protect_provider_rating() from public, anon, authenticated;

create or replace function public.record_order_status_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.provider_owner_id);
begin
  if tg_op='INSERT' then
    insert into public.order_status_events(order_id,from_status,to_status,changed_by,reason)
    values(new.id,null,new.status,v_actor,new.status_reason);
  elsif new.status is distinct from old.status then
    insert into public.order_status_events(order_id,from_status,to_status,changed_by,reason)
    values(new.id,old.status,new.status,v_actor,new.status_reason);
  end if;
  return new;
end;
$$;

revoke all on function public.record_order_status_event() from public, anon, authenticated;

create or replace function private.create_order_secure(
  p_provider_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default null,
  p_idempotency_key text default null
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
  v_existing_id uuid;
  v_item jsonb;
  v_product record;
  v_address record;
  v_service_area record;
  v_request_key text := nullif(trim(p_idempotency_key), '');
  v_request_hash text;
  v_existing_hash text;
  v_subtotal numeric(12,2) := 0;
  v_requested_litres numeric(12,2) := 0;
  v_open_orders integer := 0;
  v_daily_litres numeric(12,2) := 0;
  v_max_open integer := 25;
  v_max_daily numeric(10,2) := 250;
  v_area_distance numeric(10,4);
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if v_request_key is null then
    v_request_key := gen_random_uuid()::text;
  elsif length(v_request_key) < 16 or length(v_request_key) > 120 then
    raise exception 'invalid_idempotency_key';
  end if;

  v_request_hash := md5(
    p_provider_id::text || '|' ||
    p_address_id::text || '|' ||
    coalesce(p_items::text,'[]') || '|' ||
    coalesce(p_customer_note,'')
  );

  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || v_request_key, 0)
  );

  select id, order_request_hash
    into v_existing_id, v_existing_hash
  from public.orders
  where customer_id = v_uid
    and idempotency_key = v_request_key
  for update;

  if v_existing_id is not null then
    if v_existing_hash is distinct from v_request_hash then
      raise exception 'idempotency_key_reuse_conflict';
    end if;
    return v_existing_id;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  select *
    into v_address
  from public.addresses a
  where a.id = p_address_id
    and a.user_id = v_uid
  for share;

  if not found then
    raise exception 'address_not_owned';
  end if;

  select
    pp.owner_user_id,
    coalesce(pp.max_open_orders,25),
    coalesce(pp.max_daily_litres,250)
    into v_provider_owner, v_max_open, v_max_daily
  from public.provider_profiles pp
  where pp.id = p_provider_id
    and pp.is_active
    and exists (
      select 1
      from public.provider_verifications pv
      where pv.provider_id = pp.id
        and pv.status = 'approved'
    )
  for update;

  if v_provider_owner is null then
    raise exception 'provider_unavailable';
  end if;

  select psa.*
    into v_service_area
  from public.provider_service_areas psa
  where psa.provider_id = p_provider_id
  for share;

  if found then
    if v_address.latitude is null or v_address.longitude is null then
      raise exception 'delivery_location_required';
    end if;

    v_area_distance :=
      6371 * 2 * asin(
        sqrt(
          least(
            1,
            power(sin(radians(v_address.latitude - v_service_area.latitude) / 2),2)
            +
            cos(radians(v_address.latitude))
            * cos(radians(v_service_area.latitude))
            * power(sin(radians(v_address.longitude - v_service_area.longitude) / 2),2)
          )
        )
      );

    if v_area_distance > v_service_area.service_radius_km then
      raise exception 'outside_provider_service_area';
    end if;
  end if;

  for v_item in
    select jsonb_build_object(
      'product_id', product_id,
      'quantity', quantity
    )
    from (
      select
        (x.value->>'product_id')::uuid as product_id,
        sum(coalesce((x.value->>'quantity')::numeric,0)) as quantity
      from jsonb_array_elements(p_items) x
      where x.value ? 'product_id'
      group by (x.value->>'product_id')::uuid
    ) grouped_items
  loop
    if coalesce((v_item->>'quantity')::numeric,0) < 0.01
       or coalesce((v_item->>'quantity')::numeric,0) > 100 then
      raise exception 'invalid_quantity';
    end if;

    select id, provider_id, name, price_per_litre, stock, is_active
      into v_product
    from public.milk_products
    where id = (v_item->>'product_id')::uuid
      and provider_id = p_provider_id
      and stock
      and is_active
    for update;

    if not found then
      raise exception 'product_unavailable:%', v_item->>'product_id';
    end if;

    v_requested_litres := v_requested_litres + (v_item->>'quantity')::numeric;
    v_subtotal := v_subtotal +
      (v_product.price_per_litre * (v_item->>'quantity')::numeric);
  end loop;

  if v_requested_litres <= 0 or v_requested_litres > 500 then
    raise exception 'invalid_cart_quantity';
  end if;

  select count(*)
    into v_open_orders
  from public.orders o
  where o.provider_id = p_provider_id
    and o.status in ('placed','accepted','preparing','ready','out_for_delivery');

  if v_open_orders >= v_max_open then
    raise exception 'provider_order_capacity_full';
  end if;

  select coalesce(sum(oi.quantity),0)
    into v_daily_litres
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.provider_id = p_provider_id
    and (o.created_at at time zone 'Asia/Kolkata')::date =
        (now() at time zone 'Asia/Kolkata')::date
    and o.status not in ('rejected','cancelled');

  if v_daily_litres + v_requested_litres > v_max_daily then
    raise exception 'provider_daily_capacity_full';
  end if;

  insert into public.orders(
    id,customer_id,provider_id,provider_owner_id,address_id,status,customer_note,
    idempotency_key,order_request_hash,
    delivery_recipient_name,delivery_phone,delivery_address_line,
    delivery_area_name,delivery_city,delivery_pin_code,
    delivery_latitude,delivery_longitude
  )
  values(
    v_order_id,v_uid,p_provider_id,v_provider_owner,p_address_id,'placed',
    left(nullif(trim(p_customer_note),''),500),
    v_request_key,v_request_hash,
    v_address.recipient_name,v_address.phone,v_address.address_line,
    v_address.area_name,v_address.city,v_address.pin_code,
    v_address.latitude,v_address.longitude
  );

  for v_item in
    select jsonb_build_object('product_id', product_id, 'quantity', quantity)
    from (
      select
        (x.value->>'product_id')::uuid as product_id,
        sum(coalesce((x.value->>'quantity')::numeric,0)) as quantity
      from jsonb_array_elements(p_items) x
      where x.value ? 'product_id'
      group by (x.value->>'product_id')::uuid
    ) grouped_items
  loop
    select id, provider_id, name, price_per_litre
      into v_product
    from public.milk_products
    where id = (v_item->>'product_id')::uuid
      and provider_id = p_provider_id
      and stock
      and is_active
    for update;

    insert into public.order_items(
      order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity
    )
    values(
      v_order_id,v_product.id,v_product.provider_id,v_product.name,
      v_product.price_per_litre,(v_item->>'quantity')::numeric
    );
  end loop;

  update public.orders
  set subtotal = round(v_subtotal,2),
      delivery_fee = 0,
      total = round(v_subtotal,2),
      updated_at = now()
  where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function private.create_order_secure(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function private.create_order_secure(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function private.create_order_secure(uuid,uuid,jsonb,text,text) to authenticated;

create or replace function public.create_order(
  p_provider_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default null
)
returns uuid
language sql
security invoker
set search_path='public','pg_temp'
as $$
  select private.create_order_secure(
    p_provider_id,p_address_id,p_items,p_customer_note,gen_random_uuid()::text
  );
$$;

create or replace function public.create_order(
  p_provider_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text,
  p_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path='public','pg_temp'
as $$
  select private.create_order_secure(
    p_provider_id,p_address_id,p_items,p_customer_note,p_idempotency_key
  );
$$;

revoke all on function public.create_order(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.create_order(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_order(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.create_order(uuid,uuid,jsonb,text,text) to authenticated;

create or replace function public.provider_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_reason text := left(nullif(trim(p_reason),''),300);
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select *
    into v_order
  from public.orders
  where id=p_order_id
    and provider_owner_id=v_uid
  for update;

  if not found then
    raise exception 'order_not_found_or_not_provider';
  end if;

  if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled') then
    raise exception 'invalid_order_status';
  end if;

  if p_new_status in ('rejected','cancelled') and v_reason is null then
    raise exception 'reason_required';
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
      updated_at=now()
  where id=p_order_id;

  return jsonb_build_object(
    'id',p_order_id,
    'status',p_new_status,
    'status_reason',v_reason
  );
end;
$$;

revoke all on function public.provider_update_order_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.provider_update_order_status(uuid,text,text) to authenticated;

create or replace function public.customer_cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_reason text := coalesce(left(nullif(trim(p_reason),''),300),'Cancelled by customer');
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select *
    into v_order
  from public.orders
  where id=p_order_id
    and customer_id=v_uid
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status not in ('placed','accepted') then
    raise exception 'order_cannot_be_cancelled_now';
  end if;

  update public.orders
  set status='cancelled',
      status_reason=v_reason,
      updated_at=now()
  where id=p_order_id;

  return jsonb_build_object(
    'id',p_order_id,
    'status','cancelled',
    'status_reason',v_reason
  );
end;
$$;

revoke all on function public.customer_cancel_order(uuid,text) from public,anon,authenticated;
grant execute on function public.customer_cancel_order(uuid,text) to authenticated;
