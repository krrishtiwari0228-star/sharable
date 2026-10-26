-- Initial schema for SupplyDesk. Review and apply in a Supabase project before production use.
create extension if not exists pgcrypto;

create type public.app_role as enum ('distributor', 'dealer');
create type public.dealer_review_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.order_status as enum ('pending', 'accepted', 'processing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'dealer',
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table public.dealer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  store_name text not null,
  address text not null,
  city text not null,
  pin_code text,
  gst_number text,
  licence_path text,
  review_status public.dealer_review_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  unit_label text not null default 'piece', -- e.g. piece, packet, box, carton
  price numeric(12,2) not null check (price >= 0),
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0 and stock_reserved <= stock_on_hand),
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  dealer_id uuid not null references public.profiles(id),
  status public.order_status not null default 'pending',
  delivery_address text not null,
  dealer_note text,
  distributor_note text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  unit_label_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  order_id uuid references public.orders(id),
  movement_type text not null check (movement_type in ('restock', 'reserved', 'delivered', 'reservation_released', 'adjustment')),
  quantity_delta integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index orders_dealer_created_idx on public.orders(dealer_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index products_active_category_idx on public.products(is_active, category_id);
create index notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

-- Production checklist:
-- 1. Enable RLS on every table and add policies before exposing any table via the API.
-- 2. Provision distributor role only through a trusted server/admin process; never trust a client-submitted role.
-- 3. Implement order placement and stock reservation in a single PostgreSQL transaction/RPC with row locks.
-- 4. On accept: reserve stock atomically; on reject/cancel: release reservation; on delivery: deduct stock and create ledger entries once.
-- 5. Add a sales_ledger table or immutable delivered-order ledger, with unique order/item keys to prevent duplicate sales.
-- 6. Configure Supabase Realtime for orders and notifications only after access policies are tested.
-- 7. Store dealer licence files in a private bucket and use short-lived signed URLs for authorized reviewers.
-- Do not use this schema in production until the above policies and transaction functions are implemented and tested.
