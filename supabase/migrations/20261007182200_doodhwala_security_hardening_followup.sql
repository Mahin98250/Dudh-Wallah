-- Doodhwala security hardening follow-up.
-- Admin RPCs are owner-gated internally, but anonymous execution is unnecessary.
-- Remove duplicate customer-order index.

revoke all on function public.admin_list_orders(integer) from public,anon,authenticated;
grant execute on function public.admin_list_orders(integer) to authenticated;

revoke all on function public.admin_list_providers(integer) from public,anon,authenticated;
grant execute on function public.admin_list_providers(integer) to authenticated;

revoke all on function public.admin_list_customers(integer) from public,anon,authenticated;
grant execute on function public.admin_list_customers(integer) to authenticated;

revoke all on function public.admin_list_subscriptions(integer) from public,anon,authenticated;
grant execute on function public.admin_list_subscriptions(integer) to authenticated;

drop index if exists public.orders_customer_idx;
