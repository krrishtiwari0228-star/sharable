-- ONE-TIME administrator setup template for SupplyDesk.
-- Do not run with a dealer's email. Create a NEW, separate admin user first:
-- Supabase Dashboard -> Authentication -> Users -> Add user.
-- Then replace the email below and run this entire script in SQL Editor.
-- Public website signup must never be used to create an administrator.

begin;

-- The schema protects role changes from normal application sessions. This
-- temporary disable is transaction-scoped; if any step fails, the transaction
-- rolls back and the trigger state is rolled back too.
alter table public.profiles disable trigger protect_profile_privileges;

do $setup$
declare
  v_admin_email text := lower('REPLACE_WITH_NEW_ADMIN_EMAIL@example.com');
  v_business_name text := 'SupplyDesk Distributor';
  v_business_slug text := 'supplydesk-distributor';
  v_user_id uuid;
  v_meta jsonb;
  v_name text;
begin
  if v_admin_email = '' or v_admin_email = 'replace_with_new_admin_email@example.com' then
    raise exception 'Edit v_admin_email to the new administrator email before running this script.';
  end if;

  select u.id, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_user_id, v_meta
  from auth.users u
  where lower(u.email) = v_admin_email;

  if v_user_id is null then
    raise exception 'No Auth user exists for %. Create that new user in Authentication -> Users first.', v_admin_email;
  end if;

  -- Website-created dealer accounts include these metadata fields. Refuse to
  -- promote them; the administrator must be a separate, newly created account.
  if lower(coalesce(v_meta->>'role', '')) = 'dealer'
     or nullif(btrim(v_meta->>'store_name'), '') is not null then
    raise exception 'This email appears to be a dealer account. Use a new email for the separate administrator.';
  end if;

  v_name := coalesce(nullif(btrim(v_meta->>'full_name'), ''), 'SupplyDesk Admin');

  insert into public.profiles (id, role, full_name, email, phone)
  values (v_user_id, 'distributor', v_name, v_admin_email, nullif(btrim(v_meta->>'phone'), ''))
  on conflict (id) do update
    set role = 'distributor',
        full_name = excluded.full_name,
        email = excluded.email;

  delete from public.dealer_profiles where user_id = v_user_id;

  insert into public.distributors (owner_id, business_name, slug, contact_email, is_active)
  values (v_user_id, v_business_name, v_business_slug, v_admin_email, true)
  on conflict (owner_id) do update
    set business_name = excluded.business_name,
        contact_email = excluded.contact_email,
        is_active = true;
end;
$setup$;

alter table public.profiles enable trigger protect_profile_privileges;
commit;
