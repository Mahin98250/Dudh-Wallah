-- Doodhwala 10X delivery promise, SLA and provider dispatch board.
-- Orders get explicit acceptance deadlines and customer-facing delivery promises after acceptance.

alter table public.orders
  add column if not exists acceptance_deadline_at timestamptz,
  add column if not exists estimated_delivery_min_minutes integer,
  add column if not exists estimated_delivery_max_minutes integer,
  add column if not exists promised_delivery_at timestamptz,
  add column if not exists late_after_at timestamptz;

alter table public.orders drop constraint if exists orders_eta_range_check;
alter table public.orders add constraint orders_eta_range_check check (
  estimated_delivery_min_minutes is null or (
    estimated_delivery_min_minutes >= 1
    and estimated_delivery_max_minutes is not null
    and estimated_delivery_max_minutes >= estimated_delivery_min_minutes
    and estimated_delivery_max_minutes <= 360
  )
);

create index if not exists orders_provider_status_created_idx on public.orders(provider_id,status,created_at desc);
create index if not exists orders_customer_status_created_idx on public.orders(customer_id,status,created_at desc);
create index if not exists orders_acceptance_deadline_idx on public.orders(status,acceptance_deadline_at) where status='placed';
create index if not exists orders_promised_delivery_idx on public.orders(status,promised_delivery_at) where promised_delivery_at is not null;

-- The live database contains the implementation of:
-- private.calculate_order_eta(uuid)
-- private.set_order_delivery_promise(uuid)
-- the hardened private.create_order_secure(..., p_idempotency_key)
-- the hardened private.provider_update_order_status_impl(...)
-- public.expire_unaccepted_orders()
-- public.get_provider_dispatch_board(date)
-- and the updated public.get_admin_overview(date,date).

