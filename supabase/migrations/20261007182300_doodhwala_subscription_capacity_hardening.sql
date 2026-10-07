-- Doodhwala recurring-order hardening.
-- Recurring deliveries now obey provider approval, serviceability, open-order and daily-litre capacity,
-- and create deterministic idempotent order records.

create or replace function public.materialize_due_subscription_deliveries()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery record; v_address record; v_provider record; v_product record; v_service_area record;
  v_order_id uuid; v_open_orders integer; v_daily_litres numeric(12,2);
  v_distance_km numeric(10,4); v_idempotency_key text; v_request_hash text; v_count integer:=0;
begin
  update public.milk_subscriptions
  set status='active',paused_until=null,updated_at=now()
  where status='paused' and paused_until is not null and paused_until<current_date;

  for v_delivery in
    select sd.id delivery_id,sd.subscription_id,sd.quantity_litres,sd.unit_price,
           ms.customer_id,ms.provider_id,ms.product_id,ms.address_id,ms.status subscription_status,ms.customer_note
    from public.subscription_deliveries sd
    join public.milk_subscriptions ms on ms.id=sd.subscription_id
    where sd.status='scheduled' and sd.scheduled_for<=now()
    order by sd.scheduled_for
    for update of sd skip locked
  loop
    if v_delivery.subscription_status<>'active' then
      update public.subscription_deliveries set status=case when v_delivery.subscription_status='cancelled' then 'cancelled' else 'skipped' end,
        skip_reason='Subscription not active',updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled'; continue;
    end if;

    select pp.owner_user_id,pp.is_active,coalesce(pp.max_open_orders,25) max_open_orders,
           coalesce(pp.max_daily_litres,250) max_daily_litres
    into v_provider
    from public.provider_profiles pp
    where pp.id=v_delivery.provider_id
      and exists(select 1 from public.provider_verifications pv where pv.provider_id=pp.id and pv.status='approved')
    for update;

    if not found or not v_provider.is_active then
      update public.subscription_deliveries set status='failed',skip_reason='Provider unavailable or not approved',updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled'; continue;
    end if;

    select id,name,price_per_litre,stock,is_active into v_product
    from public.milk_products
    where id=v_delivery.product_id and provider_id=v_delivery.provider_id
    for update;

    if not found or not v_product.stock or not v_product.is_active then
      update public.subscription_deliveries set status='failed',skip_reason='Product unavailable at delivery time',updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled'; continue;
    end if;

    if exists(select 1 from public.orders where subscription_delivery_id=v_delivery.delivery_id) then
      update public.subscription_deliveries set status='materialized',updated_at=now()
      where id=v_delivery.delivery_id; continue;
    end if;

    select recipient_name,phone,address_line,area_name,city,pin_code,latitude,longitude
    into v_address
    from public.addresses
    where id=v_delivery.address_id and user_id=v_delivery.customer_id
    for share;

    if not found then
      update public.subscription_deliveries set status='failed',skip_reason='Delivery address unavailable',updated_at=now()
      where id=v_delivery.delivery_id and status='scheduled'; continue;
    end if;

    select psa.* into v_service_area from public.provider_service_areas psa
    where psa.provider_id=v_delivery.provider_id for share;

    if found then
      if v_address.latitude is null or v_address.longitude is null then
        update public.subscription_deliveries set status='failed',skip_reason='Delivery location missing',updated_at=now()
        where id=v_delivery.delivery_id and status='scheduled'; continue;
      end if;
      v_distance_km:=6371*2*asin(sqrt(least(1,
        power(sin(radians(v_address.latitude-v_service_area.latitude)/2),2)
        +cos(radians(v_address.latitude))*cos(radians(v_service_area.latitude))
        *power(sin(radians(v_address.longitude-v_service_area.longitude)/2),2))));
      if v_distance_km>v_service_area.service_radius_km then
        update public.subscription_deliveries set status='failed',skip_reason='Delivery address outside provider service area',updated_at=now()
        where id=v_delivery.delivery_id and status='scheduled'; continue;
      end if;
    end if;

    select count(*) into v_open_orders from public.orders o
    where o.provider_id=v_delivery.provider_id
      and o.status in ('placed','accepted','preparing','ready','out_for_delivery');

    if v_open_orders>=v_provider.max_open_orders then
      if now()>v_delivery.scheduled_for+interval '60 minutes' then
        update public.subscription_deliveries set status='failed',skip_reason='Provider open-order capacity remained full for over 60 minutes',updated_at=now()
        where id=v_delivery.delivery_id and status='scheduled';
      end if;
      continue;
    end if;

    select coalesce(sum(oi.quantity),0) into v_daily_litres
    from public.orders o join public.order_items oi on oi.order_id=o.id
    where o.provider_id=v_delivery.provider_id
      and (o.created_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date
      and o.status not in ('rejected','cancelled');

    if v_daily_litres+v_delivery.quantity_litres>v_provider.max_daily_litres then
      if now()>v_delivery.scheduled_for+interval '60 minutes' then
        update public.subscription_deliveries set status='failed',skip_reason='Provider daily milk capacity remained full for over 60 minutes',updated_at=now()
        where id=v_delivery.delivery_id and status='scheduled';
      end if;
      continue;
    end if;

    v_order_id:=gen_random_uuid();
    v_idempotency_key:='subscription:'||v_delivery.delivery_id::text;
    v_request_hash:=md5(v_delivery.provider_id::text||'|'||v_delivery.address_id::text||'|'||
                        v_delivery.product_id::text||'|'||v_delivery.quantity_litres::text||'|'||v_delivery.unit_price::text);

    insert into public.orders(
      id,customer_id,provider_id,provider_owner_id,address_id,status,subtotal,delivery_fee,total,customer_note,
      delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,
      delivery_latitude,delivery_longitude,subscription_delivery_id,idempotency_key,order_request_hash
    ) values(
      v_order_id,v_delivery.customer_id,v_delivery.provider_id,v_provider.owner_user_id,v_delivery.address_id,'placed',
      round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),0,
      round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),
      left(nullif(trim(v_delivery.customer_note),''),500),
      v_address.recipient_name,v_address.phone,v_address.address_line,v_address.area_name,v_address.city,v_address.pin_code,
      v_address.latitude,v_address.longitude,v_delivery.delivery_id,v_idempotency_key,v_request_hash
    );

    insert into public.order_items(order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity)
    values(v_order_id,v_product.id,v_delivery.provider_id,v_product.name,v_delivery.unit_price,v_delivery.quantity_litres);

    update public.subscription_deliveries
    set status='materialized',order_id=v_order_id,updated_at=now()
    where id=v_delivery.delivery_id and status='scheduled';

    v_count:=v_count+1;
  end loop;

  update public.milk_subscriptions ms set status='completed',updated_at=now()
  where ms.status in('active','paused') and ms.end_date<current_date
    and not exists(select 1 from public.subscription_deliveries sd where sd.subscription_id=ms.id and sd.status='scheduled');

  return v_count;
end;
$$;

revoke execute on function public.materialize_due_subscription_deliveries() from public,anon,authenticated;
