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
