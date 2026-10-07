-- Add SLA/promise fields to the owner order projection.
create or replace function private.admin_list_orders_impl(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp'
as $$
begin
  if not private.is_current_user_admin() then raise exception 'owner_access_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select o.id,o.status,o.subtotal,o.delivery_fee,o.total,o.created_at,o.updated_at,
      o.acceptance_deadline_at,o.estimated_delivery_min_minutes,o.estimated_delivery_max_minutes,
      o.promised_delivery_at,o.late_after_at,
      o.delivery_recipient_name,o.delivery_area_name,o.delivery_city,o.delivery_pin_code,
      p.display_name provider_name,pr.full_name customer_name
    from public.orders o
    left join public.provider_profiles p on p.id=o.provider_id
    left join public.profiles pr on pr.id=o.customer_id
    order by o.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x),'[]'::jsonb);
end $$;

revoke all on function private.admin_list_orders_impl(integer) from public,anon,authenticated;
grant execute on function private.admin_list_orders_impl(integer) to authenticated;
