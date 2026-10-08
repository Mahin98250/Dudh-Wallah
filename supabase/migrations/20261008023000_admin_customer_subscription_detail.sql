-- Doodhwala Admin customer/subscription drilldowns.

create or replace function private.admin_get_customer_detail_impl(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  select jsonb_build_object(
    'customer', jsonb_build_object(
      'id',p.id,'full_name',p.full_name,'phone',p.phone,'account_type',p.account_type,
      'created_at',p.created_at,'email',au.email
    ),
    'addresses',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.is_default desc,a.created_at desc)
      from public.addresses a where a.user_id=p.id
    ),'[]'::jsonb),
    'orders',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select o.id,o.status,o.total,o.created_at,pp.display_name provider_name
        from public.orders o
        left join public.provider_profiles pp on pp.id=o.provider_id
        where o.customer_id=p.id
        order by o.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'subscriptions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select s.id,s.status,s.quantity_litres,s.price_per_litre,s.delivery_time,s.start_date,s.end_date,
               pp.display_name provider_name,mp.name product_name
        from public.milk_subscriptions s
        left join public.provider_profiles pp on pp.id=s.provider_id
        left join public.milk_products mp on mp.id=s.product_id
        where s.customer_id=p.id
        order by s.created_at desc limit 100
      ) x
    ),'[]'::jsonb)
  ) into v_result
  from public.profiles p
  left join auth.users au on au.id=p.id
  where p.id=p_customer_id and p.account_type='customer';

  if v_result is null then raise exception 'customer_not_found'; end if;
  return v_result;
end
$$;

create or replace function public.admin_get_customer_detail(p_customer_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_get_customer_detail_impl(p_customer_id) $$;

create or replace function private.admin_get_subscription_detail_impl(p_subscription_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  select jsonb_build_object(
    'subscription',jsonb_build_object(
      'id',s.id,'status',s.status,'quantity_litres',s.quantity_litres,'price_per_litre',s.price_per_litre,
      'delivery_time',s.delivery_time,'timezone_name',s.timezone_name,'start_date',s.start_date,'end_date',s.end_date,
      'days_of_week',s.days_of_week,'cutoff_minutes',s.cutoff_minutes,'price_policy',s.price_policy,
      'customer_note',s.customer_note,'paused_until',s.paused_until,'created_at',s.created_at,'updated_at',s.updated_at,
      'customer_name',cp.full_name,'customer_phone',cp.phone,'customer_email',au.email,
      'provider_name',pp.display_name,'product_name',mp.name
    ),
    'deliveries',coalesce((
      select jsonb_agg(to_jsonb(sd) order by sd.delivery_date asc)
      from public.subscription_deliveries sd where sd.subscription_id=s.id
    ),'[]'::jsonb)
  ) into v_result
  from public.milk_subscriptions s
  left join public.profiles cp on cp.id=s.customer_id
  left join auth.users au on au.id=s.customer_id
  left join public.provider_profiles pp on pp.id=s.provider_id
  left join public.milk_products mp on mp.id=s.product_id
  where s.id=p_subscription_id;

  if v_result is null then raise exception 'subscription_not_found'; end if;
  return v_result;
end
$$;

create or replace function public.admin_get_subscription_detail(p_subscription_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$ select private.admin_get_subscription_detail_impl(p_subscription_id) $$;

revoke execute on function public.admin_get_customer_detail(uuid) from public,anon;
grant execute on function public.admin_get_customer_detail(uuid) to authenticated;
revoke execute on function private.admin_get_customer_detail_impl(uuid) from public,anon;
grant execute on function private.admin_get_customer_detail_impl(uuid) to authenticated;

revoke execute on function public.admin_get_subscription_detail(uuid) from public,anon;
grant execute on function public.admin_get_subscription_detail(uuid) to authenticated;
revoke execute on function private.admin_get_subscription_detail_impl(uuid) from public,anon;
grant execute on function private.admin_get_subscription_detail_impl(uuid) to authenticated;
