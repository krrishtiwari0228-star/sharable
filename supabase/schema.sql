-- SupplyDesk multi-distributor wholesale ordering schema.
-- Apply to a NEW Supabase project after reviewing the production checklist in README.md.
create extension if not exists pgcrypto;

create type public.app_role as enum ('platform_owner', 'distributor', 'dealer', 'staff');
create type public.dealer_review_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.order_status as enum (
  'pending', 'accepted', 'processing', 'ready_for_dispatch', 'dispatched',
  'out_for_delivery', 'delivered', 'rejected', 'cancellation_requested',
  'cancellation_rejected', 'cancelled', 'delivery_failed', 'partially_fulfilled'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'dealer',
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.distributors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete restrict,
  business_name text not null,
  slug text not null unique,
  logo_path text,
  contact_phone text,
  contact_email text,
  billing_address text,
  gst_number text,
  custom_domain text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.dealer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  distributor_id uuid references public.distributors(id) on delete restrict,
  store_name text not null,
  contact_name text not null,
  address text not null,
  city text not null,
  pin_code text,
  gst_number text,
  billing_address text,
  review_status public.dealer_review_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (distributor_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text not null,
  name text not null,
  brand text,
  description text,
  image_path text,
  unit_label text not null default 'carton' check (unit_label in ('piece', 'box', 'carton', 'set', 'pack')),
  pieces_per_unit integer not null default 1 check (pieces_per_unit > 0),
  minimum_order_quantity integer not null default 1 check (minimum_order_quantity > 0),
  price numeric(12,2) not null check (price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0 and stock_reserved <= stock_on_hand),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (distributor_id, sku)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  dealer_id uuid not null references public.dealer_profiles(user_id) on delete restrict,
  status public.order_status not null default 'pending',
  delivery_address text not null,
  billing_address text,
  dealer_note text,
  distributor_note text,
  cancellation_reason text,
  cancellation_response text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  grand_total numeric(12,2) not null default 0 check (grand_total >= 0),
  estimated_delivery_at timestamptz,
  accepted_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  brand_snapshot text,
  sku_snapshot text not null,
  unit_label_snapshot text not null,
  pieces_per_unit_snapshot integer not null check (pieces_per_unit_snapshot > 0),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_percent_snapshot numeric(5,2) not null default 0 check (discount_percent_snapshot >= 0 and discount_percent_snapshot <= 100),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  old_status public.order_status,
  new_status public.order_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  distributor_id uuid references public.distributors(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Optional dealer-side stock ledger: goods received from the distributor, sold onward,
-- damaged, returned, or adjusted. It is separate from distributor warehouse stock.
create table public.dealer_inventory (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealer_profiles(user_id) on delete cascade,
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at timestamptz not null default now(),
  unique (dealer_id, product_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  movement_type text not null check (movement_type in ('restock', 'reserved', 'delivered', 'reservation_released', 'adjustment', 'return')),
  quantity_delta integer not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text,
  reference_number text,
  status text not null default 'recorded' check (status in ('recorded', 'pending', 'failed', 'refunded')),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create index dealer_profiles_distributor_idx on public.dealer_profiles(distributor_id, review_status);
create index products_distributor_active_idx on public.products(distributor_id, is_active, category_id);
create index orders_distributor_status_idx on public.orders(distributor_id, status, created_at desc);
create index orders_dealer_created_idx on public.orders(dealer_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index dealer_inventory_dealer_idx on public.dealer_inventory(dealer_id, updated_at desc);

-- Enable RLS now; production policies and trusted transaction functions are still required
-- before the browser client is allowed to read or write these tables.
alter table public.profiles enable row level security;
alter table public.distributors enable row level security;
alter table public.dealer_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.dealer_inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;

-- SECURITY NOTES:
-- 1. Add and test least-privilege RLS policies for every table before using the client API.
-- 2. Provision platform_owner/distributor/staff roles only through trusted server-side administration.
-- 3. Dealer catalogue access must be restricted to the dealer's assigned distributor and approved status.
-- 4. Order placement and acceptance must run in a transaction/RPC that locks stock rows, validates
--    tenant ownership, minimum quantities, stock, and price, then stores immutable price snapshots.
-- 5. Only the assigned dealer and their distributor should be able to read an order and its items.
-- 6. On accept, reserve stock atomically; on reject/cancel release it; on delivery deduct it once.
-- 7. Dealer inventory must only be increased for confirmed delivered quantities.
-- 8. Never expose Supabase service-role credentials in browser code. Do not deploy as production-ready
--    until RLS policies, RPCs, authentication, and automated tests are implemented.
