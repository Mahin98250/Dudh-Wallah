create table if not exists public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('warning','error','critical')),
  event_type text not null check (event_type in ('runtime_error','unhandled_rejection','network_failure','http_server_error','slow_request','resource_error','storage_parse_error','storage_unavailable','manual_report')),
  fingerprint text not null check (length(fingerprint) between 8 and 64),
  message text not null check (length(message) between 1 and 500),
  route text not null default '/' check (length(route) <= 240),
  resource text check (resource is null or length(resource) <= 240),
  status_code integer check (status_code is null or status_code between 100 and 599),
  app_version text not null default '20261009.1' check (length(app_version) <= 32),
  environment text not null default 'production' check (environment in ('production','development','unknown'))
);
alter table public.client_error_reports enable row level security;
revoke all on table public.client_error_reports from public, anon, authenticated;
grant select, insert, delete on table public.client_error_reports to service_role;
create index if not exists client_error_reports_created_at_idx on public.client_error_reports (created_at desc);
create index if not exists client_error_reports_fingerprint_created_idx on public.client_error_reports (fingerprint, created_at desc);
create index if not exists client_error_reports_severity_created_idx on public.client_error_reports (severity, created_at desc);

create or replace function private.admin_list_client_error_reports_impl(p_limit integer default 50)
returns table (id uuid, created_at timestamptz, severity text, event_type text, fingerprint text, message text, route text, resource text, status_code integer, app_version text, environment text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.created_at, r.severity, r.event_type, r.fingerprint, r.message, r.route, r.resource, r.status_code, r.app_version, r.environment
  from public.client_error_reports as r
  where private.is_current_user_admin()
  order by r.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function private.admin_list_client_error_reports_impl(integer) from public, anon, authenticated;
grant execute on function private.admin_list_client_error_reports_impl(integer) to authenticated;

create or replace function public.admin_list_client_error_reports(p_limit integer default 50)
returns table (id uuid, created_at timestamptz, severity text, event_type text, fingerprint text, message text, route text, resource text, status_code integer, app_version text, environment text)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_list_client_error_reports_impl(p_limit); $$;
revoke all on function public.admin_list_client_error_reports(integer) from public, anon;
grant execute on function public.admin_list_client_error_reports(integer) to authenticated;