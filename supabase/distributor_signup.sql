-- SupplyDesk: support dealer and distributor public signup.
-- The signup type is handled by a database trigger; platform_owner is never assignable here.
create or replace function public.provision_public_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_account_type text;
  v_full_name text;
  v_store_name text;
  v_business_name text;
  v_address text;
  v_city text;
  v_phone text;
  v_slug text;
  v_distributor_id uuid;
begin
  v_account_type := lower(coalesce(new.raw_user_meta_data->>'account_type', 'dealer'));
  if v_account_type not in ('dealer', 'distributor') then
    v_account_type := 'dealer';
  end if;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );
  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');

  if v_account_type = 'distributor' then
    v_business_name := nullif(btrim(new.raw_user_meta_data->>'business_name'), '');
    v_address := nullif(btrim(new.raw_user_meta_data->>'address'), '');
    if v_business_name is null then
      raise exception 'Business name is required for distributor registration.';
    end if;

    insert into public.profiles (id, role, full_name, email, phone)
    values (new.id, 'distributor', v_full_name, new.email, v_phone)
    on conflict (id) do nothing;

    v_slug := trim(both '-' from regexp_replace(lower(v_business_name), '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'distributor'; end if;
    v_slug := left(v_slug, 80) || '-' || left(replace(new.id::text, '-', ''), 8);

    insert into public.distributors
      (owner_id, business_name, slug, contact_phone, contact_email, billing_address, is_active)
    values
      (new.id, v_business_name, v_slug, v_phone, new.email, v_address, true)
    on conflict (owner_id) do nothing;
    return new;
  end if;

  select d.id into v_distributor_id
  from public.distributors d
  where d.is_active = true
  order by d.created_at asc, d.id asc
  limit 1;

  v_store_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'store_name'), ''), v_full_name);
  v_address := coalesce(nullif(btrim(new.raw_user_meta_data->>'address'), ''), 'Not provided');
  v_city := coalesce(nullif(btrim(new.raw_user_meta_data->>'city'), ''), 'Not provided');

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, 'dealer', v_full_name, new.email, v_phone)
  on conflict (id) do nothing;

  insert into public.dealer_profiles
    (user_id, distributor_id, store_name, contact_name, address, city, review_status)
  values
    (new.id, v_distributor_id, v_store_name, v_full_name, v_address, v_city, 'pending')
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.provision_public_signup() from public, anon, authenticated;
