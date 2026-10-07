-- Doodhwala backend hardening: least-privilege trigger execution + FK indexes.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

create index if not exists order_items_product_idx
  on public.order_items(product_id);

create index if not exists order_items_provider_idx
  on public.order_items(provider_id);

create index if not exists orders_address_idx
  on public.orders(address_id);

create index if not exists orders_provider_idx
  on public.orders(provider_id);