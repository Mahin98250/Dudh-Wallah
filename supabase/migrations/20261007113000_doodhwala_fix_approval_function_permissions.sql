-- Fix RLS policies that call the approval predicate.
-- The predicate is intentionally private/security-definer so public marketplace
-- reads can safely evaluate provider approval without exposing verification rows.

create or replace function private.is_approved_provider(p_provider_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.provider_verifications
    where provider_id = p_provider_id
      and status = 'approved'
  );
$function$;

revoke all on function private.is_approved_provider(uuid) from public;
grant execute on function private.is_approved_provider(uuid) to anon, authenticated;