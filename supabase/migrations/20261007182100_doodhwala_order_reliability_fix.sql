-- Doodhwala order reliability fix: keep request hash separate from existing-row hash.

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
  if v_uid is null then raise exception 'authentication_required'; end if;

  if v_request_key is null then
    v_request_key := gen_random_uuid()::text;
  elsif length(v_request_key) < 16 or length(v_request_key) > 120 then
    raise exception 'invalid_idempotency_key';
  end if;

  v_request_hash := md5(
    p_provider_id::text || '|' || p_address_id::text || '|' ||
    coalesce(p_items::text,'[]') || '|' || coalesce(p_customer_note,'')
  );

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_request_key, 0));

  select id, order_request_hash into v_existing_id, v_existing_hash
  from public.orders
  where customer_id=v_uid and idempotency_key=v_request_key
  for update;

  if v_existing_id is not null then
    if v_existing_hash is distinct from v_request_hash then
      raise exception 'idempotency_key_reuse_conflict';
    end if;
    return v_existing_id;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'empty_cart';
  end if;

  select * into v_address
  from public.addresses a
  where a.id=p_address_id and a.user_id=v_uid
  for share;
  if not found then raise exception 'address_not_owned'; end if;

  select pp.owner_user_id,coalesce(pp.max_open_orders,25),coalesce(pp.max_daily_litres,250)
  into v_provider_owner,v_max_open,v_max_daily
  from public.provider_profiles pp
  where pp.id=p_provider_id and pp.is_active
    and exists(select 1 from public.provider_verifications pv where pv.provider_id=pp.id and pv.status='approved')
  for update;
  if v_provider_owner is null then raise exception 'provider_unavailable'; end if;

  select psa.* into v_service_area
  from public.provider_service_areas psa
  where psa.provider_id=p_provider_id
  for share;

  if found then
    if v_address.latitude is null or v_address.longitude is null then
      raise exception 'delivery_location_required';
    end if;
    v_area_distance:=6371*2*asin(sqrt(least(1,
      power(sin(radians(v_address.latitude-v_service_area.latitude)/2),2)
      + cos(radians(v_address.latitude))*cos(radians(v_service_area.latitude))
      * power(sin(radians(v_address.longitude-v_service_area.longitude)/2),2)
    )));
    if v_area_distance>v_service_area.service_radius_km then
      raise exception 'outside_provider_service_area';
    end if;
  end if;

  for v_item in
    select jsonb_build_object('product_id',product_id,'quantity',quantity)
    from (
      select (x.value->>'product_id')::uuid as product_id,
             sum(coalesce((x.value->>'quantity')::numeric,0)) as quantity
      from jsonb_array_elements(p_items) x
      where x.value ? 'product_id'
      group by (x.value->>'product_id')::uuid
    ) grouped_items
  loop
    if coalesce((v_item->>'quantity')::numeric,0)<0.01
       or coalesce((v_item->>'quantity')::numeric,0)>100 then
      raise exception 'invalid_quantity';
    end if;

    select id,provider_id,name,price_per_litre,stock,is_active into v_product
    from public.milk_products
    where id=(v_item->>'product_id')::uuid
      and provider_id=p_provider_id and stock and is_active
    for update;
    if not found then raise exception 'product_unavailable:%',v_item->>'product_id'; end if;

    v_requested_litres:=v_requested_litres+(v_item->>'quantity')::numeric;
    v_subtotal:=v_subtotal+(v_product.price_per_litre*(v_item->>'quantity')::numeric);
  end loop;

  if v_requested_litres<=0 or v_requested_litres>500 then
    raise exception 'invalid_cart_quantity';
  end if;

  select count(*) into v_open_orders
  from public.orders o
  where o.provider_id=p_provider_id
    and o.status in ('placed','accepted','preparing','ready','out_for_delivery');
  if v_open_orders>=v_max_open then raise exception 'provider_order_capacity_full'; end if;

  select coalesce(sum(oi.quantity),0) into v_daily_litres
  from public.orders o join public.order_items oi on oi.order_id=o.id
  where o.provider_id=p_provider_id
    and (o.created_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date
    and o.status not in ('rejected','cancelled');
  if v_daily_litres+v_requested_litres>v_max_daily then
    raise exception 'provider_daily_capacity_full';
  end if;

  insert into public.orders(
    id,customer_id,provider_id,provider_owner_id,address_id,status,customer_note,
    idempotency_key,order_request_hash,delivery_recipient_name,delivery_phone,
    delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,
    delivery_latitude,delivery_longitude
  ) values(
    v_order_id,v_uid,p_provider_id,v_provider_owner,p_address_id,'placed',
    left(nullif(trim(p_customer_note),''),500),v_request_key,v_request_hash,
    v_address.recipient_name,v_address.phone,v_address.address_line,v_address.area_name,
    v_address.city,v_address.pin_code,v_address.latitude,v_address.longitude
  );

  for v_item in
    select jsonb_build_object('product_id',product_id,'quantity',quantity)
    from (
      select (x.value->>'product_id')::uuid as product_id,
             sum(coalesce((x.value->>'quantity')::numeric,0)) as quantity
      from jsonb_array_elements(p_items) x
      where x.value ? 'product_id'
      group by (x.value->>'product_id')::uuid
    ) grouped_items
  loop
    select id,provider_id,name,price_per_litre into v_product
    from public.milk_products
    where id=(v_item->>'product_id')::uuid
      and provider_id=p_provider_id and stock and is_active
    for update;

    insert into public.order_items(
      order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity
    ) values(
      v_order_id,v_product.id,v_product.provider_id,v_product.name,v_product.price_per_litre,
      (v_item->>'quantity')::numeric
    );
  end loop;

  update public.orders
  set subtotal=round(v_subtotal,2),delivery_fee=0,total=round(v_subtotal,2),updated_at=now()
  where id=v_order_id;

  return v_order_id;
end;
$$;

revoke all on function private.create_order_secure(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function private.create_order_secure(uuid,uuid,jsonb,text,text) to authenticated;
