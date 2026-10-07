-- Doodhwala Phase: provider route operations + smart subscription changes
-- Keeps recurring deliveries operational without exposing privileged database functions.

create or replace function private.pause_milk_subscription(p_subscription_id uuid,p_until_date date default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_found boolean:=false;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_until_date is not null and p_until_date<current_date then
    raise exception 'pause_date_in_past';
  end if;

  update public.milk_subscriptions
  set status='paused',
      paused_until=p_until_date,
      updated_at=now()
  where id=p_subscription_id
    and customer_id=v_uid
    and status='active';
  v_found:=found;

  if v_found and p_until_date is not null then
    update public.subscription_deliveries
    set status='skipped',
        skip_reason='Plan paused until '||p_until_date::text,
        updated_at=now()
    where subscription_id=p_subscription_id
      and status='scheduled'
      and delivery_date<=p_until_date
      and scheduled_for>now();
  end if;

  return v_found;
end;
$$;

create or replace function private.update_milk_subscription(
  p_subscription_id uuid,
  p_quantity_litres numeric default null,
  p_delivery_time time default null,
  p_address_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_sub public.milk_subscriptions%rowtype;
  v_provider record;
  v_next timestamptz;
  v_quantity numeric(8,2);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select *
  into v_sub
  from public.milk_subscriptions
  where id=p_subscription_id
    and customer_id=v_uid
    and status in('active','paused');

  if not found then raise exception 'subscription_not_editable'; end if;
  if p_quantity_litres is null and p_delivery_time is null and p_address_id is null then
    raise exception 'no_subscription_changes';
  end if;

  v_quantity:=coalesce(p_quantity_litres,v_sub.quantity_litres);
  if v_quantity<=0 or v_quantity>50 then raise exception 'invalid_quantity'; end if;

  select pp.is_active,pp.delivery_from,pp.delivery_to
  into v_provider
  from public.provider_profiles pp
  where pp.id=v_sub.provider_id;
  if not found or not coalesce(v_provider.is_active,false) then raise exception 'provider_unavailable'; end if;
  if not exists(
    select 1 from public.provider_verifications pv
    where pv.provider_id=v_sub.provider_id and pv.status='approved'
  ) then raise exception 'provider_unavailable'; end if;

  if p_address_id is not null and not exists(
    select 1 from public.addresses a where a.id=p_address_id and a.user_id=v_uid
  ) then raise exception 'address_not_owned'; end if;

  if p_delivery_time is not null
     and v_provider.delivery_from is not null
     and v_provider.delivery_to is not null
     and (p_delivery_time<v_provider.delivery_from or p_delivery_time>v_provider.delivery_to)
  then
    raise exception 'delivery_time_outside_provider_window';
  end if;

  select min(sd.scheduled_for)
  into v_next
  from public.subscription_deliveries sd
  where sd.subscription_id=p_subscription_id
    and sd.status='scheduled'
    and sd.scheduled_for>now();

  if v_next is not null and now()>v_next-make_interval(mins=>v_sub.cutoff_minutes) then
    raise exception 'subscription_change_cutoff_passed';
  end if;

  if p_delivery_time is not null and v_sub.start_date<=current_date and
     p_delivery_time<=((now() at time zone v_sub.timezone_name)::time + interval '10 minutes')::time then
    if exists(
      select 1 from public.subscription_deliveries sd
      where sd.subscription_id=p_subscription_id
        and sd.status='scheduled'
        and sd.delivery_date=current_date
        and sd.scheduled_for>now()
    ) then
      raise exception 'new_delivery_time_too_soon';
    end if;
  end if;

  update public.milk_subscriptions
  set quantity_litres=v_quantity,
      delivery_time=coalesce(p_delivery_time,delivery_time),
      address_id=coalesce(p_address_id,address_id),
      updated_at=now()
  where id=p_subscription_id
    and customer_id=v_uid;

  update public.subscription_deliveries sd
  set quantity_litres=v_quantity,
      scheduled_for=case
        when p_delivery_time is not null
        then timezone(v_sub.timezone_name,sd.delivery_date+p_delivery_time)
        else sd.scheduled_for
      end,
      updated_at=now()
  where sd.subscription_id=p_subscription_id
    and sd.status='scheduled'
    and sd.scheduled_for>now();

  return true;
end;
$$;

revoke execute on function private.pause_milk_subscription(uuid,date) from public,anon;
grant execute on function private.pause_milk_subscription(uuid,date) to authenticated;
revoke execute on function private.update_milk_subscription(uuid,numeric,time,uuid) from public,anon;
grant execute on function private.update_milk_subscription(uuid,numeric,time,uuid) to authenticated;

create or replace function public.pause_milk_subscription(p_subscription_id uuid,p_until_date date default null)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
begin
  return private.pause_milk_subscription(p_subscription_id,p_until_date);
end;
$$;

create or replace function public.update_milk_subscription(
  p_subscription_id uuid,
  p_quantity_litres numeric default null,
  p_delivery_time time default null,
  p_address_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
begin
  return private.update_milk_subscription(p_subscription_id,p_quantity_litres,p_delivery_time,p_address_id);
end;
$$;

revoke execute on function public.pause_milk_subscription(uuid,date) from public,anon;
grant execute on function public.pause_milk_subscription(uuid,date) to authenticated;
revoke execute on function public.update_milk_subscription(uuid,numeric,time,uuid) from public,anon;
grant execute on function public.update_milk_subscription(uuid,numeric,time,uuid) to authenticated;

grant usage on schema private to authenticated;

-- Provider-only recurring route projection. This deliberately exposes delivery
-- address/contact only to the provider who owns the milk route.
create or replace function private.get_provider_delivery_route(p_delivery_date date default current_date)
returns table(
  delivery_id uuid,
  subscription_id uuid,
  delivery_date date,
  scheduled_for timestamptz,
  quantity_litres numeric,
  delivery_status text,
  order_id uuid,
  order_status text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  address_line text,
  area_name text,
  city text,
  pin_code text,
  product_name text,
  milk_type text,
  customer_note text
)
language sql
security definer
set search_path=''
as $$
  select
    sd.id,
    sd.subscription_id,
    sd.delivery_date,
    sd.scheduled_for,
    sd.quantity_litres,
    sd.status,
    o.id,
    o.status,
    ms.customer_id,
    coalesce(a.recipient_name,'Customer'),
    coalesce(a.phone,''),
    coalesce(a.address_line,''),
    coalesce(a.area_name,''),
    coalesce(a.city,''),
    coalesce(a.pin_code,''),
    mp.name,
    mp.milk_type,
    ms.customer_note
  from public.subscription_deliveries sd
  join public.milk_subscriptions ms on ms.id=sd.subscription_id
  join public.provider_profiles pp on pp.id=ms.provider_id
  join public.milk_products mp on mp.id=ms.product_id
  join public.addresses a on a.id=ms.address_id
  left join public.orders o on o.subscription_delivery_id=sd.id
  where pp.owner_user_id=auth.uid()
    and sd.delivery_date=coalesce(p_delivery_date,current_date)
    and sd.status in('scheduled','materialized','delivered')
  order by sd.scheduled_for, coalesce(a.recipient_name,'Customer');
$$;

revoke execute on function private.get_provider_delivery_route(date) from public,anon;
grant execute on function private.get_provider_delivery_route(date) to authenticated;

create or replace function public.get_provider_delivery_route(p_delivery_date date default current_date)
returns table(
  delivery_id uuid,
  subscription_id uuid,
  delivery_date date,
  scheduled_for timestamptz,
  quantity_litres numeric,
  delivery_status text,
  order_id uuid,
  order_status text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  address_line text,
  area_name text,
  city text,
  pin_code text,
  product_name text,
  milk_type text,
  customer_note text
)
language sql
security invoker
set search_path=''
as $$
  select * from private.get_provider_delivery_route(p_delivery_date);
$$;

revoke execute on function public.get_provider_delivery_route(date) from public,anon;
grant execute on function public.get_provider_delivery_route(date) to authenticated;

-- Tighten the recurring materializer: preserve fractional litres in generated
-- orders and automatically reactivate a "pause until" plan after its pause date.
create or replace function public.materialize_due_subscription_deliveries()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_address record;
  v_order_id uuid;
  v_count integer:=0;
begin
  update public.milk_subscriptions
  set status='active',paused_until=null,updated_at=now()
  where status='paused'
    and paused_until is not null
    and paused_until<current_date;

  for v_delivery in
    select
      sd.id delivery_id,
      sd.subscription_id,
      sd.quantity_litres,
      sd.unit_price,
      ms.customer_id,
      ms.provider_id,
      ms.product_id,
      ms.address_id,
      ms.status subscription_status,
      ms.customer_note,
      mp.name product_name,
      mp.stock,
      mp.is_active,
      pp.owner_user_id
    from public.subscription_deliveries sd
    join public.milk_subscriptions ms on ms.id=sd.subscription_id
    join public.milk_products mp on mp.id=ms.product_id
    join public.provider_profiles pp on pp.id=ms.provider_id
    where sd.status='scheduled'
      and sd.scheduled_for<=now()
    order by sd.scheduled_for
    for update of sd skip locked
  loop
    if v_delivery.subscription_status<>'active' then
      update public.subscription_deliveries
      set status=case when v_delivery.subscription_status='cancelled' then 'cancelled' else 'skipped' end,
          skip_reason='Subscription not active',
          updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled';
      continue;
    end if;

    if not v_delivery.stock or not v_delivery.is_active then
      update public.subscription_deliveries
      set status='failed',
          skip_reason='Product unavailable at delivery time',
          updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled';
      continue;
    end if;

    if exists(select 1 from public.orders o where o.subscription_delivery_id=v_delivery.delivery_id) then
      update public.subscription_deliveries
      set status='materialized',updated_at=now()
      where id=v_delivery.delivery_id;
      continue;
    end if;

    select recipient_name,phone,address_line,area_name,city,pin_code,latitude,longitude
    into v_address
    from public.addresses
    where id=v_delivery.address_id and user_id=v_delivery.customer_id;

    if not found then
      update public.subscription_deliveries
      set status='failed',
          skip_reason='Delivery address unavailable',
          updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled';
      continue;
    end if;

    v_order_id:=gen_random_uuid();

    insert into public.orders(
      id,customer_id,provider_id,provider_owner_id,address_id,status,
      subtotal,delivery_fee,total,customer_note,
      delivery_recipient_name,delivery_phone,delivery_address_line,
      delivery_area_name,delivery_city,delivery_pin_code,
      delivery_latitude,delivery_longitude,subscription_delivery_id
    )
    values(
      v_order_id,v_delivery.customer_id,v_delivery.provider_id,v_delivery.owner_user_id,
      v_delivery.address_id,'placed',
      round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),0,
      round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),
      v_delivery.customer_note,
      v_address.recipient_name,v_address.phone,v_address.address_line,
      v_address.area_name,v_address.city,v_address.pin_code,
      v_address.latitude,v_address.longitude,v_delivery.delivery_id
    );

    insert into public.order_items(
      order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity
    )
    values(
      v_order_id,v_delivery.product_id,v_delivery.provider_id,
      v_delivery.product_name,v_delivery.unit_price,v_delivery.quantity_litres
    );

    update public.subscription_deliveries
    set status='materialized',
        order_id=v_order_id,
        updated_at=now()
    where id=v_delivery.delivery_id and status='scheduled';

    v_count:=v_count+1;
  end loop;

  update public.milk_subscriptions ms
  set status='completed',updated_at=now()
  where ms.status in('active','paused')
    and ms.end_date<current_date
    and not exists(
      select 1
      from public.subscription_deliveries sd
      where sd.subscription_id=ms.id
        and sd.status='scheduled'
    );

  return v_count;
end;
$$;

revoke execute on function public.materialize_due_subscription_deliveries() from public,anon,authenticated;
