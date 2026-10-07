-- Doodhwala 10X trust layer: customer ratings after delivery.

create table if not exists public.order_ratings(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  stars smallint not null check(stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_ratings_provider_idx on public.order_ratings(provider_id,created_at desc);
create index if not exists order_ratings_customer_idx on public.order_ratings(customer_id,created_at desc);

alter table public.order_ratings enable row level security;
revoke all on table public.order_ratings from anon,authenticated;
grant select on table public.order_ratings to authenticated;

drop policy if exists order_ratings_visible_to_parties on public.order_ratings;
create policy order_ratings_visible_to_parties
on public.order_ratings for select to authenticated
using(
  customer_id=(select auth.uid())
  or exists(select 1 from public.provider_profiles pp where pp.id=order_ratings.provider_id and pp.owner_user_id=(select auth.uid()))
);

create or replace function private.rate_delivered_order_impl(
  p_order_id uuid,p_stars smallint,p_comment text default null
)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp'
as $$
declare v_uid uuid:=auth.uid();v_order public.orders%rowtype;v_provider_id uuid;v_avg numeric(3,2);
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_stars<1 or p_stars>5 then raise exception 'invalid_rating'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_uid for share;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status<>'delivered' then raise exception 'order_not_delivered'; end if;
  select id into v_provider_id from public.provider_profiles where id=v_order.provider_id for update;
  if exists(select 1 from public.order_ratings where order_id=p_order_id) then raise exception 'order_already_rated'; end if;
  insert into public.order_ratings(order_id,customer_id,provider_id,stars,comment)
  values(p_order_id,v_uid,v_provider_id,p_stars,left(nullif(trim(p_comment),''),500));
  select round(avg(stars)::numeric,2) into v_avg from public.order_ratings where provider_id=v_provider_id;
  update public.provider_profiles set rating_avg=coalesce(v_avg,0),updated_at=now() where id=v_provider_id;
  return jsonb_build_object('order_id',p_order_id,'stars',p_stars,'provider_rating_avg',v_avg);
end $$;

revoke all on function private.rate_delivered_order_impl(uuid,smallint,text) from public,anon,authenticated;
grant execute on function private.rate_delivered_order_impl(uuid,smallint,text) to authenticated;

create or replace function public.rate_delivered_order(
  p_order_id uuid,p_stars smallint,p_comment text default null
)
returns jsonb language sql security invoker set search_path='public','pg_temp'
as $$ select private.rate_delivered_order_impl(p_order_id,p_stars,p_comment); $$;

revoke all on function public.rate_delivered_order(uuid,smallint,text) from public,anon,authenticated;
grant execute on function public.rate_delivered_order(uuid,smallint,text) to authenticated;
