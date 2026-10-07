-- Keep provider moderation/state changes visible to the owner control center in realtime.
-- Idempotent so the migration is safe to run against an already-correct remote project.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_profiles'
  ) then
    alter publication supabase_realtime add table public.provider_profiles;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_verifications'
  ) then
    alter publication supabase_realtime add table public.provider_verifications;
  end if;
end $$;

-- Realtime Postgres Changes are subject to SELECT RLS. These admin-only policies
-- let the owner control center receive change signals without granting access
-- to ordinary authenticated users.
do $$
declare
  t text;
  tables text[] := array['orders','provider_profiles','provider_verifications','milk_subscriptions','subscription_deliveries'];
begin
  foreach t in array tables loop
    if not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename=t
        and policyname='admin_realtime_select'
    ) then
      execute format(
        'create policy admin_realtime_select on public.%I for select to authenticated using ((select private.is_current_user_admin()))',
        t
      );
    end if;
  end loop;
end $$;

-- Remove the legacy customer order RPC overload that generated a new
-- idempotency key on every call, which made retries/non-idempotent clients unsafe.
drop function if exists public.create_order(uuid, uuid, jsonb, text);

-- Keep the deprecated private implementation callable only by the database
-- owner; customer traffic must use the idempotent five-argument implementation.
revoke execute on function private.create_order_secure(uuid, uuid, jsonb, text)
from authenticated, service_role;
