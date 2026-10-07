create schema if not exists private;

alter function public.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) set schema private;
alter function public.pause_milk_subscription(uuid,date) set schema private;
alter function public.resume_milk_subscription(uuid) set schema private;
alter function public.cancel_milk_subscription(uuid) set schema private;
alter function public.skip_milk_delivery(uuid,text) set schema private;

revoke execute on function private.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) from public, anon;
grant execute on function private.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) to authenticated;
revoke execute on function private.pause_milk_subscription(uuid,date) from public, anon;
grant execute on function private.pause_milk_subscription(uuid,date) to authenticated;
revoke execute on function private.resume_milk_subscription(uuid) from public, anon;
grant execute on function private.resume_milk_subscription(uuid) to authenticated;
revoke execute on function private.cancel_milk_subscription(uuid) from public, anon;
grant execute on function private.cancel_milk_subscription(uuid) to authenticated;
revoke execute on function private.skip_milk_delivery(uuid,text) from public, anon;
grant execute on function private.skip_milk_delivery(uuid,text) to authenticated;

create or replace function public.create_milk_subscription(
  p_provider_id uuid,p_product_id uuid,p_address_id uuid,p_quantity_litres numeric,
  p_delivery_time time,p_start_date date,p_end_date date,
  p_days_of_week smallint[] default array[1,2,3,4,5,6,7]::smallint[],
  p_customer_note text default null,p_cutoff_minutes integer default 120
) returns uuid language plpgsql security invoker set search_path=''
as $$ begin return private.create_milk_subscription(p_provider_id,p_product_id,p_address_id,p_quantity_litres,p_delivery_time,p_start_date,p_end_date,p_days_of_week,p_customer_note,p_cutoff_minutes); end; $$;

create or replace function public.pause_milk_subscription(p_subscription_id uuid,p_until_date date default null)
returns boolean language plpgsql security invoker set search_path=''
as $$ begin return private.pause_milk_subscription(p_subscription_id,p_until_date); end; $$;

create or replace function public.resume_milk_subscription(p_subscription_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$ begin return private.resume_milk_subscription(p_subscription_id); end; $$;

create or replace function public.cancel_milk_subscription(p_subscription_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$ begin return private.cancel_milk_subscription(p_subscription_id); end; $$;

create or replace function public.skip_milk_delivery(p_delivery_id uuid,p_reason text default 'Customer skipped')
returns boolean language plpgsql security invoker set search_path=''
as $$ begin return private.skip_milk_delivery(p_delivery_id,p_reason); end; $$;

revoke execute on function public.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) from public, anon;
grant execute on function public.create_milk_subscription(uuid,uuid,uuid,numeric,time,date,date,smallint[],text,integer) to authenticated;
revoke execute on function public.pause_milk_subscription(uuid,date) from public, anon;
grant execute on function public.pause_milk_subscription(uuid,date) to authenticated;
revoke execute on function public.resume_milk_subscription(uuid) from public, anon;
grant execute on function public.resume_milk_subscription(uuid) to authenticated;
revoke execute on function public.cancel_milk_subscription(uuid) from public, anon;
grant execute on function public.cancel_milk_subscription(uuid) to authenticated;
revoke execute on function public.skip_milk_delivery(uuid,text) from public, anon;
grant execute on function public.skip_milk_delivery(uuid,text) to authenticated;