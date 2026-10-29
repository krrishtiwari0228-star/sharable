-- SupplyDesk account provisioning repair.
-- Apply once to the existing project. Safe to re-run: profile creation uses ON CONFLICT.
-- Public signups are dealers only. Never accept an admin role from browser metadata.

alter table public.dealer_profiles
  alter column distributor_id drop not null;

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
  select d.id into v_distributor_id
  from public.distributors d
  where d.is_active = true
  order by d.created_at asc, d.id asc
  limit 1;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Dealer'
  );
  v_store_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'store_name'), ''), v_full_name);
  v_address := coalesce(nullif(btrim(new.raw_user_meta_data->>'address'), ''), 'Not provided');
  v_city := coalesce(nullif(btrim(new.raw_user_meta_data->>'city'), ''), 'Not provided');

  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id, 'dealer', v_full_name, new.email,
    nullif(btrim(new.raw_user_meta_data->>'phone'), '')
  )
  on conflict (id) do nothing;

  insert into public.dealer_profiles
    (user_id, distributor_id, store_name, contact_name, address, city, review_status)
  values (
    new.id, v_distributor_id, v_store_name, v_full_name, v_address, v_city, 'pending'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_public_signup() from public, anon, authenticated;

drop trigger if exists supplydesk_provision_public_signup on auth.users;
create trigger supplydesk_provision_public_signup
after insert on auth.users
for each row execute function public.provision_public_signup();

-- Backfill existing accounts created before the auth trigger existed.
-- This only backfills accounts with no profile; public registration is dealer-only.
insert into public.profiles (id, role, full_name, email, phone)
select
  u.id,
  'dealer',
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Dealer'
  ),
  u.email,
  nullif(btrim(u.raw_user_meta_data->>'phone'), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

insert into public.dealer_profiles
  (user_id, distributor_id, store_name, contact_name, address, city, review_status)
select
  p.id,
  (
    select d.id from public.distributors d
    where d.is_active = true
    order by d.created_at asc, d.id asc
    limit 1
  ),
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'store_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Dealer'
  ),
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'contact_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Dealer'
  ),
  coalesce(nullif(btrim(u.raw_user_meta_data->>'address'), ''), 'Not provided'),
  coalesce(nullif(btrim(u.raw_user_meta_data->>'city'), ''), 'Not provided'),
  'pending'
from public.profiles p
join auth.users u on u.id = p.id
left join public.dealer_profiles dp on dp.user_id = p.id
where p.role = 'dealer' and dp.user_id is null
on conflict (user_id) do nothing;

-- Authenticated self-repair. It can repair only the caller's account and never
-- creates or promotes a distributor/admin profile.
create or replace function public.ensure_my_account_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_meta jsonb;
  v_full_name text;
  v_store_name text;
  v_address text;
  v_city text;
  v_distributor_id uuid;
  v_role public.app_role;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to repair your account profile.';
  end if;

  select u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)
  into v_email, v_meta
  from auth.users u
  where u.id = v_user_id;

  if not found then
    raise exception 'The signed-in account was not found.';
  end if;

  v_full_name := coalesce(
    nullif(btrim(v_meta->>'full_name'), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Dealer'
  );
  v_store_name := coalesce(nullif(btrim(v_meta->>'store_name'), ''), v_full_name);
  v_address := coalesce(nullif(btrim(v_meta->>'address'), ''), 'Not provided');
  v_city := coalesce(nullif(btrim(v_meta->>'city'), ''), 'Not provided');

  insert into public.profiles (id, role, full_name, email, phone)
  values (
    v_user_id, 'dealer', v_full_name, v_email,
    nullif(btrim(v_meta->>'phone'), '')
  )
  on conflict (id) do nothing;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role = 'dealer' then
    select d.id into v_distributor_id
    from public.distributors d
    where d.is_active = true
    order by d.created_at asc, d.id asc
    limit 1;

    insert into public.dealer_profiles
      (user_id, distributor_id, store_name, contact_name, address, city, review_status)
    values (
      v_user_id,
      v_distributor_id,
      v_store_name,
      coalesce(nullif(btrim(v_meta->>'contact_name'), ''), v_full_name),
      v_address,
      v_city,
      'pending'
    )
    on conflict (user_id) do nothing;
  end if;

  return jsonb_build_object('role', v_role::text, 'profile_ready', true);
end;
$$;

revoke all on function public.ensure_my_account_profile() from public, anon;
grant execute on function public.ensure_my_account_profile() to authenticated;
