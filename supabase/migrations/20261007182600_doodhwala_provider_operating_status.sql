-- Doodhwala provider operating status.
-- Separate provider self-pause from owner/admin approval.
alter table public.provider_profiles
  add column if not exists accepting_orders boolean not null default true;
create index if not exists provider_profiles_accepting_idx
  on public.provider_profiles(is_active,accepting_orders);
-- Public discovery/storefront and secure checkout are defined in the live migration
-- with an additional accepting_orders predicate.