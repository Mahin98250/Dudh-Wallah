grant execute on function private.admin_get_overview_impl(date,date) to authenticated;
grant execute on function private.admin_list_customers_impl(integer) to authenticated;
grant execute on function private.admin_list_providers_impl(integer) to authenticated;
grant execute on function private.admin_list_subscriptions_impl(integer) to authenticated;
grant execute on function private.admin_set_provider_review_impl(uuid,text,text,boolean) to authenticated;
