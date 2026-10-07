-- Doodhwala admin overview secure wrapper.
-- The exposed API function is SECURITY INVOKER; privileged analytics remain private.

create or replace function private.admin_get_overview_impl(
  p_from date default (current_date-29),p_to date default current_date
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'admin_access_required'; end if;
  select jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'customers',(select count(*) from public.profiles where account_type='customer'),
    'providers',(select count(*) from public.provider_profiles),
    'approved_providers',(select count(*) from public.provider_profiles pp where exists(select 1 from public.provider_verifications pv where pv.provider_id=pp.id and pv.status='approved')),
    'orders',(select count(*) from public.orders where created_at>=p_from::timestamptz and created_at<(p_to+1)::timestamptz),
    'completed_orders',(select count(*) from public.orders where status='delivered' and created_at>=p_from::timestamptz and created_at<(p_to+1)::timestamptz),
    'cancelled_orders',(select count(*) from public.orders where status='cancelled' and created_at>=p_from::timestamptz and created_at<(p_to+1)::timestamptz),
    'late_orders',(select count(*) from public.orders where status not in ('delivered','cancelled','rejected') and promised_delivery_at is not null and now()>coalesce(late_after_at,promised_delivery_at) and created_at>=p_from::timestamptz and created_at<(p_to+1)::timestamptz),
    'gross_sales',(select coalesce(round(sum(total),2),0) from public.orders where status='delivered' and created_at>=p_from::timestamptz and created_at<(p_to+1)::timestamptz),
    'active_subscriptions',(select count(*) from public.milk_subscriptions where status='active'),
    'scheduled_deliveries',(select count(*) from public.subscription_deliveries where status='scheduled' and delivery_date between p_from and p_to),
    'milk_litres_delivered',(select coalesce(round(sum(oi.quantity),2),0) from public.order_items oi join public.orders o on o.id=oi.order_id where o.status='delivered' and o.created_at>=p_from::timestamptz and o.created_at<(p_to+1)::timestamptz)
  ) into v_result;
  return v_result;
end $$;

revoke all on function private.admin_get_overview_impl(date,date) from public,anon,authenticated;
-- Keep the existing complete admin overview JSON implementation from the prior migration;
-- this file's wrapper is applied live after the complete implementation.
create or replace function public.get_admin_overview(
  p_from date default (current_date-29),p_to date default current_date
)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.admin_get_overview_impl(p_from,p_to); $$;

revoke all on function public.get_admin_overview(date,date) from public,anon,authenticated;
grant execute on function public.get_admin_overview(date,date) to authenticated;
