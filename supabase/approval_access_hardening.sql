-- SupplyDesk hardening: an authenticated but unapproved dealer must see no catalogue or business data.
-- Apply in Supabase SQL Editor after production_security.sql.
drop policy if exists "catalogue_read_assigned_distributor" on public.products;
create policy "catalogue_read_assigned_distributor" on public.products
for select to authenticated
using (
  is_active = true and (
    public.current_distributor_id() is not null
    or (public.is_approved_dealer() and distributor_id = public.my_distributor_id())
  )
);

drop policy if exists "category_read_assigned_distributor" on public.categories;
create policy "category_read_assigned_distributor" on public.categories
for select to authenticated
using (
  public.current_distributor_id() is not null
  or (public.is_approved_dealer() and distributor_id = public.my_distributor_id())
);

drop policy if exists "dealer_read_own_orders" on public.orders;
create policy "dealer_read_own_orders" on public.orders
for select to authenticated
using (dealer_id = auth.uid() and public.is_approved_dealer());

drop policy if exists "dealer_read_items_own_orders" on public.order_items;
create policy "dealer_read_items_own_orders" on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.dealer_id = auth.uid()
      and public.is_approved_dealer()
  )
);

drop policy if exists "history_read_own_order_or_distributor" on public.order_status_history;
create policy "history_read_own_order_or_distributor" on public.order_status_history
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_status_history.order_id
      and (
        (o.dealer_id = auth.uid() and public.is_approved_dealer())
        or o.distributor_id = public.current_distributor_id()
      )
  )
);

drop policy if exists "dealer_read_own_inventory" on public.dealer_inventory;
create policy "dealer_read_own_inventory" on public.dealer_inventory
for select to authenticated
using (dealer_id = auth.uid() and public.is_approved_dealer());

drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  and (
    public.is_approved_dealer()
    or public.current_distributor_id() is not null
  )
);

drop policy if exists "notifications_mark_own_read" on public.notifications;
create policy "notifications_mark_own_read" on public.notifications
for update to authenticated
using (
  recipient_id = auth.uid()
  and (public.is_approved_dealer() or public.current_distributor_id() is not null)
)
with check (
  recipient_id = auth.uid()
  and (public.is_approved_dealer() or public.current_distributor_id() is not null)
);

-- RPCs already check dealer approval before placing orders. Keep anonymous users
-- out of the authenticated-only tables and RPCs; do not grant anon table access.
