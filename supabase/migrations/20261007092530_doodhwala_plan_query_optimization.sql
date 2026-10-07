create index if not exists milk_subscriptions_address_idx on public.milk_subscriptions(address_id);
create index if not exists milk_subscriptions_product_idx on public.milk_subscriptions(product_id);

drop policy if exists "Customers can view own milk subscriptions" on public.milk_subscriptions;
drop policy if exists "Providers can view their milk subscriptions" on public.milk_subscriptions;
create policy "Customers and providers can view milk subscriptions"
on public.milk_subscriptions for select to authenticated
using (
  (select auth.uid()) = customer_id
  or exists (
    select 1 from public.provider_profiles pp
    where pp.id = milk_subscriptions.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can view own subscription deliveries" on public.subscription_deliveries;
drop policy if exists "Providers can view subscription deliveries" on public.subscription_deliveries;
create policy "Customers and providers can view subscription deliveries"
on public.subscription_deliveries for select to authenticated
using (
  exists (
    select 1 from public.milk_subscriptions ms
    where ms.id = subscription_deliveries.subscription_id
      and (
        ms.customer_id = (select auth.uid())
        or exists (
          select 1 from public.provider_profiles pp
          where pp.id = ms.provider_id
            and pp.owner_user_id = (select auth.uid())
        )
      )
  )
);