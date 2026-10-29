-- SupplyDesk dealer onboarding before distributor setup.
-- Run after supabase/schema.sql and production_security.sql.
alter table public.dealer_profiles alter column distributor_id drop not null;

create or replace function public.provision_public_signup()
returns trigger language plpgsql security definer set search_path = public
as $function$
declare
  v_distributor_id uuid;
  v_full_name text;
  v_store_name text;
begin
  select id into v_distributor_id from public.distributors
  where is_active = true order by created_at asc limit 1;

  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  v_store_name := coalesce(nullif(trim(new.raw_user_meta_data->>'store_name'), ''), v_full_name);

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, 'dealer', v_full_name, new.email, nullif(trim(new.raw_user_meta_data->>'phone'), ''))
  on conflict (id) do nothing;

  insert into public.dealer_profiles
    (user_id, distributor_id, store_name, contact_name, address, city, review_status)
  values (
    new.id, v_distributor_id, v_store_name, v_full_name,
    coalesce(nullif(trim(new.raw_user_meta_data->>'address'), ''), 'Not provided'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'city'), ''), 'Not provided'),
    'pending'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

revoke all on function public.provision_public_signup() from public, anon, authenticated;
drop trigger if exists supplydesk_provision_public_signup on auth.users;
create trigger supplydesk_provision_public_signup after insert on auth.users
for each row execute function public.provision_public_signup();

-- Scope catalogue reads to the signed-in user's own distributor.
drop policy if exists "catalogue_read_assigned_distributor" on public.products;
create policy "catalogue_read_assigned_distributor" on public.products
for select to authenticated using (
  is_active = true and (
    distributor_id = public.current_distributor_id()
    or (public.is_approved_dealer() and distributor_id = public.my_distributor_id())
  )
);
drop policy if exists "category_read_assigned_distributor" on public.categories;
create policy "category_read_assigned_distributor" on public.categories
for select to authenticated using (
  distributor_id = public.current_distributor_id()
  or (public.is_approved_dealer() and distributor_id = public.my_distributor_id())
);
