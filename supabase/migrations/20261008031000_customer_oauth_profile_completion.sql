-- Customer profile completion after OAuth/email signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    nullif(new.phone,'')
  )
  on conflict (id) do update
    set full_name=coalesce(public.profiles.full_name,excluded.full_name),
        phone=coalesce(public.profiles.phone,excluded.phone),
        updated_at=now();
  return new;
end;
$$;

create or replace function private.complete_current_customer_profile_impl(
  p_full_name text,
  p_phone text,
  p_address_line text default null,
  p_area_name text default null,
  p_city text default null,
  p_pin_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text:=left(trim(coalesce(p_full_name,'')),120);
  v_phone text:=trim(coalesce(p_phone,''));
  v_address text:=left(trim(coalesce(p_address_line,'')),240);
  v_area text:=left(trim(coalesce(p_area_name,'')),120);
  v_city text:=left(trim(coalesce(p_city,'')),80);
  v_pin text:=trim(coalesce(p_pin_code,''));
  v_address_id uuid;
  v_profile jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_name='' or char_length(v_name)<2 then raise exception 'full_name_required'; end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'invalid_phone'; end if;

  if v_address<>'' or v_area<>'' or v_city<>'' or v_pin<>'' then
    if v_address='' or v_area='' or v_city='' then raise exception 'complete_address_required'; end if;
    if v_pin='' or v_pin !~ '^[0-9]{6}$' then raise exception 'invalid_pin'; end if;
  end if;

  insert into public.profiles(id,full_name,phone,account_type,updated_at)
  values(v_uid,v_name,v_phone,'customer',now())
  on conflict(id) do update
    set full_name=excluded.full_name,phone=excluded.phone,updated_at=now();

  if v_address<>'' then
    select id into v_address_id
    from public.addresses
    where user_id=v_uid and is_default=true
    order by created_at asc
    limit 1
    for update;

    if v_address_id is not null then
      update public.addresses
      set recipient_name=v_name,phone=v_phone,address_line=v_address,area_name=v_area,
          city=v_city,pin_code=v_pin,is_default=true
      where id=v_address_id;
    else
      insert into public.addresses(
        user_id,label,recipient_name,phone,address_line,area_name,city,pin_code,is_default
      )
      values(v_uid,'Home',v_name,v_phone,v_address,v_area,v_city,v_pin,true)
      returning id into v_address_id;
    end if;
  end if;

  select to_jsonb(p) into v_profile from public.profiles p where p.id=v_uid;

  return jsonb_build_object(
    'profile',v_profile,
    'default_address_id',v_address_id,
    'completed',true
  );
end
$$;

create or replace function public.complete_current_customer_profile(
  p_full_name text,
  p_phone text,
  p_address_line text default null,
  p_area_name text default null,
  p_city text default null,
  p_pin_code text default null
)
returns jsonb
language sql
security invoker
set search_path to 'public','pg_temp'
as $$
  select private.complete_current_customer_profile_impl(
    p_full_name,p_phone,p_address_line,p_area_name,p_city,p_pin_code
  )
$$;

revoke execute on function public.complete_current_customer_profile(text,text,text,text,text,text) from public,anon;
grant execute on function public.complete_current_customer_profile(text,text,text,text,text,text) to authenticated;
revoke execute on function private.complete_current_customer_profile_impl(text,text,text,text,text,text) from public,anon;
grant execute on function private.complete_current_customer_profile_impl(text,text,text,text,text,text) to authenticated;
