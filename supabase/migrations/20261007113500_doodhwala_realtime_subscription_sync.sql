-- Stream recurring-plan changes to connected customer/provider clients.
alter publication supabase_realtime add table public.milk_subscriptions;
alter publication supabase_realtime add table public.subscription_deliveries;