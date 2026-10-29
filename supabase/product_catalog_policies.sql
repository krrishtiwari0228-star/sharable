-- SupplyDesk product and category permissions.
-- Apply after schema.sql and production_security.sql.
-- Distributor writes are tenant-scoped by current_distributor_id().
-- Dealer browsing is limited to active products/categories assigned to that dealer.
-- Order placement has a separate server-side approval/stock/quantity check.

grant select, insert, update, delete on public.products, public.categories to authenticated;

drop policy if exists catalogue_read_assigned_distributor on public.products;
drop policy if exists distributor_manage_products on public.products;
drop policy if exists products_distributor_manage on public.products;
drop policy if exists products_dealer_catalogue_read on public.products;

create policy products_distributor_manage
on public.products for all to authenticated
using (distributor_id = public.current_distributor_id())
with check (distributor_id = public.current_distributor_id());

create policy products_dealer_catalogue_read
on public.products for select to authenticated
using (
  is_active = true
  and distributor_id = public.my_distributor_id()
);

drop policy if exists category_read_assigned_distributor on public.categories;
drop policy if exists distributor_manage_categories on public.categories;
drop policy if exists categories_distributor_manage on public.categories;
drop policy if exists categories_dealer_read on public.categories;

create policy categories_distributor_manage
on public.categories for all to authenticated
using (distributor_id = public.current_distributor_id())
with check (distributor_id = public.current_distributor_id());

create policy categories_dealer_read
on public.categories for select to authenticated
using (distributor_id = public.my_distributor_id());
