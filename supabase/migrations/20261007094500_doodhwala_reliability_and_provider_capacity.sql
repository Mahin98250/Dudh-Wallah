-- Doodhwala reliability + provider capacity engine
-- Server-enforced controls for real marketplace operations.

alter table public.provider_profiles
  add column if not exists max_open_orders integer not null default 25
    check (max_open_orders between 1 and 500),
  add column if not exists max_daily_litres numeric(10,2) not null default 250
    check (max_daily_litres > 0 and max_daily_litres <= 100000),
  add column if not exists acceptance_timeout_minutes integer not null default 10
    check (acceptance_timeout_minutes between 1 and 120);

create index if not exists orders_provider_created_status_idx
  on public.orders(provider_id,created_at desc,status);

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
  v_requested_litres numeric(12,2) := 0;
  v_open_orders integer := 0;
  v_daily_litres numeric(12,2) := 0;
  v_max_open integer := 25;
  v_max_daily numeric(10,2) := 250;
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

  select
    pp.owner_user_id,
    coalesce(pp.max_open_orders,25),
    coalesce(pp.max_daily_litres,250)
  into v_provider_owner,v_max_open,v_max_daily
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

  select coalesce(sum(qty),0)
  into v_requested_litres
  from (
    select coalesce((value->>'quantity')::numeric,0) as qty
    from jsonb_array_elements(p_items)
  ) q;

  if v_requested_litres <= 0 or v_requested_litres > 500 then
    raise exception 'invalid_cart_quantity';
  end if;

  select count(*)
  into v_open_orders
  from public.orders o
  where o.provider_id=p_provider_id
    and o.status in ('placed','accepted','preparing','ready','out_for_delivery');

  if v_open_orders >= v_max_open then
    raise exception 'provider_order_capacity_full';
  end if;

  select coalesce(sum(oi.quantity),0)
  into v_daily_litres
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  where o.provider_id=p_provider_id
    and (o.created_at at time zone 'Asia/Kolkata')::date=current_date
    and o.status not in ('rejected','cancelled');

  if v_daily_litres + v_requested_litres > v_max_daily then
    raise exception 'provider_daily_capacity_full';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
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
    limit 1;

    if not found then
      raise exception 'product_unavailable:%', v_item->>'product_id';
    end if;

    v_subtotal := v_subtotal
      + (v_product.price_per_litre * (v_item->>'quantity')::numeric);
  end loop;

  insert into public.orders(
    id,customer_id,provider_id,provider_owner_id,address_id,status,
    customer_note
  )
  values(
    v_order_id,v_uid,p_provider_id,v_provider_owner,p_address_id,'placed',
    p_customer_note
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select id, provider_id, name, price_per_litre
    into v_product
    from public.milk_products
    where id=(v_item->>'product_id')::uuid
      and provider_id=p_provider_id
      and stock
      and is_active;

    insert into public.order_items(
      order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity
    )
    values(
      v_order_id,v_product.id,v_product.provider_id,v_product.name,
      v_product.price_per_litre,(v_item->>'quantity')::numeric
    );
  end loop;

  update public.orders
  set subtotal=round(v_subtotal,2),
      delivery_fee=0,
      total=round(v_subtotal,2),
      updated_at=now()
  where id=v_order_id;

  return v_order_id;
end;
$$;

revoke all on function private.create_order_secure(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.create_order_secure(uuid,uuid,jsonb,text) to authenticated;

create or replace function public.sync_subscription_delivery_from_order()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.subscription_delivery_id is not null then
    update public.subscription_deliveries
    set status=case
      when new.status='delivered' then 'delivered'
      when new.status='cancelled' then 'cancelled'
      when new.status='rejected' then 'failed'
      else status
    end,
    skip_reason=case
      when new.status='rejected' then left(coalesce(new.status_reason,'Provider did not accept the delivery'),200)
      else skip_reason
    end,
    updated_at=now()
    where order_id=new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_subscription_delivery_from_order() from public,anon,authenticated;

create or replace function public.expire_unaccepted_orders()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.orders o
    set status='rejected',
        status_reason='Provider did not respond within '||coalesce(pp.acceptance_timeout_minutes,10)::text||' minutes',
        updated_at=now()
    from public.provider_profiles pp
    where o.provider_id=pp.id
      and o.status='placed'
      and now() > o.created_at + make_interval(mins=>coalesce(pp.acceptance_timeout_minutes,10))
    returning o.id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

revoke execute on function public.expire_unaccepted_orders() from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname='doodhwala-expire-unaccepted-orders'
  ) then
    perform cron.schedule(
      'doodhwala-expire-unaccepted-orders',
      '* * * * *',
      $$select public.expire_unaccepted_orders();$$
    );
  end if;
end
$$;
