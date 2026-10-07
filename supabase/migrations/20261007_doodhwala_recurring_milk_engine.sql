create table if not exists public.milk_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  product_id uuid not null references public.milk_products(id) on delete restrict,
  address_id uuid not null references public.addresses(id) on delete restrict,
  status text not null default 'active' check (status in ('active','paused','cancelled','completed')),
  quantity_litres numeric(8,2) not null check (quantity_litres > 0 and quantity_litres <= 50),
  price_per_litre numeric(10,2) not null check (price_per_litre > 0),
  delivery_time time not null,
  timezone_name text not null default 'Asia/Kolkata',
  start_date date not null,
  end_date date not null,
  days_of_week smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  cutoff_minutes integer not null default 120 check (cutoff_minutes between 15 and 1440),
  price_policy text not null default 'locked' check (price_policy in ('locked','current')),
  customer_note text,
  paused_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milk_subscriptions_dates_check check (end_date >= start_date and end_date <= start_date + 31),
  constraint milk_subscriptions_days_check check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[])
);
create index if not exists milk_subscriptions_customer_idx on public.milk_subscriptions(customer_id,status,start_date,end_date);
create index if not exists milk_subscriptions_provider_idx on public.milk_subscriptions(provider_id,status);

create table if not exists public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.milk_subscriptions(id) on delete cascade,
  scheduled_for timestamptz not null,
  delivery_date date not null,
  quantity_litres numeric(8,2) not null check (quantity_litres > 0 and quantity_litres <= 50),
  unit_price numeric(10,2) not null check (unit_price > 0),
  status text not null default 'scheduled' check (status in ('scheduled','materialized','delivered','skipped','cancelled','failed')),
  order_id uuid unique references public.orders(id) on delete set null,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id,delivery_date)
);
create index if not exists subscription_deliveries_due_idx on public.subscription_deliveries(status,scheduled_for);
create index if not exists subscription_deliveries_subscription_idx on public.subscription_deliveries(subscription_id,delivery_date);

alter table public.orders add column if not exists subscription_delivery_id uuid unique references public.subscription_deliveries(id) on delete set null;
create index if not exists orders_subscription_delivery_idx on public.orders(subscription_delivery_id);

alter table public.milk_subscriptions enable row level security;
alter table public.subscription_deliveries enable row level security;
revoke all on table public.milk_subscriptions from anon,authenticated;
revoke all on table public.subscription_deliveries from anon,authenticated;
grant select on table public.milk_subscriptions to authenticated;
grant select on table public.subscription_deliveries to authenticated;

drop policy if exists "Customers can view own milk subscriptions" on public.milk_subscriptions;
create policy "Customers can view own milk subscriptions" on public.milk_subscriptions for select to authenticated using ((select auth.uid())=customer_id);
drop policy if exists "Providers can view their milk subscriptions" on public.milk_subscriptions;
create policy "Providers can view their milk subscriptions" on public.milk_subscriptions for select to authenticated using (exists(select 1 from public.provider_profiles pp where pp.id=milk_subscriptions.provider_id and pp.owner_user_id=(select auth.uid())));
drop policy if exists "Customers can view own subscription deliveries" on public.subscription_deliveries;
create policy "Customers can view own subscription deliveries" on public.subscription_deliveries for select to authenticated using (exists(select 1 from public.milk_subscriptions ms where ms.id=subscription_deliveries.subscription_id and ms.customer_id=(select auth.uid())));
drop policy if exists "Providers can view subscription deliveries" on public.subscription_deliveries;
create policy "Providers can view subscription deliveries" on public.subscription_deliveries for select to authenticated using (exists(select 1 from public.milk_subscriptions ms join public.provider_profiles pp on pp.id=ms.provider_id where ms.id=subscription_deliveries.subscription_id and pp.owner_user_id=(select auth.uid())));

create or replace function public.create_milk_subscription(
  p_provider_id uuid,p_product_id uuid,p_address_id uuid,p_quantity_litres numeric,p_delivery_time time,
  p_start_date date,p_end_date date,p_days_of_week smallint[] default array[1,2,3,4,5,6,7]::smallint[],
  p_customer_note text default null,p_cutoff_minutes integer default 120
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_subscription_id uuid:=gen_random_uuid();v_price numeric(10,2);v_provider_owner uuid;v_delivery_from time;v_delivery_to time;v_timezone text:='Asia/Kolkata';v_date date;v_scheduled timestamptz;
begin
if v_uid is null then raise exception 'authentication_required'; end if;
if p_quantity_litres is null or p_quantity_litres<=0 or p_quantity_litres>50 then raise exception 'invalid_quantity'; end if;
if p_end_date<p_start_date or p_end_date>p_start_date+31 then raise exception 'plan_must_fit_within_32_calendar_days'; end if;
if p_start_date<current_date then raise exception 'start_date_in_past'; end if;
if p_days_of_week is null or cardinality(p_days_of_week)=0 then raise exception 'choose_at_least_one_delivery_day'; end if;
if p_cutoff_minutes<15 or p_cutoff_minutes>1440 then raise exception 'invalid_cutoff'; end if;
if p_start_date=current_date then v_scheduled:=timezone(v_timezone,current_date+p_delivery_time);if v_scheduled<=now()+interval '10 minutes' then raise exception 'same_day_delivery_time_has_passed';end if;end if;
select pp.owner_user_id,pp.delivery_from,pp.delivery_to into v_provider_owner,v_delivery_from,v_delivery_to from public.provider_profiles pp where pp.id=p_provider_id and pp.is_active and exists(select 1 from public.provider_verifications pv where pv.provider_id=pp.id and pv.status='approved');
if v_provider_owner is null then raise exception 'provider_unavailable';end if;
if v_delivery_from is not null and v_delivery_to is not null and (p_delivery_time<v_delivery_from or p_delivery_time>v_delivery_to) then raise exception 'delivery_time_outside_provider_window';end if;
select mp.price_per_litre into v_price from public.milk_products mp where mp.id=p_product_id and mp.provider_id=p_provider_id and mp.is_active and mp.stock and mp.daily_available;
if v_price is null then raise exception 'subscription_product_unavailable';end if;
if not exists(select 1 from public.addresses a where a.id=p_address_id and a.user_id=v_uid) then raise exception 'address_not_owned';end if;
insert into public.milk_subscriptions(id,customer_id,provider_id,product_id,address_id,quantity_litres,price_per_litre,delivery_time,timezone_name,start_date,end_date,days_of_week,cutoff_minutes,customer_note)
values(v_subscription_id,v_uid,p_provider_id,p_product_id,p_address_id,p_quantity_litres,v_price,p_delivery_time,v_timezone,p_start_date,p_end_date,p_days_of_week,p_cutoff_minutes,p_customer_note);
for v_date in select d::date from generate_series(p_start_date,p_end_date,interval '1 day') d where extract(isodow from d)::smallint=any(p_days_of_week)
loop
v_scheduled:=timezone(v_timezone,v_date+p_delivery_time);
insert into public.subscription_deliveries(subscription_id,scheduled_for,delivery_date,quantity_litres,unit_price) values(v_subscription_id,v_scheduled,v_date,p_quantity_litres,v_price);
end loop;
if not exists(select 1 from public.subscription_deliveries sd where sd.subscription_id=v_subscription_id) then raise exception 'plan_has_no_delivery_days';end if;
return v_subscription_id;
end;
$$;
revoke execute on function public.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) from public,anon;
grant execute on function public.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) to authenticated;

create or replace function public.pause_milk_subscription(p_subscription_id uuid,p_until_date date default null)
returns boolean language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid();begin if v_uid is null then raise exception 'authentication_required';end if;update public.milk_subscriptions set status='paused',paused_until=p_until_date,updated_at=now() where id=p_subscription_id and customer_id=v_uid and status='active';return found;end; $$;
revoke execute on function public.pause_milk_subscription(uuid,date) from public,anon;grant execute on function public.pause_milk_subscription(uuid,date) to authenticated;

create or replace function public.resume_milk_subscription(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid();begin if v_uid is null then raise exception 'authentication_required';end if;update public.milk_subscriptions set status='active',paused_until=null,updated_at=now() where id=p_subscription_id and customer_id=v_uid and status='paused';return found;end; $$;
revoke execute on function public.resume_milk_subscription(uuid) from public,anon;grant execute on function public.resume_milk_subscription(uuid) to authenticated;

create or replace function public.cancel_milk_subscription(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid();begin if v_uid is null then raise exception 'authentication_required';end if;update public.milk_subscriptions set status='cancelled',updated_at=now() where id=p_subscription_id and customer_id=v_uid and status in('active','paused');if found then update public.subscription_deliveries set status='cancelled',updated_at=now() where subscription_id=p_subscription_id and status='scheduled' and scheduled_for>now();end if;return found;end; $$;
revoke execute on function public.cancel_milk_subscription(uuid) from public,anon;grant execute on function public.cancel_milk_subscription(uuid) to authenticated;

create or replace function public.skip_milk_delivery(p_delivery_id uuid,p_reason text default 'Customer skipped')
returns boolean language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid();v_cutoff integer;v_scheduled timestamptz;begin if v_uid is null then raise exception 'authentication_required';end if;select ms.cutoff_minutes,sd.scheduled_for into v_cutoff,v_scheduled from public.subscription_deliveries sd join public.milk_subscriptions ms on ms.id=sd.subscription_id where sd.id=p_delivery_id and ms.customer_id=v_uid and sd.status='scheduled';if v_cutoff is null then return false;end if;if now()>v_scheduled-make_interval(mins=>v_cutoff) then raise exception 'delivery_skip_cutoff_passed';end if;update public.subscription_deliveries set status='skipped',skip_reason=left(coalesce(p_reason,'Customer skipped'),200),updated_at=now() where id=p_delivery_id and status='scheduled';return found;end; $$;
revoke execute on function public.skip_milk_delivery(uuid,text) from public,anon;grant execute on function public.skip_milk_delivery(uuid,text) to authenticated;

create or replace function public.materialize_due_subscription_deliveries()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_delivery record;v_address record;v_order_id uuid;v_count integer:=0;
begin
for v_delivery in
select sd.id delivery_id,sd.subscription_id,sd.quantity_litres,sd.unit_price,ms.customer_id,ms.provider_id,ms.product_id,ms.address_id,ms.status subscription_status,ms.customer_note,mp.name product_name,mp.stock,mp.is_active,pp.owner_user_id
from public.subscription_deliveries sd join public.milk_subscriptions ms on ms.id=sd.subscription_id join public.milk_products mp on mp.id=ms.product_id join public.provider_profiles pp on pp.id=ms.provider_id
where sd.status='scheduled' and sd.scheduled_for<=now() order by sd.scheduled_for for update of sd skip locked
loop
if v_delivery.subscription_status<>'active' then update public.subscription_deliveries set status=case when v_delivery.subscription_status='cancelled' then 'cancelled' else 'skipped' end,skip_reason='Subscription not active',updated_at=now() where id=v_delivery.delivery_id and status='scheduled';continue;end if;
if not v_delivery.stock or not v_delivery.is_active then update public.subscription_deliveries set status='failed',skip_reason='Product unavailable at delivery time',updated_at=now() where id=v_delivery.delivery_id and status='scheduled';continue;end if;
if exists(select 1 from public.orders o where o.subscription_delivery_id=v_delivery.delivery_id) then update public.subscription_deliveries set status='materialized',updated_at=now() where id=v_delivery.delivery_id;continue;end if;
select recipient_name,phone,address_line,area_name,city,pin_code,latitude,longitude into v_address from public.addresses where id=v_delivery.address_id and user_id=v_delivery.customer_id;
if not found then update public.subscription_deliveries set status='failed',skip_reason='Delivery address unavailable',updated_at=now() where id=v_delivery.delivery_id;continue;end if;
v_order_id:=gen_random_uuid();
insert into public.orders(id,customer_id,provider_id,provider_owner_id,address_id,status,subtotal,delivery_fee,total,customer_note,delivery_recipient_name,delivery_phone,delivery_address_line,delivery_area_name,delivery_city,delivery_pin_code,delivery_latitude,delivery_longitude,subscription_delivery_id)
values(v_order_id,v_delivery.customer_id,v_delivery.provider_id,v_delivery.owner_user_id,v_delivery.address_id,'placed',round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),0,round((v_delivery.unit_price*v_delivery.quantity_litres)::numeric,2),v_delivery.customer_note,v_address.recipient_name,v_address.phone,v_address.address_line,v_address.area_name,v_address.city,v_address.pin_code,v_address.latitude,v_address.longitude,v_delivery.delivery_id);
insert into public.order_items(order_id,product_id,provider_id,product_name_snapshot,unit_price,quantity)
values(v_order_id,v_delivery.product_id,v_delivery.provider_id,v_delivery.product_name,v_delivery.unit_price,greatest(1,ceil(v_delivery.quantity_litres)::integer));
update public.subscription_deliveries set status='materialized',order_id=v_order_id,updated_at=now() where id=v_delivery.delivery_id and status='scheduled';
v_count:=v_count+1;
end loop;
update public.milk_subscriptions ms set status='completed',updated_at=now() where ms.status in('active','paused') and ms.end_date<current_date and not exists(select 1 from public.subscription_deliveries sd where sd.subscription_id=ms.id and sd.status='scheduled');
return v_count;
end;
$$;
revoke execute on function public.materialize_due_subscription_deliveries() from public,anon,authenticated;

create or replace function public.sync_subscription_delivery_from_order()
returns trigger language plpgsql security definer set search_path=''
as $$ begin if new.subscription_delivery_id is not null then update public.subscription_deliveries set status=case when new.status='delivered' then 'delivered' when new.status='cancelled' then 'cancelled' else status end,updated_at=now() where order_id=new.id;end if;return new;end; $$;
drop trigger if exists orders_sync_subscription_delivery on public.orders;
create trigger orders_sync_subscription_delivery after update of status on public.orders for each row execute function public.sync_subscription_delivery_from_order();
revoke execute on function public.sync_subscription_delivery_from_order() from public,anon,authenticated;

select cron.schedule('doodhwala-materialize-subscriptions','* * * * *',$$select public.materialize_due_subscription_deliveries();$$);