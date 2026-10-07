-- Doodhwala performance follow-up: route/date and audit lookup indexes
create index if not exists subscription_deliveries_date_status_idx
  on public.subscription_deliveries(delivery_date,status,scheduled_for);

create index if not exists order_status_events_changed_by_idx
  on public.order_status_events(changed_by);