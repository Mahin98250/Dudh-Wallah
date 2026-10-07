alter table public.order_items drop column line_total;
alter table public.order_items alter column quantity type numeric(8,2) using quantity::numeric;
alter table public.order_items add column line_total numeric(12,2) generated always as (unit_price * quantity) stored;