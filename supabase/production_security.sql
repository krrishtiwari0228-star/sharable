-- SupplyDesk production security and order transaction layer.
-- Run ONLY after reviewing/applying supabase/schema.sql in a NEW Supabase project.
-- This script intentionally does not create a distributor or promote an admin account.
create or replace function public.current_distributor_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select d.id
  from public.distributors d
  join public.profiles p on p.id = auth.uid()
  where p.role = 'distributor' and d.owner_id = p.id and d.is_active = true
  limit 1
$$;

create or replace function public.is_approved_dealer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dealer_profiles dp
    where dp.user_id = auth.uid() and dp.review_status = 'approved'
  )
$$;

create or replace function public.my_distributor_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select dp.distributor_id from public.dealer_profiles dp where dp.user_id = auth.uid()
$$;

revoke all on function public.current_distributor_id() from public;
revoke all on function public.is_approved_dealer() from public;
revoke all on function public.my_distributor_id() from public;
grant execute on function public.current_distributor_id() to authenticated;
grant execute on function public.is_approved_dealer() to authenticated;
grant execute on function public.my_distributor_id() to authenticated;

-- Profiles: users can read their own identity; distributor can read assigned dealers.
create policy "profile_read_self_or_distributor_dealers" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.dealer_profiles dp
    where dp.user_id = profiles.id and dp.distributor_id = public.current_distributor_id()
  )
);
create policy "profile_update_self_contact_only" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "distributor_read_own_business" on public.distributors
for select to authenticated
using (owner_id = auth.uid() or id = public.my_distributor_id());
create policy "distributor_owner_update_business" on public.distributors
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "dealer_read_own_profile_or_distributor" on public.dealer_profiles
for select to authenticated
using (user_id = auth.uid() or distributor_id = public.current_distributor_id());
create policy "dealer_update_own_contact" on public.dealer_profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "distributor_review_dealers" on public.dealer_profiles
for update to authenticated
using (distributor_id = public.current_distributor_id())
with check (distributor_id = public.current_distributor_id());

create policy "catalogue_read_assigned_distributor" on public.products
for select to authenticated
using (
  is_active = true and (distributor_id = public.my_distributor_id() or distributor_id = public.current_distributor_id())
);
create policy "distributor_manage_products" on public.products
for all to authenticated
using (distributor_id = public.current_distributor_id())
with check (distributor_id = public.current_distributor_id());

create policy "category_read_assigned_distributor" on public.categories
for select to authenticated
using (distributor_id = public.my_distributor_id() or distributor_id = public.current_distributor_id());
create policy "distributor_manage_categories" on public.categories
for all to authenticated
using (distributor_id = public.current_distributor_id())
with check (distributor_id = public.current_distributor_id());

create policy "dealer_read_own_orders" on public.orders
for select to authenticated
using (dealer_id = auth.uid());
create policy "distributor_read_orders" on public.orders
for select to authenticated
using (distributor_id = public.current_distributor_id());

create policy "dealer_read_items_own_orders" on public.order_items
for select to authenticated
using (exists(select 1 from public.orders o where o.id = order_items.order_id and o.dealer_id = auth.uid()));
create policy "distributor_read_items" on public.order_items
for select to authenticated
using (exists(select 1 from public.orders o where o.id = order_items.order_id and o.distributor_id = public.current_distributor_id()));

create policy "history_read_own_order_or_distributor" on public.order_status_history
for select to authenticated
using (exists(
  select 1 from public.orders o where o.id = order_status_history.order_id
  and (o.dealer_id = auth.uid() or o.distributor_id = public.current_distributor_id())
));

create policy "notifications_read_own" on public.notifications
for select to authenticated
using (recipient_id = auth.uid());
create policy "notifications_mark_own_read" on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy "dealer_read_own_inventory" on public.dealer_inventory
for select to authenticated
using (dealer_id = auth.uid());
create policy "distributor_read_inventory" on public.dealer_inventory
for select to authenticated
using (distributor_id = public.current_distributor_id());

create policy "distributor_read_stock_movements" on public.stock_movements
for select to authenticated
using (distributor_id = public.current_distributor_id());
create policy "distributor_read_payments" on public.payments
for select to authenticated
using (distributor_id = public.current_distributor_id());

-- No direct client inserts/updates/deletes are granted for orders or order_items.
-- All order writes must go through the transaction functions below.

create or replace function public.place_wholesale_order(
  p_items jsonb,
  p_delivery_address text,
  p_dealer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer public.dealer_profiles%rowtype;
  v_product public.products%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_line numeric(12,2);
  v_price numeric(12,2);
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if nullif(trim(p_delivery_address), '') is null then raise exception 'Delivery address is required'; end if;

  select * into v_dealer from public.dealer_profiles
  where user_id = auth.uid() and review_status = 'approved' for update;
  if not found then raise exception 'Dealer account is not approved'; end if;

  -- Lock product rows to prevent two concurrent orders overselling stock.
  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    if coalesce(v_item->>'product_id','') = '' then raise exception 'Invalid product'; end if;
    begin v_qty := (v_item->>'quantity')::integer;
    exception when others then raise exception 'Invalid quantity'; end;
    if v_qty < 1 then raise exception 'Quantity must be positive'; end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid
      and distributor_id = v_dealer.distributor_id and is_active = true
    for update;
    if not found then raise exception 'A product is no longer available'; end if;
    if v_qty < v_product.minimum_order_quantity then raise exception 'Minimum order quantity not met for %', v_product.name; end if;
    if v_product.stock_on_hand - v_product.stock_reserved < v_qty then raise exception 'Insufficient stock for %', v_product.name; end if;

    v_price := round(v_product.price * (1 - v_product.discount_percent / 100), 2);
    v_line := v_price * v_qty;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_discount := v_discount + ((v_product.price - v_price) * v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count <> jsonb_array_length(p_items) then raise exception 'Invalid items'; end if;

  insert into public.orders (
    distributor_id, dealer_id, status, delivery_address, dealer_note,
    subtotal, discount_total, grand_total
  ) values (
    v_dealer.distributor_id, auth.uid(), 'pending', trim(p_delivery_address), p_dealer_note,
    v_subtotal, v_discount, v_subtotal - v_discount
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and distributor_id = v_dealer.distributor_id
    for update;
    v_price := round(v_product.price * (1 - v_product.discount_percent / 100), 2);
    v_line := v_price * v_qty;
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, brand_snapshot, sku_snapshot,
      unit_label_snapshot, pieces_per_unit_snapshot, quantity, unit_price,
      discount_percent_snapshot, line_total
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.brand, v_product.sku,
      v_product.unit_label, v_product.pieces_per_unit, v_qty, v_product.price,
      v_product.discount_percent, v_line
    );
    update public.products set stock_reserved = stock_reserved + v_qty, updated_at = now()
    where id = v_product.id;
    insert into public.stock_movements(distributor_id, product_id, order_id, movement_type, quantity_delta, note, created_by)
    values (v_dealer.distributor_id, v_product.id, v_order_id, 'reserved', v_qty, 'Reserved for new dealer order', auth.uid());
  end loop;

  insert into public.order_status_history(order_id, changed_by, old_status, new_status, note)
  values (v_order_id, auth.uid(), null, 'pending', 'Order placed by dealer');
  insert into public.notifications(recipient_id, distributor_id, order_id, title, message)
  values (
    (select owner_id from public.distributors where id = v_dealer.distributor_id),
    v_dealer.distributor_id, v_order_id, 'New dealer order',
    'A dealer placed a wholesale order #' || v_order_id::text
  );
  return v_order_id;
end;
$$;

revoke all on function public.place_wholesale_order(jsonb, text, text) from public;
grant execute on function public.place_wholesale_order(jsonb, text, text) to authenticated;

-- Distributor order status transitions are server-checked and recorded in history.
create or replace function public.distributor_update_order(
  p_order_id uuid,
  p_new_status public.order_status,
  p_note text default null,
  p_estimated_delivery_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if public.current_distributor_id() is null then raise exception 'Distributor access required'; end if;

  select * into v_order from public.orders
  where id = p_order_id and distributor_id = public.current_distributor_id()
  for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.status in ('delivered','rejected','cancelled','delivery_failed') then
    raise exception 'This order is already closed';
  end if;
  if p_new_status not in ('accepted','processing','ready_for_dispatch','dispatched','out_for_delivery','delivered','rejected','cancellation_rejected','cancelled','delivery_failed','partially_fulfilled') then
    raise exception 'Invalid distributor status';
  end if;

  if p_new_status = 'rejected' or p_new_status = 'cancelled' then
    update public.products p set stock_reserved = greatest(0, p.stock_reserved - oi.quantity), updated_at = now()
    from public.order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;
    update public.stock_movements set movement_type = 'reservation_released', note = coalesce(p_note,'Order cancelled/rejected; reservation released')
    where order_id = v_order.id and movement_type = 'reserved';
  elsif p_new_status = 'delivered' then
    update public.products p set stock_reserved = greatest(0, p.stock_reserved - oi.quantity),
      stock_on_hand = greatest(0, p.stock_on_hand - oi.quantity), updated_at = now()
    from public.order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;
    insert into public.stock_movements(distributor_id, product_id, order_id, movement_type, quantity_delta, note, created_by)
    select v_order.distributor_id, oi.product_id, v_order.id, 'delivered', -oi.quantity, 'Order delivered', auth.uid()
    from public.order_items oi where oi.order_id = v_order.id;
  end if;

  update public.orders set status = p_new_status,
    distributor_note = coalesce(p_note, distributor_note),
    estimated_delivery_at = coalesce(p_estimated_delivery_at, estimated_delivery_at),
    accepted_at = case when p_new_status = 'accepted' then now() else accepted_at end,
    dispatched_at = case when p_new_status in ('dispatched','out_for_delivery') then now() else dispatched_at end,
    delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
    updated_at = now()
  where id = v_order.id;

  insert into public.order_status_history(order_id, changed_by, old_status, new_status, note)
  values (v_order.id, auth.uid(), v_order.status, p_new_status, p_note);
  insert into public.notifications(recipient_id, distributor_id, order_id, title, message)
  values (v_order.dealer_id, v_order.distributor_id, v_order.id, 'Order update',
    'Your wholesale order status is now ' || replace(p_new_status::text,'_',' '));
end;
$$;

revoke all on function public.distributor_update_order(uuid, public.order_status, text, timestamptz) from public;
grant execute on function public.distributor_update_order(uuid, public.order_status, text, timestamptz) to authenticated;

-- Dealer cancellation: immediate only while pending; otherwise ask distributor.
create or replace function public.dealer_cancel_order(p_order_id uuid, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders%rowtype; v_next public.order_status;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
  select * into v_order from public.orders where id = p_order_id and dealer_id = auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'pending' then
    v_next := 'cancelled';
    update public.products p set stock_reserved = greatest(0, p.stock_reserved - oi.quantity), updated_at = now()
    from public.order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;
    update public.stock_movements set movement_type='reservation_released', note='Dealer cancelled pending order'
    where order_id=v_order.id and movement_type='reserved';
  elsif v_order.status in ('accepted','processing','ready_for_dispatch') then
    v_next := 'cancellation_requested';
  else raise exception 'This order can no longer be cancelled online';
  end if;
  update public.orders set status=v_next, cancellation_reason=trim(p_reason), updated_at=now() where id=v_order.id;
  insert into public.order_status_history(order_id,changed_by,old_status,new_status,note)
  values(v_order.id,auth.uid(),v_order.status,v_next,trim(p_reason));
  insert into public.notifications(recipient_id,distributor_id,order_id,title,message)
  values((select owner_id from public.distributors where id=v_order.distributor_id),v_order.distributor_id,v_order.id,
    'Dealer cancellation', 'Cancellation status: ' || replace(v_next::text,'_',' ') || '. Reason: ' || trim(p_reason));
  return v_next;
end;
$$;
revoke all on function public.dealer_cancel_order(uuid, text) from public;
grant execute on function public.dealer_cancel_order(uuid, text) to authenticated;

-- SECURITY REVIEW REQUIRED before production:
-- create approved dealer profiles and distributor owner profile through trusted admin tooling;
-- add and test account provisioning, cancellation-request response rules, and full status transition matrix;
-- configure email/Realtime notifications, backups, monitoring, rate limits, and incident recovery.

-- Prevent privilege escalation through self-service profile updates.
create or replace function public.protect_account_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role and coalesce(auth.role(),'') <> 'service_role' then
      raise exception 'Account role can only be changed by trusted administrator tooling';
    end if;
  elsif tg_table_name = 'dealer_profiles' then
    if auth.uid() = old.user_id and coalesce(auth.role(),'') <> 'service_role' then
      if new.user_id is distinct from old.user_id
        or new.distributor_id is distinct from old.distributor_id
        or new.review_status is distinct from old.review_status
        or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Dealers cannot change their distributor assignment or approval status';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles
for each row execute function public.protect_account_privileges();

drop trigger if exists protect_dealer_assignment on public.dealer_profiles;
create trigger protect_dealer_assignment before update on public.dealer_profiles
for each row execute function public.protect_account_privileges();
