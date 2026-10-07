-- Protect admin-owned provider activation state.
-- Provider owners can manage store intake (accepting_orders), but cannot self-approve/reactivate moderation state.

create or replace function private.protect_provider_admin_state()
returns trigger
language plpgsql security definer set search_path='public','private','pg_temp'
as $$
begin
  if auth.uid() is not null
     and auth.uid()=old.owner_user_id
     and new.is_active is distinct from old.is_active
     and not private.is_current_user_admin() then
    raise exception 'provider_activation_managed_by_owner';
  end if;
  return new;
end $$;

drop trigger if exists provider_profiles_protect_admin_state on public.provider_profiles;
create trigger provider_profiles_protect_admin_state
before update on public.provider_profiles
for each row execute function private.protect_provider_admin_state();

revoke all on function private.protect_provider_admin_state() from public,anon,authenticated;
