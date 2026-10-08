begin;

drop policy if exists customer_order_ratings_select_own on public.order_ratings;
drop policy if exists order_ratings_visible_to_parties on public.order_ratings;
drop policy if exists customer_order_ratings_insert_own on public.order_ratings;
drop policy if exists customer_order_ratings_update_own on public.order_ratings;

create policy order_ratings_select_visible_to_parties
on public.order_ratings
for select
to authenticated
using (
  customer_id = (select auth.uid())
  or exists (
    select 1
    from public.provider_profiles pp
    where pp.id = order_ratings.provider_id
      and pp.owner_user_id = (select auth.uid())
  )
);

create policy customer_order_ratings_insert_own
on public.order_ratings
for insert
to authenticated
with check (customer_id = (select auth.uid()));

create policy customer_order_ratings_update_own
on public.order_ratings
for update
to authenticated
using (customer_id = (select auth.uid()))
with check (customer_id = (select auth.uid()));

commit;
