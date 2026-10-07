alter table public.orders
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_phone text,
  add column if not exists delivery_address_line text,
  add column if not exists delivery_area_name text,
  add column if not exists delivery_city text,
  add column if not exists delivery_pin_code text,
  add column if not exists delivery_latitude numeric,
  add column if not exists delivery_longitude numeric;

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
  v_address record;
  v_subtotal numeric(10,2) := 0;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select recipient_name, phone, address_line, area_name, city, pin_code, latitude, longitude
  into v_address
  from public.addresses
  where id = p_address_id and user_id = v_uid;

  if not found then
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

  insert into public.orders(
    customer_id, provider_id, provider_owner_id, address_id, customer_note,
    delivery_recipient_name, delivery_phone, delivery_address_line,
    delivery_area_name, delivery_city, delivery_pin_code,
    delivery_latitude, delivery_longitude
  )
  values(
    v_uid, p_provider_id, v_provider_owner, p_address_id, p_customer_note,
    v_address.recipient_name, v_address.phone, v_address.address_line,
    v_address.area_name, v_address.city, v_address.pin_code,
    v_address.latitude, v_address.longitude
  );

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

revoke execute on function private.create_order_secure(uuid, uuid, jsonb, text) from public;
revoke execute on function private.create_order_secure(uuid, uuid, jsonb, text) from anon;
revoke execute on function private.create_order_secure(uuid, uuid, jsonb, text) from authenticated;