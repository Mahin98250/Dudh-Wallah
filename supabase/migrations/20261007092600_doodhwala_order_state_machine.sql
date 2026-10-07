alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status = any(array['placed','accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled']::text[]));
alter table public.orders add column if not exists status_reason text;

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists order_status_events_order_idx on public.order_status_events(order_id,created_at desc);
alter table public.order_status_events enable row level security;
revoke all on table public.order_status_events from anon,authenticated;
grant select on table public.order_status_events to authenticated;

create policy "Customers and providers can view order status events"
on public.order_status_events for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id=order_status_events.order_id
    and (o.customer_id=(select auth.uid()) or o.provider_owner_id=(select auth.uid()))
));

create or replace function public.enforce_order_status_transition()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_allowed boolean:=false;
begin
  if tg_op='INSERT' then
    if new.status<>'placed' then raise exception 'new_order_must_start_placed'; end if;
    return new;
  end if;
  if new.status=old.status then return new; end if;
  v_allowed:=case old.status
    when 'placed' then new.status in('accepted','rejected','cancelled')
    when 'accepted' then new.status in('preparing','cancelled')
    when 'preparing' then new.status in('ready','cancelled')
    when 'ready' then new.status in('out_for_delivery','cancelled')
    when 'out_for_delivery' then new.status in('delivered','cancelled')
    else false
  end;
  if not v_allowed then raise exception 'invalid_order_status_transition:%:%',old.status,new.status; end if;
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists orders_enforce_status_transition on public.orders;
create trigger orders_enforce_status_transition before insert or update of status on public.orders for each row execute function public.enforce_order_status_transition();
revoke execute on function public.enforce_order_status_transition() from public,anon,authenticated;

create or replace function public.record_order_status_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.order_status_events(order_id,from_status,to_status,changed_by,reason)
    values(new.id,null,new.status,new.provider_owner_id,new.status_reason);
  elsif new.status is distinct from old.status then
    insert into public.order_status_events(order_id,from_status,to_status,changed_by,reason)
    values(new.id,old.status,new.status,new.provider_owner_id,new.status_reason);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_record_status_event on public.orders;
create trigger orders_record_status_event after insert or update of status on public.orders for each row execute function public.record_order_status_event();
revoke execute on function public.record_order_status_event() from public,anon,authenticated;