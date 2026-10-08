-- Doodhwala 10X: secure delivered-order ratings.
-- This migration mirrors the live backend change and is safe to apply to a fresh environment.

create or replace function private.submit_order_rating_impl(
  p_order_id uuid,
  p_stars smallint,
  p_comment text default null
)
returns public.order_ratings
language plpgsql
security definer
set search_path = public, private
as $$
declare o public.orders; r public.order_ratings;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select * into o from public.orders where id=p_order_id and customer_id=auth.uid() for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'delivered' then raise exception 'Only delivered orders can be rated'; end if;
  insert into public.order_ratings(order_id,customer_id,provider_id,stars,comment)
  values(o.id,auth.uid(),o.provider_id,p_stars,nullif(trim(p_comment),''))
  on conflict(order_id) do update
    set stars=excluded.stars,comment=excluded.comment,updated_at=now()
  returning * into r;
  update public.provider_profiles p
  set rating_avg=x.avg_stars,updated_at=now()
  from (select provider_id,round(avg(stars)::numeric,2) avg_stars from public.order_ratings where provider_id=o.provider_id group by provider_id) x
  where p.id=x.provider_id;
  insert into public.customer_notifications(customer_id,type,title,body,entity_type,entity_id)
  values(auth.uid(),'rating','Thanks for your feedback','Your rating for this milk delivery has been saved.','order',o.id);
  return r;
end;
$$;

create or replace function public.submit_order_rating(p_order_id uuid,p_stars smallint,p_comment text default null)
returns public.order_ratings
language sql security invoker set search_path=public
as $$ select * from private.submit_order_rating_impl(p_order_id,p_stars,p_comment); $$;

revoke all on function public.submit_order_rating(uuid,smallint,text) from public,anon;
grant execute on function public.submit_order_rating(uuid,smallint,text) to authenticated;

drop policy if exists customer_order_ratings_select_own on public.order_ratings;
create policy customer_order_ratings_select_own on public.order_ratings for select to authenticated using(customer_id=auth.uid());
drop policy if exists customer_order_ratings_insert_own on public.order_ratings;
create policy customer_order_ratings_insert_own on public.order_ratings for insert to authenticated with check(customer_id=auth.uid());
drop policy if exists customer_order_ratings_update_own on public.order_ratings;
create policy customer_order_ratings_update_own on public.order_ratings for update to authenticated using(customer_id=auth.uid()) with check(customer_id=auth.uid());

alter publication supabase_realtime add table public.customer_notifications;
alter publication supabase_realtime add table public.delivery_tracking_events;
alter publication supabase_realtime add table public.customer_favorites;
