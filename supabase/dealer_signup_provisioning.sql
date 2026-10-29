-- SupplyDesk: enforce dealer approval at the database boundary.
-- Apply this migration in Supabase SQL Editor after the distributor business row exists.
-- Every public signup is forced to dealer; client-supplied role metadata is ignored.
create or replace function public.provision_public_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distributor_id uuid;
  v_full_name text;
  v_store_name text;
  v_address text;
  v_city text;
begin
  select id into v_distributor_id
  from public.distributors
  where is_active = true
  order by created_at asc
  limit 1;

  if v_distributor_id is null then
    raise exception 'SupplyDesk owner setup is not complete. Please contact the distributor.';
  end if;

  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  v_store_name := coalesce(nullif(trim(new.raw_user_meta_data->>'store_name'), ''), v_full_name);
  v_address := coalesce(nullif(trim(new.raw_user_meta_data->>'address'), ''), 'Not provided');
  v_city := coalesce(nullif(trim(new.raw_user_meta_data->>'city'), ''), 'Not provided');

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, 'dealer', v_full_name, new.email, nullif(trim(new.raw_user_meta_data->>'phone'), ''))
  on conflict (id) do nothing;

  insert into public.dealer_profiles
    (user_id, distributor_id, store_name, contact_name, address, city, review_status)
  values
    (new.id, v_distributor_id, v_store_name, v_full_name, v_address, v_city, 'pending')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_public_signup() from public, anon, authenticated;

drop trigger if exists supplydesk_provision_public_signup on auth.users;
create trigger supplydesk_provision_public_signup
after insert on auth.users
for each row execute function public.provision_public_signup();
