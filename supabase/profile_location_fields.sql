-- SupplyDesk profile location fields.
-- Apply once in the Supabase SQL Editor before using the Settings location editor.
begin;

alter table public.distributors
  add column if not exists address_line text,
  add column if not exists area text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists pin_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.dealer_profiles
  add column if not exists area text,
  add column if not exists state text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distributors_location_latitude_check') then
    alter table public.distributors add constraint distributors_location_latitude_check
      check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_location_longitude_check') then
    alter table public.distributors add constraint distributors_location_longitude_check
      check (longitude is null or longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dealer_profiles_location_latitude_check') then
    alter table public.dealer_profiles add constraint dealer_profiles_location_latitude_check
      check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dealer_profiles_location_longitude_check') then
    alter table public.dealer_profiles add constraint dealer_profiles_location_longitude_check
      check (longitude is null or longitude between -180 and 180);
  end if;
end $$;

commit;
